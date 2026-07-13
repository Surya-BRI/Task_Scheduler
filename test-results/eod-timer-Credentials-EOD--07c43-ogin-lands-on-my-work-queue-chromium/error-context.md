# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: eod-timer.spec.ts >> Credentials + EOD timer >> Designer Alexander login lands on my work queue
- Location: e2e\eod-timer.spec.ts:27:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
  navigated to "http://localhost:5000/login?"
  navigated to "http://localhost:5000/login"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - img "Blue Rhine Industries" [ref=e7]
        - heading "Welcome back" [level=1] [ref=e8]
        - paragraph [ref=e9]: Sign in to Task Scheduler
      - generic [ref=e11]:
        - generic [ref=e12]:
          - text: Email address
          - generic [ref=e13]:
            - img
            - textbox "Email address" [ref=e14]:
              - /placeholder: you@bluerhine.com
        - generic [ref=e15]:
          - text: Password
          - generic [ref=e16]:
            - img
            - textbox "Password" [ref=e17]:
              - /placeholder: ••••••••
            - button [ref=e18]:
              - img [ref=e19]
        - button "Sign In" [ref=e22]
        - generic [ref=e23]:
          - paragraph [ref=e24]: Quick Demo Logins
          - generic [ref=e25]:
            - button "HOD — Sarah Mitchell HOD" [ref=e26]:
              - generic [ref=e27]: HOD — Sarah Mitchell
              - generic [ref=e28]: HOD
            - button "HOD — James Carter HOD" [ref=e29]:
              - generic [ref=e30]: HOD — James Carter
              - generic [ref=e31]: HOD
            - button "HOD — Priya Sharma HOD" [ref=e32]:
              - generic [ref=e33]: HOD — Priya Sharma
              - generic [ref=e34]: HOD
            - button "QS — Ojas QS" [ref=e35]:
              - generic [ref=e36]: QS — Ojas
              - generic [ref=e37]: QS
            - button "Sales — Rehman Sales" [ref=e38]:
              - generic [ref=e39]: Sales — Rehman
              - generic [ref=e40]: Sales
            - button "Designer — Alex Johnson Designer" [ref=e41]:
              - generic [ref=e42]: Designer — Alex Johnson
              - generic [ref=e43]: Designer
            - button "Designer — Alexander Allen Designer" [ref=e44]:
              - generic [ref=e45]: Designer — Alexander Allen
              - generic [ref=e46]: Designer
            - button "Designer — Benjamin Harris Designer" [ref=e47]:
              - generic [ref=e48]: Designer — Benjamin Harris
              - generic [ref=e49]: Designer
    - paragraph [ref=e50]: © 2026 Blue Rhine Industries. All rights reserved.
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e56] [cursor=pointer]:
    - img [ref=e57]
  - alert [ref=e60]
```

# Test source

```ts
  1  | import { test, expect, type Page } from '@playwright/test';
  2  | 
  3  | async function login(page: Page, email: string, password: string, landingUrl: RegExp) {
  4  |   await page.goto('/login', { waitUntil: 'domcontentloaded' });
  5  |   await page.getByLabel(/email address/i).fill(email);
  6  |   await page.getByLabel(/^password$/i).fill(password);
  7  |   await Promise.all([
> 8  |     page.waitForURL(landingUrl, { timeout: 30_000 }),
     |          ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  9  |     page.getByRole('button', { name: /sign in/i }).click(),
  10 |   ]);
  11 |   await expect(page.locator('body')).not.toContainText(/login failed/i);
  12 | }
  13 | 
  14 | async function openDesignerTask(page: Page, taskId: string) {
  15 |   const taskPath = `/retail-task-view/${taskId}?from=designer-queue`;
  16 |   await page.goto(taskPath, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  17 |   await expect(page).toHaveURL(new RegExp(`/retail-task-view/${taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
  18 |     timeout: 20_000,
  19 |   });
  20 | }
  21 | test.describe('Credentials + EOD timer', () => {
  22 |   test('HOD Sara login lands on design-list', async ({ page }) => {
  23 |     await login(page, 'sarah.mitchell@bluerhine.com', 'hod123', /\/design-list(?:\/)?$/);
  24 |     await expect(page).toHaveURL(/\/design-list(?:\/)?$/);
  25 |   });
  26 | 
  27 |   test('Designer Alexander login lands on my work queue', async ({ page }) => {
  28 |     await login(page, 'alexander.allen@bluerhine.com', 'alex123', /\/design-list\/tasks/);
  29 |     await expect(page).toHaveURL(/\/design-list\/tasks/);
  30 |   });
  31 | 
  32 |   test('Alexander sees Still working prompt when timer runs after 6 PM', async ({ page }) => {
  33 |     test.setTimeout(90_000);
  34 |     await login(page, 'alexander.allen@bluerhine.com', 'alex123', /\/design-list\/tasks/);
  35 | 
  36 |     const taskId = '3c772032-8a6c-4c0b-8f4a-d8cfded7efc3';
  37 |     await openDesignerTask(page, taskId);
  38 | 
  39 |     await page.clock.install({ time: new Date('2026-07-10T18:05:00') });
  40 |     await page.reload({ waitUntil: 'domcontentloaded' });
  41 |     await expect(page).toHaveURL(new RegExp(`/retail-task-view/${taskId}`), { timeout: 20_000 });
  42 |     const startBtn = page.getByTitle('Start');
  43 |     const pauseBtn = page.getByTitle('Pause');
  44 |     await expect(pauseBtn).toBeVisible({ timeout: 20_000 });
  45 |     if (await startBtn.isEnabled()) {
  46 |       await startBtn.click();
  47 |     }
  48 | 
  49 |     await page.clock.fastForward(65_000);
  50 | 
  51 |     await expect(page.getByRole('heading', { name: /still working/i })).toBeVisible({
  52 |       timeout: 10_000,
  53 |     });
  54 |     await expect(page.getByRole('button', { name: /pause for today/i })).toBeVisible();
  55 |     await expect(page.getByRole('button', { name: /yes, still working/i })).toBeVisible();
  56 |   });
  57 | });
  58 | 
```