# 董監持股資料 POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 驗證能否從免費公開來源，每月取得並解析出每檔上市＋上櫃股票的「全體董監持股 %」，作為主設計（`docs/superpowers/specs/2026-06-09-stock-screener-design.md`）條件 2 的資料相依，並產出 go/no-go 決策文件。

**Architecture:** 一個獨立的 Node + TypeScript spike，放在 `poc/director-holdings/`，不與後續 Next.js 專案耦合。內含一個**可決定性核心**（把董監持股加總成全體 %，用 TDD 寫死），以及**來源探查**（逐一驗證候選來源：政府資料開放平臺 data.gov.tw 的董監事持股餘額明細、公開資訊觀測站 MOPS 的全體董監持股比率），抓樣本→解析→交叉驗證→寫 `FINDINGS.md`。

**Tech Stack:** Node.js 24（內建 `fetch`）、TypeScript、tsx（執行 TS）、vitest（測試）、cheerio（解析 HTML，若來源回傳 HTML）。無資料庫、無前端。

---

## 成功 / 失敗判準（POC 的終點）

**POC 通過（go）需全部成立：**

1. 對 ≥ 5 檔樣本（混合上市/上櫃，且至少 1 檔已知高董監持股）能取得 `director_holding_pct ∈ [0, 100]`。
2. 其中 ≥ 2 檔的數值，與公開資訊觀測站網頁顯示的全體董監持股比率人工核對誤差 ≤ 0.5 個百分點。
3. 能對全市場（上市＋上櫃）列舉並估算涵蓋率，目標 ≥ 95% 的股票可取得數值。
4. `FINDINGS.md` 明確記載：選定來源、**確切端點/參數/欄位**、更新頻率（每月）、彙總方法（加總股數÷發行股數 或 來源直接提供比率），以此關閉主設計 §11。

**POC 失敗（no-go，需回頭調整設計）：** 無任何免費來源能產出每檔 %，或涵蓋率過低。失敗時於 `FINDINGS.md` 記錄已嘗試來源與失敗原因，並提出替代方向。

---

## File Structure

```
poc/director-holdings/
├── package.json            # 依賴與 scripts
├── tsconfig.json
├── vitest.config.ts
├── .gitignore              # node_modules/ out/ fixtures/*.raw
├── src/
│   ├── types.ts            # DirectorRow 等型別
│   ├── aggregate.ts        # 可決定性核心：加總成全體董監持股 %
│   ├── http.ts             # 通用抓取 + 存檔工具
│   ├── sources/
│   │   ├── datagov.ts      # 候選 A：data.gov.tw 董監明細解析
│   │   └── mops.ts         # 候選 B：MOPS 全體董監持股比率解析 / 交叉驗證
│   └── run.ts              # CLI：抓樣本、彙總、輸出 CSV
├── test/
│   ├── aggregate.test.ts
│   └── datagov.test.ts
├── fixtures/               # 抓回來的原始樣本（供解析測試）
├── out/                    # 產出的 sample CSV
└── FINDINGS.md             # 交付物：go/no-go 與來源結論
```

---

## Task 1: Scaffold POC 專案

**Files:**
- Create: `poc/director-holdings/package.json`
- Create: `poc/director-holdings/tsconfig.json`
- Create: `poc/director-holdings/vitest.config.ts`
- Create: `poc/director-holdings/.gitignore`

- [ ] **Step 1: 建立 `package.json`**

```json
{
  "name": "director-holdings-poc",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "probe": "tsx src/http.ts",
    "run": "tsx src/run.ts"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  },
  "dependencies": {
    "cheerio": "^1.0.0"
  }
}
```

