/**
 * One-shot: rewrite UI catch displays to use toUserFacingError.
 * Run from frontend/: node scripts/sanitize-user-errors.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src');
const IMPORT_LINE = "import { toUserFacingError } from '@/lib/api-error'";
const IMPORT_LINE_DQ = 'import { toUserFacingError } from "@/lib/api-error"';

const SKIP = new Set([
  path.join(ROOT, 'lib', 'api-error.ts'),
  path.join(ROOT, 'lib', 'api-error.spec.ts'),
  path.join(ROOT, 'lib', 'api-client.ts'),
  path.join(ROOT, 'lib', 'api-client.spec.ts'),
]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(full, out);
    } else if (/\.(jsx?|tsx?)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function ensureImport(src, filePath) {
  if (src.includes("from '@/lib/api-error'") || src.includes('from "@/lib/api-error"')) {
    if (src.includes('toUserFacingError')) return src;
    return src.replace(
      /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/api-error['"]/,
      (m, inner) => {
        const names = inner.split(',').map((s) => s.trim()).filter(Boolean);
        if (!names.includes('toUserFacingError')) names.push('toUserFacingError');
        return `import { ${names.join(', ')} } from '@/lib/api-error'`;
      },
    );
  }
  // Prefer after first import block
  const useDq = src.includes('from "');
  const line = useDq ? IMPORT_LINE_DQ : IMPORT_LINE;
  const m = src.match(/^import .+$/m);
  if (!m) return `${line}\n${src}`;
  const idx = src.indexOf(m[0]) + m[0].length;
  // find end of contiguous import section
  let end = idx;
  const lines = src.split('\n');
  let i = 0;
  for (; i < lines.length; i++) {
    if (/^import\s/.test(lines[i]) || /^import\{/.test(lines[i])) continue;
    if (lines[i].startsWith('}') && i > 0 && lines[i - 1].includes('from')) continue;
    break;
  }
  // simpler: insert after first line that is an import from '@/lib/api-client' or first import
  const insertAt = src.indexOf('\n') + 1;
  // Find last top-level import
  let lastImportEnd = 0;
  const re = /^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm;
  let match;
  while ((match = re.exec(src))) {
    lastImportEnd = match.index + match[0].length;
  }
  if (lastImportEnd === 0) return `${line}\n${src}`;
  return `${src.slice(0, lastImportEnd)}\n${line}${src.slice(lastImportEnd)}`;
}

function transform(src) {
  let next = src;
  const before = next;

  // err instanceof Error ? err.message : 'fallback'
  next = next.replace(
    /(\w+)\s+instanceof\s+Error\s*\?\s*\1\.message\s*:\s*(['"`])((?:\\.|(?!\2).)*)\2/g,
    (_, v, q, fb) => `toUserFacingError(${v}, ${q}${fb}${q})`,
  );

  // err?.message || 'fallback'  /  err?.message || "fallback"
  next = next.replace(
    /(\w+)\?\.message\s*\|\|\s*(['"`])((?:\\.|(?!\2).)*)\2/g,
    (_, v, q, fb) => `toUserFacingError(${v}, ${q}${fb}${q})`,
  );

  // error?.response?.data?.message || error?.message || 'fallback'
  next = next.replace(
    /(\w+)\?\.response\?\.data\?\.message\s*\|\|\s*\1\?\.message\s*\|\|\s*(['"`])((?:\\.|(?!\2).)*)\2/g,
    (_, v, q, fb) => `toUserFacingError(${v}, ${q}${fb}${q})`,
  );

  if (next === before) return { changed: false, src };
  if (!next.includes('toUserFacingError')) return { changed: false, src };
  next = ensureImport(next, '');
  return { changed: true, src: next };
}

const files = walk(ROOT);
let changedCount = 0;
for (const file of files) {
  if (SKIP.has(file)) continue;
  const raw = fs.readFileSync(file, 'utf8');
  const { changed, src } = transform(raw);
  if (!changed) continue;
  fs.writeFileSync(file, src);
  changedCount += 1;
  console.log('updated', path.relative(ROOT, file));
}
console.log('filesChanged=', changedCount);
