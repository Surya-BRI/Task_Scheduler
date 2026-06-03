/**
 * Verifies binary integrity: upload PNG → S3 → download → compare bytes + PNG signature.
 */
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.API_BASE_URL || 'http://localhost:7000/api/v1';
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'test-pixel.png');

// Valid 1x1 PNG (68 bytes)
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64');
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function hasPngSignature(buf) {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG);
}

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'sarah.mitchell@bluerhine.com',
      password: 'hod123',
    }),
  });
  if (!res.ok) throw new Error(`Login ${res.status}: ${await res.text()}`);
  return (await res.json()).accessToken;
}

/** Browser-like upload using native FormData + Blob */
async function uploadBrowserLike(token) {
  const form = new FormData();
  form.append('title', 'Binary verify');
  form.append('message', 'Browser-like FormData');
  form.append('postType', 'Posts');
  form.append('priority', 'Medium');
  const blob = new Blob([PNG_BYTES], { type: 'image/png' });
  form.append('files', blob, 'test-pixel.png');

  const res = await fetch(`${BASE}/chatter-posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

/** Broken upload: only 4 magic bytes (mimics bad automation) */
async function uploadTruncatedPng(token) {
  const form = new FormData();
  form.append('title', 'Truncated');
  form.append('message', 'Bad PNG');
  const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
  form.append('files', blob, 'bad.png');
  const res = await fetch(`${BASE}/chatter-posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, body: await res.text() };
}

async function downloadUrl(url) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, contentType: res.headers.get('content-type') };
}

async function main() {
  mkdirSync(join(__dirname, 'fixtures'), { recursive: true });
  writeFileSync(FIXTURE, PNG_BYTES);
  console.log('Original PNG:', PNG_BYTES.length, 'bytes', 'sha256=', sha256(PNG_BYTES).slice(0, 16) + '...');
  console.log('PNG signature OK:', hasPngSignature(PNG_BYTES));

  const token = await login();
  console.log('\n=== Browser-like upload ===');
  const up = await uploadBrowserLike(token);
  console.log('HTTP', up.status);
  if (up.status >= 400) {
    console.log(up.body.slice(0, 400));
    process.exit(1);
  }

  const dto = JSON.parse(up.body);
  const att = dto.attachments?.[0];
  if (!att?.url) {
    console.error('No attachment URL in response');
    process.exit(1);
  }
  console.log('S3 key:', att.filePath);
  console.log('DB sizeBytes:', att.sizeBytes);
  console.log('mimeType:', att.mimeType);

  console.log('\n=== Download from signed URL ===');
  const dl = await downloadUrl(att.url);
  console.log('Download HTTP', dl.status, 'Content-Type:', dl.contentType);
  console.log('Downloaded size:', dl.buf.length, 'bytes');
  console.log('PNG signature OK:', hasPngSignature(dl.buf));
  console.log('sha256 match:', sha256(dl.buf) === sha256(PNG_BYTES));
  console.log('Size match:', dl.buf.length === PNG_BYTES.length, `(db=${att.sizeBytes}, orig=${PNG_BYTES.length})`);

  if (!hasPngSignature(dl.buf) || dl.buf.length !== PNG_BYTES.length) {
    console.error('\nFAIL: Downloaded file is corrupted or wrong size');
    console.log('First 16 bytes orig:', PNG_BYTES.subarray(0, 16).toString('hex'));
    console.log('First 16 bytes dl: ', dl.buf.subarray(0, 16).toString('hex'));
    process.exit(1);
  }

  console.log('\n=== Truncated PNG (should upload but be invalid image) ===');
  const bad = await uploadTruncatedPng(token);
  console.log('HTTP', bad.status);
  if (bad.status === 201) {
    const badDto = JSON.parse(bad.body);
    const badAtt = badDto.attachments?.[0];
    if (badAtt?.url) {
      const badDl = await downloadUrl(badAtt.url);
      console.log('Truncated upload size on S3:', badDl.buf.length, '(expected 4 — invalid PNG)');
    }
  }

  console.log('\nPASS: Browser-like PNG upload/download binary integrity OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
