# 資料管線 + 儲存 + API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立後端：每日（Vercel Cron 或手動）跑一次資料管線——抓 FinMind 股價＋三大法人、抓公開資訊觀測站董監持股、落地三張原始表、用計畫 1 的 `computeSignals` 算出 `daily_stock_signals` 快照、寫 `job_runs` 狀態——並以 `/api/snapshots/latest` 供前端讀取。

**Architecture:** 沿用 `web/`（Next.js App Router）。新增 `web/db/schema.sql`（Supabase 五表）、`web/lib/` 下的環境設定、Supabase 服務端客戶端、FinMind 客戶端、董監 ingest（移植自 `poc/director-holdings`）、原始資料 repo、訊號組裝器、管線編排器，以及兩個 API route 與 Vercel Cron 設定。純轉換邏輯（FinMind 正規化、董監彙總、訊號組裝）以 TDD＋fixture 寫死；I/O（Supabase、route、cron）以完整程式碼＋整合驗證步驟交付。對應設計文件 §2、§3、§4、§5、§7。

**Tech Stack:** Next.js（App Router）＋ TypeScript ＋ `@supabase/supabase-js` ＋ vitest ＋ Vercel Cron。沿用計畫 1 的 `web/lib/types.ts`、`signals.ts`。

---

## 前置與環境

- **Supabase**：使用者已建立專案。需要 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（服務端金鑰，僅伺服器用）。
- **FinMind**：使用者已取得 `FINMIND_TOKEN`。
- **Cron 保護**：`CRON_SECRET`（自訂強隨機字串）。
- 這些放在 `web/.env.local`（已 gitignore）；Vercel 上以環境變數設定。
- 執行 DB migration：把 `web/db/schema.sql` 貼到 Supabase SQL Editor 執行（或用 `psql`）。本計畫不引入 migration 框架（YAGNI）。

> 單位約定（同設計 §5）：`*_lots`＝張（股數÷1000）；`*_ratio`＝小數比例；`director_holding_pct`＝百分比數值。

---

## File Structure

```
web/
├── db/
│   └── schema.sql                 # 五表 DDL（手動套用到 Supabase）
├── vercel.json                    # Cron：每日 14:00 UTC 呼叫 /api/jobs/run
├── lib/
│   ├── env.ts                     # 讀取/驗證環境變數（server-only）
│   ├── supabase.ts                # service-role 客戶端（server-only）
│   ├── finmind.ts                 # FinMind 抓取：latestTradeDate / prices / institutional / stockInfo
│   ├── finmind-normalize.ts       # 原始回應 → 正規化 domain 物件（純函式，TDD）
│   ├── director/
│   │   ├── datagov.ts             # parseDirectorRows（移植自 POC，含董監過濾+去重）
│   │   ├── aggregate.ts           # aggregateByShares（移植自 POC）
│   │   └── ingest.ts              # 抓明細CSV+基本資料 → 每檔 director_holding_pct（純解析 TDD + 抓取）
│   ├── repo.ts                    # 原始表 upsert / 讀取視窗 / 快照讀寫 / job_runs
│   ├── signal-builder.ts          # 原始列 → SignalInput → computeSignals → daily_stock_signals 列（純，TDD）
│   └── pipeline.ts                # 編排器 runPipeline()
├── lib/__tests__/
│   ├── finmind-normalize.test.ts
│   ├── director-datagov.test.ts
│   └── signal-builder.test.ts
└── app/api/
    ├── jobs/run/route.ts          # POST，CRON_SECRET，防重複鎖
    └── snapshots/latest/route.ts  # GET
```

---

## Task 1: 依賴、環境設定、Supabase 客戶端、DB schema

**Files:**
- Modify: `web/package.json`（加 `@supabase/supabase-js`）
- Create: `web/lib/env.ts`
- Create: `web/lib/supabase.ts`
- Create: `web/db/schema.sql`
- Create: `web/.env.local.example`

- [ ] **Step 1: 安裝 Supabase 客戶端**

Run: `cd web && npm install @supabase/supabase-js@^2.45.0`
Expected: 安裝成功，`package.json` dependencies 多一筆。

- [ ] **Step 2: 建立 `web/lib/env.ts`**

```ts
// web/lib/env.ts — 僅在伺服器端 import；缺值即丟錯（fail fast）
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  supabaseUrl: () => required('SUPABASE_URL'),
  supabaseServiceKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  finmindToken: () => required('FINMIND_TOKEN'),
  cronSecret: () => required('CRON_SECRET'),
};
```

- [ ] **Step 3: 建立 `web/lib/supabase.ts`**

```ts
// web/lib/supabase.ts — server-only service-role 客戶端
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;

/** 取得服務端 Supabase 客戶端（service role，繞過 RLS；切勿用於前端）。 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
      auth: { persistSession: false },
    });
  }
  return client;
}
```

- [ ] **Step 4: 建立 `web/db/schema.sql`（五表，對應設計 §5）**

```sql
-- web/db/schema.sql — 在 Supabase SQL Editor 執行
create table if not exists stock_price_history (
  stock_id text not null,
  trade_date date not null,
  open numeric, high numeric, low numeric, close numeric,
  volume_lots numeric,
  primary key (stock_id, trade_date)
);

create table if not exists institutional_daily (
  stock_id text not null,
  trade_date date not null,
  net_lots numeric not null,
  primary key (stock_id, trade_date)
);

create table if not exists director_holdings_monthly (
  stock_id text not null,
  data_month text not null,                 -- 'YYYY-MM'
  director_holding_pct numeric not null,
  primary key (stock_id, data_month)
);

create table if not exists daily_stock_signals (
  data_date date not null,
  stock_id text not null,
  stock_name text,
  market text,                              -- 'TWSE' | 'TPEx'
  close numeric,
  change_ratio numeric,
  volume_lots numeric,
  inst_net_lots numeric,
  inst_buy_streak int,
  director_holding_pct numeric,
  director_data_month text,
  ma20 numeric, ma20_prev numeric, ma20_holdflat_5d numeric,
  ma60 numeric, ma60_prev numeric, ma60_holdflat_5d numeric,
  dist_ma20_ratio numeric, dist_ma60_ratio numeric,
  eligible_a boolean, eligible_b boolean,
  exclude_reason_a text, exclude_reason_b text,
  primary key (data_date, stock_id)
);

create table if not exists job_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  data_date date,
  status text not null,                     -- running|success|partial_success|failed|no_new_data
  stocks_processed int default 0,
  eligible_a_count int default 0,
  eligible_b_count int default 0,
  excluded_count int default 0,
  exclude_stats jsonb,
  error_message text
);

-- 取「最新成功快照日期」與「防重複鎖」用的索引
create index if not exists idx_job_runs_status_started on job_runs (status, started_at desc);
create index if not exists idx_signals_data_date on daily_stock_signals (data_date);
```

