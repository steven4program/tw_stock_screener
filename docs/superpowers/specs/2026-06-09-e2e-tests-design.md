# E2E Tests for the Taiwan Stock Screener Frontend — Design

**Date:** 2026-06-09
**Status:** Approved design (pre-plan)
**Author:** brainstormed with the team

## Goal

Add browser-level end-to-end tests that protect the screener **frontend** — real hydration of the client island, click→re-render wiring, status banners — across three layers: a smoke/critical path, the key user interactions, and every status scenario. These cover what the existing 76 vitest unit tests cannot reach.

## Context (current state)

- `web/app/page.tsx` is `export const dynamic = 'force-dynamic'` and **server-reads Supabase** via `getLatestSnapshot()` (`web/lib/snapshot.server.ts`). It does **not** go through the `/api/snapshots/latest` route, so Playwright's browser-level network interception cannot influence the page's server render.
- The interactive surface is a single client island (`web/components/screener/Screener.tsx`, `'use client'`) holding N/X params, active tab, sort key, and per-row expand state; it calls `runFilter(signals, {n, x})` then `manualSort` in the browser.
- Existing tests: `npm run test` → 76 vitest unit tests for pure logic (`runFilter`, `manualSort`, `deriveScenario`, formatters). No browser/E2E framework exists.
- A design fixture exists at `docs/design_handoff_stock_screener/sample-snapshot.json` (different shape — `{snapshot, ...}` — not the `SnapshotPayload` contract; useful as reference only).
- Data contract the fixtures must honor — `SnapshotPayload` (from `web/lib/snapshot.ts`): `{ signals: StockSignal[], scenario, dataDate, lastSuccessDate, generatedAt, directorDataMonthLatest }`; `Scenario = 'success' | 'stale' | 'partial' | 'failed' | 'no_data'`. `StockSignal` fields are in `web/lib/types.ts`.

## Scope

**In scope**
- Playwright test harness (`@playwright/test`) running against a production build.
- An env-gated, cookie-selected **fixture seam** so the page renders deterministic data per scenario without Supabase.
- Three spec files: smoke, interactions, status states.
- A small vitest **fixture-validation** test that pins what `runFilter` produces for the shared fixture, so fixture edits can't silently break the E2E assertions.
- `npm run e2e` script (kept separate from `npm run test`).

**Out of scope (explicit YAGNI)**
- Visual-regression / screenshot snapshots.
- A real seeded test Supabase DB.
- CI wiring (GitHub Actions) — left as an optional follow-up.
- Testing the Supabase query, `mapRow`, or `deriveScenario` through the browser (already unit-covered).

## Architecture

### Decision: env-gated fixture seam, cookie-selected scenario

```
Playwright test
  ├─ context.addCookies([{ name: 'e2e_scenario', value: 'stale', url: baseURL }])
  └─ page.goto('/')
        │  (server render, E2E=1)
        ▼
  page.tsx → getLatestSnapshot()
        │
        ├─ if (process.env.E2E === '1'):
        │     scenario = cookies().get('e2e_scenario')?.value ?? 'success'
        │     return (await import('./snapshot.fixture.server')).getFixtureSnapshot(scenario)
        │
        └─ else: real Supabase path (unchanged)
        ▼
  Real <StatusBar/> + <Screener/> render & hydrate
```

- **Why this approach:** deterministic status states (no `today`/timestamp math), no DB/network (fast, non-flaky), one server serves all 5 scenarios. It exercises the real components, hydration, and interactions — only the data source is stubbed. The seam is the right layer because the query/mapping/`deriveScenario` are already unit-tested. (Rejected alternatives: seeded DB — buys fidelity we already have at high flake cost; mocking the supabase-js builder chain — brittle.)
- **Production safety:** the branch is gated behind `process.env.E2E === '1'` (a server-side env read, evaluated at runtime), so the fixture path is **never executed in production**, where the flag is unset. The fixture module is loaded via **dynamic `import()`** inside the branch, so it is code-split into its own lazy chunk and never loaded unless the branch runs. `cookies()` is only called in the E2E branch, so the production code path of `getLatestSnapshot` is unchanged. (The same guard also applies when the `/api/snapshots/latest` route calls `getLatestSnapshot`, which is fine — under `E2E=1` the API serves the same fixtures.)