- [ ] **Step 2: 建立 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: 建立 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, environment: 'node' },
});
```

- [ ] **Step 4: 建立 `.gitignore`**

```
node_modules/
out/
fixtures/*.raw
```

- [ ] **Step 5: 安裝依賴**

Run: `cd poc/director-holdings && npm install`
Expected: 安裝成功，產生 `node_modules/` 與 `package-lock.json`。

- [ ] **Step 6: 確認測試器可跑（尚無測試）**

Run: `cd poc/director-holdings && npx vitest run --passWithNoTests`
Expected: 退出碼 0，顯示 "No test files found" 但通過。

- [ ] **Step 7: Commit**

```bash
git add poc/director-holdings/package.json poc/director-holdings/tsconfig.json poc/director-holdings/vitest.config.ts poc/director-holdings/.gitignore poc/director-holdings/package-lock.json
git commit -m "chore(poc): scaffold director-holdings spike"
```

---

## Task 2: 可決定性核心 — 把董監持股彙總成全體 %（TDD）

這是 POC 唯一純算術、與來源無關的部分，先用合成資料寫死，之後不論選哪個來源都共用。

**Files:**
- Create: `poc/director-holdings/src/types.ts`
- Create: `poc/director-holdings/src/aggregate.ts`
- Test: `poc/director-holdings/test/aggregate.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// test/aggregate.test.ts
import { describe, it, expect } from 'vitest';
import { aggregateByShares, aggregateByRatios } from '../src/aggregate';

describe('aggregateByShares', () => {
  it('18M 董監持股 / 100M 發行股數 = 18.0%', () => {
    const rows = [
      { title: '董事長', name: 'A', currentShares: 10_000_000 },
      { title: '董事', name: 'B', currentShares: 5_000_000 },
      { title: '監察人', name: 'C', currentShares: 3_000_000 },
    ];
    expect(aggregateByShares(rows, 100_000_000)).toBeCloseTo(18.0, 6);
  });

  it('發行股數 <= 0 應丟出錯誤', () => {
    expect(() => aggregateByShares([], 0)).toThrow();
  });
});

describe('aggregateByRatios', () => {
  it('來源直接提供每位董監比率時，加總得全體比率', () => {
    expect(aggregateByRatios([10, 5, 3.2])).toBeCloseTo(18.2, 6);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd poc/director-holdings && npx vitest run test/aggregate.test.ts`
Expected: FAIL，訊息類似 "Failed to resolve import '../src/aggregate'"。

- [ ] **Step 3: 寫型別**

```ts
// src/types.ts
export interface DirectorRow {
  title: string;          // 職稱：董事長 / 董事 / 監察人 …
  name: string;           // 姓名
  currentShares: number;  // 目前持股（股）
}

export interface DirectorHoldingResult {
  stockId: string;
  stockName: string;
  market: 'TWSE' | 'TPEx';
  dataMonth: string;          // 'YYYY-MM'
  directorHoldingPct: number; // 全體董監持股 %
  method: 'shares' | 'ratio'; // 來源彙總方式
}
```

- [ ] **Step 4: 寫最小實作**

```ts
// src/aggregate.ts
import type { DirectorRow } from './types';

/** 全體董監持股比率 = Σ 董監目前持股 ÷ 已發行股數 × 100 */
export function aggregateByShares(rows: DirectorRow[], outstandingShares: number): number {
  if (!(outstandingShares > 0)) throw new Error('outstandingShares must be > 0');
  const total = rows.reduce((s, r) => s + r.currentShares, 0);
  return (total / outstandingShares) * 100;
}

