const MIME_PREFIXES = ['image/', 'audio/', 'video/'] as const;

const MIME_EXACT = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'image/svg+xml',
  'application/postscript',
  'application/illustrator',
  'application/vnd.adobe.illustrator',
  'image/vnd.adobe.photoshop',
  'application/x-photoshop',
]);

const EXT_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.ai': 'application/illustrator',
  '.eps': 'application/postscript',
  '.psd': 'image/vnd.adobe.photoshop',
  '.cdr': 'application/octet-stream',
  '.dwg': 'application/octet-stream',
  '.dxf': 'application/octet-stream',
};

export function mimeFromFileName(fileName: string): string | null {
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase() : '';
  return EXT_TO_MIME[ext] ?? null;
}

export function resolveUploadMimeType(mimeType: string, fileName: string): string {
  const trimmed = (mimeType ?? '').trim().toLowerCase();
  if (trimmed && trimmed !== 'application/octet-stream') {
    return mimeType;
  }
  return mimeFromFileName(fileName) ?? mimeType ?? 'application/octet-stream';
}

export function isAllowedUploadMime(mimeType: string, fileName = ''): boolean {
  const resolved = resolveUploadMimeType(mimeType, fileName);
  if (!resolved) return false;
  if (MIME_PREFIXES.some((p) => resolved.startsWith(p))) return true;
  if (MIME_EXACT.has(resolved)) return true;
  // Allow unknown types when the extension is explicitly mapped (e.g. .dwg as octet-stream).
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase() : '';
  return Boolean(ext && EXT_TO_MIME[ext] && resolved === EXT_TO_MIME[ext]);
}
