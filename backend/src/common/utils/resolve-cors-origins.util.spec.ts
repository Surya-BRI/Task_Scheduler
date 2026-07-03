import { resolveCorsOrigins } from './resolve-cors-origins.util';

describe('resolveCorsOrigins', () => {
  it('returns explicit origin list in production', () => {
    expect(resolveCorsOrigins('https://app.example.com,https://admin.example.com', 'production')).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('reflects request origin in non-production environments', () => {
    expect(resolveCorsOrigins('http://localhost:5000', 'development')).toBe(true);
    expect(resolveCorsOrigins('http://localhost:5000', 'test')).toBe(true);
  });
});