/** 若來源已提供每位董監的持股比率(%)，加總即為全體比率 */
export function aggregateByRatios(ratiosPct: number[]): number {
  return ratiosPct.reduce((s, r) => s + r, 0);
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `cd poc/director-holdings && npx vitest run test/aggregate.test.ts`
Expected: PASS（3 個測試）。

- [ ] **Step 6: Commit**

```bash
git add poc/director-holdings/src/types.ts poc/director-holdings/src/aggregate.ts poc/director-holdings/test/aggregate.test.ts
git commit -m "feat(poc): director-holding aggregation core with tests"
```

---

## Task 3: 通用抓取工具 + 樣本股清單

**Files:**
- Create: `poc/director-holdings/src/http.ts`

- [ ] **Step 1: 寫抓取/存檔工具（可由 CLI 直接呼叫）**

```ts
// src/http.ts
// 用法：npx tsx src/http.ts <url> <outFile> [method] [body]
import { writeFile } from 'node:fs/promises';

export async function fetchText(
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> },
): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    body: init?.body,
    headers: {
      'User-Agent': 'Mozilla/5.0 (poc director-holdings)',
      ...(init?.body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...init?.headers,
    },
  });
  return { status: res.status, text: await res.text() };
}

// 直接從命令列執行：抓一個 URL 存成 fixture
if (import.meta.url === `file://${process.argv[1]}`) {
  const [url, out, method, body] = process.argv.slice(2);
  const { status, text } = await fetchText(url, { method, body });
  console.log('HTTP', status, 'bytes', text.length);
  if (out) {
    await writeFile(out, text);
    console.log('saved to', out);
  } else {
    console.log(text.slice(0, 2000));
  }
}
```

- [ ] **Step 2: 定義樣本股清單（寫在 run.ts 之前先記錄於此處供後續任務使用）**

樣本（混合上市/上櫃 + 已知高董監持股）：

| stock_id | 名稱 | 市場 | 備註 |
|---|---|---|---|
| 2330 | 台積電 | 上市 | 大型權值股，董監持股偏低 |
| 2317 | 鴻海 | 上市 | 大型股 |
| 9921 | 巨大 | 上市 | 家族色彩、董監持股較高 |
| 5371 | 中光電 | 上櫃 | 上櫃驗證 |
| 6488 | 環球晶 | 上櫃 | 上櫃驗證 |

- [ ] **Step 3: 冒煙測試抓取工具（任抓一個公開頁面）**

Run: `cd poc/director-holdings && npx tsx src/http.ts "https://openapi.twse.com.tw/v1/opendata/t187ap03_L" out/twse-basic.raw`
Expected: 印出 `HTTP 200 bytes <n>`，`out/twse-basic.raw` 產生（上市公司基本資料 JSON，含 `公司代號`、`實收資本額(元)` 等欄位 → 可由 `實收資本額 / 10` 估算已發行股數，供候選 A 之 `aggregateByShares` 使用）。

- [ ] **Step 4: Commit**

```bash
git add poc/director-holdings/src/http.ts
git commit -m "feat(poc): http fetch util and sample stock list"
```

---

## Task 4: 候選 A — data.gov.tw 董監事持股餘額明細（抓樣本→存 fixture）

> **候選來源 A（需於本任務驗證）：** 政府資料開放平臺的「上市公司董監事持股餘額明細資料」與「上櫃公司董監事持股餘額明細資料」。資料檔通常為每月 CSV，欄位含 `公司代號`、`職稱`、`姓名`、`目前持股` 等。優點：為自動化而生、易抓。需另取「已發行股數」以 `aggregateByShares` 計算 %。

**Files:**
- Create: `poc/director-holdings/fixtures/datagov-listed.csv`（由步驟抓取產生）

- [ ] **Step 1: 找到資料集與下載網址**

於瀏覽器開啟 `https://data.gov.tw`，搜尋「董監事持股餘額明細」。分別找到上市、上櫃兩個資料集，複製其資料分布（distribution）的 CSV 下載網址。將兩個網址記到本任務下方「實測記錄」。

> 若資料集下載網址為 data.gov.tw 轉址，會被工具回傳轉址 URL；以回傳的最終 URL 再抓一次。

- [ ] **Step 2: 抓上市明細存成 fixture**

Run（將 `<LISTED_CSV_URL>` 換成上一步找到的網址）:
`cd poc/director-holdings && npx tsx src/http.ts "<LISTED_CSV_URL>" fixtures/datagov-listed.csv`
Expected: `HTTP 200`，`fixtures/datagov-listed.csv` 內含表頭與多列董監明細。

- [ ] **Step 3: 人工檢視表頭，記錄實際欄位名**

