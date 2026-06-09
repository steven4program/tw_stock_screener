import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';

export { test, expect };

const BASE = 'http://localhost:3100';

/** Set the e2e_scenario cookie (and optional skin) then open the page. */
export async function open(
  page: Page,
  context: BrowserContext,
  opts: { scenario?: string; skin?: string } = {},
): Promise<void> {
  const cookies = [{ name: 'e2e_scenario', value: opts.scenario ?? 'success', url: BASE }];
  if (opts.skin) cookies.push({ name: 'skin', value: opts.skin, url: BASE });
  await context.addCookies(cookies);
  await page.goto('/');
}

/** Collect console.error + pageerror entries (attach BEFORE navigating). */
export function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}
