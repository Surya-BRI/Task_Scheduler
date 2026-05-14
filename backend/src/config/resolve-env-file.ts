import { existsSync } from 'fs';
import { join } from 'path';

export function resolveEnvFilePaths(): string[] {
  const candidates = [join(process.cwd(), '.env'), join(process.cwd(), 'backend', '.env')];
  const existing = candidates.filter((candidate) => existsSync(candidate));

  return existing.length > 0 ? existing : [candidates[0]];
}
