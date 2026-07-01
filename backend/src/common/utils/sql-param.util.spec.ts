import { Prisma } from '@prisma/client';
import {
  buildAndWhere,
  buildWhere,
  filterValidUuids,
  likeContainsPattern,
  optionalUuid,
  parseOptionalSqlDate,
} from './sql-param.util';

describe('sql-param.util', () => {
  it('optionalUuid accepts valid UUIDs and rejects invalid input', () => {
    expect(optionalUuid('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(optionalUuid("'; DROP TABLE users; --")).toBeNull();
    expect(optionalUuid('')).toBeNull();
  });

  it('filterValidUuids deduplicates and filters', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(filterValidUuids([id, id, 'not-a-uuid'])).toEqual([id]);
  });

  it('likeContainsPattern wraps search text', () => {
    expect(likeContainsPattern('abc')).toBe('%abc%');
  });

  it('parseOptionalSqlDate rejects invalid dates', () => {
    expect(parseOptionalSqlDate('2026-01-15')).toBeInstanceOf(Date);
    expect(parseOptionalSqlDate('not-a-date')).toBeNull();
  });

  it('buildAndWhere and buildWhere return Prisma.empty for no fragments', () => {
    expect(buildAndWhere([])).toBe(Prisma.empty);
    expect(buildWhere([])).toBe(Prisma.empty);
  });
});
