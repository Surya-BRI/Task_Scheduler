import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_SRC = path.join(REPO_ROOT, 'backend', 'src');
const PRISMA_DIR = path.join(REPO_ROOT, 'backend', 'prisma');

const ALLOW_COMMENT = 'security-sql:allow-static-ddl';

const FORBIDDEN_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: '$queryRawUnsafe', regex: /\$queryRawUnsafe\s*[<(]/ },
  { name: '$executeRawUnsafe', regex: /\$executeRawUnsafe\s*[<(]/ },
  { name: 'sqlQuotedUuid', regex: /\bsqlQuotedUuid\s*\(/ },
  { name: 'manual SQL string concat', regex: /(?:queryRawUnsafe|executeRawUnsafe)\s*\(\s*`[^`]*\$\{/ },
];

type Finding = {
  file: string;
  line: number;
  rule: string;
  excerpt: string;
};

function listTypeScriptFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function hasAllowComment(lines: string[], lineIndex: number): boolean {
  const current = lines[lineIndex] ?? '';
  const previous = lines[lineIndex - 1] ?? '';
  return current.includes(ALLOW_COMMENT) || previous.includes(ALLOW_COMMENT);
}

function scanFile(filePath: string): Finding[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const findings: Finding[] = [];
  const relativePath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  const inPrismaScripts = relativePath.startsWith('backend/prisma/');

  lines.forEach((line, index) => {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (!pattern.regex.test(line)) continue;

      const isUnsafeCall =
        pattern.name === '$queryRawUnsafe' || pattern.name === '$executeRawUnsafe';

      if (isUnsafeCall) {
        const inSrc = relativePath.startsWith('backend/src/');
        if (inPrismaScripts) return;
        if (inSrc && hasAllowComment(lines, index)) return;
        if (!inSrc) return;
      }

      findings.push({
        file: relativePath,
        line: index + 1,
        rule: pattern.name,
        excerpt: line.trim().slice(0, 160),
      });
    }
  });

  return findings;
}

function scanPrismaRuntimeUnsafe(): Finding[] {
  const findings: Finding[] = [];
  const prismaFiles = listTypeScriptFiles(PRISMA_DIR).filter(
    (file) => !file.includes(`${path.sep}migrations${path.sep}`),
  );

  for (const file of prismaFiles) {
    const relativePath = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!/\$queryRawUnsafe|\$executeRawUnsafe/.test(line)) return;
      findings.push({
        file: relativePath,
        line: index + 1,
        rule: 'prisma-script-unsafe-review',
        excerpt: `${line.trim().slice(0, 120)} (allowed in prisma/ scripts; prefer migrations for schema changes)`,
      });
    });
  }

  return findings;
}

function main(): void {
  const srcFiles = listTypeScriptFiles(BACKEND_SRC);
  const srcFindings = srcFiles.flatMap(scanFile);
  const prismaFindings = scanPrismaRuntimeUnsafe();

  const blockingFindings = srcFindings;
  const advisoryFindings = prismaFindings;

  if (blockingFindings.length > 0) {
    console.error('SQL security check failed. Unsafe database access patterns detected:\n');
    for (const finding of blockingFindings) {
      console.error(`  ${finding.file}:${finding.line} [${finding.rule}]`);
      console.error(`    ${finding.excerpt}\n`);
    }
  }

  if (advisoryFindings.length > 0 && process.env.SQL_CHECK_VERBOSE === '1') {
    console.warn('Advisory: prisma/ scripts using RawUnsafe (review for migration candidates):\n');
    for (const finding of advisoryFindings) {
      console.warn(`  ${finding.file}:${finding.line}`);
    }
  }

  if (blockingFindings.length > 0) {
    process.exit(1);
  }

  console.log(
    `SQL security check passed (${srcFiles.length} backend/src files scanned).` +
      (advisoryFindings.length > 0
        ? ` ${advisoryFindings.length} prisma script advisory note(s) — set SQL_CHECK_VERBOSE=1 to list.`
        : ''),
  );
}

main();