- [ ] **Step 5: 建立 `web/.env.local.example`**

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FINMIND_TOKEN=your-finmind-token
CRON_SECRET=generate-a-long-random-string
```

- [ ] **Step 6: 套用 schema 並驗證（人工）**

把 `web/db/schema.sql` 貼到 Supabase SQL Editor 執行；確認五張表建立成功（左側 Table Editor 可見）。把 `.env.local.example` 複製為 `.env.local` 並填入真值。

- [ ] **Step 7: 型別檢查 + Commit**

Run: `cd web && npx tsc --noEmit`（預期無錯；env/supabase 僅型別不執行）
```bash
git add web/package.json web/package-lock.json web/lib/env.ts web/lib/supabase.ts web/db/schema.sql web/.env.local.example
git commit -m "feat(web): supabase client, env config, db schema (5 tables)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: FinMind 客戶端 + 正規化（先抓樣本確認欄位，再 TDD 解析）

> FinMind REST：`GET https://api.finmindtrade.com/api/v4/data?dataset=<ds>&start_date=<YYYY-MM-DD>&end_date=<YYYY-MM-DD>&token=<token>`（不帶 `data_id` 取全市場該日）。回應 `{ "msg":"success", "status":200, "data":[ ... ] }`。**欄位確切名稱以抓回的樣本為準**（FinMind 欄位常為大小寫混用，如 `Trading_Volume`）。

**Files:**
- Create: `web/lib/finmind.ts`
- Create: `web/lib/finmind-normalize.ts`
- Test: `web/lib/__tests__/finmind-normalize.test.ts`

- [ ] **Step 1: 抓三個樣本確認欄位（人工一次性；用真 token）**

於 `web/` 下，用 `FINMIND_TOKEN` 抓最近一個交易日的小樣本，**記下確切欄位名**到本任務「實測記錄」：
```bash
cd web && node --env-file=.env.local -e "
const t=process.env.FINMIND_TOKEN; const d='2026-06-06';
const base='https://api.finmindtrade.com/api/v4/data';
for (const ds of ['TaiwanStockPrice','TaiwanStockInstitutionalInvestorsBuySell','TaiwanStockInfo']) {
  const u=new URL(base); u.searchParams.set('dataset',ds);
  if (ds!=='TaiwanStockInfo'){u.searchParams.set('start_date',d);u.searchParams.set('end_date',d);}
  u.searchParams.set('token',t);
  const r=await fetch(u); const j=await r.json();
  console.log(ds,'status',j.status,'rows',(j.data||[]).length,'keys',Object.keys((j.data||[])[0]||{}));
  console.log('sample', JSON.stringify((j.data||[])[0]));
}
"
```
預期：`TaiwanStockPrice` keys 含 `date, stock_id, open, max, min, close, Trading_Volume`；`...InstitutionalInvestorsBuySell` keys 含 `date, stock_id, name, buy, sell`（**long 格式，每檔多列、每列一種法人類別**）；`TaiwanStockInfo` keys 含 `stock_id, stock_name, type`（`type` 區分 `twse`/`tpex`）。把實際 keys 與 `name` 欄出現的法人類別字串（如 `Foreign_Investor`/`Investment_Trust`/`Dealer_self`/`Dealer_Hedging`/`Foreign_Dealer_Self`）記下。若欄位名與上述不同，於 Step 3/4 調整。

- [ ] **Step 2: 寫失敗測試（正規化純函式，用合成 raw 列）**

```ts
// web/lib/__tests__/finmind-normalize.test.ts
import { describe, it, expect } from 'vitest';
import { normalizePrice, normalizeInstitutional, normalizeStockInfo } from '../finmind-normalize';

describe('normalizePrice', () => {
  it('股數轉張、欄位對應', () => {
    const rows = [{ date: '2026-06-06', stock_id: '2330', open: 1000, max: 1010, min: 990, close: 1005, Trading_Volume: 25_000_000 }];
    const out = normalizePrice(rows);
    expect(out[0]).toEqual({ stockId: '2330', tradeDate: '2026-06-06', open: 1000, high: 1010, low: 990, close: 1005, volumeLots: 25000 });
  });
});

describe('normalizeInstitutional（long → 每檔每日合計買超張）', () => {
  it('同檔多法人列加總 (買-賣)/1000', () => {
    const rows = [
      { date: '2026-06-06', stock_id: '2330', name: 'Foreign_Investor', buy: 5_000_000, sell: 1_000_000 },
      { date: '2026-06-06', stock_id: '2330', name: 'Investment_Trust', buy: 2_000_000, sell: 0 },
      { date: '2026-06-06', stock_id: '2330', name: 'Dealer_self', buy: 0, sell: 1_000_000 },
    ];
    const out = normalizeInstitutional(rows);
    // (4,000,000 + 2,000,000 - 1,000,000)/1000 = 5000
    expect(out).toEqual([{ stockId: '2330', tradeDate: '2026-06-06', netLots: 5000 }]);
  });
});

describe('normalizeStockInfo', () => {
  it('type→market、取名稱（去重，TWSE/TPEx 以外略過）', () => {
    const rows = [
      { stock_id: '2330', stock_name: '台積電', type: 'twse' },
      { stock_id: '6488', stock_name: '環球晶', type: 'tpex' },
      { stock_id: '0050', stock_name: '元大台灣50', type: 'twse' },
    ];
    const m = normalizeStockInfo(rows);
    expect(m.get('2330')).toEqual({ stockName: '台積電', market: 'TWSE' });
    expect(m.get('6488')).toEqual({ stockName: '環球晶', market: 'TPEx' });
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `cd web && npx vitest run lib/__tests__/finmind-normalize.test.ts`
Expected: FAIL（函式未定義）。

- [ ] **Step 4: 實作正規化（依 Step 1 實測欄位微調 `PRICE_VOL`/類別判斷）**

```ts
// web/lib/finmind-normalize.ts
import type { Market } from './types';

export interface RawPrice { date: string; stock_id: string; open: number; max: number; min: number; close: number; Trading_Volume: number; }
export interface RawInst { date: string; stock_id: string; name: string; buy: number; sell: number; }
export interface RawInfo { stock_id: string; stock_name: string; type: string; }

export interface PriceRow { stockId: string; tradeDate: string; open: number; high: number; low: number; close: number; volumeLots: number; }
export interface InstRow { stockId: string; tradeDate: string; netLots: number; }

export function normalizePrice(rows: RawPrice[]): PriceRow[] {
  return rows.map((r) => ({
    stockId: r.stock_id,
    tradeDate: r.date,
    open: r.open, high: r.max, low: r.min, close: r.close,
    volumeLots: r.Trading_Volume / 1000,
  }));
}

/** long 格式：同 (stock_id, date) 多列（各法人類別），合計 Σ(buy-sell)/1000 = 三大法人合計買超（張）。 */
export function normalizeInstitutional(rows: RawInst[]): InstRow[] {
  const acc = new Map<string, { stockId: string; tradeDate: string; netShares: number }>();
  for (const r of rows) {
    const key = `${r.stock_id}|${r.date}`;
    const cur = acc.get(key) ?? { stockId: r.stock_id, tradeDate: r.date, netShares: 0 };
    cur.netShares += (r.buy - r.sell);
    acc.set(key, cur);
  }
  return [...acc.values()].map((v) => ({ stockId: v.stockId, tradeDate: v.tradeDate, netLots: v.netShares / 1000 }));
}

