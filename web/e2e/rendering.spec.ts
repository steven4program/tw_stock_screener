import { test, expect, open } from './fixtures';

test.describe('data→DOM rendering', () => {
  test.beforeEach(async ({ page, context }) => { await open(page, context, { scenario: 'success' }); });

  test('紅漲綠跌: positive change uses .chg.up, negative uses .chg.down', async ({ page }) => {
    const up = page.locator('article.srow', { hasText: '台積電股' });   // +0.02
    const down = page.locator('article.srow', { hasText: '水泥股' });   // -0.015
    await expect(up.locator('.chg.up')).toBeVisible();
    await expect(down.locator('.chg.down')).toBeVisible();
  });

  test('null changeRatio renders — (not 0.00%)', async ({ page }) => {
    const nullRow = page.locator('article.srow', { hasText: '環球晶股' }); // changeRatio null
    await expect(nullRow.locator('.chg')).toHaveText('—');
    await expect(nullRow.locator('.chg')).not.toContainText('%');
  });

  test('per-row stale director month shows 資料較舊; fresh row does not', async ({ page }) => {
    const stale = page.locator('article.srow', { hasText: '大立光股' }); // month 2026-03 < latest 2026-05
    const fresh = page.locator('article.srow', { hasText: '台積電股' }); // month 2026-05
    await expect(stale.locator('.director-stale')).toContainText('資料較舊');
    await expect(fresh.locator('.director-stale')).toHaveCount(0);
  });
});
