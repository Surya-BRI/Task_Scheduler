import { ChatterPostsService } from './chatter-posts.service';
import { UserRole } from '../common/constants/roles.enum';

const VIEWER_ID = '11111111-1111-4111-8111-111111111111';
const HOD_ID = '44444444-4444-4444-8444-444444444444';
const SALES_A = '22222222-2222-4222-8222-222222222222';
const SALES_B = '33333333-3333-4333-8333-333333333333';
const DESIGNER_SAME = '55555555-5555-4555-8555-555555555555';
const DESIGNER_OTHER = '66666666-6666-4666-8666-666666666666';
const ASSIGNEE_ID = '77777777-7777-4777-8777-777777777777';
const PROJECT_ID = '88888888-8888-4888-8888-888888888888';

function userRow(id: string, fullName: string, role: UserRole, departmentId?: string | null) {
  return {
    id,
    fullName,
    department: departmentId ? { id: departmentId } : null,
    role: { name: role },
  };
}

describe('ChatterPostsService mention eligibility', () => {
  const queryRaw = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
    user: { findUnique: jest.fn() },
    task: { findUnique: jest.fn(), findMany: jest.fn() },
  };
  const usersService = { findAll: jest.fn() };
  const activityLogger = { log: jest.fn() };
  const taskFilesService = { createSignedReadUrl: jest.fn() };

  const service = new ChatterPostsService(
    prisma as any,
    usersService as any,
    activityLogger as any,
    taskFilesService as any,
  );

  const allUsers = [
    userRow(VIEWER_ID, 'Alex Designer', UserRole.DESIGNER, 'dept-a'),
    userRow(HOD_ID, 'Hari HOD', UserRole.HOD, 'dept-a'),
    userRow(SALES_A, 'Sithara Sukumaran', UserRole.SALESPERSON, null),
    userRow(SALES_B, 'Fahad Sales', UserRole.SALESPERSON, null),
    userRow(DESIGNER_SAME, 'Dana SameDept', UserRole.DESIGNER, 'dept-a'),
    userRow(DESIGNER_OTHER, 'Omar OtherDept', UserRole.DESIGNER, 'dept-b'),
    userRow(ASSIGNEE_ID, 'Assigned Designer', UserRole.DESIGNER, 'dept-b'),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockResolvedValue([]);
    usersService.findAll.mockResolvedValue(allUsers);
    prisma.user.findUnique.mockResolvedValue({ departmentId: 'dept-a' });
    prisma.task.findUnique.mockResolvedValue(null);
    prisma.task.findMany.mockResolvedValue([]);
  });

  it('includes every sales user even when they are not assigned to the project', async () => {
    const result = await service.listMentionUsers(VIEWER_ID, UserRole.DESIGNER, undefined, PROJECT_ID);
    const ids = result.map((user) => user.id);

    expect(ids).toEqual(expect.arrayContaining([SALES_A, SALES_B]));
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: PROJECT_ID } }),
    );
  });

  it('includes every sales user for HOD viewers without requiring project assignment', async () => {
    const result = await service.listMentionUsers(HOD_ID, UserRole.HOD, undefined, PROJECT_ID);
    const ids = result.map((user) => user.id);

    expect(ids).toEqual(expect.arrayContaining([SALES_A, SALES_B, HOD_ID]));
    expect(ids).not.toContain(DESIGNER_OTHER);
  });

  it('keeps existing designer department and HOD mention rules', async () => {
    const result = await service.listMentionUsers(VIEWER_ID, UserRole.DESIGNER, undefined, PROJECT_ID);
    const ids = result.map((user) => user.id);

    expect(ids).toEqual(expect.arrayContaining([VIEWER_ID, HOD_ID, DESIGNER_SAME, SALES_A, SALES_B]));
    expect(ids).not.toContain(DESIGNER_OTHER);
  });

  it('still includes project assignees alongside sales users', async () => {
    prisma.task.findMany.mockResolvedValue([
      { assigneeId: ASSIGNEE_ID, taskDesigners: [] },
    ]);

    const result = await service.listMentionUsers(VIEWER_ID, UserRole.DESIGNER, undefined, PROJECT_ID);
    const ids = result.map((user) => user.id);

    expect(ids).toEqual(expect.arrayContaining([ASSIGNEE_ID, SALES_A, SALES_B]));
  });
});