export function normalizeStockInfo(rows: RawInfo[]): Map<string, { stockName: string; market: Market }> {
  const m = new Map<string, { stockName: string; market: Market }>();
  for (const r of rows) {
    const market: Market | null = r.type === 'twse' ? 'TWSE' : r.type === 'tpex' ? 'TPEx' : null;
    if (!market) continue;
    if (!m.has(r.stock_id)) m.set(r.stock_id, { stockName: r.stock_name, market });
  }
  return m;
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `cd web && npx vitest run lib/__tests__/finmind-normalize.test.ts`
Expected: PASS。

- [ ] **Step 6: 寫 FinMind 抓取客戶端**

```ts
// web/lib/finmind.ts — server-only
import { env } from './env';
import {
  normalizePrice, normalizeInstitutional, normalizeStockInfo,
  type RawPrice, type RawInst, type RawInfo, type PriceRow, type InstRow,
} from './finmind-normalize';
import type { Market } from './types';

const BASE = 'https://api.finmindtrade.com/api/v4/data';

async function fetchDataset<T>(params: Record<string, string>): Promise<T[]> {
  const u = new URL(BASE);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('token', env.finmindToken());
  const res = await fetch(u);
  const json = (await res.json()) as { msg?: string; status?: number; data?: T[] };
  if (json.status !== 200 || !Array.isArray(json.data)) {
    throw new Error(`FinMind ${params.dataset} 失敗：status=${json.status} msg=${json.msg}`);
  }
  return json.data;
}

/** 以 2330 近 ~10 日資料推出「最新可得交易日」。 */
export async function latestTradeDate(): Promise<string> {
  const start = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
  const rows = await fetchDataset<RawPrice>({ dataset: 'TaiwanStockPrice', data_id: '2330', start_date: start });
  const dates = rows.map((r) => r.date).sort();
  if (dates.length === 0) throw new Error('FinMind 無法取得最新交易日（2330 近兩週無資料）');
  return dates[dates.length - 1];
}

/** 在 [from, to] 之間 2330 實際有交易的日期（升冪）—— 用以得知真實交易日清單，避免自維護交易日曆。 */
export async function tradingDaysInRange(from: string, to: string): Promise<string[]> {
  const rows = await fetchDataset<RawPrice>({ dataset: 'TaiwanStockPrice', data_id: '2330', start_date: from, end_date: to });
  return rows.map((r) => r.date).sort();
}

export async function fetchPrices(date: string): Promise<PriceRow[]> {
  return normalizePrice(await fetchDataset<RawPrice>({ dataset: 'TaiwanStockPrice', start_date: date, end_date: date }));
}

export async function fetchInstitutional(date: string): Promise<InstRow[]> {
  return normalizeInstitutional(
    await fetchDataset<RawInst>({ dataset: 'TaiwanStockInstitutionalInvestorsBuySell', start_date: date, end_date: date }),
  );
}

export async function fetchStockInfo(): Promise<Map<string, { stockName: string; market: Market }>> {
  return normalizeStockInfo(await fetchDataset<RawInfo>({ dataset: 'TaiwanStockInfo' }));
}
```

- [ ] **Step 7: Commit**

```bash
git add web/lib/finmind.ts web/lib/finmind-normalize.ts web/lib/__tests__/finmind-normalize.test.ts
git commit -m "feat(web): FinMind client + normalization (price/institutional/info)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 董監 ingest（移植 POC 解析 + 抓取整月明細）

把 `poc/director-holdings` 已驗證的解析（只計董監本人、依姓名去重）移植進 `web/`，並包成「抓整月明細 + 基本資料 → 每檔 `director_holding_pct`」。

**Files:**
- Create: `web/lib/director/datagov.ts`（移植 `parseDirectorRows`）
- Create: `web/lib/director/aggregate.ts`（移植 `aggregateByShares`）
- Create: `web/lib/director/ingest.ts`
- Test: `web/lib/__tests__/director-datagov.test.ts`

- [ ] **Step 1: 移植 `aggregate.ts` 與 `datagov.ts`（與 POC 同邏輯）**

`web/lib/director/aggregate.ts`：
```ts
export interface DirectorRow { title: string; name: string; currentShares: number; }

export function aggregateByShares(rows: DirectorRow[], outstandingShares: number): number {
  if (!(outstandingShares > 0)) throw new Error('outstandingShares must be > 0');
  const total = rows.reduce((s, r) => s + r.currentShares, 0);
  return (total / outstandingShares) * 100;
}
```

`web/lib/director/datagov.ts`（**含已驗證的董監過濾＋去重**；需 `npm i csv-parse@^5.6.0`）：
```ts
import { parse } from 'csv-parse/sync';
import type { DirectorRow } from './aggregate';

const COL = {
  stockId: ['公司代號', '代號'],
  title: ['職稱'],
  name: ['姓名'],
  shares: ['目前持股', '持股（股數）', '持股(股數)', '目前持股(股)'],
};
function findKey(keys: string[], aliases: string[]): string {
  const k = keys.find((key) => aliases.includes(key.trim()));
  if (!k) throw new Error(`找不到欄位，候選名稱：${aliases.join('/')}；實際表頭：${keys.join(',')}`);
  return k;
}
const isDirectorOrSupervisor = (title: string) =>
  (title.includes('董事') || title.includes('監察人')) && !title.includes('法人代表');

/** 解析整月明細 → 每檔 stockId 的董監本人列（已過濾經理人/法人代表、依姓名去重）。 */
export function parseDirectorRowsByStock(csv: string): Map<string, DirectorRow[]> {
  const records: Record<string, string>[] = parse(csv, {
    columns: true, skip_empty_lines: true, relax_column_count: true, bom: true, trim: true,
  });
  const out = new Map<string, DirectorRow[]>();
  if (records.length === 0) return out;
  const keys = Object.keys(records[0]);
  const kId = findKey(keys, COL.stockId);
  const kTitle = findKey(keys, COL.title);
  const kName = findKey(keys, COL.name);
  const kShares = findKey(keys, COL.shares);

  const dedupe = new Map<string, Map<string, DirectorRow>>(); // stockId -> name -> row
  for (const r of records) {
    const title = r[kTitle];
    if (!isDirectorOrSupervisor(title)) continue;
    const id = String(r[kId]).trim();
    const name = r[kName];
    const shares = Number(String(r[kShares]).replace(/,/g, '')) || 0;
    const byName = dedupe.get(id) ?? new Map<string, DirectorRow>();
    const prev = byName.get(name);
    if (!prev || shares > prev.currentShares) byName.set(name, { title, name, currentShares: shares });
    dedupe.set(id, byName);
  }
  for (const [id, byName] of dedupe) out.set(id, [...byName.values()]);
  return out;
}

/** data.gov 資料年月（民國 YYYMM，如 '11504'）→ 'YYYY-MM'。 */
export function rocMonthToIso(rocYYYMM: string): string {
  const s = String(rocYYYMM).trim();
  const year = Number(s.slice(0, 3)) + 1911;
  const month = s.slice(3, 5);
  return `${year}-${month}`;
}
```

- [ ] **Step 2: 寫解析測試（用 POC fixture，相對路徑指回 repo 的 POC 樣本）**

```ts
// web/lib/__tests__/director-datagov.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDirectorRowsByStock, rocMonthToIso } from '../director/datagov';
import { aggregateByShares } from '../director/aggregate';

// 重用 POC 已抓取並提交的明細 fixture（位於 repo 的 poc/ 下）
const listed = readFileSync(new URL('../../../poc/director-holdings/fixtures/datagov-listed.csv', import.meta.url), 'utf8');
const otc = readFileSync(new URL('../../../poc/director-holdings/fixtures/datagov-otc.csv', import.meta.url), 'utf8');

describe('parseDirectorRowsByStock 對齊 MOPS', () => {
  it('2330 全體董監持股 = 6.52%（與 POC/MOPS 一致）', () => {
    const rows = parseDirectorRowsByStock(listed).get('2330')!;
    expect(rows.reduce((s, r) => s + r.currentShares, 0)).toBe(1_690_761_830);
    expect(aggregateByShares(rows, 25_932_370_067)).toBeCloseTo(6.52, 1);
  });
  it('6488 全體董監持股 = 46.96%（法人董事去重、排除法人代表/經理人）', () => {
    const rows = parseDirectorRowsByStock(otc).get('6488')!;
    expect(rows.reduce((s, r) => s + r.currentShares, 0)).toBe(224_521_516);
    expect(aggregateByShares(rows, 478_113_725)).toBeCloseTo(46.96, 1);
  });
});

describe('rocMonthToIso', () => {
  it('11504 → 2026-04', () => { expect(rocMonthToIso('11504')).toBe('2026-04'); });
});
```

- [ ] **Step 3: 跑測試（先紅後綠）**

Run: `cd web && npx vitest run lib/__tests__/director-datagov.test.ts`
先確認 import 失敗（紅）→ 完成 Step 1 程式後再跑（綠）。若 `csv-parse` 未裝：`cd web && npm install csv-parse@^5.6.0`。

- [ ] **Step 4: 寫 `ingest.ts`（抓整月明細 + 基本資料 → 每檔 pct 與資料月份）**

```ts
// web/lib/director/ingest.ts — server-only
import { parseDirectorRowsByStock, rocMonthToIso } from './datagov';
import { aggregateByShares } from './aggregate';

const SRC = {
  TWSE: {
    detail: 'https://openapi.twse.com.tw/v1/opendata/t187ap11_L',
    basic: 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',
    codeKey: '公司代號', sharesKey: '已發行普通股數或TDR原股發行股數',
  },
  TPEx: {
    detail: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap11_O',
    basic: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O',
    codeKey: 'SecuritiesCompanyCode', sharesKey: 'IssueShares',
  },
} as const;

export interface DirectorHolding { stockId: string; pct: number; dataMonth: string; }

async function getCsv(url: string): Promise<string> {
  const res = await fetch(url, { headers: { Accept: 'text/csv', 'User-Agent': 'stock-screener' } });
  const text = await res.text();
  if (text.slice(0, 200).toLowerCase().includes('<html')) throw new Error(`董監明細回傳 HTML 而非 CSV：${url}`);
  return text;
}
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'stock-screener' } });
  return (await res.json()) as T;
}

