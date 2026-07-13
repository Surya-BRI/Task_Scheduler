import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isAllowedUploadMime, resolveUploadMimeType } from '../common/utils/allowed-file-mime';
import {
  assertBufferSizeConsistent,
  assertImageBinaryValid,
  resolveUploadBuffer,
} from '../common/utils/file-binary.util';

type UploadResult = {
  key: string;
  fileName: string;
  mimeType: string;
  size: number;
  /** Presigned read URL (usable immediately). Persist `key` long-term, not this URL. */
  url: string;
  fileUrl: string;
  signedUrl: string;
};

@Injectable()
export class TaskFilesService {
  private readonly logger = new Logger(TaskFilesService.name);
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
      this.logger.error(
        'AWS S3 configuration is incomplete (need AWS_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)',
      );
      throw new Error('AWS S3 configuration is incomplete');
    }

    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    this.logger.log(`S3 client ready (bucket=${this.bucket}, region=${this.region}, folder=${this.folder})`);
  }

  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  async uploadTaskFile(file: Express.Multer.File, userId: string): Promise<UploadResult> {
    const originalName = file?.originalname || 'upload';
    this.logger.log(
      `Upload start: name=${originalName} mime=${file?.mimetype ?? 'unknown'} reportedSize=${file?.size ?? 0}`,
    );
    const buffer = resolveUploadBuffer(file);
    const byteLength = buffer.length;
    assertBufferSizeConsistent(buffer, file.size ?? 0, originalName);

    if (byteLength > 20 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds 20MB limit');
    }

    const resolvedMime = resolveUploadMimeType(file.mimetype || '', originalName);
    if (!isAllowedUploadMime(resolvedMime, originalName)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype || 'unknown'} (${originalName})`,
      );
    }

    assertImageBinaryValid(buffer, resolvedMime, originalName);

    const now = new Date();
    const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    const safeName = this.sanitizeFileName(originalName);
    const key = `${this.folder}/${userId}/${stamp}-${random}-${safeName}`;

    try {
      const putResult = await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentLength: byteLength,
          ContentType: resolvedMime,
        }),
      );

      const head = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      const signedUrl = await this.createSignedReadUrl(key);
      this.logger.log(
        `Upload success: name=${originalName} key=${key} bytes=${byteLength} ContentType=${head.ContentType ?? resolvedMime} S3 Length=${head.ContentLength ?? 'n/a'} ETag=${putResult.ETag ?? 'n/a'}`,
      );

      return {
        key,
        fileName: originalName,
        mimeType: resolvedMime,
        size: byteLength,
        // Signed (usable) URL for immediate open; persist `key` in DB, not this URL.
        url: signedUrl,
        fileUrl: signedUrl,
        signedUrl,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `S3 upload failed for "${originalName}" (bucket=${this.bucket}, bytes=${byteLength}): ${error instanceof Error ? error.message : error}`,
      );
      throw new InternalServerErrorException(`Failed to upload file to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
