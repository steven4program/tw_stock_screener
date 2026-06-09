# 市場別篩選（上市／上櫃）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在選股篩選器加上「全部／上市／上櫃」市場別篩選，並順手把參數面板壓扁，讓清單更快進入視野。

**Architecture:** 市場別是 pool 的前置篩選——在 `runFilter` 比對與計數「之前」依 `market` 過濾 signals，因此 summary／分頁／清單／空狀態全部一致只反映選定市場（Model A）。`matchesA/B`、`FilterParams` 不動。UI 新增一排 segmented 控制（重用 `.tabs`/`.tab`），放在計數列上方；同時對 ParamPanel 做密度優化（保留 48px 觸控鍵與大字值）。

**Tech Stack:** Next.js 15 App Router、TypeScript、Vitest（純函式單元測試）、Playwright（e2e）。

---

## File Structure

- `lib/types.ts` — 新增 `MarketFilter` 型別（modify）
- `lib/filter.ts` — `runFilter` 接受並前置套用 `market`（modify）
- `lib/__tests__/filter.test.ts` — runFilter 市場別測試（modify）
- `components/screener/MarketTabs.tsx` — 市場別 segmented 控制（create）
- `components/screener/Screener.tsx` — market state + 接線 + 擺位（modify）
- `components/screener/ParamPanel.tsx` — 密度優化標記（modify）
- `app/globals.css` — 壓縮 CSS + market-tabs 間距（modify）
- `e2e/interactions.spec.ts` — 市場別互動測試（modify）

---