/** 抓單一市場：回傳每檔 director_holding_pct 與資料月份。 */
export async function ingestMarket(market: 'TWSE' | 'TPEx'): Promise<DirectorHolding[]> {
  const src = SRC[market];
  const [detailCsv, basic] = await Promise.all([
    getCsv(src.detail),
    getJson<Record<string, string>[]>(src.basic),
  ]);
  const byStock = parseDirectorRowsByStock(detailCsv);
  const sharesById = new Map<string, number>();
  for (const co of basic) {
    const id = String(co[src.codeKey]).trim();
    const shares = Number(String(co[src.sharesKey] ?? '').replace(/,/g, ''));
    if (id && shares > 0) sharesById.set(id, shares);
  }
  // 資料月份：取明細第一列的資料年月（整月一致）；以 csv 簡單擷取
  const dataMonth = extractDataMonth(detailCsv);

  const out: DirectorHolding[] = [];
  for (const [stockId, rows] of byStock) {
    const shares = sharesById.get(stockId);
    if (!shares) continue; // 無發行股數 → 略過（fail-closed，後續視為缺董監）
    out.push({ stockId, pct: aggregateByShares(rows, shares), dataMonth });
  }
  return out;
}

function extractDataMonth(csv: string): string {
  // 表頭含「資料年月」，取第一筆資料列該欄（民國 YYYMM）
  const lines = csv.split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim());
  const idx = header.indexOf('資料年月');
  if (idx < 0) throw new Error('董監明細缺「資料年月」欄');
  const first = lines.find((l, i) => i > 0 && l.trim().length > 0)!;
  const cell = first.split(',')[idx].replace(/^"|"$/g, '').trim();
  return rocMonthToIso(cell);
}

export async function ingestAllDirectors(): Promise<DirectorHolding[]> {
  const [tw, otc] = await Promise.all([ingestMarket('TWSE'), ingestMarket('TPEx')]);
  return [...tw, ...otc];
}
```

> 註：`extractDataMonth` 用簡單字串切割是因為只取單一欄、整月一致；明細本體仍由 `csv-parse` 嚴謹解析。若未來欄位順序變動導致切割失準，改用 `csv-parse` 取首列即可。

- [ ] **Step 5: Commit**

```bash
git add web/lib/director web/lib/__tests__/director-datagov.test.ts web/package.json web/package-lock.json
git commit -m "feat(web): director-holdings ingest (ported POC parse + monthly fetch)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 原始資料 repo（upsert / 讀視窗 / 快照 / job_runs）

**Files:**
- Create: `web/lib/repo.ts`

- [ ] **Step 1: 寫 repo（Supabase upsert 與讀取）**

