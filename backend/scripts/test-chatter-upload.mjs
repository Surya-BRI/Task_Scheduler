/**
 * End-to-end chatter upload smoke test (API → S3 → DB).
 * Usage: node scripts/test-chatter-upload.mjs
 */
const BASE = process.env.API_BASE_URL || 'http://localhost:7000/api/v1';

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'sarah.mitchell@bluerhine.com',
      password: 'hod123',
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Login ${res.status}: ${text}`);
  const data = JSON.parse(text);
  return data.accessToken;
}

function buildMultipart(fields, files) {
  const boundary = `----test${Date.now()}`;
  const chunks = [];
  const push = (s) => chunks.push(Buffer.from(s, 'utf8'));

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${key}"\r\n\r\n`);
    push(`${value}\r\n`);
  }

  for (const file of files) {
    push(`--${boundary}\r\n`);
    push(
      `Content-Disposition: form-data; name="files"; filename="${file.name}"\r\n`,
    );
    push(`Content-Type: ${file.mime}\r\n\r\n`);
    chunks.push(file.body);
    push('\r\n');
  }

  push(`--${boundary}--\r\n`);
  return {
    boundary,
    body: Buffer.concat(chunks),
  };
}

async function createPostWithFile(token, file) {
  const { boundary, body } = buildMultipart(
    {
      title: 'E2E Upload Test',
      message: 'Automated upload verification',
      postType: 'Posts',
      priority: 'Medium',
    },
    [file],
  );

  const res = await fetch(`${BASE}/chatter-posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  console.log('API:', BASE);
  const token = await login();
  console.log('Login OK');

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const cases = [
    { name: 'tiny.png', mime: 'image/png', body: png },
    {
      name: 'doc.bin',
      mime: 'application/octet-stream',
      body: Buffer.from('%PDF-1.4 fake'),
    },
    { name: 'notes.txt', mime: 'text/plain', body: Buffer.from('hello chatter upload') },
  ];

  for (const c of cases) {
    const result = await createPostWithFile(token, c);
    console.log(`\n--- ${c.name} (${c.mime}) → HTTP ${result.status}`);
    if (result.status >= 400) {
      console.log(result.text.slice(0, 500));
      continue;
    }
    const dto = JSON.parse(result.text);
    const att = dto.attachments?.[0];
    console.log('postId:', dto.id);
    console.log('attachments:', dto.attachments?.length ?? 0);
    if (att) {
      console.log('fileName:', att.fileName);
      console.log('fileUrl:', att.fileUrl ? 'set' : 'missing');
      console.log('signed url:', att.url ? 'set' : 'missing');
    }
  }

  const listRes = await fetch(`${BASE}/chatter-posts?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listText = await listRes.text();
  console.log('\nList latest post:', listRes.status);
  const list = JSON.parse(listText);
  const latest = list[0];
  if (latest?.attachments?.[0]) {
    console.log('Latest attachment url present:', Boolean(latest.attachments[0].url));
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