### Components / files

- **Modify** `web/lib/snapshot.server.ts` — add the ~4-line E2E guard at the top of `getLatestSnapshot()` (dynamic import of the fixture module; reads `e2e_scenario` cookie via `next/headers`).
- **Create** `web/lib/snapshot.fixture.server.ts` (`import 'server-only'`) — exports `getFixtureSnapshot(scenario: string): SnapshotPayload`. Holds the shared `FIXTURE_SIGNALS: StockSignal[]` and a `SCENARIOS` map producing each `SnapshotPayload`. Unknown scenario → `success`.
- **Create** `web/lib/__tests__/snapshot.fixture.test.ts` (vitest) — fixture-validation: runs `runFilter(FIXTURE_SIGNALS, {n:2,x:15})` and `{n:3,x:20}` and asserts the canonical summary + presence/absence of specific stocks the E2E specs rely on. Also asserts each scenario wrapper has the expected `scenario`/`dataDate` and that `no_data` has an empty `signals`.
- **Create** `web/playwright.config.ts` — `testDir: './e2e'`, `baseURL: 'http://localhost:3100'`, `webServer: { command: 'E2E=1 next start -p 3100', reuseExistingServer: !process.env.CI, url: baseURL }`, single chromium project, `forbidOnly` in CI, trace `'on-first-retry'`.
- **Create** `web/e2e/smoke.spec.ts`, `web/e2e/interactions.spec.ts`, `web/e2e/status.spec.ts`.
- **Create** `web/e2e/fixtures.ts` (test-side helper) — `gotoScenario(page, context, scenario)` that sets the cookie and navigates; shared locators/selectors.
- **Modify** `web/package.json` — add `@playwright/test` (devDep) and scripts:
  - `"e2e": "next build && playwright test"` (build is plain; the seam is runtime-gated)
  - `"e2e:ui": "next build && playwright test --ui"`
- Optionally add a tiny number of stable `data-testid` hooks only where a CSS-class/role selector would be ambiguous (prefer role/text selectors first).

### The shared fixture (determinism contract)

`FIXTURE_SIGNALS` is a small, hand-built set of ~8–10 `StockSignal`s with controlled values so interactions produce **stable, assertable** outcomes. Rather than hard-coding magic counts, the fixture-validation vitest test pins the canonical `runFilter` results, and the E2E specs assert against named stocks + invariants. Required properties at the **defaults (N=2, X=15)**:

- A mix of tab membership: at least one **A-only**, one **B-only**, and one **A+B** stock (so the A / B / A+B tabs are each non-empty and distinguishable).
- At least one stock with `instBuyStreak === 2` that **matches at N=2 but drops at N=3** (anchors the N-stepper assertion).
- At least one stock with `directorHoldingPct` in `[15, 20)` that **matches at X=15 but drops at X=20** (anchors the X-stepper assertion).
- A clear **maximum** for each sort key so "sort by streak desc → first row = <known stock>" etc. is unambiguous (distinct `instBuyStreak`, `distMa*Ratio`, `instNetLots`, `volumeLots`, `directorHoldingPct` extremes).
- At least one stock with a **null** nullable field actually rendered (`changeRatio` and/or a `distMa*Ratio` for a matched group) to exercise the `—` rendering path.
- All matched stocks have non-null spine fields (`close`, `volumeLots`, `instNetLots`) per the real write contract.

Scenario wrappers (same `FIXTURE_SIGNALS` unless noted):
- `success` — `scenario:'success'`, `dataDate:'2026-06-09'`, `lastSuccessDate:'2026-06-09'`, `directorDataMonthLatest:'2026-05'`.
- `partial` — `scenario:'partial'`, dates as success, `directorDataMonthLatest:'2026-04'` (drives the "董監資料沿用 2026-04 月份" sub-banner).
- `stale`  — `scenario:'stale'`, `lastSuccessDate:'2026-06-03'`.
- `failed` — `scenario:'failed'`, `lastSuccessDate:'2026-06-06'`.
- `no_data` — `scenario:'no_data'`, `signals: []`, all date fields null.