開啟 `fixtures/datagov-listed.csv`，把第一列（表頭）原文記到本任務「實測記錄」。特別找出：公司代號、職稱、姓名、**目前持股（股數）**這幾個欄位的**確切名稱**（可能為「目前持股」「持股（股數）」等）。

- [ ] **Step 4: 抓上櫃明細存成 fixture**

Run: `cd poc/director-holdings && npx tsx src/http.ts "<OTC_CSV_URL>" fixtures/datagov-otc.csv`
Expected: `HTTP 200`，檔案產生。

- [ ] **Step 5: Commit（含 fixture，供解析測試）**

```bash
git add -f poc/director-holdings/fixtures/datagov-listed.csv poc/director-holdings/fixtures/datagov-otc.csv
git commit -m "test(poc): capture data.gov.tw director-holdings fixtures"
```

> 注意：`.gitignore` 忽略 `fixtures/*.raw`，但 `.csv` fixture 需保留，故用 `git add -f` 確保納入。

---

## Task 5: 候選 A — 解析明細 + 取得發行股數 → 算出 %（TDD）

**Files:**
- Create: `poc/director-holdings/src/sources/datagov.ts`
- Test: `poc/director-holdings/test/datagov.test.ts`

- [ ] **Step 1: 寫失敗測試（用 Task 4 抓到的 fixture）**

> 將 `EXPECTED_COL_*` 換成 Task 4 步驟 3 記錄的**實際欄位名**；`2330` 改成 fixture 中確實存在的代號。

```ts
// test/datagov.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDirectorRows } from '../src/sources/datagov';

const csv = readFileSync(new URL('../fixtures/datagov-listed.csv', import.meta.url), 'utf8');

describe('parseDirectorRows', () => {
  it('擷取指定公司的董監列，且 currentShares 為非負數', () => {
    const rows = parseDirectorRows(csv, '2330');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(typeof r.title).toBe('string');
      expect(r.currentShares).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd poc/director-holdings && npx vitest run test/datagov.test.ts`
Expected: FAIL（`parseDirectorRows` 尚未定義）。

- [ ] **Step 3: 寫解析器**

> 欄位別名陣列依 Task 4 步驟 3 的實際表頭調整；以下涵蓋常見命名。CSV 可能為 UTF-8 或 Big5，若亂碼則於 `fetchText` 後改用 `Buffer`/`TextDecoder('big5')` 重抓（在 `FINDINGS.md` 記錄編碼）。

```ts
// src/sources/datagov.ts
import type { DirectorRow } from '../types';

const COL = {
  stockId: ['公司代號', '公司代號 ', '代號'],
  title: ['職稱'],
  name: ['姓名'],
  shares: ['目前持股', '持股（股數）', '持股(股數)', '目前持股(股)'],
};

function pick(header: string[], aliases: string[]): number {
  const idx = header.findIndex((h) => aliases.includes(h.trim()));
  if (idx < 0) throw new Error(`找不到欄位，候選名稱：${aliases.join('/')}；實際表頭：${header.join(',')}`);
  return idx;
}

function splitCsvLine(line: string): string[] {
  // 簡易 CSV 切分（董監明細無內嵌逗號的引號欄位；若有，於 FINDINGS 記錄並改用正式 CSV parser）
  return line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
}

export function parseDirectorRows(csv: string, stockId: string): DirectorRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = splitCsvLine(lines[0]);
  const iId = pick(header, COL.stockId);
  const iTitle = pick(header, COL.title);
  const iName = pick(header, COL.name);
  const iShares = pick(header, COL.shares);

  const out: DirectorRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    if (cells[iId] !== stockId) continue;
    out.push({
      title: cells[iTitle],
      name: cells[iName],
      currentShares: Number(cells[iShares].replace(/,/g, '')) || 0,
    });
  }
  return out;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd poc/director-holdings && npx vitest run test/datagov.test.ts`