### Task 1: 市場感知的 `runFilter`（純函式，TDD）

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/filter.ts`
- Test: `lib/__tests__/filter.test.ts`

- [ ] **Step 1: 寫失敗測試**（append 到 `filter.test.ts` 末尾）

```ts
describe('runFilter 市場別前置篩選', () => {
  const twseA = sig({ stockId: 'T1', market: 'TWSE', distMa20Ratio: 0.5 }); // A-only（B 帶寬不過）
  const twseAB = sig({ stockId: 'T2', market: 'TWSE' });                    // A+B
  const tpexB = sig({ stockId: 'P1', market: 'TPEx', distMa60Ratio: 0.5 }); // B-only

  it("market='all'（預設）不過濾，等同舊行為", () => {
    const { rows, summary } = runFilter([twseA, twseAB, tpexB], { n: 2, x: 15 });
    expect(rows).toHaveLength(3);
    expect(summary).toEqual({ total: 3, countA: 2, countB: 2, countAB: 1 });
  });

  it("market='TWSE' 只保留上市，計數同步只算上市", () => {
    const { rows, summary } = runFilter([twseA, twseAB, tpexB], { n: 2, x: 15 }, 'TWSE');
    expect(rows.map((r) => r.signal.stockId)).toEqual(['T2', 'T1']); // A+B 排序優先
    expect(rows.every((r) => r.signal.market === 'TWSE')).toBe(true);
    expect(summary).toEqual({ total: 2, countA: 2, countB: 1, countAB: 1 });
  });

  it("market='TPEx' 只保留上櫃", () => {
    const { rows, summary } = runFilter([twseA, twseAB, tpexB], { n: 2, x: 15 }, 'TPEx');
    expect(rows.map((r) => r.signal.stockId)).toEqual(['P1']);
    expect(summary).toEqual({ total: 1, countA: 0, countB: 1, countAB: 0 });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/__tests__/filter.test.ts -t "市場別"`
Expected: FAIL（`runFilter` 第三參數尚不存在，TWSE/TPEx case 不過濾 → 數量不符）

- [ ] **Step 3: 新增 `MarketFilter` 型別**（`lib/types.ts`，緊接 `Market` 定義之後）

```ts
export type Market = 'TWSE' | 'TPEx';
export type MarketFilter = 'all' | Market;
```

- [ ] **Step 4: 讓 `runFilter` 前置套用市場**（`lib/filter.ts`）

import 行加入 `MarketFilter`：
```ts
import type { StockSignal, FilterParams, MarketFilter, Tag, FilterRow, FilterSummary } from './types';
```
改 `runFilter` 簽名與第一行：
```ts
export function runFilter(
  signals: StockSignal[],
  p: FilterParams,
  market: MarketFilter = 'all',
): { rows: FilterRow[]; summary: FilterSummary } {
  const pool = market === 'all' ? signals : signals.filter((s) => s.market === market);
  const rows: FilterRow[] = [];
  for (const s of pool) {
    // ...（迴圈內容不變）
```
（把原本 `for (const s of signals)` 改成 `for (const s of pool)`，其餘不動。）

- [ ] **Step 5: 跑測試確認全綠**

Run: `npx vitest run lib/__tests__/filter.test.ts`
Expected: PASS（新 3 筆 + 既有全部綠；預設 'all' 保證回歸安全）

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/filter.ts lib/__tests__/filter.test.ts
git commit -m "feat(filter): market-aware runFilter (上市/上櫃 pre-filter)"
```

---

### Task 2: `MarketTabs` 元件 + Screener 接線

**Files:**
- Create: `components/screener/MarketTabs.tsx`
- Modify: `components/screener/Screener.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: 建立 MarketTabs 元件**（`components/screener/MarketTabs.tsx`）

```tsx
// web/components/screener/MarketTabs.tsx
import type { MarketFilter } from '@/lib/types';

const ITEMS: [MarketFilter, string][] = [
  ['all', '全部'], ['TWSE', '上市'], ['TPEx', '上櫃'],
];

export function MarketTabs({ market, onMarket }: {
  market: MarketFilter; onMarket: (m: MarketFilter) => void;
}) {
  return (
    <div className="tabs market-tabs" role="group" aria-label="市場別">
      {ITEMS.map(([k, label]) => (
        <button key={k} aria-pressed={market === k} className="tab" onClick={() => onMarket(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Screener 加入 market state 並接線**（`components/screener/Screener.tsx`）

import 補上 `MarketFilter` 與 `MarketTabs`：
```tsx
import type { StockSignal, FilterRow, MarketFilter } from '@/lib/types';
import { MarketTabs } from './MarketTabs';
```
state 與 useMemo：
```tsx
const [market, setMarket] = useState<MarketFilter>('all');
const { rows, summary } = useMemo(() => runFilter(signals, { n, x }, market), [signals, n, x, market]);
```
在 `<ParamPanel/>` 與 `<StatsRow/>` 之間插入（市場列在計數上方）：
```tsx
<ParamPanel n={n} x={x} onN={setN} onX={setX} dataDate={dataDate} />
<MarketTabs market={market} onMarket={setMarket} />
<StatsRow summary={summary} />
```

- [ ] **Step 3: market-tabs 間距**（`app/globals.css`，緊接 `.tabs { ... }` 區塊後新增一行）

```css
.market-tabs { margin-bottom: var(--sp-3); }
```

- [ ] **Step 4: 型別檢查 + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 全部通過；build route 表仍只有 `/` 等既有路由

- [ ] **Step 5: Commit**

```bash
git add components/screener/MarketTabs.tsx components/screener/Screener.tsx app/globals.css
git commit -m "feat(screener): 市場別 segmented control above counts"
```

---

### Task 3: ParamPanel 密度優化（壓扁，保留觸控鍵與大字）

**Files:**
- Modify: `components/screener/ParamPanel.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: 把「可調範圍」併進名稱行**（`components/screener/ParamPanel.tsx`，改 `.param-grid` 內兩塊）

```tsx
<div className="param-grid">
  <div className="param">
    <div className="p-name">法人連買天數 <b>N</b><span className="p-range">1–10・預設 2</span></div>
    <Stepper value={n} min={1} max={10} unit="天" label="法人連買天數" onChange={onN} />
  </div>
  <div className="param">
    <div className="p-name">董監持股門檻 <b>X</b><span className="p-range">5–50・預設 15</span></div>
    <Stepper value={x} min={5} max={50} unit="%" label="董監持股門檻" onChange={onX} />
  </div>
</div>
```
（移除原本兩個獨立的 `<div className="p-range">可調範圍 …</div>`。）

- [ ] **Step 2: 壓縮間距與把 p-range 改成行內**（`app/globals.css`）

```css
/* 178 */ .params { padding: var(--sp-4); margin-bottom: var(--sp-3); }
/* 179 params-head 區塊：margin-bottom 由 sp-4 改 sp-3 */
.params-head {
  display:flex; align-items:baseline; justify-content:space-between;
  gap: var(--sp-3); margin-bottom: var(--sp-3); flex-wrap: wrap;
}
/* 190 .param padding 由 sp-4 改 sp-3 */
.param {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius-ctrl); padding: var(--sp-3);
}
/* 214 p-range 由獨立置中行改行內 */
.param .p-range { margin-left: 8px; font-size: var(--fs-small); color: var(--ink-3); font-weight: 600; }
/* 216 fixed-params 上緣縮一階 */
.fixed-params {
  margin-top: var(--sp-3); padding-top: var(--sp-3);
  border-top: 1px dashed var(--border);
  display: flex; flex-wrap: wrap; gap: 8px 10px; align-items:center;
}
```

- [ ] **Step 3: build + 視覺驗收**

Run: `npm run build`
Expected: 通過。並以 `E2E=1 npm run dev` 開 localhost:3000 目視確認參數面板變矮、48px 加減鍵與大字值仍在、市場列就在計數上方。

- [ ] **Step 4: Commit**

```bash
git add components/screener/ParamPanel.tsx app/globals.css
git commit -m "style(params): density pass so list rises into view sooner"
```

---

### Task 4: 市場別互動 E2E

**Files:**
- Modify: `e2e/interactions.spec.ts`

- [ ] **Step 1: 新增測試**（append 進 `client island interactions` 的 describe 區塊內）

```ts
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
```

- [ ] **Step 2: 跑 e2e**

Run: `npm run e2e -- interactions.spec.ts`
Expected: 新測試 + 既有測試全綠

- [ ] **Step 3: Commit**

```bash
git add e2e/interactions.spec.ts
git commit -m "test(web): e2e 市場別篩選 (上市/上櫃) interaction"
```

---

## Self-Review notes
- 回歸安全：`runFilter` 第三參數預設 `'all'`，既有呼叫端與測試零改動。
- 命名一致：`MarketFilter`、`market`、`MarketTabs`、`onMarket` 全程一致。
- '全部' 在市場列與 A/B 分頁皆有 → e2e 以 `getByRole('group', { name: '市場別' })` 範圍化避免 strict-mode 撞名。
- 計數一致：market 在 `runFilter` 內前置過濾 → summary（StatsRow/Tabs 計數）自動只算該市場。
