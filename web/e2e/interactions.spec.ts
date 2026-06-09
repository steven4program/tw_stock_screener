import { test, expect, open, captureErrors } from './fixtures';

test.describe('client island interactions', () => {
  test.beforeEach(async ({ page, context }) => { await open(page, context, { scenario: 'success' }); });

  test('N param: streak-2 anchor drops at N=3, returns at N=2', async ({ page }) => {
    const anchor = page.locator('article.srow', { hasText: '水泥股' });
    await expect(anchor).toBeVisible();
    await page.getByRole('button', { name: '增加法人連買天數' }).click(); // N=3
    await expect(anchor).toHaveCount(0);
    await page.getByRole('button', { name: '減少法人連買天數' }).click(); // N=2
    await expect(anchor).toBeVisible();
  });

  test('X param: director-16 anchor drops at X=20', async ({ page }) => {
    const anchor = page.locator('article.srow', { hasText: '邊緣股' });
    await expect(anchor).toBeVisible();
    const inc = page.getByRole('button', { name: '增加董監持股門檻' });
    for (let i = 0; i < 5; i++) await inc.click(); // 15 → 20
    await expect(anchor).toHaveCount(0);
  });

  test('tabs filter to A / B / A+B by named stock', async ({ page }) => {
    const aOnly = page.locator('article.srow', { hasText: '大立光股' }); // 3008
    const bOnly = page.locator('article.srow', { hasText: '環球晶股' }); // 6488
    const both = page.locator('article.srow', { hasText: '台積電股' });  // 2330

    const aTab = page.getByRole('button', { name: /A 季線型/ });
    await aTab.click();
    await expect(aTab).toHaveAttribute('aria-pressed', 'true');
    await expect(aOnly).toBeVisible();
    await expect(bOnly).toHaveCount(0);

    await page.getByRole('button', { name: /B 月線型/ }).click();
    await expect(bOnly).toBeVisible();
    await expect(aOnly).toHaveCount(0);

    await page.getByRole('button', { name: /A\+B 同時符合/ }).click();
    await expect(both).toBeVisible();
    await expect(aOnly).toHaveCount(0);
    await expect(bOnly).toHaveCount(0);
  });

  test('sort by 距均線% ascending puts the min-dist stock first', async ({ page }) => {
    await page.getByRole('combobox').selectOption({ label: '距均線%' });
    await expect(page.locator('article.srow').first()).toContainText('台積電股');
  });

  test('expand/collapse a row toggles its reasons region', async ({ page }) => {
    const row = page.locator('article.srow', { hasText: '台積電股' });
    const btn = row.locator('button.reason-btn');
    await btn.click();
    await expect(page.locator('#reasons-2330')).toBeVisible();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await btn.click();
    await expect(page.locator('#reasons-2330')).toHaveCount(0);
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  test('raising N past all matches shows the client EmptyState (not no_data)', async ({ page }) => {
    const inc = page.getByRole('button', { name: '增加法人連買天數' });
    for (let i = 0; i < 8; i++) await inc.click(); // 2 → 10; max streak is 9
    await expect(page.locator('.empty')).toBeVisible();
    await expect(page.getByText('今日無符合條件的股票')).toBeVisible();
    await expect(page.locator('.params')).toBeVisible();   // island still present
    await expect(page.locator('.no-data')).toHaveCount(0); // NOT the server card
    await expect(page.locator('article.srow')).toHaveCount(0);
  });

  test('skin switch sets data-skin and persists across reload', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'default');
    const paper = page.getByRole('button', { name: '報紙' });
    await paper.click();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'paper');
    await expect(paper).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'paper');
  });

  test('市場別篩選 上市/上櫃 narrows list and counts', async ({ page }) => {
    const marketGroup = page.getByRole('group', { name: '市場別' });
    const tw = page.locator('article.srow', { hasText: '台積電股' }); // 2330 TWSE
    const tp = page.locator('article.srow', { hasText: '環球晶股' }); // 6488 TPEx

    await expect(page.locator('article.srow')).toHaveCount(5); // 全部

    await marketGroup.getByRole('button', { name: '上櫃' }).click();
    await expect(tp).toBeVisible();
    await expect(tw).toHaveCount(0);
    await expect(page.locator('article.srow')).toHaveCount(2); // 6488 + 9999

    await marketGroup.getByRole('button', { name: '上市' }).click();
    await expect(tw).toBeVisible();
    await expect(tp).toHaveCount(0);
    await expect(page.locator('article.srow')).toHaveCount(3); // 2330 + 1101 + 3008

    await marketGroup.getByRole('button', { name: '全部' }).click();
    await expect(page.locator('article.srow')).toHaveCount(5);
  });
});

test('server renders data-skin from the cookie on first load (no FOUC)', async ({ page, context }) => {
  const errors = captureErrors(page);
  await open(page, context, { scenario: 'success', skin: 'paper' });
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'paper');
  await expect(page.getByRole('button', { name: '報紙' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors, errors.join('\n')).toEqual([]);
});