```ts
// web/lib/repo.ts — server-only
import { getSupabase } from './supabase';
import type { PriceRow, InstRow } from './finmind-normalize';
import type { DirectorHolding } from './director/ingest';
import type { StockSignal } from './types';

const CHUNK = 1000;
async function upsertChunked<T>(table: string, rows: T[], onConflict: string): Promise<void> {
  const db = getSupabase();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + CHUNK) as object[], { onConflict });
    if (error) throw new Error(`upsert ${table} 失敗：${error.message}`);
  }
}

export async function upsertPrices(rows: PriceRow[]): Promise<void> {
  await upsertChunked('stock_price_history',
    rows.map((r) => ({ stock_id: r.stockId, trade_date: r.tradeDate, open: r.open, high: r.high, low: r.low, close: r.close, volume_lots: r.volumeLots })),
    'stock_id,trade_date');
}

export async function upsertInstitutional(rows: InstRow[]): Promise<void> {
  await upsertChunked('institutional_daily',
    rows.map((r) => ({ stock_id: r.stockId, trade_date: r.tradeDate, net_lots: r.netLots })),
    'stock_id,trade_date');
}

export async function upsertDirectors(rows: DirectorHolding[]): Promise<void> {
  await upsertChunked('director_holdings_monthly',
    rows.map((r) => ({ stock_id: r.stockId, data_month: r.dataMonth, director_holding_pct: r.pct })),
    'stock_id,data_month');
}

// ⚠️ PostgREST/Supabase 單次 select 預設最多回 1000 列。全市場視窗（~1800×70 ≈ 12.6 萬列）
// 必須分頁，否則會「靜默只拿到 1000 列」。以 range 迴圈分頁取全部。
async function selectAllPaged<T>(build: () => any): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(`分頁讀取失敗：${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** 由 asOf 往前 calendarDays 天的日期（YYYY-MM-DD），作為查詢下限以免全表掃描。 */
function floorDate(asOf: string, calendarDays: number): string {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - calendarDays);
  return d.toISOString().slice(0, 10);
}

/** DB 中某表在 [from, asOf] 已存在的交易日集合（用於只回補缺日）。 */
export async function existingDates(
  table: 'stock_price_history' | 'institutional_daily', from: string, asOf: string,
): Promise<Set<string>> {
  const rows = await selectAllPaged<{ trade_date: string }>(() =>
    getSupabase().from(table).select('trade_date').gte('trade_date', from).lte('trade_date', asOf).order('trade_date', { ascending: true }));
  return new Set(rows.map((r) => r.trade_date));
}

/** 某交易日各檔成交量（張）。 */
export async function readDayVolumes(date: string): Promise<Map<string, number>> {
  const rows = await selectAllPaged<{ stock_id: string; volume_lots: number }>(() =>
    getSupabase().from('stock_price_history').select('stock_id, volume_lots').eq('trade_date', date));
  return new Map(rows.map((r) => [r.stock_id, Number(r.volume_lots)]));
}

/** 讀「截至 asOf（含）最近 limitDays 個交易日」的收盤；時間升冪。 */
export async function readPriceWindow(asOf: string, limitDays: number): Promise<Map<string, { date: string; close: number }[]>> {
  const from = floorDate(asOf, Math.ceil(limitDays * 1.9)); // 70 交易日 ≈ 130 日曆日，留緩衝
  const rows = await selectAllPaged<{ stock_id: string; trade_date: string; close: number }>(() =>
    getSupabase().from('stock_price_history').select('stock_id, trade_date, close').gte('trade_date', from).lte('trade_date', asOf).order('trade_date', { ascending: true }));
  const m = new Map<string, { date: string; close: number }[]>();
  for (const r of rows) {
    const arr = m.get(r.stock_id) ?? [];
    arr.push({ date: r.trade_date, close: Number(r.close) });
    m.set(r.stock_id, arr);
  }
  for (const [id, arr] of m) m.set(id, arr.slice(-limitDays));
  return m;
}

export async function readInstWindow(asOf: string, limitDays: number): Promise<Map<string, { date: string; netLots: number }[]>> {
  const from = floorDate(asOf, Math.ceil(limitDays * 1.9));
  const rows = await selectAllPaged<{ stock_id: string; trade_date: string; net_lots: number }>(() =>
    getSupabase().from('institutional_daily').select('stock_id, trade_date, net_lots').gte('trade_date', from).lte('trade_date', asOf).order('trade_date', { ascending: true }));
  const m = new Map<string, { date: string; netLots: number }[]>();
  for (const r of rows) {
    const arr = m.get(r.stock_id) ?? [];
    arr.push({ date: r.trade_date, netLots: Number(r.net_lots) });
    m.set(r.stock_id, arr);
  }
  for (const [id, arr] of m) m.set(id, arr.slice(-limitDays));
  return m;
}

/** 每檔最新可得月份的董監持股（升冪掃描 → 最後寫入者為最新月份）。 */
export async function readLatestDirectors(): Promise<Map<string, { pct: number; dataMonth: string }>> {
  const rows = await selectAllPaged<{ stock_id: string; data_month: string; director_holding_pct: number }>(() =>
    getSupabase().from('director_holdings_monthly').select('stock_id, data_month, director_holding_pct').order('data_month', { ascending: true }));
  const m = new Map<string, { pct: number; dataMonth: string }>();
  for (const r of rows) m.set(r.stock_id, { pct: Number(r.director_holding_pct), dataMonth: r.data_month });
  return m;
}

export async function writeSignals(rows: StockSignal[]): Promise<void> {
  await upsertChunked('daily_stock_signals',
    rows.map((s) => ({
      data_date: s.dataDate, stock_id: s.stockId, stock_name: s.stockName, market: s.market,
      close: s.close, change_ratio: s.changeRatio, volume_lots: s.volumeLots,
      inst_net_lots: s.instNetLots, inst_buy_streak: s.instBuyStreak,
      director_holding_pct: s.directorHoldingPct, director_data_month: s.directorDataMonth,
      ma20: s.ma20, ma20_prev: s.ma20Prev, ma20_holdflat_5d: s.ma20Holdflat5d,
      ma60: s.ma60, ma60_prev: s.ma60Prev, ma60_holdflat_5d: s.ma60Holdflat5d,
      dist_ma20_ratio: s.distMa20Ratio, dist_ma60_ratio: s.distMa60Ratio,
      eligible_a: s.eligibleA, eligible_b: s.eligibleB,
      exclude_reason_a: s.excludeReasonA, exclude_reason_b: s.excludeReasonB,
    })),
    'data_date,stock_id');
}

/** 最新「成功/部分成功」快照的資料日期（無則 null）。 */
export async function latestSnapshotDate(): Promise<string | null> {
  const db = getSupabase();
  const { data, error } = await db
    .from('job_runs')
    .select('data_date')
    .in('status', ['success', 'partial_success'])
    .not('data_date', 'is', null)
    .order('data_date', { ascending: false })
    .limit(1);
  if (error) throw new Error(`latestSnapshotDate 失敗：${error.message}`);
  return data && data.length ? (data[0].data_date as string) : null;
}
```

- [ ] **Step 2: 型別檢查 + Commit**

Run: `cd web && npx tsc --noEmit`（無錯）
```bash
git add web/lib/repo.ts
git commit -m "feat(web): raw-data repo (upsert, windowed reads, snapshot date)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 訊號組裝器（原始列 → SignalInput → computeSignals）（TDD）

把每檔的收盤視窗、法人視窗、最新董監、名稱/市場組成 `SignalInput`，呼叫計畫 1 的 `computeSignals`。法人視窗需對齊交易日：缺當日法人資料的交易日填 `null`（中斷連買）。

