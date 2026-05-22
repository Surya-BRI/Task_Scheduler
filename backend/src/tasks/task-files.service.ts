import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type UploadResult = {
  key: string;
  fileName: string;
  mimeType: string;
  size: number;
};

@Injectable()
export class TaskFilesService {
  private readonly bucket: string;
  private readonly region: string;
  private readonly folder: string;
  private readonly client: S3Client;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('aws.bucket') ?? process.env.AWS_BUCKET ?? '';
    this.region = this.config.get<string>('aws.region') ?? process.env.AWS_REGION ?? '';
    this.folder = (this.config.get<string>('aws.folder') ?? process.env.AWS_FOLDER ?? 'taskfiles')
      .replace(/^\/+|\/+$/g, '');
    const accessKeyId =
      this.config.get<string>('aws.accessKeyId') ?? process.env.AWS_ACCESS_KEY_ID ?? '';
    const secretAccessKey =
      this.config.get<string>('aws.secretAccessKey') ?? process.env.AWS_SECRET_ACCESS_KEY ?? '';

    if (!this.bucket || !this.region || !accessKeyId || !secretAccessKey) {
      throw new Error('AWS S3 configuration is incomplete');
    }

    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private isAllowedMimeType(mimeType: string): boolean {
    if (!mimeType) return false;
    return (
      mimeType.startsWith('image/') ||
      mimeType.startsWith('audio/') ||
      mimeType === 'video/mp4' ||
      mimeType === 'application/pdf'
    );
  }

  async uploadTaskFile(file: Express.Multer.File, userId: string): Promise<UploadResult> {
    if (!file) throw new BadRequestException('No file uploaded');
    if (file.size > 20 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds 20MB limit');
    }
    if (!this.isAllowedMimeType(file.mimetype || '')) {
      throw new BadRequestException('Unsupported file type');
    }

    const now = new Date();
    const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    const safeName = this.sanitizeFileName(file.originalname);
    const key = `${this.folder}/${userId}/${stamp}-${random}-${safeName}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype || 'application/octet-stream',
        }),
      );

      return {
        key,
        fileName: file.originalname,
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size,
      };
    } catch {
      throw new InternalServerErrorException('Failed to upload file to S3');
    }
  }

  async createSignedReadUrl(key: string, expiresIn = 60 * 30): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn },
    );
  }

  async assertKeysExist(keys: string[]): Promise<void> {
    const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
    try {
      await Promise.all(
        uniqueKeys.map((key) =>
          this.client.send(
            new HeadObjectCommand({
              Bucket: this.bucket,
              Key: key,
            }),
          ),
        ),
      );
    } catch {
      throw new BadRequestException('One or more file references are invalid');
    }
  }

  async deleteObjectByKey(key: string): Promise<void> {
    const trimmed = String(key ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('Invalid file key');
    }
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: trimmed,
        }),
      );
    } catch {
      throw new InternalServerErrorException('Failed to delete file from S3');
    }
  }
}
