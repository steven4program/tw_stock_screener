# 訊號計算與篩選引擎核心庫 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立台股選股器的**純函式核心**——把每檔的原始價量/法人/董監資料算成「門檻無關的原始訊號」，並提供「讀取時依使用者參數 `N`、`X` 即時篩選、分類（A/B/A+B）、產生入選原因與排序」的篩選引擎；全部以 TDD 寫死，零外部相依。

**Architecture:** 在 `web/`（Next.js App Router 專案）下建立 `web/lib/`，分為 `types.ts`（型別）、`signals.ts`（訊號計算，對應 `daily_stock_signals` 的門檻無關欄位）、`filter.ts`（篩選引擎：條件 A/B 判定、標籤、原因、排序、統計）。三者皆為純函式、無 I/O、無 DB、無網路，可用合成資料完整單元測試。後續「資料管線/API」與「前端」兩個計畫都 import 此核心。對應設計文件 `docs/superpowers/specs/2026-06-09-stock-screener-design.md` 之 §5.4、§6、§9、§12。

**Tech Stack:** Next.js（App Router）+ TypeScript + vitest。本計畫只動 `web/lib/` 與測試，不碰資料庫、FinMind、UI。

---

## 範圍與成功判準

**做：** 純函式 `computeSignals`、`runFilter`（含 `matchesA/matchesB`、原因字串、`compositeSort`、`manualSort`、`summarize`），對應 §6.1 精確公式、§6 條件、§9 邊界與 reason 代碼。

**不做：** 任何資料抓取、Supabase、API route、前端畫面（屬計畫 2、3）。

**成功判準：** `cd web && npx vitest run` 全綠；`computeSignals` 與 `runFilter` 對所有 §6.1 公式、§9 邊界（缺董監、20~59 日、<20 日、恰 60 日無 ma_prev）、A/B/A+B 標籤、扣抵向上、距均線帶 `[0,0.10]` 皆有測試覆蓋並通過。

---

## File Structure

```
web/                          # Next.js App Router 專案（本計畫建立骨架；計畫 2/3 續用）
├── package.json
├── tsconfig.json
├── next.config.mjs
├── vitest.config.ts
├── app/
│   └── layout.tsx            # 最小 root layout（讓 Next 專案可建置；UI 留待計畫 3）
└── lib/
    ├── types.ts             # Market / ExcludeReason / SignalInput / StockSignal / 篩選型別
    ├── signals.ts           # computeSignals + 內部 helper（sma/holdflat/buyStreak）
    ├── filter.ts            # runFilter / matchesA / matchesB / reasons / sort / summarize
    └── __tests__/
        ├── signals.test.ts
        └── filter.test.ts
```

---