Expected: PASS。若 FAIL 因欄位名不符，依錯誤訊息印出的「實際表頭」修正 `COL`，再跑。

- [ ] **Step 5: 取得已發行股數並算出 2330 的 %（手動驗證腳本）**

新增臨時驗證：用 Task 3 抓到的 `out/twse-basic.raw`（上市公司基本資料 JSON）找出 `2330` 的 `實收資本額(元)`，`已發行股數 = 實收資本額 / 10`，再以 `aggregateByShares(parseDirectorRows(csv,'2330'), 已發行股數)` 計算。

Run（一次性）:
```bash
cd poc/director-holdings && npx tsx -e "
import { readFileSync } from 'node:fs';
import { parseDirectorRows } from './src/sources/datagov.ts';
import { aggregateByShares } from './src/aggregate.ts';
const csv = readFileSync('fixtures/datagov-listed.csv','utf8');
const basic = JSON.parse(readFileSync('out/twse-basic.raw','utf8'));
const co = basic.find((x)=>x['公司代號']==='2330');
const shares = Number(String(co['實收資本額(元)']).replace(/,/g,''))/10;
console.log('已發行股數≈', shares, '全體董監持股%≈', aggregateByShares(parseDirectorRows(csv,'2330'), shares).toFixed(2));
"
```
Expected: 印出一個介於 0~100 的合理百分比（台積電董監持股偏低，預期個位數%）。記錄到「實測記錄」。

> 面額假設：多數股票面額 10 元，故 `÷10`。若遇無面額/5 元股票，`aggregateByShares` 會偏差 → 在 `FINDINGS.md` 標記此風險與處理方式。

- [ ] **Step 6: Commit**

```bash
git add poc/director-holdings/src/sources/datagov.ts poc/director-holdings/test/datagov.test.ts
git commit -m "feat(poc): parse data.gov.tw director rows + aggregate %"
```

---

## Task 6: 候選 B — MOPS 全體董監持股比率（交叉驗證 / 備援）

> **候選來源 B（需於本任務驗證）：** 公開資訊觀測站（MOPS）的「董監事持股餘額明細資料」查詢頁，其彙總常**直接顯示全體董監持股比率**，可免去發行股數估算。缺點：查詢為逐檔 POST、可能含編碼參數與防爬。本任務主要用於**人工交叉驗證候選 A 的數字**；若候選 A 不可行，則升級 MOPS 為主來源。

**Files:**
- Create: `poc/director-holdings/src/sources/mops.ts`（僅在需要程式化解析時）

- [ ] **Step 1: 以瀏覽器人工查 2 檔的官方比率**

開啟 MOPS（`https://mops.twse.com.tw`）→ 公司治理 → 「董監事持股餘額明細資料」，查 `2330` 與一檔上櫃股（如 `6488`）最新月份，記下網頁顯示的「全體董監事持股」比率到「實測記錄」。這是**判準 2** 的人工核對基準。

- [ ] **Step 2: 比對候選 A 與 MOPS 官方值**

把 Task 5 算出的 % 與本任務官方比率相減，確認 ≤ 0.5 個百分點。記錄差異。

- [ ] **Step 3:（僅在候選 A 失敗時）程式化 MOPS**

候選端點（待驗證）：`POST https://mops.twse.com.tw/mops/web/ajax_stapap1`，表單參數含 `co_id=<代號>`、`year=<民國年, 2026→115>`、`month=<MM>`、`step=1`、`firstin=1`。用 `src/http.ts` 抓回 HTML 存 fixture，再以 cheerio 解析「全體董監持股比率」儲存格。僅當候選 A 無法滿足判準時才實作此步並補測試。

- [ ] **Step 4: Commit（如有產生檔案）**

```bash
git add -A poc/director-holdings/
git commit -m "test(poc): MOPS cross-check of director-holding ratios"
```

---

## Task 7: Runner — 對樣本股輸出 sample CSV

**Files:**
- Create: `poc/director-holdings/src/run.ts`

