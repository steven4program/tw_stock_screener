# Frontend Screener Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the read-only 台股選股器 main page in Next.js by porting the Claude Design hi-fi handoff, consuming the existing `lib/filter.ts` + a new server-only snapshot reader.

**Architecture:** Server Component `app/page.tsx` reads the snapshot via server-only `lib/snapshot.ts` (no self-fetch), derives the status `scenario`, and hands plain data to a single Client island `Screener` that runs the existing `runFilter`/`manualSort` and owns all interactivity (N/X steppers, tabs, sort, expand). Static chrome (StatusBar, title, footer) stays server-rendered; a small `SkinSwitcher` client island persists the skin via cookie.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · `next/font/google` · global CSS (ported design tokens + container queries) · Supabase (via existing `lib/repo.ts`) · vitest.

---

## Design references (read before coding)

- Spec: `docs/superpowers/specs/2026-06-09-frontend-screener-design.md` (the authority for architecture + scenario logic).
- Visual/markup source: `docs/design_handoff_stock_screener/components.jsx`, `App.jsx`, `styles.css`, `README.md`.
- Data contract (already built): `web/lib/types.ts` (`StockSignal`, `FilterRow`, `Tag`), `web/lib/filter.ts` (`runFilter`, `manualSort`, `ManualSortKey`, `SortDir`, `reasonsForA/B`), `web/lib/repo.ts` (`readSignalsByDate`), `web/lib/supabase.ts` (`getSupabase`).

## Gotchas (each has bitten before — honor them)

1. **Director % is already a percent number** (e.g. `24.8` = 24.8%), NOT a ratio. Display `directorHoldingPct.toFixed(1)` directly. Do **not** divide by 100 then multiply. (`changeRatio`/`distMa*Ratio` ARE decimal ratios → use `fmt.pct1`/`fmt.changePct` which ×100.)
2. **Sort keys renamed from the prototype**: prototype `net`→`buyLots`, `vol`→`volume` (match `ManualSortKey` in `filter.ts`).
3. **`composite` order is already applied** by `runFilter` (rows come pre-sorted); tab-filtering preserves it, so the `composite` branch must NOT re-sort.
4. **`lib/snapshot.ts` is server-only** — first line `import 'server-only'`. Never import it (or `lib/supabase.ts`) from a `'use client'` file.
5. **CJK fonts via `next/font/google`**: no `subsets`, explicit `weight` arrays, `preload:false`, `display:'swap'`. Self-hosted Noto TC weights are large; `preload:false` keeps them off the critical path (design fallback stack covers FOUT).
6. **Next.js 15 `cookies()` is async** → `await cookies()`; the layout/page become async (and therefore dynamic — intended).
7. **Commit messages: no `Co-Authored-By` trailer** (per current `AGENTS.md`).

## File structure (created/modified)

```
web/
  lib/
    format.ts                 (new) pure formatters: fmt, trendShort, isStaleDirectorMonth
    snapshot.ts               (new) pure: Scenario/JobStatus/SnapshotPayload types,
                              daysBetween, deriveScenario (vitest-safe, no Supabase import)
    snapshot.server.ts        (new, server-only) mapRow, getLatestSnapshot (Supabase)
    skin.ts                   (new) SKINS, Skin, normalizeSkin, SKIN_COOKIE
    fonts.ts                  (new) next/font Noto Sans TC + Noto Serif TC
    __tests__/format.test.ts  (new) unit tests
    __tests__/snapshot.test.ts(new) unit tests (deriveScenario, daysBetween)
  app/
    globals.css               (new) ported styles.css (tokens, 3 skins, container queries)
    layout.tsx                (modify) fonts + globals + cookie skin → <html data-skin> + metadata
    page.tsx                  (new) Server Component: getLatestSnapshot → StatusBar + Screener
    api/snapshots/latest/route.ts (modify) delegate to getLatestSnapshot
  components/screener/
    types.ts                  (new) FIXED, Tab, SortKey, SORT_DIR, SORT_OPTIONS
    StatusBar.tsx             (new, server) status tone/message
    Stepper.tsx               (new) +/- stepper
    ParamPanel.tsx            (new) N/X steppers + fixed chips
    StatsRow.tsx              (new) 4 stat cards
    Tabs.tsx                  (new) all/A/B/AB tabs
    SortBar.tsx               (new) sort select + count
    Change.tsx                (new) ▲/▼ change %
    MaLine.tsx                (new) MA summary line
    ReasonGroup.tsx           (new) badge + MaLine + reason list
    DirectorCell.tsx          (new) director % + stale-month badge
    StockItem.tsx             (new) row/card + expand
    StockList.tsx             (new) list wrapper
    EmptyState.tsx            (new) 0-rows state
    Footer.tsx                (new) disclaimer
    PageTitle.tsx             (new, server) title text
    SkinSwitcher.tsx          (new, client) skin radiogroup
    Screener.tsx              (new, client) state + runFilter/manualSort + compose
  package.json                (modify) add server-only
```

---

## Task 1: Add `server-only` dependency

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Install**

Run (in `web/`):
```bash
npm install server-only
```
Expected: `package.json` `dependencies` gains `"server-only"`; no errors.

- [ ] **Step 2: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "build(web): add server-only dep for server/client boundary guard"
```

---

## Task 2: Pure formatters `lib/format.ts` (TDD)

**Files:**
- Create: `web/lib/format.ts`
- Test: `web/lib/__tests__/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/__tests__/format.test.ts
import { describe, it, expect } from 'vitest';
import { fmt, trendShort, isStaleDirectorMonth } from '../format';

describe('fmt', () => {
  it('int adds thousands separators', () => {
    expect(fmt.int(4120)).toBe('4,120');
    expect(fmt.int(48.6)).toBe('49');
  });
  it('price: 1 decimal at >=100, 2 decimals below', () => {
    expect(fmt.price(168.5)).toBe('168.5');
    expect(fmt.price(75.8)).toBe('75.80');
  });
  it('pct1 multiplies ratio by 100, 1 decimal', () => {
    expect(fmt.pct1(0.09)).toBe('9.0');
    expect(fmt.pct1(-0.0596)).toBe('-6.0');
  });
  it('changePct signs the value, 2 decimals', () => {
    expect(fmt.changePct(0.0241)).toBe('+2.41%');
    expect(fmt.changePct(0)).toBe('0.00%');
    expect(fmt.changePct(-0.0035)).toBe('-0.35%');
  });
});

