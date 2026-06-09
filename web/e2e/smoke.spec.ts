import { test, expect, open, captureErrors } from './fixtures';

test('success snapshot renders shell + a named stock with no console/hydration errors', async ({ page, context }) => {
  const errors = captureErrors(page);
  await open(page, context, { scenario: 'success' });

  await expect(page.locator('main.app')).toBeVisible();
  await expect(page.locator('.params')).toBeVisible();
  await expect(page.locator('.status[role="status"]')).toHaveAttribute('data-tone', 'ok');
  await expect(page.getByText('台積電股')).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