- [ ] **Step 1: 寫 runner（用已驗證可行的來源；以下以候選 A 為例）**

```ts
// src/run.ts
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseDirectorRows } from './sources/datagov';
import { aggregateByShares } from './aggregate';
import type { DirectorHoldingResult } from './types';

const SAMPLES: { id: string; name: string; market: 'TWSE' | 'TPEx' }[] = [
  { id: '2330', name: '台積電', market: 'TWSE' },
  { id: '2317', name: '鴻海', market: 'TWSE' },
  { id: '9921', name: '巨大', market: 'TWSE' },
  { id: '5371', name: '中光電', market: 'TPEx' },
  { id: '6488', name: '環球晶', market: 'TPEx' },
];

const DATA_MONTH = process.env.DATA_MONTH ?? '';  // 由 fixture 表頭的出表日期填入，例 '2026-05'

function outstandingShares(basic: any[], id: string): number {
  const co = basic.find((x) => x['公司代號'] === id);
  if (!co) throw new Error(`基本資料缺 ${id}`);
  return Number(String(co['實收資本額(元)']).replace(/,/g, '')) / 10;
}

const listedCsv = readFileSync(new URL('../fixtures/datagov-listed.csv', import.meta.url), 'utf8');
const otcCsv = readFileSync(new URL('../fixtures/datagov-otc.csv', import.meta.url), 'utf8');
const basic = JSON.parse(readFileSync(new URL('../out/twse-basic.raw', import.meta.url), 'utf8'));

const results: DirectorHoldingResult[] = [];
for (const s of SAMPLES) {
  const csv = s.market === 'TWSE' ? listedCsv : otcCsv;
  const rows = parseDirectorRows(csv, s.id);
  // 上櫃發行股數來源於 Task 8 補上 TPEx 基本資料；上市先用 TWSE 基本資料
  const shares = s.market === 'TWSE' ? outstandingShares(basic, s.id) : NaN;
  const pct = Number.isFinite(shares) ? aggregateByShares(rows, shares) : NaN;
  results.push({
    stockId: s.id, stockName: s.name, market: s.market,
    dataMonth: DATA_MONTH, directorHoldingPct: Number(pct.toFixed(2)), method: 'shares',
  });
}

mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
const header = 'stock_id,stock_name,market,data_month,director_holding_pct,method';
const body = results.map((r) =>
  `${r.stockId},${r.stockName},${r.market},${r.dataMonth},${r.directorHoldingPct},${r.method}`).join('\n');
writeFileSync(new URL('../out/director-holdings-sample.csv', import.meta.url), `${header}\n${body}\n`);
console.table(results);
```

- [ ] **Step 2: 執行 runner**

Run: `cd poc/director-holdings && DATA_MONTH=2026-05 npx tsx src/run.ts`
Expected: console 印出 5 列結果表；`out/director-holdings-sample.csv` 產生。上市 3 檔應為合理 %；上櫃發行股數待 Task 8 補來源（先允許 NaN）。

- [ ] **Step 3: Commit**

```bash
git add poc/director-holdings/src/run.ts
git commit -m "feat(poc): sample runner outputs director-holdings CSV"
```

---

## Task 8: 驗證涵蓋率、補上櫃發行股數，寫 FINDINGS.md 並更新主設計 §11

**Files:**
- Create: `poc/director-holdings/FINDINGS.md`
- Modify: `docs/superpowers/specs/2026-06-09-stock-screener-design.md`（§11 標記 POC 結論）

- [ ] **Step 1: 補上櫃發行股數來源**

抓 TPEx 上櫃公司基本資料（含實收資本額）以補上櫃發行股數。候選端點（待驗證）：`https://www.tpex.org.tw/openapi/v1/...`（上櫃公司基本資料）。用 `src/http.ts` 抓存 `out/tpex-basic.raw`，比照 TWSE 解析，使 runner 中上櫃 3 檔也得出 %。重跑 runner 確認 5 檔皆有值。

