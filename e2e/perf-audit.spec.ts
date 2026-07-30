import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface RequestMetric {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  requestSize: number;
  responseSize: number;
  initiator: string;
  timestamp: number;
}

const capturedMetrics: RequestMetric[] = [];

test.beforeEach(async ({ page }) => {
  page.on('requestfinished', async (request) => {
    try {
      const response = await request.response();
      const timing = request.timing();
      const durationMs = timing ? Math.max(0, timing.responseEnd - timing.startTime) : 0;
      
      const reqHeaders = request.headers();
      const reqBody = request.postDataBuffer();
      const requestSize = reqBody ? reqBody.length : (reqHeaders['content-length'] ? parseInt(reqHeaders['content-length']) : 0);
      
      let responseSize = 0;
      if (response) {
        const resHeaders = response.headers();
        const resBody = await response.body().catch(() => null);
        responseSize = resBody ? resBody.length : (resHeaders['content-length'] ? parseInt(resHeaders['content-length']) : 0);
      }

      const url = request.url();
      if (url.includes('/api/') || url.includes(':5001/')) {
        capturedMetrics.push({
          url,
          method: request.method(),
          status: response ? response.status() : 0,
          durationMs: Math.round(durationMs),
          requestSize,
          responseSize,
          initiator: request.resourceType(),
          timestamp: Date.now(),
        });
      }
    } catch {
      // Ignore timing collection errors for closed requests
    }
  });
});

test.describe('Performance & Network Audit Suite', () => {
  test('Audit 1: Login & Session Hydration Workflow', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    
    // Fill credentials
    const emailInput = page.getByLabel(/email address/i);
    const passwordInput = page.getByLabel(/^password$/i);
    
    if (await emailInput.isVisible()) {
      await emailInput.fill('alex@example.com');
      await passwordInput.fill('password123');
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForTimeout(1000);
    }
  });

  test('Audit 2: Projects Overview & Dashboard Workflow', async ({ page }) => {
    await page.goto('/projects-overview');
    await page.waitForTimeout(1500);
  });

  test('Audit 3: Projects List & Search Debounce Test', async ({ page }) => {
    await page.goto('/projects-list');
    await page.waitForTimeout(1000);
    
    const searchInput = page.getByPlaceholder(/search projects/i).first();
    if (await searchInput.isVisible()) {
      // Rapid typing request storm test
      await searchInput.pressSequentially('RETAIL PROJECT TEST SEARCH', { delay: 50 });
      await page.waitForTimeout(1000);
    }
  });

  test('Audit 4: QS Projects Workflow & Rapid Filtering', async ({ page }) => {
    await page.goto('/qs/projects');
    await page.waitForTimeout(1000);
    
    const searchInput = page.getByPlaceholder(/search/i).first();
    if (await searchInput.isVisible()) {
      await searchInput.pressSequentially('FAST SEARCH QUERY', { delay: 30 });
      await page.waitForTimeout(1000);
    }
  });

  test('Audit 5: Design Scheduler Workflow', async ({ page }) => {
    await page.goto('/design-scheduler');
    await page.waitForTimeout(1500);
  });

  test('Audit 6: Team Activity / Chatter Workflow', async ({ page }) => {
    await page.goto('/chatter');
    await page.waitForTimeout(1000);
  });

  test('Audit 7: Rapid Button Click Request Storm Test', async ({ page }) => {
    await page.goto('/login');
    const submitBtn = page.getByRole('button', { name: /sign in/i });
    if (await submitBtn.isVisible()) {
      // Click 3 times in rapid succession
      await Promise.all([
        submitBtn.click({ clickCount: 1 }).catch(() => {}),
        submitBtn.click({ clickCount: 1 }).catch(() => {}),
        submitBtn.click({ clickCount: 1 }).catch(() => {}),
      ]);
      await page.waitForTimeout(500);
    }
  });
});

test.afterAll(async () => {
  const outputPath = path.join(process.cwd(), 'perf-audit-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(capturedMetrics, null, 2));
  console.log(`Saved ${capturedMetrics.length} captured network request metrics to ${outputPath}`);
});