## Test coverage

### `smoke.spec.ts` (default = success)
1. `/` returns 200 and the `<main>` renders; the param panel (`篩選參數`), status bar (`role="status"`), and the stock list are visible.
2. The list renders ≥1 stock row (`article.srow`).
3. **No console errors** and **no React hydration warning** during load (collect `page.on('console')` / `pageerror`; fail on error-level entries).

Selector notes: the ± stepper buttons carry distinct `aria-label`s (`增加法人連買天數` / `減少法人連買天數` / `增加董監持股門檻` / `減少董監持股門檻`, from the a11y pass) → select via `getByRole('button', { name })`. Tabs and skin buttons are `button`s with `aria-pressed`. The plan pins the **exact** sort-option and skin labels from `SORT_OPTIONS` (`web/components/screener/types.ts`) and `SkinSwitcher`; the bullets below reference them by meaning.

1. **N stepper:** record the visible row count; the N stepper value shows `2`; click `增加法人連買天數` → value shows `3` and the anchor stock with `instBuyStreak===2` is no longer in the list; click `減少法人連買天數` → it returns and the count matches the original.
2. **X stepper:** the X stepper value shows `15`; click `增加董監持股門檻` five times to `20` → the `[15,20)`-director anchor stock disappears.
3. **Tabs:** click the **A** tab → only A/A+B rows; the known **A-only** stock is present, the known **B-only** stock is absent. Click **B** → inverse. Click **A+B** → only the A+B stock(s). The active tab has `aria-pressed="true"`.
4. **Sort:** choose the streak-descending option → first `article.srow` is the known max-streak stock; choose the distance-ascending option → first row is the known min-dist stock.
5. **Expand reasons:** click a row's `看原因` → its `#reasons-<stockId>` region is visible and the button is `aria-expanded="true"`; click `收合` → hidden, `aria-expanded="false"`.
6. **Skin switch + persistence:** click the **paper** skin button → `html[data-skin="paper"]` and the button is `aria-pressed="true"`; **reload** → still `data-skin="paper"` (cookie persisted, no flash).

### `status.spec.ts` (one test per scenario cookie)
1. `success` → status bar tone `ok`, text contains `今日已更新`, no sub-banner.
2. `partial` → tone `ok`, sub-banner contains `董監資料沿用 2026-04`.
3. `stale` → tone `warn`, text contains `資料尚未更新` and `2026-06-03`.
4. `failed` → tone `bad`, text contains `更新失敗` and `2026-06-06`.
5. `no_data` → the `.no-data` card (`資料準備中`) renders; the param panel and stock list are **absent**.

## Error handling / edge behavior

- Fixture seam only activates when `process.env.E2E === '1'`; absent that, behavior is identical to today.
- Unknown `e2e_scenario` cookie value → falls back to `success` (defensive).
- If the dev forgets to set the cookie, the default `success` scenario renders (tests that rely on a scenario always set it explicitly).

## Risks & tradeoffs

- **Test-only branch in a production module** (`snapshot.server.ts`). Mitigated: env-gated, ~4 lines, dynamic import, clear comment. Accepted as the standard pattern for E2E-testing data-driven RSC pages.
- **Build needs network** for `next/font` Google Fonts at build time (same as the real build, which already succeeds).
- **Fixture drift:** if someone edits `FIXTURE_SIGNALS`, the vitest fixture-validation test fails fast, before E2E — keeping the two in sync.
- **Selector brittleness:** prefer role/text selectors; add `data-testid` only where unavoidable.

## Success criteria

1. `npm run e2e` builds, starts the server with `E2E=1`, and runs all three spec files green locally.
2. `npm run test` (unit, incl. the new fixture-validation test) stays green; production behavior of `getLatestSnapshot` is unchanged when `E2E` is unset.
3. The interactions and status-state assertions above all pass deterministically with no network/DB.
4. `npx tsc --noEmit` clean; `next build` (without `E2E`) unaffected; the fixture path never executes when `E2E` is unset (covered by criterion 2).
