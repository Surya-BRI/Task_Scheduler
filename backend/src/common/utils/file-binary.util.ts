import { BadRequestException } from '@nestjs/common';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const GIF87_SIGNATURE = Buffer.from('GIF87a');
const GIF89_SIGNATURE = Buffer.from('GIF89a');
const WEBP_RIFF = Buffer.from('RIFF');
const WEBP_MAGIC = Buffer.from('WEBP');

/** Normalize multer buffer to a Node Buffer without string conversion. */
export function resolveUploadBuffer(file: Express.Multer.File): Buffer {
  if (!file) {
    throw new BadRequestException('No file uploaded');
  }
  const raw = file.buffer as Buffer | Uint8Array | undefined;
  if (Buffer.isBuffer(raw)) {
    return raw;
  }
  if (raw instanceof Uint8Array) {
    return Buffer.from(raw);
  }
  throw new BadRequestException(
    `File "${file.originalname || 'upload'}" could not be read (missing binary buffer). Try again.`,
  );
}

export function assertBufferSizeConsistent(
  buffer: Buffer,
  reportedSize: number,
  fileName: string,
): void {
  if (buffer.length === 0) {
    throw new BadRequestException(`File "${fileName}" is empty.`);
  }
  if (reportedSize > 0 && buffer.length !== reportedSize) {
    throw new BadRequestException(
      `File "${fileName}" was truncated during upload (expected ${reportedSize} bytes, received ${buffer.length}).`,
    );
  }
}

/** Reject obviously corrupt images (automation often sends only magic bytes). */
export function assertImageBinaryValid(buffer: Buffer, mimeType: string, fileName: string): void {
  if (!mimeType.startsWith('image/')) return;

  if (buffer.length < 12) {
    throw new BadRequestException(
      `Image "${fileName}" is too small (${buffer.length} bytes) and appears corrupted.`,
    );
  }

  const lower = fileName.toLowerCase();
  const isPng = mimeType === 'image/png' || lower.endsWith('.png');
  const isJpeg =
    mimeType === 'image/jpeg' || lower.endsWith('.jpg') || lower.endsWith('.jpeg');
  const isGif = mimeType === 'image/gif' || lower.endsWith('.gif');
  const isWebp = mimeType === 'image/webp' || lower.endsWith('.webp');

  if (isPng && !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new BadRequestException(`"${fileName}" is not a valid PNG file (invalid signature).`);
  }
  if (isJpeg && !buffer.subarray(0, 3).equals(JPEG_SIGNATURE)) {
    throw new BadRequestException(`"${fileName}" is not a valid JPEG file (invalid signature).`);
  }
  if (isGif && !buffer.subarray(0, 6).equals(GIF87_SIGNATURE) && !buffer.subarray(0, 6).equals(GIF89_SIGNATURE)) {
    throw new BadRequestException(`"${fileName}" is not a valid GIF file (invalid signature).`);
  }
  if (
    isWebp &&
    (!buffer.subarray(0, 4).equals(WEBP_RIFF) || !buffer.subarray(8, 12).equals(WEBP_MAGIC))
  ) {
    throw new BadRequestException(`"${fileName}" is not a valid WebP file (invalid signature).`);
  }
}
