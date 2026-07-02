import { ChatterPostsService } from './chatter-posts.service';
import { UserRole } from '../common/constants/roles.enum';
import { expectInputParameterized, extractPrismaSqlParts } from '../common/utils/prisma-sql-test.util';

const POST_ID = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '660e8400-e29b-41d4-a716-446655440001';

const FILTER_EDGE_CASES = [
  { label: 'single quote', value: "test' OR '1'='1" },
  { label: 'unicode', value: 'チャット' },
  { label: 'percent', value: '100%' },
  { label: 'empty', value: '' },
];

describe('ChatterPostsService SQL security', () => {
  const queryRaw = jest.fn();
  const executeRaw = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    user: { findUnique: jest.fn().mockResolvedValue({ role: { name: 'ADMIN' } }) },
    notification: { create: jest.fn() },
    task: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  };
  const usersService = { findAll: jest.fn().mockResolvedValue([]) };
  const activityLogger = { log: jest.fn() };
  const taskFilesService = { createSignedReadUrl: jest.fn() };

  const service = new ChatterPostsService(
    prisma as any,
    usersService as any,
    activityLogger as any,
    taskFilesService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockResolvedValue([]);
    executeRaw.mockResolvedValue(1);
  });

  it.each(FILTER_EDGE_CASES)('parameterizes findAll postType filter: $label', async ({ value }) => {
    await service.findAll('50', undefined, undefined, undefined, undefined, value);

    expect(queryRaw).toHaveBeenCalled();
    const listQuery = queryRaw.mock.calls[0][0];
    if (value.trim()) {
      expectInputParameterized(listQuery, value.trim());
    }
  });

  it('rejects invalid UUID filters instead of embedding them in SQL', async () => {
    await service.findAll(
      '50',
      "'; DROP TABLE ErpTSChatterPost; --",
      'not-a-uuid',
      'also-invalid',
      'bad-id',
    );

    const listQuery = queryRaw.mock.calls[0][0];
    const { strings } = extractPrismaSqlParts(listQuery);
    expect(strings.join('')).not.toContain('DROP TABLE');
  });

  it('parameterizes loadPostById with valid UUID', async () => {
    await service.loadPostById(POST_ID);

    expect(queryRaw).toHaveBeenCalled();
    expectInputParameterized(queryRaw.mock.calls[0][0], POST_ID, ['DROP TABLE']);
    const { values } = extractPrismaSqlParts(queryRaw.mock.calls[0][0]);
    expect(values).toContain(POST_ID);
  });

  it('parameterizes QS viewer filter in findAll', async () => {
    await service.findAll('10', undefined, undefined, undefined, undefined, undefined, undefined, undefined, USER_ID, UserRole.QS);

    const listQuery = queryRaw.mock.calls[0][0];
    const { values } = extractPrismaSqlParts(listQuery);
    expect(values).toContain(USER_ID);
  });

  it('parameterizes likePost mutations', async () => {
    queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cnt: 1 }]);

    await service.likePost(POST_ID, USER_ID);

    expect(executeRaw).toHaveBeenCalled();
    const insertOrDeleteQuery = executeRaw.mock.calls[0][0];
    const { values } = extractPrismaSqlParts(insertOrDeleteQuery);
    expect(values).toEqual(expect.arrayContaining([POST_ID, USER_ID]));
  });

  it('parameterizes updateComment message content', async () => {
    const commentId = '880e8400-e29b-41d4-a716-446655440003';
    const maliciousMessage = "'; UPDATE ErpTSUser SET roleId = NULL; --";
    queryRaw
      .mockResolvedValueOnce([{ authorId: USER_ID }])
      .mockResolvedValueOnce([
        {
          id: commentId,
          postId: POST_ID,
          authorId: USER_ID,
          mentionUserId: null,
          authorName: 'Tester',
          authorRole: 'DESIGNER',
          message: maliciousMessage,
          createdAt: new Date(),
        },
      ]);

    await service.updateComment(POST_ID, commentId, { message: maliciousMessage }, USER_ID);

    const updateQuery = executeRaw.mock.calls[0][0];
    expectInputParameterized(updateQuery, maliciousMessage);
  });
});