**Files:**
- Create: `web/lib/signal-builder.ts`
- Test: `web/lib/__tests__/signal-builder.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// web/lib/__tests__/signal-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildSignals } from '../signal-builder';

const info = new Map([['2330', { stockName: '台積電', market: 'TWSE' as const }]]);

describe('buildSignals', () => {
  it('以交易日對齊法人（缺日填 null 以中斷連買），組出 StockSignal', () => {
    const prices = new Map([['2330', [
      { date: '2026-06-04', close: 100 }, { date: '2026-06-05', close: 101 }, { date: '2026-06-06', close: 102 },
    ]]]);
    const inst = new Map([['2330', [
      { date: '2026-06-05', netLots: 3 }, { date: '2026-06-06', netLots: 5 }, // 6-04 缺
    ]]]);
    const directors = new Map([['2330', { pct: 6.52, dataMonth: '2026-04' }]]);
    const out = buildSignals('2026-06-06', ['2330'], prices, inst, directors, info);
    expect(out).toHaveLength(1);
    expect(out[0].stockId).toBe('2330');
    expect(out[0].close).toBe(102);
    expect(out[0].instNetLots).toBe(5);
    expect(out[0].instBuyStreak).toBe(2); // 6-05、6-06 連兩天 >0（6-04 為 null 不影響結尾）
    expect(out[0].directorHoldingPct).toBe(6.52);
    expect(out[0].directorDataMonth).toBe('2026-04');
    expect(out[0].market).toBe('TWSE');
  });

  it('缺董監 → directorHoldingPct null（computeSignals 會標 missing_director）', () => {
    const prices = new Map([['2330', [{ date: '2026-06-06', close: 100 }]]]);
    const out = buildSignals('2026-06-06', ['2330'], prices, new Map(), new Map(), info);
    expect(out[0].directorHoldingPct).toBeNull();
    expect(out[0].excludeReasonA).toBe('missing_director');
  });

  it('無價格資料的股票直接略過', () => {
    const out = buildSignals('2026-06-06', ['9999'], new Map(), new Map(), new Map(), info);
    expect(out).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && npx vitest run lib/__tests__/signal-builder.test.ts`
Expected: FAIL（`buildSignals` 未定義）。

- [ ] **Step 3: 實作**

```ts
// web/lib/signal-builder.ts
import { computeSignals } from './signals';
import type { StockSignal, SignalInput, Market } from './types';

/** 以價格視窗的交易日為基準，對齊法人（缺日 null）。回傳每檔 StockSignal。 */
export function buildSignals(
  dataDate: string,
  stockIds: string[],
  prices: Map<string, { date: string; close: number }[]>,
  inst: Map<string, { date: string; netLots: number }[]>,
  directors: Map<string, { pct: number; dataMonth: string }>,
  info: Map<string, { stockName: string; market: Market }>,
): StockSignal[] {
  const out: StockSignal[] = [];
  for (const stockId of stockIds) {
    const priceRows = prices.get(stockId);
    if (!priceRows || priceRows.length === 0) continue;

    const closes = priceRows.map((p) => p.close);
    const instByDate = new Map((inst.get(stockId) ?? []).map((r) => [r.date, r.netLots]));
    const instNetLots = priceRows.map((p) => (instByDate.has(p.date) ? instByDate.get(p.date)! : null));

    const meta = info.get(stockId);
    const director = directors.get(stockId);
    const input: SignalInput = {
      stockId,
      stockName: meta?.stockName ?? stockId,
      market: meta?.market ?? 'TWSE',
      dataDate,
      closes,
      volumeLots: 0, // 由管線在組裝後另填當日量（見 pipeline；此處不需精確）
      instNetLots,
      directorHoldingPct: director ? director.pct : null,
      directorDataMonth: director ? director.dataMonth : null,
    };
    out.push(computeSignals(input));
  }
  return out;
}
```

> 註：`volumeLots`（當日量）非訊號計算所需，於 `pipeline` 寫入快照前由當日 `PriceRow.volumeLots` 補上，避免在此重複載入。`computeSignals` 會把 `volumeLots` 原樣帶入 `StockSignal.volumeLots`，pipeline 再覆寫成當日真值。

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && npx vitest run lib/__tests__/signal-builder.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add web/lib/signal-builder.ts web/lib/__tests__/signal-builder.test.ts
git commit -m "feat(web): signal-builder assembles SignalInput → computeSignals

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 管線編排器 `runPipeline()`

串起：判定最新交易日 → no_new_data 短路 → 抓 FinMind 全市場 → upsert 原始 → 抓/沿用董監 → 組訊號 → 寫快照 → 回傳統計。

**Files:**
- Create: `web/lib/pipeline.ts`

- [ ] **Step 1: 寫編排器**

