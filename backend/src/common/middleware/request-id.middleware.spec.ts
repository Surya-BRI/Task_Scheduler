import { resolveRequestId } from './request-id.middleware';

describe('request-id.middleware', () => {
  it('reuses a valid incoming request id', () => {
    expect(resolveRequestId('abc-123')).toBe('abc-123');
  });

  it('generates a uuid when header is missing', () => {
    const id = resolveRequestId(undefined);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('generates a uuid when header is too long', () => {
    const id = resolveRequestId('x'.repeat(200));
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
