#!/usr/bin/env node
/**
 * Fails CI when generated build artifacts are tracked in git.
 * Run from repository root: node scripts/verify-repo-hygiene.js
 */
const { execSync } = require('child_process');

const TRACKED_ARTIFACT_PATTERNS = [
  /(^|\/)frontend\/\.next\//,
  /(^|\/)frontend\/out\//,
  /(^|\/)frontend\/build\//,
  /(^|\/)\.next\//,
  /(^|\/)dist\//,
  /\.tsbuildinfo$/,
];

function listTrackedFiles() {
  try {
    return execSync('git ls-files', { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const tracked = listTrackedFiles();
const violations = tracked.filter((file) =>
  TRACKED_ARTIFACT_PATTERNS.some((pattern) => pattern.test(file.replace(/\\/g, '/'))),
);

if (violations.length > 0) {
  console.error('Repository hygiene check failed. Tracked build/generated files found:\n');
  for (const file of violations) {
    console.error(`  - ${file}`);
  }
  console.error(
    '\nRemove them with: git rm -r --cached <path>  (then commit)\n' +
      'Ensure .gitignore covers these paths to prevent re-tracking.',
  );
  process.exit(1);
}

console.log(`Repository hygiene check passed (${tracked.length} tracked files scanned).`);
