import { isSameUserId, normalizeUserId } from './user-id.util';

describe('user-id.util', () => {
  const id = '1001';

  it('normalizes numeric ids, trimming whitespace', () => {
    expect(normalizeUserId(id)).toBe(id);
    expect(normalizeUserId(` ${id} `)).toBe(id);
  });

  it('rejects non-numeric ids', () => {
    expect(normalizeUserId('not-a-number')).toBeNull();
    expect(normalizeUserId('a1b2c3d4-e5f6-4789-a012-3456789abcde')).toBeNull();
  });

  it('treats the same numeric id as the same user', () => {
    expect(isSameUserId(id, id)).toBe(true);
  });

  it('rejects mismatched users', () => {
    expect(isSameUserId(id, '1002')).toBe(false);
  });
});
