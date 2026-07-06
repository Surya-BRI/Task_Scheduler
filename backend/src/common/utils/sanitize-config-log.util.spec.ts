import { maskDatabaseUrl, maskSecret, buildConfigLogSnapshot } from './sanitize-config-log.util';

describe('sanitize-config-log.util', () => {
  it('masks secrets without revealing values', () => {
    expect(maskSecret('super-secret-password')).toBe('***(21 chars)');
    expect(maskSecret(undefined)).toBe('(not set)');
  });

  it('redacts password segments from database URLs', () => {
    const url = 'sqlserver://localhost:1433;database=app;user=sa;password=Secret123!;encrypt=true';
    expect(maskDatabaseUrl(url)).toBe(
      'sqlserver://localhost:1433;database=app;user=sa;password=***;encrypt=true',
    );
  });

  it('builds a snapshot without plaintext credentials', () => {
    const snapshot = buildConfigLogSnapshot(
      {
        NODE_ENV: 'development',
        DB_PASSWORD: 'Secret123!',
        JWT_ACCESS_SECRET: 'jwt-secret-min-16-chars',
        AWS_SECRET_ACCESS_KEY: 'aws-key',
        DATABASE_URL: 'sqlserver://x;password=Secret123!;',
      },
      'sqlserver://x;password=Secret123!;',
    );

    expect(snapshot.hasDbPassword).toBe(true);
    expect(snapshot.hasJwtAccessSecret).toBe(true);
    expect(snapshot.resolvedDbUrl).not.toContain('Secret123!');
    expect(JSON.stringify(snapshot)).not.toContain('Secret123!');
    expect(JSON.stringify(snapshot)).not.toContain('jwt-secret-min-16-chars');
  });
});