## Task 1: Scaffold Next.js 專案骨架 + vitest

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/next.config.mjs`
- Create: `web/vitest.config.ts`
- Create: `web/app/layout.tsx`
- Create: `web/.gitignore`

- [ ] **Step 1: 建立 `web/package.json`**

```json
{
  "name": "stock-screener-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: 建立 `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "types": ["vitest/globals", "node"],
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: 建立 `web/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

- [ ] **Step 4: 建立 `web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, environment: 'node', include: ['lib/**/*.test.ts'] },
});
```

- [ ] **Step 5: 建立最小 `web/app/layout.tsx`**

```tsx
export const metadata = { title: '台股選股器' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: 建立 `web/.gitignore`**

```
node_modules/
.next/
next-env.d.ts
*.tsbuildinfo
.env*.local
```

- [ ] **Step 7: 安裝依賴**

Run: `cd web && npm install`
Expected: 安裝成功，產生 `node_modules/` 與 `package-lock.json`。

- [ ] **Step 8: 確認測試器可跑（尚無測試）**

Run: `cd web && npx vitest run --passWithNoTests`
Expected: 退出碼 0。

- [ ] **Step 9: Commit**

```bash
git add web/package.json web/tsconfig.json web/next.config.mjs web/vitest.config.ts web/app/layout.tsx web/.gitignore web/package-lock.json
git commit -m "chore(web): scaffold Next.js app + vitest

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 核心型別 `lib/types.ts`

**Files:**
- Create: `web/lib/types.ts`

- [ ] **Step 1: 寫型別（無邏輯，後續任務 import）**

```ts
// web/lib/types.ts
export type Market = 'TWSE' | 'TPEx';

export type ExcludeReason =
  | 'insufficient_history_60'
  | 'insufficient_history_20'
  | 'missing_director';

/** 訊號計算的原始輸入（門檻無關）。closes 與 instNetLots 皆為「時間升冪」，最後一筆為最新交易日。 */
export interface SignalInput {
  stockId: string;
  stockName: string;
  market: Market;
  dataDate: string;                 // 最新交易日 'YYYY-MM-DD'
  closes: number[];                 // 收盤價，時間升冪，最後一筆＝今日 c[t]；長度 ≥ 1
  volumeLots: number;               // 今日成交量（張）
  instNetLots: (number | null)[];   // 三大法人合計買超（張），時間升冪；null＝當日無資料（未交易）
  directorHoldingPct: number | null;
  directorDataMonth: string | null; // 採用的董監資料月份，如 '2026-05'
}

/** 門檻無關的當日快照（對應 daily_stock_signals 的衍生欄位）。 */
export interface StockSignal {
  dataDate: string;
  stockId: string;
  stockName: string;
  market: Market;
  close: number;
  changeRatio: number | null;        // (close - 前一交易日收盤)/前一交易日收盤；無前一日為 null
  volumeLots: number;
  instNetLots: number;               // 今日三大法人合計買超（張）
  instBuyStreak: number;             // 連續買超天數（>0 連續）
  directorHoldingPct: number | null;
  directorDataMonth: string | null;
  ma20: number | null;
  ma20Prev: number | null;
  ma20Holdflat5d: number | null;
  ma60: number | null;
  ma60Prev: number | null;
  ma60Holdflat5d: number | null;
  distMa20Ratio: number | null;
  distMa60Ratio: number | null;
  eligibleA: boolean;
  eligibleB: boolean;
  excludeReasonA: ExcludeReason | null;
  excludeReasonB: ExcludeReason | null;
}

/** 篩選參數（使用者可調）。 */
export interface FilterParams {
  n: number; // 三大法人連買天數門檻（整數 1–10）
  x: number; // 董監持股 % 門檻（5–50）
}

export type Tag = 'A' | 'B' | 'A+B';

export interface FilterRow {
  signal: StockSignal;
  tag: Tag;
  matchA: boolean;
  matchB: boolean;
  reasonsA: string[];
  reasonsB: string[];
}

export interface FilterSummary {
  total: number;   // matchA || matchB
  countA: number;  // matchA（含 A+B）
  countB: number;  // matchB（含 A+B）
  countAB: number; // matchA && matchB
}
```

- [ ] **Step 2: 型別檢查**

Run: `cd web && npx tsc --noEmit`
Expected: 無錯誤。

- [ ] **Step 3: Commit**

```bash
git add web/lib/types.ts
git commit -m "feat(web): core signal & filter types

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 均線與扣抵 helper（TDD）

實作 §6.1 精確公式所需的 `sma`（可帶往前位移）與 `holdflat`。先寫測試。

**Files:**
- Create: `web/lib/signals.ts`（本任務先放 helper 與其 export）
- Test: `web/lib/__tests__/signals.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// web/lib/__tests__/signals.test.ts
import { describe, it, expect } from 'vitest';
import { sma, holdflat } from '../signals';

describe('sma（時間升冪，視窗取結尾）', () => {
  const closes = [1, 2, 3, 4, 5]; // 最後一筆＝今日

  it('視窗 3、offset 0 = 最後三筆 (3+4+5)/3 = 4', () => {
    expect(sma(closes, 3, 0)).toBeCloseTo(4, 9);
  });

  it('視窗 3、offset 1 = 結尾往前一格 (2+3+4)/3 = 3', () => {
    expect(sma(closes, 3, 1)).toBeCloseTo(3, 9);
  });

  it('視窗超過資料長度回 null', () => {
    expect(sma(closes, 6, 0)).toBeNull();
  });

  it('視窗剛好等於長度可算、但 offset 1 不足回 null', () => {
    expect(sma(closes, 5, 0)).toBeCloseTo(3, 9);
    expect(sma(closes, 5, 1)).toBeNull();
  });
});

describe('holdflat（假設未來 5 日收盤＝今日收盤）', () => {
  it('視窗 20：取最後 15 筆 + 5×今日，再除以 20', () => {
    // closes 全為 10 → holdflat 必為 10
    const flat = Array(25).fill(10);
    expect(holdflat(flat, 20, 5)).toBeCloseTo(10, 9);
  });

  it('今日收盤高於過去 → holdflat 高於過去段平均', () => {
    const closes = [...Array(19).fill(10), 40]; // 20 筆，最後一筆＝今日＝40
    // 最後 15 筆（含今日：14×10 + 40）+ 5 筆模擬今日(40)；今日共 6 次：
    // (6×40 + 14×10)/20 = (240+140)/20 = 19.0
    expect(holdflat(closes, 20, 5)).toBeCloseTo(19.0, 9);
  });

  it('資料不足視窗回 null', () => {
    expect(holdflat([1, 2, 3], 20, 5)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && npx vitest run lib/__tests__/signals.test.ts`
Expected: FAIL（`sma`/`holdflat` 未定義）。

- [ ] **Step 3: 實作 helper**

```ts
// web/lib/signals.ts
import type { SignalInput, StockSignal, ExcludeReason } from './types';

/** 時間升冪陣列，取「結尾往前位移 offsetFromEnd 格」結束的 window 筆平均；不足回 null。
 *  offset 0 ＝最新一筆結尾（含今日）；offset 1 ＝昨日結尾。 */
export function sma(closes: number[], window: number, offsetFromEnd = 0): number | null {
  const end = closes.length - offsetFromEnd; // 不含
  const start = end - window;
  if (start < 0 || end > closes.length) return null;
  let sum = 0;
  for (let i = start; i < end; i++) sum += closes[i];
  return sum / window;
}

/** 扣抵後均線：(Σ 最後 (window - simDays) 筆 + simDays × 今日收盤) / window；不足回 null。 */
export function holdflat(closes: number[], window: number, simDays = 5): number | null {
  if (closes.length < window) return null;
  const today = closes[closes.length - 1];
  const keep = window - simDays;
  let sum = simDays * today;
  for (let i = closes.length - keep; i < closes.length; i++) sum += closes[i];
  return sum / window;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && npx vitest run lib/__tests__/signals.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add web/lib/signals.ts web/lib/__tests__/signals.test.ts
git commit -m "feat(web): sma + holdflat MA helpers with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 連買天數與漲跌幅 helper（TDD）

**Files:**
- Modify: `web/lib/signals.ts`
- Test: `web/lib/__tests__/signals.test.ts`（追加）

- [ ] **Step 1: 追加失敗測試**

```ts
// 追加到 web/lib/__tests__/signals.test.ts
import { buyStreak, changeRatio } from '../signals';

describe('buyStreak（從最新往前數連續 >0）', () => {
  it('結尾連續 3 天 >0', () => {
    expect(buyStreak([-1, 0, 5, 2, 8])).toBe(3);
  });
  it('最新一天為 0 → 0', () => {
    expect(buyStreak([5, 5, 0])).toBe(0);
  });
  it('null（無資料）中斷連續', () => {
    expect(buyStreak([3, null, 4, 6])).toBe(2);
  });
  it('全部 >0 → 等於長度', () => {
    expect(buyStreak([1, 2, 3])).toBe(3);
  });
});

describe('changeRatio', () => {
  it('(close - 前一日)/前一日', () => {
    expect(changeRatio([100, 102])).toBeCloseTo(0.02, 9);
  });
  it('僅一筆收盤 → null', () => {
    expect(changeRatio([100])).toBeNull();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && npx vitest run lib/__tests__/signals.test.ts`
Expected: FAIL（`buyStreak`/`changeRatio` 未定義）。

- [ ] **Step 3: 實作**

```ts
// 追加到 web/lib/signals.ts
/** 三大法人合計連續買超天數：從最新往前數，遇 null 或 <=0 中斷。 */
export function buyStreak(instNetLots: (number | null)[]): number {
  let streak = 0;
  for (let i = instNetLots.length - 1; i >= 0; i--) {
    const v = instNetLots[i];
    if (v !== null && v > 0) streak++;
    else break;
  }
  return streak;
}

/** 漲跌幅（小數比例），相對前一交易日收盤；不足兩筆回 null。 */
export function changeRatio(closes: number[]): number | null {
  if (closes.length < 2) return null;
  const today = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  if (prev === 0) return null;
  return (today - prev) / prev;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && npx vitest run lib/__tests__/signals.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add web/lib/signals.ts web/lib/__tests__/signals.test.ts
git commit -m "feat(web): buyStreak + changeRatio helpers with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `computeSignals` 組裝（含 §9 資格與 reason）（TDD）

把前面 helper 組成完整 `StockSignal`，並依 §9 計算 `eligibleA/B` 與 `excludeReasonA/B`。

**邏輯（§9）：** 設 `hasDirector = directorHoldingPct != null`、`has60 = closes.length >= 60`、`has20 = closes.length >= 20`。
- `eligibleA = hasDirector && has60`；`eligibleB = hasDirector && has20`。
- `excludeReasonA = !hasDirector ? 'missing_director' : (!has60 ? 'insufficient_history_60' : null)`。
- `excludeReasonB = !hasDirector ? 'missing_director' : (!has20 ? 'insufficient_history_20' : null)`。

（驗證對照 §9 表：完整→both null；20~59 日→A `insufficient_history_60`、B null；<20 日→A `insufficient_history_60`、B `insufficient_history_20`；缺董監→both `missing_director`。）

**Files:**
- Modify: `web/lib/signals.ts`
- Test: `web/lib/__tests__/signals.test.ts`（追加）

- [ ] **Step 1: 追加失敗測試**

```ts
// 追加到 web/lib/__tests__/signals.test.ts
import { computeSignals } from '../signals';
import type { SignalInput } from '../types';

function baseInput(closes: number[], overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    stockId: '0001', stockName: '測試', market: 'TWSE', dataDate: '2026-06-09',
    closes, volumeLots: 100, instNetLots: closes.map(() => 1),
    directorHoldingPct: 20, directorDataMonth: '2026-05',
    ...overrides,
  };
}

describe('computeSignals 均線與距離', () => {
  it('70 筆遞增收盤：ma20/ma60/ma_prev/holdflat/dist 皆有值且關係正確', () => {
    const closes = Array.from({ length: 70 }, (_, i) => 100 + i); // 100..169，今日=169
    const s = computeSignals(baseInput(closes));
    expect(s.ma20).not.toBeNull();
    expect(s.ma60).not.toBeNull();
    expect(s.ma20Prev).not.toBeNull();
    expect(s.ma60Prev).not.toBeNull();
    // 遞增 → 今日均線 > 昨日均線
    expect(s.ma20! > s.ma20Prev!).toBe(true);
    expect(s.ma60! > s.ma60Prev!).toBe(true);
    // 收盤 > 均線 → dist 為正
    expect(s.distMa60Ratio! > 0).toBe(true);
    expect(s.close).toBe(169);
  });
});

describe('computeSignals 資格與 reason（§9）', () => {
  it('完整（≥60 且有董監）→ eligibleA/B 皆 true、reason 皆 null', () => {
    const s = computeSignals(baseInput(Array(60).fill(50)));
    expect(s.eligibleA).toBe(true);
    expect(s.eligibleB).toBe(true);
    expect(s.excludeReasonA).toBeNull();
    expect(s.excludeReasonB).toBeNull();
  });

  it('歷史 20~59 日（有 20MA、無 60MA）→ A 不合格(insufficient_history_60)、B 合格', () => {
    const s = computeSignals(baseInput(Array(30).fill(50)));
    expect(s.eligibleA).toBe(false);
    expect(s.eligibleB).toBe(true);
    expect(s.excludeReasonA).toBe('insufficient_history_60');
    expect(s.excludeReasonB).toBeNull();
    expect(s.ma60).toBeNull();
    expect(s.ma20).not.toBeNull();
  });

  it('歷史 < 20 日 → A insufficient_history_60、B insufficient_history_20', () => {
    const s = computeSignals(baseInput(Array(10).fill(50)));
    expect(s.eligibleA).toBe(false);
    expect(s.eligibleB).toBe(false);
    expect(s.excludeReasonA).toBe('insufficient_history_60');
    expect(s.excludeReasonB).toBe('insufficient_history_20');
  });

  it('缺董監 → A、B 皆 missing_director', () => {
    const s = computeSignals(baseInput(Array(60).fill(50), { directorHoldingPct: null, directorDataMonth: null }));
    expect(s.eligibleA).toBe(false);
    expect(s.eligibleB).toBe(false);
    expect(s.excludeReasonA).toBe('missing_director');
    expect(s.excludeReasonB).toBe('missing_director');
  });

  it('恰 60 筆：ma60 有值但 ma60Prev 為 null（需 61 筆）', () => {
    const s = computeSignals(baseInput(Array(60).fill(50)));
    expect(s.ma60).not.toBeNull();
    expect(s.ma60Prev).toBeNull();
  });

  it('連買天數與今日法人/量帶入', () => {
    const closes = Array(60).fill(50);
    const inst = Array(60).fill(1); inst[59] = 7; // 今日 7 張、全段 >0
    const s = computeSignals(baseInput(closes, { instNetLots: inst, volumeLots: 250 }));
    expect(s.instNetLots).toBe(7);
    expect(s.instBuyStreak).toBe(60);
    expect(s.volumeLots).toBe(250);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && npx vitest run lib/__tests__/signals.test.ts`
Expected: FAIL（`computeSignals` 未定義）。

- [ ] **Step 3: 實作 `computeSignals`**

```ts
// 追加到 web/lib/signals.ts
const SIM_DAYS = 5;

export function computeSignals(input: SignalInput): StockSignal {
  const { closes } = input;
  const close = closes[closes.length - 1];

  const ma20 = sma(closes, 20, 0);
  const ma20Prev = sma(closes, 20, 1);
  const ma20Holdflat5d = holdflat(closes, 20, SIM_DAYS);
  const ma60 = sma(closes, 60, 0);
  const ma60Prev = sma(closes, 60, 1);
  const ma60Holdflat5d = holdflat(closes, 60, SIM_DAYS);

  const distMa20Ratio = ma20 !== null ? (close - ma20) / ma20 : null;
  const distMa60Ratio = ma60 !== null ? (close - ma60) / ma60 : null;

  const hasDirector = input.directorHoldingPct !== null;
  const has60 = closes.length >= 60;
  const has20 = closes.length >= 20;

  const excludeReasonA: ExcludeReason | null = !hasDirector
    ? 'missing_director'
    : !has60
      ? 'insufficient_history_60'
      : null;
  const excludeReasonB: ExcludeReason | null = !hasDirector
    ? 'missing_director'
    : !has20
      ? 'insufficient_history_20'
      : null;

  const todayInst = input.instNetLots[input.instNetLots.length - 1] ?? 0;

  return {
    dataDate: input.dataDate,
    stockId: input.stockId,
    stockName: input.stockName,
    market: input.market,
    close,
    changeRatio: changeRatio(closes),
    volumeLots: input.volumeLots,
    instNetLots: todayInst,
    instBuyStreak: buyStreak(input.instNetLots),
    directorHoldingPct: input.directorHoldingPct,
    directorDataMonth: input.directorDataMonth,
    ma20, ma20Prev, ma20Holdflat5d,
    ma60, ma60Prev, ma60Holdflat5d,
    distMa20Ratio, distMa60Ratio,
    eligibleA: hasDirector && has60,
    eligibleB: hasDirector && has20,
    excludeReasonA,
    excludeReasonB,
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && npx vitest run lib/__tests__/signals.test.ts`
Expected: PASS（全部）。

- [ ] **Step 5: Commit**

```bash
git add web/lib/signals.ts web/lib/__tests__/signals.test.ts
git commit -m "feat(web): computeSignals with eligibility & reasons (§9)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 條件 A/B 判定與標籤（TDD）

實作 §6 的 `matchesA`、`matchesB`，含「均線已上彎或扣抵向上」與「距均線帶 `[0, 0.10]`」，並只對 `eligibleA/B` 為真者判定（§9 fail-closed）。

**均線上彎判定（處理 ma_prev 可能為 null）：**
`maUp = (maPrev != null && ma > maPrev) || (maHoldflat != null && maHoldflat > ma)`。

**Files:**
- Create: `web/lib/filter.ts`
- Test: `web/lib/__tests__/filter.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// web/lib/__tests__/filter.test.ts
import { describe, it, expect } from 'vitest';
import { matchesA, matchesB } from '../filter';
import type { StockSignal } from '../types';

function sig(overrides: Partial<StockSignal>): StockSignal {
  return {
    dataDate: '2026-06-09', stockId: '0001', stockName: '測試', market: 'TWSE',
    close: 100, changeRatio: 0.01, volumeLots: 100, instNetLots: 5, instBuyStreak: 3,
    directorHoldingPct: 20, directorDataMonth: '2026-05',
    ma20: 95, ma20Prev: 94, ma20Holdflat5d: 96, ma60: 98, ma60Prev: 97, ma60Holdflat5d: 99,
    distMa20Ratio: 0.05, distMa60Ratio: 0.02,
    eligibleA: true, eligibleB: true, excludeReasonA: null, excludeReasonB: null,
    ...overrides,
  };
}

describe('matchesA（條件 A 季線型）', () => {
  it('全部成立 → true', () => {
    expect(matchesA(sig({}), { n: 2, x: 15 })).toBe(true);
  });
  it('連買天數不足 → false', () => {
    expect(matchesA(sig({ instBuyStreak: 1 }), { n: 2, x: 15 })).toBe(false);
  });
  it('董監持股不足 → false', () => {
    expect(matchesA(sig({ directorHoldingPct: 10 }), { n: 2, x: 15 })).toBe(false);
  });
  it('距季線 > 10% → false', () => {
    expect(matchesA(sig({ distMa60Ratio: 0.12 }), { n: 2, x: 15 })).toBe(false);
  });
  it('距季線為負（在均線下）→ false', () => {
    expect(matchesA(sig({ distMa60Ratio: -0.01 }), { n: 2, x: 15 })).toBe(false);
  });
  it('季線未上彎但扣抵向上 → true', () => {
    expect(matchesA(sig({ ma60: 98, ma60Prev: 99, ma60Holdflat5d: 98.5 }), { n: 2, x: 15 })).toBe(true);
  });
  it('季線未上彎且扣抵未向上 → false', () => {
    expect(matchesA(sig({ ma60: 98, ma60Prev: 99, ma60Holdflat5d: 97 }), { n: 2, x: 15 })).toBe(false);
  });
  it('ma60Prev 為 null 但扣抵向上 → true', () => {
    expect(matchesA(sig({ ma60Prev: null, ma60Holdflat5d: 99 }), { n: 2, x: 15 })).toBe(true);
  });
  it('不具 A 資格 → false（即使數值符合）', () => {
    expect(matchesA(sig({ eligibleA: false }), { n: 2, x: 15 })).toBe(false);
  });
  it('距季線剛好 0% 與 10% 邊界 → true', () => {
    expect(matchesA(sig({ distMa60Ratio: 0 }), { n: 2, x: 15 })).toBe(true);
    expect(matchesA(sig({ distMa60Ratio: 0.10 }), { n: 2, x: 15 })).toBe(true);
  });
});

describe('matchesB（條件 B 月線型，用 20MA）', () => {
  it('全部成立 → true', () => {
    expect(matchesB(sig({}), { n: 2, x: 15 })).toBe(true);
  });
  it('距月線 > 10% → false', () => {
    expect(matchesB(sig({ distMa20Ratio: 0.2 }), { n: 2, x: 15 })).toBe(false);
  });
  it('不具 B 資格 → false', () => {
    expect(matchesB(sig({ eligibleB: false }), { n: 2, x: 15 })).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && npx vitest run lib/__tests__/filter.test.ts`
Expected: FAIL（`matchesA`/`matchesB` 未定義）。

- [ ] **Step 3: 實作 `matchesA`/`matchesB`**

```ts
// web/lib/filter.ts
import type { StockSignal, FilterParams, Tag, FilterRow, FilterSummary } from './types';

const BAND_MIN = 0;
const BAND_MAX = 0.10;

function maTurningUp(ma: number | null, maPrev: number | null, maHoldflat: number | null): boolean {
  if (ma === null) return false;
  const turnedUp = maPrev !== null && ma > maPrev;
  const carryUp = maHoldflat !== null && maHoldflat > ma;
  return turnedUp || carryUp;
}

function inBand(dist: number | null): boolean {
  return dist !== null && dist >= BAND_MIN && dist <= BAND_MAX;
}

export function matchesA(s: StockSignal, p: FilterParams): boolean {
  if (!s.eligibleA) return false;
  return (
    s.instBuyStreak >= p.n &&
    s.directorHoldingPct !== null && s.directorHoldingPct >= p.x &&
    maTurningUp(s.ma60, s.ma60Prev, s.ma60Holdflat5d) &&
    inBand(s.distMa60Ratio)
  );
}

export function matchesB(s: StockSignal, p: FilterParams): boolean {
  if (!s.eligibleB) return false;
  return (
    s.instBuyStreak >= p.n &&
    s.directorHoldingPct !== null && s.directorHoldingPct >= p.x &&
    maTurningUp(s.ma20, s.ma20Prev, s.ma20Holdflat5d) &&
    inBand(s.distMa20Ratio)
  );
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && npx vitest run lib/__tests__/filter.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add web/lib/filter.ts web/lib/__tests__/filter.test.ts
git commit -m "feat(web): condition A/B matchers with band & MA-up logic

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 入選原因字串（TDD）

依 §6 範例，由訊號即時組字。提供 `reasonsForA(s, p)` 與 `reasonsForB(s, p)`，回傳逐條中文字串陣列。

**Files:**
- Modify: `web/lib/filter.ts`
- Test: `web/lib/__tests__/filter.test.ts`（追加）

- [ ] **Step 1: 追加失敗測試**

```ts
// 追加到 web/lib/__tests__/filter.test.ts
import { reasonsForA, reasonsForB } from '../filter';

describe('reasonsForA（季線型入選原因）', () => {
  it('涵蓋連買、董監、距季線、季線狀態四條', () => {
    const r = reasonsForA(sig({ instBuyStreak: 5, directorHoldingPct: 18.2, distMa60Ratio: 0.021 }), { n: 2, x: 15 });
    expect(r).toHaveLength(4);
    expect(r[0]).toContain('連買');
    expect(r[0]).toContain('5');
    expect(r[1]).toContain('董監持股');
    expect(r[1]).toContain('18.2');
    expect(r[2]).toContain('季線上方');
    expect(r[2]).toContain('2.1');
    expect(r[3]).toContain('季線');
  });

  it('季線已上彎時用「已上彎」字樣', () => {
    const r = reasonsForA(sig({ ma60: 98, ma60Prev: 97, ma60Holdflat5d: 97.5 }), { n: 2, x: 15 });
    expect(r[3]).toContain('已上彎');
  });

  it('季線未上彎但扣抵向上時用「扣抵向上」字樣', () => {
    const r = reasonsForA(sig({ ma60: 98, ma60Prev: 99, ma60Holdflat5d: 98.5 }), { n: 2, x: 15 });
    expect(r[3]).toContain('扣抵');
  });
});

describe('reasonsForB（月線型）', () => {
  it('用「月線」字樣與 20MA 距離', () => {
    const r = reasonsForB(sig({ distMa20Ratio: 0.05 }), { n: 2, x: 15 });
    expect(r[2]).toContain('月線上方');
    expect(r[3]).toContain('月線');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && npx vitest run lib/__tests__/filter.test.ts`
Expected: FAIL（`reasonsForA`/`reasonsForB` 未定義）。

- [ ] **Step 3: 實作原因組字**

```ts
// 追加到 web/lib/filter.ts
function pct1(ratio: number): string {
  return (ratio * 100).toFixed(1);
}

function streakReason(s: StockSignal, p: FilterParams): string {
  return `三大法人連買 ${s.instBuyStreak} 天（門檻 ≥ ${p.n} 天）`;
}

function directorReason(s: StockSignal, p: FilterParams): string {
  const v = s.directorHoldingPct ?? 0;
  return `董監持股 ${v.toFixed(1)}%，達門檻 ${p.x}%`;
}

function bandReason(distRatio: number | null, lineName: string): string {
  return `股價在${lineName}上方 ${pct1(distRatio ?? 0)}%（位於 0~10% 區間）`;
}

function maStateReason(
  ma: number | null, maPrev: number | null, maHoldflat: number | null, lineName: string,
): string {
  if (maPrev !== null && ma !== null && ma > maPrev) return `${lineName}已上彎`;
  return `${lineName} 5 個交易日內扣抵向上`;
}

export function reasonsForA(s: StockSignal, p: FilterParams): string[] {
  return [
    streakReason(s, p),
    directorReason(s, p),
    bandReason(s.distMa60Ratio, '季線'),
    maStateReason(s.ma60, s.ma60Prev, s.ma60Holdflat5d, '季線'),
  ];
}

export function reasonsForB(s: StockSignal, p: FilterParams): string[] {
  return [
    streakReason(s, p),
    directorReason(s, p),
    bandReason(s.distMa20Ratio, '月線'),
    maStateReason(s.ma20, s.ma20Prev, s.ma20Holdflat5d, '月線'),
  ];
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && npx vitest run lib/__tests__/filter.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add web/lib/filter.ts web/lib/__tests__/filter.test.ts
git commit -m "feat(web): selection reason strings for A/B

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `runFilter` 組裝（標籤、綜合/手動排序、統計）（TDD）

組成對外主函式 `runFilter(signals, params)` → `{ rows, summary }`，其中 `rows` 已套用綜合排序；另提供 `manualSort` 供前端切換。

**綜合排序（§8）：** A+B 優先 → 連買天數多 → 距均線近 → 買超張數多。
- 距均線「近」的代表值 `sortDist`：tag A → `distMa60Ratio`；B → `distMa20Ratio`；A+B → 兩者取較小（較近）。null 視為極大（排最後）。

**手動排序鍵（§8）：** `streak`（連買天數）、`dist`（距均線%）、`buyLots`（買超張數）、`volume`（成交量）、`director`（董監持股%）。

**Files:**
- Modify: `web/lib/filter.ts`
- Test: `web/lib/__tests__/filter.test.ts`（追加）

- [ ] **Step 1: 追加失敗測試**

```ts
// 追加到 web/lib/__tests__/filter.test.ts
import { runFilter, manualSort } from '../filter';

describe('runFilter 標籤與統計', () => {
  it('依符合度標 A / B / A+B，並只收 matchA||matchB', () => {
    const aOnly = sig({ stockId: 'A1', distMa20Ratio: 0.5 });           // 季線符合、月線距離超帶 → 只 A
    const bOnly = sig({ stockId: 'B1', distMa60Ratio: 0.5 });           // 月線符合、季線距離超帶 → 只 B
    const both = sig({ stockId: 'AB1' });                               // A、B 皆符合
    const none = sig({ stockId: 'N1', instBuyStreak: 0 });              // 皆不符合 → 不收
    const { rows, summary } = runFilter([aOnly, bOnly, both, none], { n: 2, x: 15 });
    const byId = Object.fromEntries(rows.map((r) => [r.signal.stockId, r.tag]));
    expect(byId['A1']).toBe('A');
    expect(byId['B1']).toBe('B');
    expect(byId['AB1']).toBe('A+B');
    expect('N1' in byId).toBe(false);
    expect(summary).toEqual({ total: 3, countA: 2, countB: 2, countAB: 1 });
  });

  it('綜合排序：A+B 優先，其次連買天數多', () => {
    const ab = sig({ stockId: 'AB', instBuyStreak: 3 });
    const aHi = sig({ stockId: 'AHI', distMa20Ratio: 0.5, instBuyStreak: 9 });
    const aLo = sig({ stockId: 'ALO', distMa20Ratio: 0.5, instBuyStreak: 4 });
    const { rows } = runFilter([aLo, aHi, ab], { n: 2, x: 15 });
    expect(rows.map((r) => r.signal.stockId)).toEqual(['AB', 'AHI', 'ALO']);
  });

  it('rows 帶 reasonsA/reasonsB（依符合的條件）', () => {
    const both = sig({ stockId: 'AB1' });
    const { rows } = runFilter([both], { n: 2, x: 15 });
    expect(rows[0].reasonsA.length).toBe(4);
    expect(rows[0].reasonsB.length).toBe(4);
  });
});

describe('manualSort', () => {
  const rows = () => runFilter([
    sig({ stockId: 'X', instBuyStreak: 2, volumeLots: 300, directorHoldingPct: 16 }),
    sig({ stockId: 'Y', instBuyStreak: 8, volumeLots: 100, directorHoldingPct: 40 }),
  ], { n: 2, x: 15 }).rows;

  it('依連買天數遞減', () => {
    expect(manualSort(rows(), 'streak', 'desc').map((r) => r.signal.stockId)).toEqual(['Y', 'X']);
  });
  it('依成交量遞減', () => {
    expect(manualSort(rows(), 'volume', 'desc').map((r) => r.signal.stockId)).toEqual(['X', 'Y']);
  });
  it('依董監持股遞增', () => {
    expect(manualSort(rows(), 'director', 'asc').map((r) => r.signal.stockId)).toEqual(['X', 'Y']);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && npx vitest run lib/__tests__/filter.test.ts`
Expected: FAIL（`runFilter`/`manualSort` 未定義）。

- [ ] **Step 3: 實作 `runFilter`、`manualSort`、`summarize`**

```ts
// 追加到 web/lib/filter.ts
export type ManualSortKey = 'streak' | 'dist' | 'buyLots' | 'volume' | 'director';
export type SortDir = 'asc' | 'desc';

const FAR = Number.POSITIVE_INFINITY;

function sortDist(row: FilterRow): number {
  const a = row.signal.distMa60Ratio;
  const b = row.signal.distMa20Ratio;
  if (row.tag === 'A') return a ?? FAR;
  if (row.tag === 'B') return b ?? FAR;
  return Math.min(a ?? FAR, b ?? FAR); // A+B 取較近
}

function tagRank(tag: Tag): number {
  return tag === 'A+B' ? 0 : 1;
}

/** 綜合排序：A+B 優先 → 連買天數多 → 距均線近 → 買超張數多。 */
function compositeCompare(p: FilterRow, q: FilterRow): number {
  return (
    tagRank(p.tag) - tagRank(q.tag) ||
    q.signal.instBuyStreak - p.signal.instBuyStreak ||
    sortDist(p) - sortDist(q) ||
    q.signal.instNetLots - p.signal.instNetLots
  );
}

export function summarize(rows: FilterRow[]): FilterSummary {
  return {
    total: rows.length,
    countA: rows.filter((r) => r.matchA).length,
    countB: rows.filter((r) => r.matchB).length,
    countAB: rows.filter((r) => r.matchA && r.matchB).length,
  };
}

export function runFilter(
  signals: StockSignal[],
  p: FilterParams,
): { rows: FilterRow[]; summary: FilterSummary } {
  const rows: FilterRow[] = [];
  for (const s of signals) {
    const matchA = matchesA(s, p);
    const matchB = matchesB(s, p);
    if (!matchA && !matchB) continue;
    const tag: Tag = matchA && matchB ? 'A+B' : matchA ? 'A' : 'B';
    rows.push({
      signal: s, tag, matchA, matchB,
      reasonsA: matchA ? reasonsForA(s, p) : [],
      reasonsB: matchB ? reasonsForB(s, p) : [],
    });
  }
  rows.sort(compositeCompare);
  return { rows, summary: summarize(rows) };
}

export function manualSort(rows: FilterRow[], key: ManualSortKey, dir: SortDir): FilterRow[] {
  const val = (r: FilterRow): number => {
    switch (key) {
      case 'streak': return r.signal.instBuyStreak;
      case 'dist': return sortDist(r);
      case 'buyLots': return r.signal.instNetLots;
      case 'volume': return r.signal.volumeLots;
      case 'director': return r.signal.directorHoldingPct ?? FAR;
    }
  };
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => sign * (val(a) - val(b)));
}
```

- [ ] **Step 4: 跑測試確認通過 + 全套件**

Run: `cd web && npx vitest run`
Expected: PASS（`signals.test.ts` + `filter.test.ts` 全綠）。

- [ ] **Step 5: 型別檢查與建置健檢**

Run: `cd web && npx tsc --noEmit`
Expected: 無錯誤。

- [ ] **Step 6: Commit**

```bash
git add web/lib/filter.ts web/lib/__tests__/filter.test.ts
git commit -m "feat(web): runFilter with tagging, composite & manual sort, summary

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review（撰寫者於計畫完成後自查，已執行）

- **Spec 覆蓋：** §6.1 六條均線/扣抵公式（Task 3、5）、連買天數（Task 4）、§6 條件 A/B 與距均線帶與扣抵向上（Task 6）、入選原因（Task 7）、型別標籤與綜合/手動排序與統計（Task 8）、§9 資格與 reason 代碼（Task 5）。§5.4 欄位對應於 `StockSignal`（Task 2）。皆有對應任務。
- **Placeholder 掃描：** 無 TBD；每個程式步驟均含完整程式碼與測試碼。
- **型別一致：** `SignalInput`/`StockSignal`/`FilterParams`/`FilterRow`/`FilterSummary`/`Tag`/`ExcludeReason` 於 Task 2 定義，後續任務一致沿用；`computeSignals`、`matchesA/B`、`reasonsForA/B`、`runFilter`、`manualSort`、`summarize` 簽章前後一致。
- **未涵蓋之 spec（刻意，屬其他計畫）：** 資料抓取/Supabase/job_runs/API/Cron → 計畫 2；前端畫面與「≥已確認天數」之顯示、partial_success 提示、免責聲明 → 計畫 3（前端可由 `instBuyStreak` 與已知回補窗 30 推導「≥」顯示）。

---

## 下一步（本計畫完成後）

1. **計畫 2：資料管線 + 儲存 + API** — Supabase 五表 schema/migration、FinMind 客戶端（股價＋法人）、董監 ingest（移植 `poc/director-holdings` 之來源與 `parseDirectorRows`／彙總邏輯）、管線 `/api/jobs/run`（防重複鎖、status 機制、job_runs）、`/api/snapshots/latest`、Vercel Cron。產出後端：跑管線→寫 `daily_stock_signals`→API 可讀。
2. **計畫 3：前端畫面** — 依 Claude Design 設計稿實作 Next.js UI（頂部狀態列、參數摘要、分頁、表格/卡片、展開原因、排序、免責聲明），消費計畫 1 的 `runFilter` 與計畫 2 的 `/api/snapshots/latest`。