- [ ] **Step 2: 估算全市場涵蓋率**

以 `fixtures/datagov-listed.csv` + `datagov-otc.csv` 的**不重複公司代號數**，對照 TWSE/TPEx 基本資料的上市＋上櫃總檔數，計算可取得董監明細的比例。記錄到 FINDINGS。目標 ≥ 95%。

Run（一次性，計算明細涵蓋的不重複代號數）:
```bash
cd poc/director-holdings && npx tsx -e "
import { readFileSync } from 'node:fs';
for (const f of ['fixtures/datagov-listed.csv','fixtures/datagov-otc.csv']) {
  const ids = new Set(readFileSync(f,'utf8').split(/\r?\n/).slice(1).map(l=>l.split(',')[0]).filter(Boolean));
  console.log(f, '不重複代號數≈', ids.size);
}
"
```

- [ ] **Step 3: 寫 `FINDINGS.md`**

```markdown
# 董監持股資料 POC — 結論

## 判定：GO / NO-GO
<填入 go 或 no-go，並一句話總結>

## 選定來源
- 名稱：<data.gov.tw 董監事持股餘額明細 / MOPS 全體董監持股比率>
- 上市端點：<確切 URL>
- 上櫃端點：<確切 URL>
- 發行股數來源（若採加總股數法）：<TWSE/TPEx 基本資料端點；面額假設>
- 更新頻率：每月；出表日期欄位＝<欄位名>；可得最新月份＝<YYYY-MM>
- 編碼：<UTF-8 / Big5>

## 欄位對應
| 用途 | 來源欄位名 |
|---|---|
| 公司代號 | <…> |
| 職稱 | <…> |
| 目前持股(股) | <…> |

## 彙總方法
<aggregateByShares（Σ董監股數÷發行股數）或 aggregateByRatios（來源直接提供比率）>

## 驗證結果
| stock_id | 市場 | POC 算出 % | MOPS 官方 % | 差異(pp) |
|---|---|---|---|---|
| 2330 | 上市 | <…> | <…> | <…> |
| 6488 | 上櫃 | <…> | <…> | <…> |

## 涵蓋率
- 明細涵蓋不重複代號數：<…>
- 上市＋上櫃總檔數：<…>
- 涵蓋率：<…>%

## 風險 / 注意
- 面額非 10 元股票的發行股數估算偏差：<處理方式>
- 月資料延遲：當月公布日約為 <…>
- 反爬 / 速率限制：<…>

## 對主設計的影響（關閉 §11）
- `director_holdings_monthly` 寫入流程採用本來源；管線「董監抓取」步驟改為 <每月觸發/每日檢查當月是否已公布>。
- 若 no-go：替代方向＝<…>
```

逐項以 POC 實測數據填滿所有 `<…>`，不得留空。

- [ ] **Step 4: 更新主設計 §11，標記 POC 已驗證**

將 `docs/superpowers/specs/2026-06-09-stock-screener-design.md` §11 的「待定」改為「已由 POC 驗證」，並指向 `poc/director-holdings/FINDINGS.md` 與選定端點摘要。

- [ ] **Step 5: Commit**

```bash
git add poc/director-holdings/FINDINGS.md poc/director-holdings/src docs/superpowers/specs/2026-06-09-stock-screener-design.md
git commit -m "docs(poc): director-holdings findings + close spec §11 open item"
```

---

## 下一步（POC 通過後）

POC 為 **go** → 回到 writing-plans，依 `FINDINGS.md` 的確切來源，展開其餘完整實作計畫：

1. 資料管線（FinMind 股價/法人 + 本 POC 確認的董監來源）→ Supabase 五張表
2. 訊號計算（均線、扣抵、連買天數）
3. 篩選引擎 + `/api/snapshots/latest`、`/api/jobs/run`（含防重複）
4. 前端（依 Claude Design 設計稿實作）

POC 為 **no-go** → 依 `FINDINGS.md` 的替代方向回頭調整主設計 §3/§11 後再議。
