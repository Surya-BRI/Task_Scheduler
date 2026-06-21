/**
 * Production-style upload debug: PNG, JPG, PDF, DOCX via browser-like FormData.
 */
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.API_BASE_URL || 'http://localhost:7000/api/v1';
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures');

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Minimal JPEG (JFIF header + minimal structure)
const JPG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x03, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00,
  0x3f, 0x00, 0x37, 0xff, 0xd9,
]);

const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'sarah.mitchell@bluerhine.com', password: 'hod123' }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Login ${res.status}: ${text}`);
  return JSON.parse(text).accessToken;
}

async function uploadFile(token, fileName, mime, bytes) {
  const form = new FormData();
  form.append('title', `Debug ${fileName}`);
  form.append('message', 'Format upload debug test');
  form.append('postType', 'Posts');
  form.append('priority', 'Medium');
  const blob = new Blob([bytes], { type: mime });
  form.append('files', blob, fileName);

  const headers = { Authorization: `Bearer ${token}` };
  console.log('\n---', fileName, '---');
  console.log('FormData created: fields=title,message,postType,priority,files');
  console.log('File:', fileName, 'mime=', mime, 'size=', bytes.length, 'sha256=', sha256(bytes).slice(0, 16));

  const res = await fetch(`${BASE}/chatter-posts`, { method: 'POST', headers, body: form });
  const text = await res.text();
  console.log('Request sent: POST', `${BASE}/chatter-posts`);
  console.log('Response:', res.status, res.statusText);
  console.log('Content-Type response:', res.headers.get('content-type'));

  if (!res.ok) {
    console.log('FAIL body:', text.slice(0, 600));
    return { ok: false, status: res.status, body: text };
  }

  let dto;
  try {
    dto = JSON.parse(text);
  } catch {
    console.log('FAIL: invalid JSON', text.slice(0, 200));
    return { ok: false, status: res.status, body: text };
  }

  const att = dto.attachments?.[0];
  if (!att?.url) {
    console.log('FAIL: no attachment in response', JSON.stringify(dto).slice(0, 300));
    return { ok: false, status: res.status, body: text };
  }

  console.log('DB: postId=', dto.id, 'attachmentId=', att.id, 'filePath=', att.filePath);
  console.log('DB: sizeBytes=', att.sizeBytes, 'mimeType=', att.mimeType);

  const dl = await fetch(att.url);
  const dlBuf = Buffer.from(await dl.arrayBuffer());
  console.log('S3 download:', dl.status, 'bytes=', dlBuf.length, 'content-type=', dl.headers.get('content-type'));
  const match = dlBuf.length === bytes.length && sha256(dlBuf) === sha256(bytes);
  console.log('Integrity:', match ? 'PASS' : 'FAIL', `(orig=${bytes.length} dl=${dlBuf.length})`);
  if (!match) {
    console.log('orig head:', bytes.subarray(0, 12).toString('hex'));
    console.log('dl head:  ', dlBuf.subarray(0, 12).toString('hex'));
  }
  return { ok: match, status: res.status, dto, att };
}

async function main() {
  mkdirSync(FIX, { recursive: true });
  writeFileSync(join(FIX, 'test.png'), Buffer.from(PNG_B64, 'base64'));
  writeFileSync(join(FIX, 'test.jpg'), JPG_BYTES);
  writeFileSync(join(FIX, 'test.pdf'), PDF_BYTES);

  let docxPath = join(FIX, 'test.docx');
  try {
    readFileSync(docxPath);
  } catch {
    console.log('DOCX: no fixture file — create minimal docx or skip');
    docxPath = null;
  }

  console.log('API:', BASE);
  const token = await login();
  console.log('Login OK, token length=', token?.length);

  const cases = [
    { name: 'test.png', mime: 'image/png', bytes: Buffer.from(PNG_B64, 'base64') },
    { name: 'test.jpg', mime: 'image/jpeg', bytes: JPG_BYTES },
    { name: 'test.pdf', mime: 'application/pdf', bytes: PDF_BYTES },
    {
      name: 'test.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: Buffer.from('mock docx content'),
    },
    {
      name: 'test.xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: Buffer.from('mock xlsx content'),
    },
  ];

  const results = [];
  for (const c of cases) {
    results.push({ format: c.name, ...(await uploadFile(token, c.name, c.mime, c.bytes)) });
  }

  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    console.log(r.format, r.ok ? 'PASS' : 'FAIL', r.status ?? '');
  }
  const failed = results.filter((r) => !r.ok);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
