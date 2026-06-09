import { test, expect, open } from './fixtures';

const bar = '.status[role="status"]';

test('partial: ok tone + director-reuse sub-banner', async ({ page, context }) => {
  await open(page, context, { scenario: 'partial' });
  await expect(page.locator(bar)).toHaveAttribute('data-tone', 'ok');
  await expect(page.locator(bar)).toContainText('董監資料沿用 2026-04');
});

test('stale: warn tone + last-success date', async ({ page, context }) => {
  await open(page, context, { scenario: 'stale' });
  await expect(page.locator(bar)).toHaveAttribute('data-tone', 'warn');
  await expect(page.locator(bar)).toContainText('資料尚未更新');
  await expect(page.locator(bar)).toContainText('2026-06-03');
});

test('failed: bad tone + last-success date', async ({ page, context }) => {
  await open(page, context, { scenario: 'failed' });
  await expect(page.locator(bar)).toHaveAttribute('data-tone', 'bad');
  await expect(page.locator(bar)).toContainText('更新失敗');
  await expect(page.locator(bar)).toContainText('2026-06-06');
});

test('no_data: card renders, screener is absent', async ({ page, context }) => {
  await open(page, context, { scenario: 'no_data' });
  await expect(page.locator('.no-data')).toBeVisible();
  await expect(page.getByText('資料準備中')).toBeVisible();
  await expect(page.locator('.params')).toHaveCount(0);
  await expect(page.locator('article.srow')).toHaveCount(0);
});
