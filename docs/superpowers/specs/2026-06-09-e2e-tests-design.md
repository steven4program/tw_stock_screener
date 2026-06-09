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
- Four spec files: smoke, interactions, rendering (data→DOM correctness), status states.
- A small vitest **fixture-sanity** test asserting the named anchor stocks keep their intended fields/membership (so fixture edits can't silently break the E2E assertions) — without re-pinning `runFilter` counts.
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
- **Create** `web/lib/__tests__/snapshot.fixture.test.ts` (vitest) — fixture **sanity** only (NOT a logic re-test): each named E2E anchor stock exists and has its intended fields (N-anchor `instBuyStreak===2`; X-anchor `directorHoldingPct ∈ [15,20)`; the A-only / B-only / A+B anchors have the matching `eligible*`/fields; one row `changeRatio>0`, one `<0`, one `=== null`; one row's `directorDataMonth` < `directorDataMonthLatest`), scenario names are valid, and `no_data.signals.length === 0`. It does **not** pin `runFilter` summary counts — that would just re-test pure logic already covered by `filter.test.ts`. (Cut per the Codex YAGNI pass.)
- **Create** `web/playwright.config.ts` — `testDir: './e2e'`, `baseURL: 'http://localhost:3100'`, `webServer: { command: 'E2E=1 next start -p 3100', reuseExistingServer: !process.env.CI, url: baseURL }`, single chromium project, `forbidOnly` in CI, trace `'on-first-retry'`.
- **Create** `web/e2e/smoke.spec.ts`, `web/e2e/interactions.spec.ts`, `web/e2e/rendering.spec.ts`, `web/e2e/status.spec.ts`.
- **Create** `web/e2e/fixtures.ts` (test-side helper) — `gotoScenario(page, context, scenario)` that sets the cookie and navigates; shared locators/selectors.
- **Modify** `web/package.json` — add `@playwright/test` (devDep) and scripts:
  - `"e2e": "next build && playwright test"` (build is plain; the seam is runtime-gated)
  - `"e2e:ui": "next build && playwright test --ui"`
- Optionally add a tiny number of stable `data-testid` hooks only where a CSS-class/role selector would be ambiguous (prefer role/text selectors first).

### The shared fixture (determinism contract)

`FIXTURE_SIGNALS` is the **smallest** hand-built set (~6 `StockSignal`s) that supports the browser behaviors actually tested — nothing more (right-sized per the Codex YAGNI pass). The E2E specs assert against **named stocks + invariants** (anchor appears/disappears), never magic counts. Required rows at the **defaults (N=2, X=15)** — roles may overlap on the same row:

- One **A-only**, one **B-only**, one **A+B** stock (so the A / B / A+B tabs are each non-empty and distinguishable by a named stock).
- An **N-anchor**: `instBuyStreak === 2` → matches at N=2, drops at N=3.
- An **X-anchor**: `directorHoldingPct ∈ [15, 20)` → matches at X=15, drops at X=20.
- One matched row with the clear **minimum `distMa*Ratio`** (anchors the single dist-ascending sort test). No other per-sort-key extrema are needed — we test one sort.
- **Rendering rows:** one with `changeRatio > 0`, one with `changeRatio < 0` (紅漲綠跌), one matched row with `changeRatio === null` (the `—` path), and one stock whose `directorDataMonth` is **older** than `directorDataMonthLatest` (the per-row `資料較舊` marker).
- All matched stocks have non-null spine fields (`close`, `volumeLots`, `instNetLots`).

Scenario wrappers (same `FIXTURE_SIGNALS` unless noted):
- `success` — `scenario:'success'`, `dataDate:'2026-06-09'`, `lastSuccessDate:'2026-06-09'`, `directorDataMonthLatest:'2026-05'`.
- `partial` — `scenario:'partial'`, dates as success, `directorDataMonthLatest:'2026-04'` (drives the "董監資料沿用 2026-04 月份" sub-banner).
- `stale`  — `scenario:'stale'`, `lastSuccessDate:'2026-06-03'`.
- `failed` — `scenario:'failed'`, `lastSuccessDate:'2026-06-06'`.
- `no_data` — `scenario:'no_data'`, `signals: []`, all date fields null.

## Test coverage

Selector notes: the ± stepper buttons carry distinct `aria-label`s (`增加法人連買天數` / `減少法人連買天數` / `增加董監持股門檻` / `減少董監持股門檻`, from the a11y pass) → `getByRole('button', { name })`. Tabs and skin buttons are `button`s with `aria-pressed`. The plan pins the exact sort-option and skin labels from `SORT_OPTIONS` (`web/components/screener/types.ts`) and `SkinSwitcher`; bullets reference them by meaning. **Assertions use named fixture stocks + invariants (anchor appears/disappears), not magic row counts.**

### `smoke.spec.ts` (success default)
1. `/` renders `<main>`; the param panel (`篩選參數`), the status bar (`role="status"`, `data-tone="ok"`), and the stock list are visible, and a **named fixture stock** appears in the list (stronger than "≥1 row").
2. **No console errors and no React hydration warning** during load (`page.on('console')` / `page.on('pageerror')`; fail on error-level entries). With the fixture's null fields present, this doubles as the cheap **server→client serialization + hydration** guard.

### `interactions.spec.ts` (success default) — proves the client island hydrated and re-renders
1. **N param:** the N stepper shows `2`; click `增加法人連買天數` → shows `3` and the **N-anchor** (`instBuyStreak===2`) disappears; click `減少法人連買天數` → it reappears.
2. **X param:** the X stepper shows `15`; click `增加董監持股門檻` up to `20` → the **X-anchor** disappears.
3. **Tabs:** click **A** → A-only stock present, B-only stock absent; **B** → inverse; **A+B** → only the A+B stock. Active tab has `aria-pressed="true"`.
4. **Sort (dist ascending — the one direction most likely mis-wired, since `SORT_DIR.dist='asc'` is the odd one out):** choose the distance-ascending option → first `article.srow` is the known **min-dist** stock. (Only this one sort is tested; the rest is `manualSort` unit-coverage.)
5. **Expand / collapse reasons:** click `看原因` → `#reasons-<stockId>` visible, button `aria-expanded="true"`; click `收合` → hidden, `aria-expanded="false"`.
6. **Client-side empty state (distinct from server `no_data`):** raise N/X until zero rows match → `EmptyState` renders **inside the still-present screener** (the param panel/tabs remain), NOT the server `no_data` card. Guards `Screener.tsx`'s `listRows.length === 0` branch.
7. **Skin — server no-FOUC + switch + persist:**
   - **(a) Server first-render:** with cookie `skin=paper` set *before the first navigation*, the initial server HTML already has `html[data-skin="paper"]` (guards `layout.tsx` reading the cookie server-side) and there is no hydration warning.
   - **(b) Switch:** from the default skin, click the **paper** button → `html[data-skin="paper"]`, button `aria-pressed="true"`.
   - **(c) Persist:** reload → still `data-skin="paper"`.

### `rendering.spec.ts` (success default) — data→DOM correctness the unit tests can't reach
1. **紅漲綠跌:** the `changeRatio>0` row renders its change with the up class (`.chg.up`, red); the `changeRatio<0` row with the down class (`.chg.down`, green). A flipped sign→class mapping fails here.
2. **Null change → `—`:** the `changeRatio===null` matched row renders `—` (not `0.00%`) in its `.chg` cell.
3. **Per-row stale director month:** the stock whose `directorDataMonth` < `directorDataMonthLatest` renders `.director-stale` containing `資料較舊`; a non-stale stock does not.

### `status.spec.ts` (one test per scenario cookie; `success` already covered by smoke)
1. `partial` → `data-tone="ok"`, sub-banner contains `董監資料沿用 2026-04`.
2. `stale`  → `data-tone="warn"`, text contains `資料尚未更新` and `2026-06-03`.
3. `failed` → `data-tone="bad"`, text contains `更新失敗` and `2026-06-06`.
4. `no_data` → the `.no-data` card (`資料準備中`) renders; the param panel and stock list are **absent**.

## Error handling / edge behavior

- Fixture seam only activates when `process.env.E2E === '1'`; absent that, behavior is identical to today.
- Unknown `e2e_scenario` cookie value → falls back to `success` (defensive).
- If the dev forgets to set the cookie, the default `success` scenario renders (tests that rely on a scenario always set it explicitly).

## Risks & tradeoffs

- **Test-only branch in a production module** (`snapshot.server.ts`). Mitigated: env-gated, ~4 lines, dynamic import, clear comment. Accepted as the standard pattern for E2E-testing data-driven RSC pages.
- **Build needs network** for `next/font` Google Fonts at build time (same as the real build, which already succeeds).
- **Fixture drift:** if someone edits `FIXTURE_SIGNALS` and breaks an anchor's intended membership/fields, the vitest fixture-sanity test fails fast, before E2E — keeping the two in sync.
- **Selector brittleness:** prefer role/text selectors; add `data-testid` only where unavoidable.
- **Coverage shaped by a Codex GPT-5.5 YAGNI / test-value review (2026-06-09):** cut fixture bookkeeping (no pinned `runFilter` counts; ~6-stock fixture; one sort test; `success` folded into smoke) and added the browser-only rendering/state checks most likely to catch real regressions (紅漲綠跌 colors, null `—`, per-row `資料較舊`, client-side `EmptyState`, server no-FOUC `data-skin`).

## Success criteria

1. `npm run e2e` builds, starts the server with `E2E=1`, and runs all four spec files green locally.
2. `npm run test` (unit, incl. the new fixture-sanity test) stays green; production behavior of `getLatestSnapshot` is unchanged when `E2E` is unset.
3. The interactions and status-state assertions above all pass deterministically with no network/DB.
4. `npx tsc --noEmit` clean; `next build` (without `E2E`) unaffected; the fixture path never executes when `E2E` is unset (covered by criterion 2).
