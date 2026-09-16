import { ChatterPostsService } from './chatter-posts.service';
import { UserRole } from '../common/constants/roles.enum';

const VIEWER_ID = '9001';
const HOD_ID = '9002';
const SALES_A = '9003';
const SALES_B = '9004';
const DESIGNER_SAME = '9005';
const DESIGNER_OTHER = '9006';
const ASSIGNEE_ID = '9007';
const PROJECT_ID = '88888888-8888-4888-8888-888888888888';

function userRow(id: string, userName: string, role: UserRole) {
  return {
    id,
    userName,
    role,
  };
}

describe('ChatterPostsService mention eligibility', () => {
  const queryRaw = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
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
    userRow(VIEWER_ID, 'Alex Designer', UserRole.DESIGNER),
    userRow(HOD_ID, 'Hari HOD', UserRole.HOD),
    userRow(SALES_A, 'Sithara Sukumaran', UserRole.SALESPERSON),
    userRow(SALES_B, 'Fahad Sales', UserRole.SALESPERSON),
    userRow(DESIGNER_SAME, 'Dana SameDept', UserRole.DESIGNER),
    userRow(DESIGNER_OTHER, 'Omar OtherDept', UserRole.DESIGNER),
    userRow(ASSIGNEE_ID, 'Assigned Designer', UserRole.DESIGNER),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockResolvedValue([]);
    usersService.findAll.mockResolvedValue(allUsers);
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
    // Department-based exclusion no longer applies: ErpUser has no department
    // field post-migration, so isDesignerDepartmentMentionable treats every
    // designer as mentionable (genuine, accepted behavior change).
    expect(ids).toContain(DESIGNER_OTHER);
  });

  it('keeps existing HOD mention rules (department-based designer gating no longer applies)', async () => {
    const result = await service.listMentionUsers(VIEWER_ID, UserRole.DESIGNER, undefined, PROJECT_ID);
    const ids = result.map((user) => user.id);

    expect(ids).toEqual(
      expect.arrayContaining([VIEWER_ID, HOD_ID, DESIGNER_SAME, DESIGNER_OTHER, SALES_A, SALES_B]),
    );
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