describe('trendShort', () => {
  const base = { ma20: null, ma20Prev: null, ma60: null, ma60Prev: null };
  it('A: 已上彎 when ma60 > ma60Prev else 扣抵向上', () => {
    expect(trendShort('A', { ...base, ma60: 154.6, ma60Prev: 153.9 })).toBe('已上彎');
    expect(trendShort('A', { ...base, ma60: 74.2, ma60Prev: 74.4 })).toBe('扣抵向上');
  });
  it('B: keys off ma20', () => {
    expect(trendShort('B', { ...base, ma20: 159.2, ma20Prev: 157.8 })).toBe('已上彎');
  });
});

describe('isStaleDirectorMonth', () => {
  it('true only when older than latest', () => {
    expect(isStaleDirectorMonth('2026-03', '2026-04')).toBe(true);
    expect(isStaleDirectorMonth('2026-04', '2026-04')).toBe(false);
    expect(isStaleDirectorMonth(null, '2026-04')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (in `web/`): `npx vitest run lib/__tests__/format.test.ts`
Expected: FAIL — `Cannot find module '../format'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// web/lib/format.ts — pure presentation helpers (no I/O)
export const fmt = {
  int(n: number): string {
    return Math.round(n).toLocaleString('en-US');
  },
  price(n: number): string {
    const d = n >= 100 ? 1 : 2;
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  /** ratio is a decimal (0.09 → "9.0"). NOT for director % (already a percent). */
  pct1(ratio: number): string {
    return (ratio * 100).toFixed(1);
  },
  changePct(ratio: number): string {
    const v = (ratio * 100).toFixed(2);
    return (ratio > 0 ? '+' : '') + v + '%';
  },
};

type MaFields = { ma20: number | null; ma20Prev: number | null; ma60: number | null; ma60Prev: number | null };

export function trendShort(kind: 'A' | 'B', s: MaFields): '已上彎' | '扣抵向上' {
  const ma = kind === 'A' ? s.ma60 : s.ma20;
  const prev = kind === 'A' ? s.ma60Prev : s.ma20Prev;
  return ma !== null && prev !== null && ma > prev ? '已上彎' : '扣抵向上';
}

/** month is older than the latest available director month. latest = max(directorDataMonth). */
export function isStaleDirectorMonth(month: string | null, latest: string | null): boolean {
  return month !== null && latest !== null && month < latest;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (in `web/`): `npx vitest run lib/__tests__/format.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add web/lib/format.ts web/lib/__tests__/format.test.ts
git commit -m "feat(web): pure presentation formatters (fmt, trendShort, isStaleDirectorMonth)"
```

---

## Task 3: Scenario logic `daysBetween` + `deriveScenario` (TDD)

**Files:**
- Create: `web/lib/snapshot.ts` (types + pure functions first; `getLatestSnapshot` added in Task 4)
- Test: `web/lib/__tests__/snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/__tests__/snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { daysBetween, deriveScenario } from '../snapshot';

describe('daysBetween', () => {
  it('counts calendar days (to - from), UTC-safe across months', () => {
    expect(daysBetween('2026-06-09', '2026-06-09')).toBe(0);
    expect(daysBetween('2026-06-06', '2026-06-09')).toBe(3);
    expect(daysBetween('2026-01-30', '2026-02-02')).toBe(3);
  });
});

describe('deriveScenario', () => {
  const ok = { latestStatus: 'success', displayStatus: 'success', displayDataDate: '2026-06-09', today: '2026-06-09' } as const;

  it('regression (friend finding 1): same-day no_new_data after success is NOT stale', () => {
    expect(deriveScenario({ ...ok, latestStatus: 'no_new_data' })).toBe('success');
  });
  it('fresh success → success; fresh partial → partial', () => {
    expect(deriveScenario(ok)).toBe('success');
    expect(deriveScenario({ ...ok, displayStatus: 'partial_success' })).toBe('partial');
  });
  it('latest failed → failed regardless of freshness (failed › stale)', () => {
    expect(deriveScenario({ ...ok, latestStatus: 'failed' })).toBe('failed');
    expect(deriveScenario({ latestStatus: 'failed', displayStatus: 'success', displayDataDate: '2026-06-01', today: '2026-06-09' })).toBe('failed');
  });
  it('data older than staleAfterDays → stale (stale › partial)', () => {
    expect(deriveScenario({ latestStatus: 'no_new_data', displayStatus: 'success', displayDataDate: '2026-06-04', today: '2026-06-09' })).toBe('stale');
    expect(deriveScenario({ latestStatus: 'no_new_data', displayStatus: 'partial_success', displayDataDate: '2026-06-04', today: '2026-06-09' })).toBe('stale');
  });
  it('weekend gap within threshold → not stale (Fri shown, Mon today)', () => {
    expect(deriveScenario({ latestStatus: 'no_new_data', displayStatus: 'success', displayDataDate: '2026-06-05', today: '2026-06-08' })).toBe('success');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (in `web/`): `npx vitest run lib/__tests__/snapshot.test.ts`
Expected: FAIL — `Cannot find module '../snapshot'`.

- [ ] **Step 3: Write minimal implementation (pure parts only)**

```ts
// web/lib/snapshot.ts — server-only snapshot reader + pure scenario logic
import type { StockSignal } from './types';

export type JobStatus = 'running' | 'success' | 'partial_success' | 'failed' | 'no_new_data';
export type Scenario = 'success' | 'stale' | 'partial' | 'failed' | 'no_data';

export interface SnapshotPayload {
  signals: StockSignal[];
  scenario: Scenario;
  dataDate: string | null;        // displayed snapshot date (= lastSuccessDate)
  lastSuccessDate: string | null;
  generatedAt: string | null;
  directorDataMonthLatest: string | null;
}

/** Calendar days (to - from); both 'YYYY-MM-DD', compared at UTC midnight. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Pure. `today` is injected (Asia/Taipei) so this stays testable. Precedence: failed › stale › partial › success. */
export function deriveScenario(input: {
  latestStatus: JobStatus;
  displayStatus: 'success' | 'partial_success';
  displayDataDate: string;
  today: string;
  staleAfterDays?: number;
}): 'success' | 'stale' | 'partial' | 'failed' {
  const { latestStatus, displayStatus, displayDataDate, today, staleAfterDays = 4 } = input;
  if (latestStatus === 'failed') return 'failed';
  if (daysBetween(displayDataDate, today) > staleAfterDays) return 'stale';
  if (displayStatus === 'partial_success') return 'partial';
  return 'success';
}
```

> NOTE: `snapshot.ts` stays **pure** — no `import 'server-only'`, no Supabase import. vitest imports `daysBetween`/`deriveScenario` from here directly. The Supabase reader and the `server-only` guard live in `snapshot.server.ts` (Task 4), which imports `deriveScenario` and the types from this file.

- [ ] **Step 4: Run test to verify it passes**

Run (in `web/`): `npx vitest run lib/__tests__/snapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/snapshot.ts web/lib/__tests__/snapshot.test.ts
git commit -m "feat(web): scenario derivation (date-aware, freshness-based) + daysBetween"
```

---

## Task 4: `getLatestSnapshot` server reader (`snapshot.server.ts`)

**Files:**
- Create: `web/lib/snapshot.server.ts` (server-only; the Supabase reader)

**Why a second file:** `lib/snapshot.ts` stays pure so vitest can import its functions. `getLatestSnapshot` uses Supabase and must never reach the client, so it lives in `snapshot.server.ts` with the `server-only` guard. App code (page + route) imports `getLatestSnapshot` from `@/lib/snapshot.server`; the pure `Scenario` type is imported from `@/lib/snapshot`.

- [ ] **Step 1: Create `web/lib/snapshot.server.ts`**

```ts
// web/lib/snapshot.server.ts — server-only Supabase snapshot reader
import 'server-only';
import { getSupabase } from './supabase';
import { readSignalsByDate } from './repo';
import type { StockSignal } from './types';
import { deriveScenario, type JobStatus, type SnapshotPayload } from './snapshot';

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(r: Record<string, unknown>): StockSignal {
  return {
    dataDate: r.data_date as string, stockId: r.stock_id as string, stockName: r.stock_name as string,
    market: r.market as StockSignal['market'],
    close: num(r.close) as number, changeRatio: num(r.change_ratio), volumeLots: num(r.volume_lots) as number,
    instNetLots: num(r.inst_net_lots) as number, instBuyStreak: (r.inst_buy_streak as number) ?? 0,
    directorHoldingPct: num(r.director_holding_pct), directorDataMonth: (r.director_data_month as string | null) ?? null,
    ma20: num(r.ma20), ma20Prev: num(r.ma20_prev), ma20Holdflat5d: num(r.ma20_holdflat_5d),
    ma60: num(r.ma60), ma60Prev: num(r.ma60_prev), ma60Holdflat5d: num(r.ma60_holdflat_5d),
    distMa20Ratio: num(r.dist_ma20_ratio), distMa60Ratio: num(r.dist_ma60_ratio),
    eligibleA: !!r.eligible_a, eligibleB: !!r.eligible_b,
    excludeReasonA: (r.exclude_reason_a as StockSignal['excludeReasonA']) ?? null,
    excludeReasonB: (r.exclude_reason_b as StockSignal['excludeReasonB']) ?? null,
  };
}

/** Server-only. Reads the latest displayable snapshot + derives the status scenario. */
export async function getLatestSnapshot(): Promise<SnapshotPayload> {
  const db = getSupabase();

  const { data: disp, error: dErr } = await db
    .from('job_runs').select('data_date, status, finished_at')
    .in('status', ['success', 'partial_success']).not('data_date', 'is', null)
    .order('data_date', { ascending: false }).limit(1);
  if (dErr) throw new Error(`getLatestSnapshot display: ${dErr.message}`);
  if (!disp || disp.length === 0) {
    return { signals: [], scenario: 'no_data', dataDate: null, lastSuccessDate: null, generatedAt: null, directorDataMonthLatest: null };
  }
  const display = disp[0] as { data_date: string; status: 'success' | 'partial_success'; finished_at: string | null };

  const { data: lat, error: lErr } = await db
    .from('job_runs').select('status').order('started_at', { ascending: false }).limit(1);
  if (lErr) throw new Error(`getLatestSnapshot latest: ${lErr.message}`);
  const latestStatus = ((lat?.[0]?.status as JobStatus) ?? display.status);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }); // 'YYYY-MM-DD'
  const scenario = deriveScenario({ latestStatus, displayStatus: display.status, displayDataDate: display.data_date, today });

  const rows = await readSignalsByDate(display.data_date);
  const signals = rows.map(mapRow);
  const directorDataMonthLatest = signals.reduce<string | null>(
    (m, s) => (s.directorDataMonth && (!m || s.directorDataMonth > m) ? s.directorDataMonth : m), null);

  return {
    signals, scenario,
    dataDate: display.data_date, lastSuccessDate: display.data_date,
    generatedAt: display.finished_at, directorDataMonthLatest,
  };
}
```

- [ ] **Step 2: Verify types + existing tests still pass**

Run (in `web/`): `npx tsc --noEmit && npx vitest run lib/__tests__/snapshot.test.ts`
Expected: no type errors; the pure `snapshot.test.ts` still PASSES (it imports only `snapshot.ts`, which is unchanged).

- [ ] **Step 3: Commit**

```bash
git add web/lib/snapshot.server.ts
git commit -m "feat(web): getLatestSnapshot server-only Supabase reader"
```

---

## Task 5: Delegate `/api/snapshots/latest` to `getLatestSnapshot`

**Files:**
- Modify: `web/app/api/snapshots/latest/route.ts` (replace body)

- [ ] **Step 1: Replace the route**

```ts
// web/app/api/snapshots/latest/route.ts
import { NextResponse } from 'next/server';
import { getLatestSnapshot } from '@/lib/snapshot.server';

export const revalidate = 0;

export async function GET(): Promise<Response> {
  try {
    const payload = await getLatestSnapshot();
    return NextResponse.json(payload, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify types**

Run (in `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/app/api/snapshots/latest/route.ts
git commit -m "refactor(web): /api/snapshots/latest delegates to getLatestSnapshot (richer payload)"
```

---

## Task 6: Skin cookie helpers `lib/skin.ts`

**Files:**
- Create: `web/lib/skin.ts`

- [ ] **Step 1: Create**

```ts
// web/lib/skin.ts — shared by server (cookie read) and client (SkinSwitcher)
export const SKINS = ['default', 'paper', 'bold'] as const;
export type Skin = (typeof SKINS)[number];
export const SKIN_COOKIE = 'skin';

export function normalizeSkin(v: string | undefined | null): Skin {
  return v && (SKINS as readonly string[]).includes(v) ? (v as Skin) : 'default';
}
```

- [ ] **Step 2: Verify types**

Run (in `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/lib/skin.ts
git commit -m "feat(web): skin cookie helpers (SKINS, normalizeSkin)"
```

---

## Task 7: Fonts `lib/fonts.ts`

**Files:**
- Create: `web/lib/fonts.ts`

- [ ] **Step 1: Create**

```ts
// web/lib/fonts.ts — CJK fonts via next/font/google (no subsets, preload:false; see plan gotcha 5)
import { Noto_Sans_TC, Noto_Serif_TC } from 'next/font/google';

export const notoSans = Noto_Sans_TC({
  weight: ['400', '600', '700', '800', '900'],
  display: 'swap',
  preload: false,
  variable: '--font-sans-tc',
  fallback: ['system-ui', 'sans-serif'],
});

export const notoSerif = Noto_Serif_TC({
  weight: ['700'],
  display: 'swap',
  preload: false,
  variable: '--font-serif-tc',
  fallback: ['Songti TC', 'serif'],
});
```

- [ ] **Step 2: Verify it resolves (fonts download at build/dev)**

Run (in `web/`): `npx tsc --noEmit`
Expected: no type errors. (Font download is validated by the build in Task 19; if `next` errors about subsets, `preload:false` is already the fix.)

- [ ] **Step 3: Commit**

```bash
git add web/lib/fonts.ts
git commit -m "feat(web): load Noto Sans/Serif TC via next/font as CSS variables"
```

---

## Task 8: Global stylesheet `app/globals.css`

**Files:**
- Create: `web/app/globals.css`

- [ ] **Step 1: Copy the design stylesheet verbatim, then apply the 3 edits below**

Run (in repo root):
```bash
cp docs/design_handoff_stock_screener/styles.css web/app/globals.css
```

- [ ] **Step 2: Edit 1 — wire next/font variables into the font tokens**

In `web/app/globals.css`, replace the two font token lines in `:root` (currently):
```css
  --font-serif: "Noto Serif TC", "Songti TC", serif;        /* 股名 / 標題 */
  --font-sans: "Noto Sans TC", system-ui, sans-serif;       /* 內文 / 數字 */
```
with:
```css
  --font-serif: var(--font-serif-tc), "Noto Serif TC", "Songti TC", serif;  /* 股名 / 標題 */
  --font-sans: var(--font-sans-tc), "Noto Sans TC", system-ui, sans-serif;  /* 內文 / 數字 */
```

- [ ] **Step 3: Edit 2 — delete the prototype-only DemoBar block**

Delete the entire `/* ---- 示範狀態切換條 ---- */` rule block (the `.demo-bar`, `.demo-bar .demo-label`, `.demo-seg`, `.demo-seg button`, `.demo-seg button[aria-pressed="true"]` rules).

- [ ] **Step 4: Edit 3 — append SkinSwitcher + no-data styles**

Append to the end of `web/app/globals.css`:
```css
/* =========================================================================
   皮膚切換器（正式）
   ========================================================================= */
.skin-switcher { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-left: auto; }
.skin-switcher .ss-label { font-size: var(--fs-small); color: var(--ink-3); font-weight: 700; margin-right: 2px; }
.skin-switcher button {
  font-family: var(--font-sans); font-size: var(--fs-small); font-weight: 700;
  min-height: var(--hit); padding: 8px 14px;
  border-radius: var(--radius-ctrl); border: 2px solid var(--border);
  background: var(--surface); color: var(--ink-2); cursor: pointer;
}
.skin-switcher button:hover { border-color: var(--border-strong); }
.skin-switcher button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }

/* =========================================================================
   空庫狀態（no_data）
   ========================================================================= */
.no-data { text-align: center; padding: var(--sp-8) var(--sp-5); }
.no-data .nd-ico { font-size: 48px; }
.no-data .nd-title { font-size: var(--fs-title); font-weight: 800; color: var(--ink); margin-top: var(--sp-3); }
.no-data .nd-sub { font-size: var(--fs-body); color: var(--ink-2); margin-top: 8px; }
```

- [ ] **Step 5: Commit**

```bash
git add web/app/globals.css
git commit -m "feat(web): port design tokens/skins/container-queries to globals.css"
```

---

## Task 9: Root layout — fonts, CSS, cookie skin

**Files:**
- Modify: `web/app/layout.tsx` (replace)

- [ ] **Step 1: Replace `layout.tsx`**

```tsx
// web/app/layout.tsx
import './globals.css';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { notoSans, notoSerif } from '@/lib/fonts';
import { normalizeSkin, SKIN_COOKIE } from '@/lib/skin';

export const metadata = {
  title: '台股選股器',
  description: '每日收盤後・上市＋上櫃技術選股',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const skin = normalizeSkin((await cookies()).get(SKIN_COOKIE)?.value);
  return (
    <html lang="zh-Hant" data-skin={skin} className={`${notoSans.variable} ${notoSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Verify types**

Run (in `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/app/layout.tsx
git commit -m "feat(web): layout wires fonts, globals, cookie-driven data-skin"
```

---

## Task 10: Screener shared types/constants

**Files:**
- Create: `web/components/screener/types.ts`

- [ ] **Step 1: Create**

```ts
// web/components/screener/types.ts
import type { ManualSortKey, SortDir } from '@/lib/filter';

export const FIXED = { distLow: 0, distHigh: 10, ma20: 20, ma60: 60, holdflatDays: 5 } as const;

export type Tab = 'all' | 'A' | 'B' | 'AB';
export type SortKey = 'composite' | ManualSortKey;

/** Per-key sort direction (matches prototype data.js). dist ascending = closer first. */
export const SORT_DIR: Record<ManualSortKey, SortDir> = {
  dist: 'asc', streak: 'desc', buyLots: 'desc', volume: 'desc', director: 'desc',
};

export const SORT_OPTIONS: [SortKey, string][] = [
  ['composite', '綜合排序'], ['streak', '連買天數'], ['dist', '距均線%'],
  ['buyLots', '買超張數'], ['volume', '成交量'], ['director', '董監持股%'],
];
```

- [ ] **Step 2: Verify types**

Run (in `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/screener/types.ts
git commit -m "feat(web): screener shared types/constants (FIXED, Tab, SortKey, SORT_DIR)"
```

---

## Task 11: `StatusBar` (server component)

**Files:**
- Create: `web/components/screener/StatusBar.tsx`

- [ ] **Step 1: Create** (ported from `components.jsx` StatusBar; wording per spec §4)

```tsx
// web/components/screener/StatusBar.tsx — static, server-rendered
import type { Scenario } from '@/lib/snapshot';

export function StatusBar({ scenario, dataDate, lastSuccessDate, directorDataMonthLatest }: {
  scenario: Scenario;
  dataDate: string | null;
  lastSuccessDate: string | null;
  directorDataMonthLatest: string | null;
}) {
  let tone = 'ok', ico = '✅', main = '', sub: string | null = null;
  if (scenario === 'stale') {
    tone = 'warn'; ico = '⚠️'; main = `資料尚未更新（最後更新 ${lastSuccessDate}）`;
  } else if (scenario === 'failed') {
    tone = 'bad'; ico = '⛔'; main = `更新失敗（顯示為上次成功資料 ${lastSuccessDate}）`;
  } else if (scenario === 'partial') {
    main = `今日已更新 ・ 資料日期 ${dataDate}`; sub = `⚠️ 董監資料沿用 ${directorDataMonthLatest} 月份`;
  } else {
    main = `今日已更新 ・ 資料日期 ${dataDate}`;
  }
  return (
    <div className="status card" data-tone={tone} role="status" aria-live="polite">
      <span className="ico" aria-hidden="true">{ico}</span>
      <div className="st-text">
        <div className="st-main">{main}</div>
        {sub && <span className="st-sub">{sub}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

Run (in `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/screener/StatusBar.tsx
git commit -m "feat(web): StatusBar (4 tones from scenario)"
```

---

## Task 12: `Stepper` + `ParamPanel`

**Files:**
- Create: `web/components/screener/Stepper.tsx`, `web/components/screener/ParamPanel.tsx`

- [ ] **Step 1: Create `Stepper.tsx`** (ported from `components.jsx` Stepper)

```tsx
// web/components/screener/Stepper.tsx
export function Stepper({ value, min, max, unit, onChange }: {
  value: number; min: number; max: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="stepper">
      <button className="step-btn" aria-label="減少" disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <div className="step-val num">{value}{unit && <span className="unit">{unit}</span>}</div>
      <button className="step-btn" aria-label="增加" disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}
```

- [ ] **Step 2: Create `ParamPanel.tsx`** (ported; uses `FIXED` from types, drops the `fixed` prop)

```tsx
// web/components/screener/ParamPanel.tsx
import { Stepper } from './Stepper';
import { FIXED } from './types';

export function ParamPanel({ n, x, onN, onX, dataDate }: {
  n: number; x: number; onN: (v: number) => void; onX: (v: number) => void; dataDate: string;
}) {
  return (
    <section className="params card" aria-label="篩選參數">
      <div className="params-head">
        <h2 className="serif">篩選參數</h2>
        <span className="data-date">資料日期 <b className="num">{dataDate}</b></span>
      </div>
      <div className="param-grid">
        <div className="param">
          <div className="p-name">法人連買天數 <b>N</b></div>
          <Stepper value={n} min={1} max={10} unit="天" onChange={onN} />
          <div className="p-range">可調範圍 1–10　預設 2</div>
        </div>
        <div className="param">
          <div className="p-name">董監持股門檻 <b>X</b></div>
          <Stepper value={x} min={5} max={50} unit="%" onChange={onX} />
          <div className="p-range">可調範圍 5–50　預設 15</div>
        </div>
      </div>
      <div className="fixed-params">
        <span className="fp-label">固定條件</span>
        <span className="fixed-chip">距均線 {FIXED.distLow}~{FIXED.distHigh}%</span>
        <span className="fixed-chip">月線 {FIXED.ma20}MA</span>
        <span className="fixed-chip">季線 {FIXED.ma60}MA</span>
        <span className="fixed-chip">扣抵 {FIXED.holdflatDays} 個交易日</span>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verify types**

Run (in `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/components/screener/Stepper.tsx web/components/screener/ParamPanel.tsx
git commit -m "feat(web): ParamPanel + Stepper (N/X steppers, fixed-condition chips)"
```

---

## Task 13: `StatsRow` + `Tabs` + `SortBar`

**Files:**
- Create: `web/components/screener/StatsRow.tsx`, `Tabs.tsx`, `SortBar.tsx`

- [ ] **Step 1: Create `StatsRow.tsx`** (ported)

```tsx
// web/components/screener/StatsRow.tsx
import type { FilterSummary } from '@/lib/types';

export function StatsRow({ summary }: { summary: FilterSummary }) {
  const items: [string, number, boolean][] = [
    ['全部', summary.total, false],
    ['A 季線型', summary.countA, false],
    ['B 月線型', summary.countB, false],
    ['A+B 同時', summary.countAB, true],
  ];
  return (
    <div className="stats">
      {items.map(([lab, n, ab]) => (
        <div key={lab} className={'stat' + (ab ? ' is-ab' : '')}>
          <div className="s-num num">{n} <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink-2)' }}>檔</span></div>
          <div className="s-lab">{lab}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `Tabs.tsx`** (ported; typed `Tab`)

```tsx
// web/components/screener/Tabs.tsx
import type { FilterSummary } from '@/lib/types';
import type { Tab } from './types';

export function Tabs({ tab, onTab, summary }: {
  tab: Tab; onTab: (t: Tab) => void; summary: FilterSummary;
}) {
  const items: [Tab, string, number][] = [
    ['all', '全部', summary.total],
    ['A', 'A 季線型', summary.countA],
    ['B', 'B 月線型', summary.countB],
    ['AB', 'A+B 同時符合', summary.countAB],
  ];
  return (
    <div className="tabs" role="tablist" aria-label="分類">
      {items.map(([k, label, c]) => (
        <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => onTab(k)}>
          {label}<span className="t-count num">{c}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `SortBar.tsx`** (ported; `SORT_OPTIONS` from types)

```tsx
// web/components/screener/SortBar.tsx
import type { SortKey } from './types';
import { SORT_OPTIONS } from './types';

export function SortBar({ sort, onSort, count }: {
  sort: SortKey; onSort: (s: SortKey) => void; count: number;
}) {
  return (
    <div className="sortbar">
      <label className="s-label" htmlFor="sortsel">排序</label>
      <select id="sortsel" className="sort-select" value={sort} onChange={(e) => onSort(e.target.value as SortKey)}>
        {SORT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <span className="list-meta num">共 {count} 檔</span>
    </div>
  );
}
```

- [ ] **Step 4: Verify types**

Run (in `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/components/screener/StatsRow.tsx web/components/screener/Tabs.tsx web/components/screener/SortBar.tsx
git commit -m "feat(web): StatsRow, Tabs, SortBar"
```

---

## Task 14: Row internals — `Change`, `MaLine`, `ReasonGroup`, `DirectorCell`, `StockItem`

**Files:**
- Create: `web/components/screener/Change.tsx`, `MaLine.tsx`, `ReasonGroup.tsx`, `DirectorCell.tsx`, `StockItem.tsx`

- [ ] **Step 1: Create `Change.tsx`** (ported)

```tsx
// web/components/screener/Change.tsx
import { fmt } from '@/lib/format';

export function Change({ r }: { r: number | null }) {
  const v = r ?? 0;
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '—';
  return <span className={'chg num ' + cls}>{arrow} {fmt.changePct(v)}</span>;
}
```

- [ ] **Step 2: Create `MaLine.tsx`** (ported; `trendShort` from format)

```tsx
// web/components/screener/MaLine.tsx
import type { StockSignal } from '@/lib/types';
import { fmt, trendShort } from '@/lib/format';

export function MaLine({ kind, sig }: { kind: 'A' | 'B'; sig: StockSignal }) {
  const isA = kind === 'A';
  const name = isA ? '季線(60MA)' : '月線(20MA)';
  const val = isA ? sig.ma60 : sig.ma20;
  const dist = isA ? sig.distMa60Ratio : sig.distMa20Ratio;
  const status = trendShort(kind, sig);
  const d = dist ?? 0;
  const sign = d >= 0 ? '+' : '';
  return (
    <div className="ma-line num">
      <span>{name} <b>{val !== null ? fmt.price(val) : '—'}</b></span>
      <span>距均線 <b>{sign}{fmt.pct1(d)}%</b></span>
      <span>狀態 <b>{status === '已上彎' ? '↑ 已上彎' : '↗ 扣抵向上'}</b></span>
    </div>
  );
}
```

- [ ] **Step 3: Create `ReasonGroup.tsx`** (ported)

```tsx
// web/components/screener/ReasonGroup.tsx
import type { StockSignal } from '@/lib/types';
import { MaLine } from './MaLine';

export function ReasonGroup({ kind, sig, reasons }: {
  kind: 'A' | 'B'; sig: StockSignal; reasons: string[];
}) {
  const isA = kind === 'A';
  return (
    <div className="reason-group">
      <div className="rg-head">
        <span className={'badge ' + (isA ? 'a' : 'b')}>{isA ? 'A 季線型' : 'B 月線型'}</span>
        <span className="rg-title serif">{isA ? '為什麼符合季線型' : '為什麼符合月線型'}</span>
      </div>
      <MaLine kind={kind} sig={sig} />
      <ul className="reason-list">
        {reasons.map((t, i) => (
          <li key={i}><span className="tick" aria-hidden="true">✓</span><span>{t}</span></li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Create `DirectorCell.tsx`** (ported; gotcha 1 — display percent directly; pass `latest`)

```tsx
// web/components/screener/DirectorCell.tsx
import type { StockSignal } from '@/lib/types';
import { isStaleDirectorMonth } from '@/lib/format';

export function DirectorCell({ sig, directorDataMonthLatest }: {
  sig: StockSignal; directorDataMonthLatest: string | null;
}) {
  const stale = isStaleDirectorMonth(sig.directorDataMonth, directorDataMonthLatest);
  return (
    <div className="cell director m-cell">
      <span className="col-label">董監持股</span>
      <div className="c-num num">{sig.directorHoldingPct !== null ? sig.directorHoldingPct.toFixed(1) : '—'}%</div>
      <div className="c-sub num">
        {stale
          ? <span className="director-stale">⚠ {sig.directorDataMonth}・資料較舊</span>
          : <span>{sig.directorDataMonth}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `StockItem.tsx`** (ported; `row: FilterRow`, `tab: Tab`)

```tsx
// web/components/screener/StockItem.tsx
import type { FilterRow } from '@/lib/types';
import type { Tab } from './types';
import { fmt } from '@/lib/format';
import { Change } from './Change';
import { DirectorCell } from './DirectorCell';
import { ReasonGroup } from './ReasonGroup';

export function StockItem({ row, tab, expanded, onToggle, directorDataMonthLatest }: {
  row: FilterRow; tab: Tab; expanded: boolean; onToggle: () => void; directorDataMonthLatest: string | null;
}) {
  const s = row.signal;
  const badge = row.tag === 'A+B'
    ? <span className="badge ab">★ A+B</span>
    : row.tag === 'A'
      ? <span className="badge a">A 季線型</span>
      : <span className="badge b">B 月線型</span>;

  let groups: ('A' | 'B')[] = [];
  if (tab === 'A') { if (row.matchA) groups = ['A']; }
  else if (tab === 'B') { if (row.matchB) groups = ['B']; }
  else if (tab === 'AB') { groups = ['A', 'B']; }
  else { if (row.matchA) groups.push('A'); if (row.matchB) groups.push('B'); }

  return (
    <article className="srow card">
      <div className="srow-main">
        <div className="s-name-wrap">
          <div className="s-id-name">
            <span className="s-id num">{s.stockId}</span>
            <span className="s-name serif">{s.stockName}</span>
          </div>
          <span className="s-market">{s.market === 'TWSE' ? '上市' : '上櫃'}</span>
          <div className="s-badges">{badge}</div>
        </div>

        <div className="cell price m-cell">
          <span className="col-label">收盤價</span>
          <div className="c-num num">{fmt.price(s.close)}</div>
          <Change r={s.changeRatio} />
        </div>

        <div className="cell streak m-cell">
          <span className="col-label">法人連買</span>
          <div className="c-num num"><span className="big">連買 {s.instBuyStreak}</span> 天</div>
        </div>

        <div className="cell m-cell">
          <span className="col-label">買超 / 成交量</span>
          <div className="c-num num">{fmt.int(s.instNetLots)} 張</div>
          <div className="c-sub num">量 {fmt.int(s.volumeLots)} 張</div>
        </div>

        <DirectorCell sig={s} directorDataMonthLatest={directorDataMonthLatest} />

        <div className="cell action m-cell">
          <button className="reason-btn" aria-expanded={expanded} onClick={onToggle}>
            {expanded ? '收合' : '看原因'} <span className="chev" aria-hidden="true">▾</span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className={'reasons' + (groups.length > 1 ? ' two' : '')}>
          {groups.map((k) => (
            <ReasonGroup key={k} kind={k} sig={s} reasons={k === 'A' ? row.reasonsA : row.reasonsB} />
          ))}
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 6: Verify types**

Run (in `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add web/components/screener/Change.tsx web/components/screener/MaLine.tsx web/components/screener/ReasonGroup.tsx web/components/screener/DirectorCell.tsx web/components/screener/StockItem.tsx
git commit -m "feat(web): StockItem and expand internals (Change, MaLine, ReasonGroup, DirectorCell)"
```

---

## Task 15: `StockList` + `EmptyState` + `Footer` + `PageTitle`

**Files:**
- Create: `web/components/screener/StockList.tsx`, `EmptyState.tsx`, `Footer.tsx`, `PageTitle.tsx`

- [ ] **Step 1: Create `StockList.tsx`**

```tsx
// web/components/screener/StockList.tsx
import type { FilterRow } from '@/lib/types';
import type { Tab } from './types';
import { StockItem } from './StockItem';

export function StockList({ rows, tab, open, onToggle, directorDataMonthLatest }: {
  rows: FilterRow[]; tab: Tab; open: Record<string, boolean>;
  onToggle: (id: string) => void; directorDataMonthLatest: string | null;
}) {
  return (
    <div className="list">
      {rows.map((row) => (
        <StockItem key={row.signal.stockId} row={row} tab={tab}
          expanded={!!open[row.signal.stockId]} onToggle={() => onToggle(row.signal.stockId)}
          directorDataMonthLatest={directorDataMonthLatest} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `EmptyState.tsx`** (ported; typed `Tab`)

```tsx
// web/components/screener/EmptyState.tsx
import type { Tab } from './types';

export function EmptyState({ tab }: { tab: Tab }) {
  const labelMap: Record<Tab, string> = { all: '符合條件', A: 'A 季線型', B: 'B 月線型', AB: 'A+B 同時符合' };
  return (
    <div className="empty card">
      <div className="e-ico" aria-hidden="true">🔍</div>
      <div className="e-title serif">今日無{labelMap[tab]}的股票</div>
      <div className="e-sub">可試著調低「法人連買天數 N」或「董監持股門檻 X%」，<br />放寬條件後再看看。</div>
    </div>
  );
}
```

- [ ] **Step 3: Create `Footer.tsx`** (ported)

```tsx
// web/components/screener/Footer.tsx
export function Footer() {
  return (
    <footer className="footer">
      <div className="f-title">ℹ️ 免責聲明</div>
      本工具僅為個人選股資訊整理，<b>不構成任何投資建議</b>。資料可能延遲或缺漏，
      實際交易請以官方公告與券商資訊為準，投資前請自行評估風險。
    </footer>
  );
}
```

- [ ] **Step 4: Create `PageTitle.tsx`** (server, static; fragment so the switcher sits beside it)

```tsx
// web/components/screener/PageTitle.tsx
export function PageTitle() {
  return (
    <>
      <h1 className="serif">台股選股器</h1>
      <span className="sub">每日收盤後・上市＋上櫃技術選股</span>
    </>
  );
}
```

- [ ] **Step 5: Verify types**

Run (in `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/components/screener/StockList.tsx web/components/screener/EmptyState.tsx web/components/screener/Footer.tsx web/components/screener/PageTitle.tsx
git commit -m "feat(web): StockList, EmptyState, Footer, PageTitle"
```

---

## Task 16: `SkinSwitcher` (client island)

**Files:**
- Create: `web/components/screener/SkinSwitcher.tsx`

- [ ] **Step 1: Create**

```tsx
// web/components/screener/SkinSwitcher.tsx
'use client';
import { useState } from 'react';
import { SKINS, type Skin, SKIN_COOKIE } from '@/lib/skin';

const LABELS: Record<Skin, string> = { default: '預設', paper: '報紙', bold: '大字高對比' };

export function SkinSwitcher({ current }: { current: Skin }) {
  const [skin, setSkin] = useState<Skin>(current);
  const choose = (s: Skin) => {
    setSkin(s);
    document.documentElement.dataset.skin = s;
    document.cookie = `${SKIN_COOKIE}=${s}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <div className="skin-switcher" role="group" aria-label="顯示樣式">
      <span className="ss-label">顯示樣式</span>
      {SKINS.map((s) => (
        <button key={s} type="button" aria-pressed={skin === s} onClick={() => choose(s)}>
          {LABELS[s]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

Run (in `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/screener/SkinSwitcher.tsx
git commit -m "feat(web): SkinSwitcher (cookie-persisted, no-FOUC via server cookie read)"
```

---

## Task 17: `Screener` client island (state + compose)

**Files:**
- Create: `web/components/screener/Screener.tsx`

- [ ] **Step 1: Create** (state wiring ported from `App.jsx`; gotcha 3 — composite not re-sorted)

```tsx
// web/components/screener/Screener.tsx
'use client';
import { useMemo, useState } from 'react';
import type { StockSignal, FilterRow } from '@/lib/types';
import { runFilter, manualSort } from '@/lib/filter';
import type { Tab, SortKey } from './types';
import { SORT_DIR } from './types';
import { ParamPanel } from './ParamPanel';
import { StatsRow } from './StatsRow';
import { Tabs } from './Tabs';
import { SortBar } from './SortBar';
import { StockList } from './StockList';
import { EmptyState } from './EmptyState';

export function Screener({ signals, dataDate, directorDataMonthLatest }: {
  signals: StockSignal[]; dataDate: string; directorDataMonthLatest: string | null;
}) {
  const [n, setN] = useState(2);
  const [x, setX] = useState(15);
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<SortKey>('composite');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { rows, summary } = useMemo(() => runFilter(signals, { n, x }), [signals, n, x]);

  const listRows = useMemo(() => {
    let r: FilterRow[] = rows;
    if (tab === 'A') r = rows.filter((v) => v.matchA);
    else if (tab === 'B') r = rows.filter((v) => v.matchB);
    else if (tab === 'AB') r = rows.filter((v) => v.matchA && v.matchB);
    return sort === 'composite' ? r : manualSort(r, sort, SORT_DIR[sort]);
  }, [rows, tab, sort]);

  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <>
      <ParamPanel n={n} x={x} onN={setN} onX={setX} dataDate={dataDate} />
      <StatsRow summary={summary} />
      <Tabs tab={tab} onTab={setTab} summary={summary} />
      <SortBar sort={sort} onSort={setSort} count={listRows.length} />
      <div className="list-head">
        <span>代號 / 名稱</span>
        <span>收盤價 / 漲跌</span>
        <span>法人連買</span>
        <span>買超 / 成交量</span>
        <span>董監持股</span>
        <span></span>
      </div>
      {listRows.length === 0
        ? <EmptyState tab={tab} />
        : <StockList rows={listRows} tab={tab} open={open} onToggle={toggle} directorDataMonthLatest={directorDataMonthLatest} />}
    </>
  );
}
```

- [ ] **Step 2: Verify types**

Run (in `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/screener/Screener.tsx
git commit -m "feat(web): Screener client island (n/x/tab/sort/open, runFilter/manualSort)"
```

---

## Task 18: `app/page.tsx` (Server Component)

**Files:**
- Create: `web/app/page.tsx`

- [ ] **Step 1: Create**

```tsx
// web/app/page.tsx
import { cookies } from 'next/headers';
import { getLatestSnapshot } from '@/lib/snapshot.server';
import { normalizeSkin, SKIN_COOKIE } from '@/lib/skin';
import { PageTitle } from '@/components/screener/PageTitle';
import { SkinSwitcher } from '@/components/screener/SkinSwitcher';
import { StatusBar } from '@/components/screener/StatusBar';
import { Screener } from '@/components/screener/Screener';
import { Footer } from '@/components/screener/Footer';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const snap = await getLatestSnapshot();
  const skin = normalizeSkin((await cookies()).get(SKIN_COOKIE)?.value);

  return (
    <div className="app">
      <div className="app-title">
        <PageTitle />
        <SkinSwitcher current={skin} />
      </div>

      {snap.scenario === 'no_data' ? (
        <div className="no-data card">
          <div className="nd-ico" aria-hidden="true">📊</div>
          <div className="nd-title serif">資料準備中</div>
          <div className="nd-sub">尚無可顯示的選股快照，請稍後再來。</div>
        </div>
      ) : (
        <>
          <StatusBar scenario={snap.scenario} dataDate={snap.dataDate}
            lastSuccessDate={snap.lastSuccessDate} directorDataMonthLatest={snap.directorDataMonthLatest} />
          <Screener signals={snap.signals} dataDate={snap.dataDate as string}
            directorDataMonthLatest={snap.directorDataMonthLatest} />
          <Footer />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

Run (in `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/app/page.tsx
git commit -m "feat(web): main page (RSC) wires snapshot → StatusBar + Screener + skin switcher"
```

---

## Task 19: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type check**

Run (in `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Unit tests (all green, including the new pure tests)**

Run (in `web/`): `npm run test`
Expected: all suites PASS, including `format.test.ts` and `snapshot.test.ts`.

- [ ] **Step 3: Production build**

Run (in `web/`): `npm run build`
Expected: build succeeds. The page compiles as a dynamic route (`ƒ` / Dynamic). If `next` errors on a font subset, confirm `preload: false` is set on both fonts in `lib/fonts.ts` (it is).

- [ ] **Step 4: Manual browser check**

Run (in `web/`): `npm run dev`, open `http://localhost:3000`.
- If Supabase is seeded (run the seed in `AGENTS.md` if not): verify StatusBar tone, N/X steppers re-filter live, tabs/sort work, a row expands to show reasons + MaLine, the director stale ⚠ shows when `directorDataMonth` is older, and the SkinSwitcher changes skin and survives reload (cookie). Resize the window narrow (≤720px container) → rows become cards.
- If Supabase is empty: the page shows 「資料準備中」 (no_data) — seed first to verify the list UI.

Expected: page matches the handoff visually; no console errors; no hydration warning.

- [ ] **Step 5: Final commit (if any verification tweaks were needed)**

```bash
git add -A
git commit -m "chore(web): verification fixes for frontend screener"
```
(If nothing changed in Step 4, skip this commit.)

---

## Done criteria

- `npx tsc --noEmit` clean, `npm run test` green, `npm run build` succeeds.
- Main page renders the five status states (4 server-derived + client `empty`) and the `no_data` placeholder.
- N/X/tabs/sort/expand all work against live `runFilter`/`manualSort`; skin switch persists with no FOUC.
- `lib/snapshot.server.ts` (Supabase) is never imported by a client component — only by RSC (`page.tsx`) and the route handler; client code touches only the pure `lib/snapshot.ts` types and `lib/filter.ts`.