```ts
// web/lib/pipeline.ts — server-only
import { latestTradeDate, tradingDaysInRange, fetchPrices, fetchInstitutional, fetchStockInfo } from './finmind';
import { ingestAllDirectors } from './director/ingest';
import { buildSignals } from './signal-builder';
import {
  upsertPrices, upsertInstitutional, upsertDirectors, existingDates, readDayVolumes,
  readPriceWindow, readInstWindow, readLatestDirectors,
  writeSignals, latestSnapshotDate,
} from './repo';
import type { StockSignal } from './types';

const PRICE_BACKFILL_DAYS = 70;   // 訊號視窗：最近 70 交易日收盤（足 60MA + prev）
const INST_BACKFILL_DAYS = 30;    // 訊號視窗：最近 30 交易日法人（足連買 N≤10）
const PRICE_LOOKBACK_CAL = 130;   // 回補價格的日曆天數（~75 交易日）
const INST_LOOKBACK_CAL = 60;     // 回補法人的日曆天數（~35 交易日）

function floorCal(asOf: string, days: number): string {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 確保最近視窗內每個「實際交易日」的全市場價量/法人都已落地；首次全回補、之後只補缺日（idempotent、self-healing）。 */
async function ensureMarketData(dataDate: string): Promise<void> {
  const priceFrom = floorCal(dataDate, PRICE_LOOKBACK_CAL);
  const days = await tradingDaysInRange(priceFrom, dataDate);          // 實際交易日清單（來自 2330）
  const havePrice = await existingDates('stock_price_history', priceFrom, dataDate);
  for (const d of days) {
    if (havePrice.has(d)) continue;
    await upsertPrices(await fetchPrices(d));                          // 逐缺日抓全市場
  }
  const instFrom = floorCal(dataDate, INST_LOOKBACK_CAL);
  const haveInst = await existingDates('institutional_daily', instFrom, dataDate);
  for (const d of days.filter((x) => x >= instFrom)) {
    if (haveInst.has(d)) continue;
    await upsertInstitutional(await fetchInstitutional(d));
  }
}

export interface PipelineResult {
  status: 'success' | 'partial_success' | 'no_new_data';
  dataDate: string | null;
  stocksProcessed: number;
  eligibleACount: number;
  eligibleBCount: number;
  excludedCount: number;
  excludeStats: Record<string, number>;
  errorMessage: string | null;
}

export async function runPipeline(): Promise<PipelineResult> {
  const dataDate = await latestTradeDate();
  const latest = await latestSnapshotDate();
  if (latest && latest >= dataDate) {
    return { status: 'no_new_data', dataDate, stocksProcessed: 0, eligibleACount: 0, eligibleBCount: 0, excludedCount: 0, excludeStats: {}, errorMessage: null };
  }

  // 1) 確保最近視窗的全市場原始資料齊備（首次回補 ~75 交易日，之後只補缺日）+ 股票資訊
  const info = await fetchStockInfo();
  await ensureMarketData(dataDate);

  // 2) 董監（每月）：抓當月明細；失敗則沿用 DB 既有 → partial_success
  let partial = false;
  let errorMessage: string | null = null;
  try {
    const directors = await ingestAllDirectors();
    if (directors.length > 0) await upsertDirectors(directors);
    else { partial = true; errorMessage = '董監抓取回傳 0 筆，沿用既有月份'; }
  } catch (e) {
    partial = true;
    errorMessage = `董監抓取失敗，沿用既有月份：${(e as Error).message}`;
  }

  // 3) 讀回視窗 + 最新董監 + 當日量，組訊號
  const [priceWin, instWin, directors, todayVolume] = await Promise.all([
    readPriceWindow(dataDate, PRICE_BACKFILL_DAYS),
    readInstWindow(dataDate, INST_BACKFILL_DAYS),
    readLatestDirectors(),
    readDayVolumes(dataDate),
  ]);
  const stockIds = [...priceWin.keys()];
  const signals: StockSignal[] = buildSignals(dataDate, stockIds, priceWin, instWin, directors, info)
    .map((s) => ({ ...s, volumeLots: todayVolume.get(s.stockId) ?? 0 })); // 覆寫當日真值

  await writeSignals(signals);

  // 4) 統計
  const excludeStats: Record<string, number> = {};
  let eligibleACount = 0, eligibleBCount = 0, excludedCount = 0;
  for (const s of signals) {
    if (s.eligibleA) eligibleACount++;
    if (s.eligibleB) eligibleBCount++;
    if (!s.eligibleA && !s.eligibleB) excludedCount++;
    for (const reason of [s.excludeReasonA, s.excludeReasonB]) {
      if (reason) excludeStats[reason] = (excludeStats[reason] ?? 0) + 1;
    }
  }

  return {
    status: partial ? 'partial_success' : 'success',
    dataDate, stocksProcessed: signals.length,
    eligibleACount, eligibleBCount, excludedCount, excludeStats, errorMessage,
  };
}
```

- [ ] **Step 2: 型別檢查 + Commit**

Run: `cd web && npx tsc --noEmit`（無錯）
```bash
git add web/lib/pipeline.ts
git commit -m "feat(web): pipeline orchestrator (fetch → store → signals → stats)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `/api/jobs/run`（CRON_SECRET + 防重複鎖 + job_runs）

**Files:**
- Create: `web/app/api/jobs/run/route.ts`

- [ ] **Step 1: 寫 route（鎖、逾時、409、寫 job_runs）**

```ts
// web/app/api/jobs/run/route.ts
import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { runPipeline } from '@/lib/pipeline';

export const maxDuration = 300; // Vercel：給管線足夠時間

const STALE_MINUTES = 30;

export async function POST(req: Request): Promise<Response> {
  // 1) 認證
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${env.cronSecret()}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = getSupabase();

  // 2) 防重複：若有未逾時的 running → 409
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const { data: runningRows, error: qErr } = await db
    .from('job_runs').select('id, started_at').eq('status', 'running').gte('started_at', staleBefore).limit(1);
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  if (runningRows && runningRows.length > 0) {
    return NextResponse.json({ status: 'already_running' }, { status: 409 });
  }

  // 3) 寫一筆 running 作為鎖
  const { data: lockRow, error: lockErr } = await db
    .from('job_runs').insert({ status: 'running' }).select('id').single();
  if (lockErr || !lockRow) return NextResponse.json({ error: lockErr?.message ?? 'lock failed' }, { status: 500 });
  const runId = lockRow.id as number;

  // 4) 跑管線；無論成敗都更新該列
  try {
    const r = await runPipeline();
    await db.from('job_runs').update({
      finished_at: new Date().toISOString(),
      data_date: r.dataDate, status: r.status,
      stocks_processed: r.stocksProcessed,
      eligible_a_count: r.eligibleACount, eligible_b_count: r.eligibleBCount,
      excluded_count: r.excludedCount, exclude_stats: r.excludeStats,
      error_message: r.errorMessage,
    }).eq('id', runId);
    return NextResponse.json({ status: r.status, dataDate: r.dataDate, stocksProcessed: r.stocksProcessed }, { status: 200 });
  } catch (e) {
    await db.from('job_runs').update({
      finished_at: new Date().toISOString(), status: 'failed', error_message: (e as Error).message,
    }).eq('id', runId);
    return NextResponse.json({ status: 'failed', error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: 整合驗證（人工，需 .env.local 與已套用 schema 的 Supabase）**

於 `web/` 起本機伺服器並手動觸發：
```bash
cd web && npm run dev   # 另開終端機
# 另一終端機：
curl -s -X POST http://localhost:3000/api/jobs/run -H "authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" | tee /tmp/run1.json
```
預期：首次回 `{"status":"success"|"partial_success", "dataDate":"YYYY-MM-DD", "stocksProcessed": >1000}`。再立刻重打一次 → 因該日已有快照，回 `{"status":"no_new_data",...}`（或若仍在跑，回 409）。到 Supabase 確認 `daily_stock_signals`、`job_runs` 有資料。錯誤的 token → 401。

- [ ] **Step 3: Commit**

```bash
git add web/app/api/jobs/run/route.ts
git commit -m "feat(web): /api/jobs/run with auth, idempotency lock, job_runs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `/api/snapshots/latest`

**Files:**
- Create: `web/app/api/snapshots/latest/route.ts`

- [ ] **Step 1: 寫 route**

```ts
// web/app/api/snapshots/latest/route.ts
import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const revalidate = 0;

export async function GET(): Promise<Response> {
  const db = getSupabase();

  // 最新一筆成功/部分成功的 job_run（取狀態與資料日期）
  const { data: jobs, error: jErr } = await db
    .from('job_runs').select('data_date, status, finished_at')
    .in('status', ['success', 'partial_success']).not('data_date', 'is', null)
    .order('data_date', { ascending: false }).limit(1);
  if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 });
  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ dataDate: null, jobStatus: 'no_data', generatedAt: null, signals: [] }, { status: 200 });
  }
  const job = jobs[0];

  const { data: rows, error: sErr } = await db
    .from('daily_stock_signals').select('*').eq('data_date', job.data_date);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  // DB snake_case → 前端 camelCase（對齊 web/lib/types.ts 的 StockSignal）
  const signals = (rows ?? []).map((r) => ({
    dataDate: r.data_date, stockId: r.stock_id, stockName: r.stock_name, market: r.market,
    close: num(r.close), changeRatio: num(r.change_ratio), volumeLots: num(r.volume_lots),
    instNetLots: num(r.inst_net_lots), instBuyStreak: r.inst_buy_streak ?? 0,
    directorHoldingPct: num(r.director_holding_pct), directorDataMonth: r.director_data_month,
    ma20: num(r.ma20), ma20Prev: num(r.ma20_prev), ma20Holdflat5d: num(r.ma20_holdflat_5d),
    ma60: num(r.ma60), ma60Prev: num(r.ma60_prev), ma60Holdflat5d: num(r.ma60_holdflat_5d),
    distMa20Ratio: num(r.dist_ma20_ratio), distMa60Ratio: num(r.dist_ma60_ratio),
    eligibleA: !!r.eligible_a, eligibleB: !!r.eligible_b,
    excludeReasonA: r.exclude_reason_a, excludeReasonB: r.exclude_reason_b,
  }));

  return NextResponse.json({
    dataDate: job.data_date, jobStatus: job.status, generatedAt: job.finished_at, signals,
  }, { status: 200 });
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 2: 整合驗證（人工）**

