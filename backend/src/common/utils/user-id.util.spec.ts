import { isSameUserId, normalizeUserId } from './user-id.util';

describe('user-id.util', () => {
  const lower = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
  const upper = 'A1B2C3D4-E5F6-4789-A012-3456789ABCDE';

  it('normalizes UUID casing', () => {
    expect(normalizeUserId(upper)).toBe(lower);
    expect(normalizeUserId(` ${lower} `)).toBe(lower);
  });

  it('treats differently cased UUIDs as the same user', () => {
    expect(isSameUserId(lower, upper)).toBe(true);
  });

  it('rejects mismatched users', () => {
    expect(
      isSameUserId(lower, 'b1b2c3d4-e5f6-4789-a012-3456789abcde'),
    ).toBe(false);
  });
});
