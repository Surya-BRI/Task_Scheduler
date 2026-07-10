import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, email: string, password: string, landingUrl: RegExp) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/email address/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await Promise.all([
    page.waitForURL(landingUrl, { timeout: 30_000 }),
    page.getByRole('button', { name: /sign in/i }).click(),
  ]);
  await expect(page.locator('body')).not.toContainText(/login failed/i);
}

async function openDesignerTask(page: Page, taskId: string) {
  const taskPath = `/retail-task-view/${taskId}?from=designer-queue`;
  await page.goto(taskPath, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`/retail-task-view/${taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
    timeout: 20_000,
  });
}
test.describe('Credentials + EOD timer', () => {
  test('HOD Sara login lands on design-list', async ({ page }) => {
    await login(page, 'sarah.mitchell@bluerhine.com', 'hod123', /\/design-list(?:\/)?$/);
    await expect(page).toHaveURL(/\/design-list(?:\/)?$/);
  });

  test('Designer Alexander login lands on my work queue', async ({ page }) => {
    await login(page, 'alexander.allen@bluerhine.com', 'alex123', /\/design-list\/tasks/);
    await expect(page).toHaveURL(/\/design-list\/tasks/);
  });

  test('Alexander sees Still working prompt when timer runs after 6 PM', async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, 'alexander.allen@bluerhine.com', 'alex123', /\/design-list\/tasks/);

    const taskId = '3c772032-8a6c-4c0b-8f4a-d8cfded7efc3';
    await openDesignerTask(page, taskId);

    await page.clock.install({ time: new Date('2026-07-10T18:05:00') });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/retail-task-view/${taskId}`), { timeout: 20_000 });
    const startBtn = page.getByTitle('Start');
    const pauseBtn = page.getByTitle('Pause');
    await expect(pauseBtn).toBeVisible({ timeout: 20_000 });
    if (await startBtn.isEnabled()) {
      await startBtn.click();
    }

    await page.clock.fastForward(65_000);

    await expect(page.getByRole('heading', { name: /still working/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: /pause for today/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /yes, still working/i })).toBeVisible();
  });
});