`curl -s http://localhost:3000/api/snapshots/latest | head -c 800`
預期：回 `{"dataDate":"YYYY-MM-DD","jobStatus":"success"|"partial_success","signals":[...]}`，`signals` 含全市場各檔（含 `eligibleA/B` 與均線值）。

- [ ] **Step 3: Commit**

```bash
git add web/app/api/snapshots/latest/route.ts
git commit -m "feat(web): /api/snapshots/latest returns latest snapshot signals

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Vercel Cron + 環境文件

**Files:**
- Create: `web/vercel.json`
- Create: `web/README.md`

- [ ] **Step 1: 建立 `web/vercel.json`（每日台灣 22:00 = 14:00 UTC）**

```json
{
  "crons": [
    { "path": "/api/jobs/run", "schedule": "0 14 * * *" }
  ]
}
```

> Vercel Cron 會以 GET 觸發且自動帶 `Authorization: Bearer <CRON_SECRET>`（當專案設定了 `CRON_SECRET` 環境變數）。**注意**：本 route 為 `POST`。於 Vercel 設定中，Cron 對 path 發出的請求方法需與 route 對應。MVP 採以下相容做法：在 `route.ts` 另匯出 `export const GET = POST;`（同一處理邏輯）—— 在 Task 7 完成後補一行；或於 Vercel Cron 設定使用支援 POST 的觸發。實作時擇一並於 README 註明。

- [ ] **Step 2: 讓 Cron 的 GET 能觸發（補匯出）**

於 `web/app/api/jobs/run/route.ts` 末端加入：
```ts
// Vercel Cron 以 GET 觸發；沿用同一處理邏輯
export const GET = POST;
```
（Vercel 會自動帶上 `Authorization: Bearer <CRON_SECRET>`，與 route 的認證一致。）

- [ ] **Step 3: 建立 `web/README.md`（環境與部署說明）**

````markdown
# 台股選股器 — web

## 環境變數（`.env.local`，見 `.env.local.example`）
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`：Supabase 服務端
- `FINMIND_TOKEN`：FinMind API token
- `CRON_SECRET`：保護 `/api/jobs/run`；Vercel 設同名環境變數後，Cron 觸發會自動帶 `Authorization: Bearer`

## 初始化資料庫
把 `db/schema.sql` 貼到 Supabase SQL Editor 執行（建立 5 張表）。

## 本機
```bash
npm install
npm run dev
# 手動觸發管線：
curl -X POST http://localhost:3000/api/jobs/run -H "authorization: Bearer <CRON_SECRET>"
# 讀快照：
curl http://localhost:3000/api/snapshots/latest
```

## 部署（Vercel）
- 設定上述環境變數。
- `vercel.json` 已設每日 14:00 UTC（台灣 22:00）觸發 `/api/jobs/run`。
- 排程失敗可手動補跑（同上 curl，帶 CRON_SECRET）。

## 測試
`npm run test`（純函式：訊號、篩選、FinMind 正規化、董監解析、訊號組裝）
````

- [ ] **Step 4: 全套件 + 型別檢查 + Commit**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: 測試全綠、型別無誤。
```bash
git add web/vercel.json web/README.md web/app/api/jobs/run/route.ts
git commit -m "feat(web): vercel cron config + README + GET trigger for cron

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review（撰寫者自查）

- **Spec 覆蓋：** §2 架構（pipeline→Supabase→API）、§3 資料來源（FinMind 兩 dataset＋董監）、§4 流程（最新交易日判定、no_new_data、回補 70/30、partial_success 沿用董監）、§5 五表 schema 與單位、§7 兩端點與防重複鎖（running/409/30 分逾時/no_new_data）。皆有任務。
- **Placeholder 掃描：** FinMind 欄位以 Task 2 Step 1 實測確認（capture-first），其餘皆完整程式碼。
- **型別一致：** `PriceRow/InstRow`（finmind-normalize）、`DirectorHolding`（ingest）、`StockSignal/SignalInput/Market`（計畫 1 types）跨檔一致；repo/pipeline/route 對應 snake_case 欄位與 §5 一致。
- **重用計畫 1：** `computeSignals`（signal-builder）、`StockSignal` 型別、董監解析邏輯（移植 POC 並加測試對齊 MOPS）。
- **已修正的兩個正確性陷阱：**（1）Supabase/PostgREST 單次 select 預設上限 1000 列——全市場視窗會「靜默截斷」；已用 `selectAllPaged` 分頁＋日期下限解決。（2）只抓當日會讓 60MA 永遠算不出來；已用 `ensureMarketData` 依「實際交易日」首次回補 ~75 日、之後只補缺日（idempotent、self-healing），符合 §4「回補 70 個交易日」。
- **已知限制 / 後續：** 連買天數「≥已確認天數」之顯示屬前端（計畫 3）；快照為全市場、前端再以 `runFilter` 篩選；DB 整合測試以人工 curl 驗證（不引入測試用 DB，YAGNI）；首次回補逐日抓取（~110 次 FinMind 請求、在 600/hr 內）於 `maxDuration=300s` 內完成，穩態每日僅 ~2 次；視窗讀取全市場分頁於 MVP 規模可接受，未來可改 Postgres RPC/視圖以省資料搬運。

---

## 下一步

- 取得 Claude Design 設計稿後 → **計畫 3：前端**（依設計稿實作頂部狀態列、參數區、分頁、表格/卡片、展開原因、排序、免責；資料來自 `/api/snapshots/latest` 經 `runFilter`）。
- 部署到 Vercel、設定環境變數與 Cron，跑第一次真實管線並驗證快照。
