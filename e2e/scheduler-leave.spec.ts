import { test, expect, type Page } from '@playwright/test';

const HOD_EMAIL = 'sarah.mitchell@bluerhine.com';
const HOD_PASSWORD = 'hod123';
const FIXTURE_DESIGNER_ID = '11111111-2222-3333-4444-555555555555';
const FIXTURE_TASK_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

async function loginAsHod(page: Page) {
  const response = await page.request.post('/api/auth/login', {
    data: { email: HOD_EMAIL, password: HOD_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();

  await page.goto('/design-list', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/design-list(?:\/)?/, { timeout: 30_000 });
  await expect(page.getByText(/Loading session/i)).not.toBeVisible({ timeout: 30_000 });
}

type SchedulerRow = Record<string, unknown>;

async function openSchedulerWithLeaveFixture(page: Page) {
  const dayIndex = 0;

  const matchApi = (url: string, path: string) => url.includes(path);

  await page.route((url) => matchApi(url.href, '/api/v1/users') && url.search.includes('role=DESIGNER'), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: FIXTURE_DESIGNER_ID,
          email: 'alex.johnson@bluerhine.com',
          fullName: 'Alex Johnson',
          role: { name: 'DESIGNER' },
        },
      ]),
    });
  });

  await page.route((url) => matchApi(url.href, '/api/v1/tasks/scheduler-queue'), async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: FIXTURE_TASK_ID,
            opNo: 'OP-FIXTURE',
            title: 'Fixture Scheduler Task',
            signType: 'B315',
            revisionCode: 'A',
            designType: 'Project',
            disciplineType: 'Artwork',
            status: 'DESIGN_NEW',
            priority: 'Medium',
            assigneeId: FIXTURE_DESIGNER_ID,
            holdPreviousStatus: null,
            projectId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
            updatedAt: new Date().toISOString(),
            estimatedHours: 8,
            hasTaskDesigners: false,
            project: {
              id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
              name: 'Fixture Project',
              projectNo: 'PRJ-FIXTURE',
              category: 'Project',
              technicalHead: null,
              teamLead: null,
              subTeamLead: null,
              designers: null,
            },
          },
        ],
      }),
    });
  });

  await page.route((url) => matchApi(url.href, '/api/v1/scheduler-assignments/week/') && url.href.includes('/meta'), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ weekStartDate: '2026-07-13', version: 1, isLocked: false }),
    });
  });

  await page.route((url) => matchApi(url.href, '/api/v1/scheduler-assignments') && url.search.includes('weekStart='), async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: `leave-fixture-${FIXTURE_DESIGNER_ID}-${dayIndex}`,
          designerId: FIXTURE_DESIGNER_ID,
          dayIndex,
          requestType: 'LEAVE',
          leaveHours: 4,
          leaveSession: 'Second Half',
          scheduledHours: 4,
          assignedHours: 4,
          isSystemBlock: true,
          isLocked: true,
          leaveRequestIds: ['leave-fixture-1'],
          requestLabel: 'Approved leave - Half Day - Second Half',
        },
        {
          id: `${FIXTURE_TASK_ID}-fixture-a`,
          designerId: FIXTURE_DESIGNER_ID,
          taskId: FIXTURE_TASK_ID,
          dayIndex,
          scheduledHours: 4,
          assignedHours: 4,
          splitIndex: 1,
          totalParts: 2,
          parentId: FIXTURE_TASK_ID,
          designType: 'Project',
          title: 'Fixture Scheduler Task',
        },
        {
          id: `${FIXTURE_TASK_ID}-fixture-b`,
          designerId: FIXTURE_DESIGNER_ID,
          taskId: FIXTURE_TASK_ID,
          dayIndex,
          scheduledHours: 4,
          assignedHours: 4,
          splitIndex: 2,
          totalParts: 2,
          parentId: FIXTURE_TASK_ID,
          designType: 'Project',
          title: 'Fixture Scheduler Task',
        },
      ]),
    });
  });

  await page.route((url) => /\/api\/v1\/tasks\/[^/]+\/status/.test(url.href), async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.continue();
  });

  await page.route((url) => matchApi(url.href, '/api/v1/scheduler-assignments/task/'), async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.continue();
  });

  await page.route((url) => matchApi(url.href, '/api/v1/scheduler-assignments/week/') && !url.href.includes('/meta'), async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: 2, overflowPlacements: [], unplacedOverflow: [] }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/design-scheduler', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/Unassigned\s*&\s*On-HOLD/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Alex Johnson')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Approved leave - Half Day - Second Half/i)).toBeVisible({ timeout: 20_000 });
}

test.describe('Scheduler leave blocks', () => {
  test('approved leave stays in the regular row after unassigning a sibling task', async ({ page }) => {
    test.setTimeout(120_000);

    await loginAsHod(page);
    await openSchedulerWithLeaveFixture(page);

    const leaveCard = page.getByText(/Approved leave - Half Day - Second Half/i).first();
    await expect(leaveCard).toBeVisible({ timeout: 20_000 });

    const leaveCell = leaveCard.locator('xpath=ancestor::div[contains(@class,"border-r")][1]');
    await expect(leaveCell.locator('div.border-red-200').getByText(/Approved leave/i)).toHaveCount(0);

    const regularRow = leaveCell.locator('div.min-h-\\[20px\\]').first();
    const regularCards = regularRow.locator('> div');
    await expect(regularCards.first()).toContainText(/OP-FIXTURE/i);
    await expect(regularCards.last()).toContainText(/Approved leave/i);

    const draggableTasks = leaveCell.locator('[draggable="true"]');
    await expect(draggableTasks).toHaveCount(2, { timeout: 10_000 });

    const taskToUnassign = leaveCell
      .locator('div.min-h-\\[20px\\]')
      .first()
      .locator('[draggable="true"]')
      .first();
    const sidebar = page.locator('div.w-64.shrink-0.bg-slate-50.flex.flex-col').first();
    await taskToUnassign.dragTo(sidebar, { targetPosition: { x: 40, y: 200 }, force: true });

    await expect(page.getByRole('heading', { name: /Remove from Schedule\?/i })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: /Unassign Task/i }).click();

    await expect(leaveCard).toBeVisible({ timeout: 15_000 });
    await expect(leaveCell.locator('div.border-red-200').getByText(/Approved leave/i)).toHaveCount(0);
    await expect(leaveCell.getByText(/Approved leave - Half Day - Second Half/i)).toHaveCount(1);
    await expect(leaveCell.locator('[draggable="true"]')).toHaveCount(1);
  });
});
