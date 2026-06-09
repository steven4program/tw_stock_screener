# 董監持股資料 POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 驗證能否從免費公開來源，每月取得並解析出每檔上市＋上櫃股票的「全體董監持股 %」，作為主設計（`docs/superpowers/specs/2026-06-09-stock-screener-design.md`）條件 2 的資料相依，並產出 go/no-go 決策文件。

**Architecture:** 一個獨立的 Node + TypeScript spike，放在 `poc/director-holdings/`，不與後續 Next.js 專案耦合。內含一個**可決定性核心**（把董監持股加總成全體 %，用 TDD 寫死），以及**來源探查**（逐一驗證候選來源：政府資料開放平臺 data.gov.tw 的董監事持股餘額明細、公開資訊觀測站 MOPS 的全體董監持股比率），抓樣本→解析→交叉驗證→寫 `FINDINGS.md`。

**Tech Stack:** Node.js 24（內建 `fetch`）、TypeScript、tsx（執行 TS）、vitest（測試）、cheerio（解析 HTML，若來源回傳 HTML）。無資料庫、無前端。

---

## 成功 / 失敗判準（POC 的終點）

**POC 通過（go）需全部成立：**

1. 對 ≥ 5 檔樣本（混合上市/上櫃，且至少 1 檔已知高董監持股）能取得 `director_holding_pct ∈ [0, 100]`。
2. **更新頻率為每月、且資料為近月**：上市與上櫃所選來源的 `資料年月` 皆為最近一期（距今 ≤ 2 個月），且來源宣告之更新頻率為每月。⚠️ 政府開放資料集的更新頻率須逐一確認——已知部分上櫃董監明細資料集標示「每1年」；若某市場來源僅為年更，**該市場必須改用每月來源**（見 Task 6 的 MOPS 路徑）才算通過。
3. 其中 ≥ 2 檔的數值，與公開資訊觀測站網頁顯示的全體董監持股比率人工核對誤差 ≤ 0.5 個百分點，**且比較的是同一個 `資料年月`**。
4. 能對全市場（上市＋上櫃）**列舉**涵蓋率（datagov 以明細全量列舉、MOPS 以全量逐檔查詢，皆為普查非抽樣），≥ 95% 的股票可取得數值；唯有在 MOPS 被封鎖/限流而無法全量時，才退回大樣本並以**信賴下界 ≥ 95%** 為準。
5. `FINDINGS.md` 明確記載：選定來源、**確切端點/參數/欄位**、各市場更新頻率與最新可得月份、**發行股數欄位來源**、彙總方法，以此關閉主設計 §11。

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
│   ├── coverage_mops.ts    # 上櫃走 MOPS 時的全量涵蓋率普查（節流＋快取）
│   └── run.ts              # CLI：抓樣本、彙總、輸出 CSV
├── test/
│   ├── aggregate.test.ts
│   └── datagov.test.ts
├── fixtures/               # 抓回來的原始樣本（供解析測試；mops-<id>-<月>.html）
├── out/                    # 產出的 sample CSV、basic raw、mops-coverage/ 快取（gitignore）
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
    "cheerio": "^1.0.0",
    "csv-parse": "^5.6.0"
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
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function fetchText(
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> },
): Promise<{ status: number; contentType: string; text: string }> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    body: init?.body,
    headers: {
      'User-Agent': 'Mozilla/5.0 (poc director-holdings)',
      ...(init?.body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...init?.headers,
    },
  });
  return { status: res.status, contentType: res.headers.get('content-type') ?? '', text: await res.text() };
}

/** 防呆：擋下把錯誤頁/HTML 當成資料存檔（data.gov.tw 轉址至 mopsfin 可能回傳安全性錯誤頁）。
 *  CSV/JSON 來源應套用；MOPS 本身回傳 HTML，須以 ALLOW_HTML=1 放行（錯誤頁改由解析器偵測）。 */
export function assertNotHtml(text: string, url: string): void {
  const head = text.slice(0, 500).toLowerCase();
  if (head.includes('<html') || head.includes('<!doctype html')) {
    throw new Error(`回應疑似 HTML/錯誤頁而非資料：${url}\n前 500 字：\n${text.slice(0, 500)}`);
  }
}

// 直接從命令列執行：抓一個 URL 存成 fixture（自動建立目錄；預設擋 HTML 錯誤頁，ALLOW_HTML=1 放行）
if (import.meta.url === `file://${process.argv[1]}`) {
  const [url, out, method, body] = process.argv.slice(2);
  const { status, contentType, text } = await fetchText(url, { method, body });
  console.log('HTTP', status, 'content-type', contentType, 'bytes', text.length);
  if (out) {
    if (!process.env.ALLOW_HTML) assertNotHtml(text, url);
    await mkdir(dirname(out), { recursive: true });
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

- [ ] **Step 3: 抓上市公司基本資料（取「已發行股數」欄位，非用資本額估算）**

Run: `cd poc/director-holdings && npx tsx src/http.ts "https://openapi.twse.com.tw/v1/opendata/t187ap03_L" out/twse-basic.raw`
Expected: `HTTP 200`，`out/twse-basic.raw` 產生（上市公司基本資料 JSON）。

確認其含 `公司代號` 與**已發行股數欄位**（TWSE t187ap03_L 提供 `已發行普通股數或TDR原股發行股數`）。**直接使用此欄位**作為發行股數，**不要**用 `實收資本額 / 10` 估算——非 10 元面額、TDR、私募、特別股都會讓估算失真而產生假 GO。把該欄位的**確切名稱**記到本任務「實測記錄」。

- [ ] **Step 4: 抓上櫃公司基本資料（取「已發行股數」欄位）**

候選端點（待驗證）：TPEx 開放資料的上櫃公司基本資料。於 `https://www.tpex.org.tw/openapi/` 找到含已發行股數的上櫃公司基本資料集後，將其網址代入 `<TPEX_BASIC_URL>`：

Run: `cd poc/director-holdings && npx tsx src/http.ts "<TPEX_BASIC_URL>" out/tpex-basic.raw`
Expected: `HTTP 200`，`out/tpex-basic.raw` 產生；確認含公司代號與已發行股數欄位，把確切欄位名記到「實測記錄」（上櫃欄位名可能與上市不同）。

- [ ] **Step 5: Commit**

```bash
git add poc/director-holdings/src/http.ts
git commit -m "feat(poc): http fetch util, sample stock list, basic-data capture"
```

---

## Task 4: 候選 A — data.gov.tw 董監事持股餘額明細（抓樣本→存 fixture）

> **候選來源 A（需於本任務驗證）：** 政府資料開放平臺的「上市公司董監事持股餘額明細資料」與「上櫃公司董監事持股餘額明細資料」。資料檔通常為每月 CSV，欄位含 `公司代號`、`職稱`、`姓名`、`目前持股` 等。優點：為自動化而生、易抓。需另取「已發行股數」以 `aggregateByShares` 計算 %。

**Files:**
- Create: `poc/director-holdings/fixtures/datagov-listed.csv`（由步驟抓取產生）

- [ ] **Step 1: 找到資料集、下載網址、並記錄更新頻率**

於瀏覽器開啟 `https://data.gov.tw`，搜尋「董監事持股餘額明細」。分別找到上市、上櫃兩個資料集，複製其資料分布（distribution）的 CSV 下載網址。**同時把每個資料集頁面標示的「更新頻率」抄到本任務「實測記錄」**——⚠️ 已知上櫃版可能標示「每1年」；若為年更則此來源對上櫃**不合格**（轉 Task 6 的 MOPS 每月路徑）。

> 若資料集下載網址為 data.gov.tw 轉址，會被工具回傳轉址 URL；以回傳的最終 URL 再抓一次。部分連結會轉到 `mopsfin.twse.com.tw`，可能回傳安全性錯誤頁（HTML）——`http.ts` 的 `assertNotHtml` 會擋下並報錯；遇此情況改用 data.gov.tw 的 datastore API 或資料集頁的直接檔案連結。

- [ ] **Step 2: 抓上市明細存成 fixture**

Run（將 `<LISTED_CSV_URL>` 換成上一步找到的網址）:
`cd poc/director-holdings && npx tsx src/http.ts "<LISTED_CSV_URL>" fixtures/datagov-listed.csv`
Expected: `HTTP 200`，`fixtures/datagov-listed.csv` 內含表頭與多列董監明細。若工具報「疑似 HTML/錯誤頁」→ 連結無效，回 Step 1 換正確的檔案連結。

- [ ] **Step 3: 人工檢視表頭，記錄實際欄位名與資料年月**

開啟 `fixtures/datagov-listed.csv`，把第一列（表頭）原文記到本任務「實測記錄」。特別找出：公司代號、職稱、姓名、**目前持股（股數）**、**出表日期/資料年月** 這幾個欄位的**確切名稱**（可能為「目前持股」「持股（股數）」等）。從資料列讀出實際 `資料年月`（例 `2026-05`）一併記錄。

- [ ] **Step 4: 抓上櫃明細存成 fixture**

Run: `cd poc/director-holdings && npx tsx src/http.ts "<OTC_CSV_URL>" fixtures/datagov-otc.csv`
Expected: `HTTP 200`，檔案產生（若工具報 HTML 錯誤頁，同 Step 2 處理）。

- [ ] **Step 5: 驗證更新頻率與資料新鮮度（判準 2 的把關）**

對上市與上櫃兩個 fixture：
- 確認 Step 1 記錄的更新頻率為**每月**；若上櫃為「每1年」→ 在「實測記錄」標記「上櫃 data.gov 不合格、改走 MOPS」，並於 Task 6 對上櫃改用 MOPS。
- 確認 fixture 的 `資料年月` 距今 ≤ 2 個月。
- 把「上市最新月份」「上櫃最新月份」「上市/上櫃更新頻率」四項結論寫進「實測記錄」，供 Task 6 同月比較與 Task 8 的 FINDINGS。

- [ ] **Step 6: Commit（含 fixture，供解析測試）**

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

> `2330` 改成 fixture 中確實存在的代號；明細欄位名的調整在 Step 3 的 `COL` 別名表（依 Task 4 Step 3 記錄的實際表頭），不在本測試碼。

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
import { parse } from 'csv-parse/sync';
import type { DirectorRow } from '../types';

// 各欄位的候選名稱（依 Task 4 Step 3 實測表頭調整）
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

export function parseDirectorRows(csv: string, stockId: string): DirectorRow[] {
  // 用正式 CSV parser：正確處理千分位引號欄位（如 "10,000,000"）、BOM、不定欄數
  const records: Record<string, string>[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
    trim: true,
  });
  if (records.length === 0) return [];
  const keys = Object.keys(records[0]);
  const kId = findKey(keys, COL.stockId);
  const kTitle = findKey(keys, COL.title);
  const kName = findKey(keys, COL.name);
  const kShares = findKey(keys, COL.shares);

  return records
    .filter((r) => String(r[kId]).trim() === stockId)
    .map((r) => ({
      title: r[kTitle],
      name: r[kName],
      currentShares: Number(String(r[kShares]).replace(/,/g, '')) || 0,
    }));
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd poc/director-holdings && npx vitest run test/datagov.test.ts`
Expected: PASS。若 FAIL 因欄位名不符，依錯誤訊息印出的「實際表頭」修正 `COL`，再跑。

- [ ] **Step 5: 取得已發行股數並算出 2330 的 %（手動驗證腳本）**

用 Task 3 抓到的 `out/twse-basic.raw`（上市公司基本資料 JSON）找出 `2330` 的**已發行股數欄位**（`已發行普通股數或TDR原股發行股數`，**直接使用、不用資本額估算**），再以 `aggregateByShares(parseDirectorRows(csv,'2330'), 已發行股數)` 計算。

> 將 `SHARES_COL` 換成 Task 3 步驟 3 記錄的**確切欄位名**。

Run（一次性）:
```bash
cd poc/director-holdings && npx tsx -e "
import { readFileSync } from 'node:fs';
import { parseDirectorRows } from './src/sources/datagov.ts';
import { aggregateByShares } from './src/aggregate.ts';
const SHARES_COL = '已發行普通股數或TDR原股發行股數';
const csv = readFileSync('fixtures/datagov-listed.csv','utf8');
const basic = JSON.parse(readFileSync('out/twse-basic.raw','utf8'));
const co = basic.find((x)=>x['公司代號']==='2330');
const shares = Number(String(co[SHARES_COL]).replace(/,/g,''));
if (!(shares>0)) throw new Error('已發行股數欄位讀取失敗，請確認 SHARES_COL：'+Object.keys(co).join(','));
console.log('已發行股數=', shares, '全體董監持股%≈', aggregateByShares(parseDirectorRows(csv,'2330'), shares).toFixed(2));
"
```
Expected: 印出一個介於 0~100 的合理百分比（台積電董監持股偏低，預期個位數%）。記錄到「實測記錄」。若 throw → 用錯誤訊息印出的欄位清單修正 `SHARES_COL`。

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

- [ ] **Step 1: 以瀏覽器人工查 2 檔的官方比率（指定同一個資料年月）**

開啟 MOPS（`https://mops.twse.com.tw`）→ 公司治理 → 「董監事持股餘額明細資料」，查 `2330` 與一檔上櫃股（如 `6488`）。**查詢月份必須對齊 Task 4 fixture 的 `資料年月`**（同月才可比較），記下網頁顯示的「全體董監事持股」比率到「實測記錄」。這是**判準 3** 的人工核對基準。

- [ ] **Step 2: 同月比對候選 A 與 MOPS 官方值**

把 Task 5/7 算出的 % 與本任務官方比率相減，確認 ≤ 0.5 個百分點。**若兩者資料年月不同，視為無效比較**，需取相同月份重做。記錄差異與所用月份。

- [ ] **Step 3: 上櫃每月來源備援（若 data.gov 上櫃為年更/不新鮮，則此為必做）**

當 Task 4 判定上櫃 data.gov 明細為「每1年」或新鮮度不足時，上櫃**改用 MOPS 每月**。若上櫃 data.gov 為每月且新鮮，**跳過本步**、上櫃維持 datagov。

**(a) 抓 MOPS 回應（HTML，需放行）** — 候選端點（待驗證）`POST https://mops.twse.com.tw/mops/web/ajax_stapap1`，參數 `co_id=<代號>`、`year=<民國年,2026→115>`、`month=<MM，對齊 DATA_MONTH>`、`step=1`、`firstin=1`。每檔上櫃樣本各抓一次（`ALLOW_HTML=1` 放行 HTML 存檔）：

Run（以 6488、month 對齊 fixture 月份為例）:
`cd poc/director-holdings && ALLOW_HTML=1 npx tsx src/http.ts "https://mops.twse.com.tw/mops/web/ajax_stapap1" "fixtures/mops-6488-2026-05.html" POST "co_id=6488&year=115&month=05&step=1&firstin=1"`

**(b) 寫 `src/sources/mops.ts`**：

```ts
// src/sources/mops.ts
import * as cheerio from 'cheerio';

/** 從 MOPS 董監持股明細 HTML 取「全體董監事持股」比率(%)。
 *  找不到比率儲存格即 throw —— 同時擋下 MOPS 錯誤頁/查無資料頁，避免假成功。 */
export function parseMopsRatio(html: string): number {
  const $ = cheerio.load(html);
  // 找含「全體董監事持股」字樣的列，取其百分比數值（選擇器依實際 HTML 結構於本步調整）
  let pct = NaN;
  $('tr').each((_, tr) => {
    const txt = $(tr).text().replace(/\s+/g, '');
    if (txt.includes('全體董監事') && txt.includes('持股')) {
      const m = txt.match(/(\d+(?:\.\d+)?)%/);
      if (m) pct = Number(m[1]);
    }
  });
  if (!(pct >= 0 && pct <= 100)) {
    throw new Error('MOPS 回應找不到全體董監持股比率（可能為錯誤頁/查無資料）');
  }
  return pct;
}
```

**(c) 補解析測試**（比照 Task 5 TDD）：用 `fixtures/mops-6488-2026-05.html` 斷言 `parseMopsRatio` 回傳 ∈ (0,100]。

**(d) 切換來源**：在 `src/run.ts` 將 `MARKET_SOURCE.TPEx` 設為 `'mops'`，runner 即走比率路徑（`aggregateByRatios` 概念，省去發行股數）。

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

type Market = 'TWSE' | 'TPEx';
const SAMPLES: { id: string; name: string; market: Market }[] = [
  { id: '2330', name: '台積電', market: 'TWSE' },
  { id: '2317', name: '鴻海', market: 'TWSE' },
  { id: '9921', name: '巨大', market: 'TWSE' },
  { id: '5371', name: '中光電', market: 'TPEx' },
  { id: '6488', name: '環球晶', market: 'TPEx' },
];

const DATA_MONTH = process.env.DATA_MONTH ?? '';  // 對齊 Task 4 記錄的 fixture 資料年月，例 '2026-05'
if (!DATA_MONTH) throw new Error('請以 DATA_MONTH=YYYY-MM 執行，對齊 fixture 的資料年月');

// 由 Task 4–6 結論決定每個市場的來源：datagov(明細→加總股數) 或 mops(直接比率)
const MARKET_SOURCE: Record<Market, 'datagov' | 'mops'> = {
  TWSE: 'datagov',
  TPEx: 'datagov', // ← 若 Task 4 判定上櫃 data.gov 為年更/不新鮮，改成 'mops'
};

// 已發行股數欄位名（依 Task 3 實測記錄調整；上市/上櫃可能不同）
const SHARES_COL: Record<Market, string> = {
  TWSE: '已發行普通股數或TDR原股發行股數',
  TPEx: '<TPEX_SHARES_COL>', // ← 換成 out/tpex-basic.raw 的實際欄位名
};

function outstandingShares(basic: any[], id: string, market: Market): number {
  const co = basic.find((x) => String(x['公司代號']).trim() === id);
  if (!co) throw new Error(`${market} 基本資料缺 ${id}`);
  const shares = Number(String(co[SHARES_COL[market]] ?? '').replace(/,/g, ''));
  if (!(shares > 0)) throw new Error(`${market} ${id} 已發行股數讀取失敗（欄位 ${SHARES_COL[market]}）`);
  return shares;
}

// 僅載入「採 datagov 的市場」所需的明細與基本資料
const datagovCsv: Partial<Record<Market, string>> = {};
const datagovBasic: Partial<Record<Market, any[]>> = {};
if (MARKET_SOURCE.TWSE === 'datagov') {
  datagovCsv.TWSE = readFileSync(new URL('../fixtures/datagov-listed.csv', import.meta.url), 'utf8');
  datagovBasic.TWSE = JSON.parse(readFileSync(new URL('../out/twse-basic.raw', import.meta.url), 'utf8'));
}
if (MARKET_SOURCE.TPEx === 'datagov') {
  datagovCsv.TPEx = readFileSync(new URL('../fixtures/datagov-otc.csv', import.meta.url), 'utf8');
  datagovBasic.TPEx = JSON.parse(readFileSync(new URL('../out/tpex-basic.raw', import.meta.url), 'utf8'));
}

async function holdingPct(s: { id: string; market: Market }): Promise<{ pct: number; method: 'shares' | 'ratio' }> {
  if (MARKET_SOURCE[s.market] === 'datagov') {
    const rows = parseDirectorRows(datagovCsv[s.market]!, s.id);
    if (rows.length === 0) throw new Error(`${s.market} ${s.id} datagov 明細無董監列`);
    return { pct: aggregateByShares(rows, outstandingShares(datagovBasic[s.market]!, s.id, s.market)), method: 'shares' };
  }
  // mops 路徑：動態載入（未採 mops 時不需該模組）；直接取全體董監比率
  const { parseMopsRatio } = await import('./sources/mops');
  const html = readFileSync(new URL(`../fixtures/mops-${s.id}-${DATA_MONTH}.html`, import.meta.url), 'utf8');
  return { pct: parseMopsRatio(html), method: 'ratio' };
}

const results: DirectorHoldingResult[] = await Promise.all(
  SAMPLES.map(async (s) => {
    const { pct, method } = await holdingPct(s);
    return {
      stockId: s.id, stockName: s.name, market: s.market,
      dataMonth: DATA_MONTH, directorHoldingPct: Number(pct.toFixed(2)), method,
    };
  }),
);

mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
const header = 'stock_id,stock_name,market,data_month,director_holding_pct,method';
const bodyText = results.map((r) =>
  `${r.stockId},${r.stockName},${r.market},${r.dataMonth},${r.directorHoldingPct},${r.method}`).join('\n');
writeFileSync(new URL('../out/director-holdings-sample.csv', import.meta.url), `${header}\n${bodyText}\n`);
console.table(results);
```

- [ ] **Step 2: 執行 runner**

Run（`DATA_MONTH` 換成 Task 4 記錄的實際 fixture 資料年月）: `cd poc/director-holdings && DATA_MONTH=2026-05 npx tsx src/run.ts`
Expected: console 印出 **5 列**結果表，**每列 `director_holding_pct` 皆為 0~100 的數值（無 NaN）**；`out/director-holdings-sample.csv` 產生。若任一檔缺發行股數或缺明細，腳本會 throw（這是刻意的——避免中途產出看起來成功卻不完整的結果）。

- [ ] **Step 3: Commit**

```bash
git add poc/director-holdings/src/run.ts
git commit -m "feat(poc): sample runner outputs director-holdings CSV"
```

---

## Task 8: 驗證新鮮度與涵蓋率，寫 FINDINGS.md 並更新主設計 §11

**Files:**
- Create: `poc/director-holdings/FINDINGS.md`
- Modify: `docs/superpowers/specs/2026-06-09-stock-screener-design.md`（§11 標記 POC 結論）

- [ ] **Step 1: 彙整「每月新鮮度 + 更新頻率」結論（判準 2）**

依 Task 4 Step 5 與 Task 6 的記錄，明確結論並寫進「實測記錄」：
- 上市：來源＝`<data.gov / MOPS>`、更新頻率＝`<每月?>`、最新可得月份＝`<YYYY-MM>`。
- 上櫃：來源＝`<data.gov / MOPS>`、更新頻率＝`<每月?>`、最新可得月份＝`<YYYY-MM>`。
- 確認兩者距今皆 ≤ 2 個月、且皆為**每月**來源（若 data.gov 上櫃為年更，此處應已改為 MOPS）。
- 若任一市場無每月來源 → 本 POC 對該市場為 **no-go**，於 FINDINGS 明確記錄。

- [ ] **Step 2: 估算涵蓋率（依各市場實際來源）**

**採 datagov 的市場**：用 csv-parse 算明細的不重複 `公司代號` 數，對照該市場基本資料總檔數得涵蓋率。

Run（上市；上櫃若亦為 datagov，把 `datagov-otc.csv` 也加進陣列）:
```bash
cd poc/director-holdings && npx tsx -e "
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
for (const f of ['fixtures/datagov-listed.csv']) {
  const recs = parse(readFileSync(f,'utf8'), { columns:true, skip_empty_lines:true, bom:true, trim:true });
  const ids = new Set(recs.map(r => String(r['公司代號']).trim()).filter(Boolean));
  console.log(f, '不重複代號數=', ids.size);
}
"
```

**採 MOPS 的市場（上櫃年更時）**：MOPS 為逐檔查詢，但「≥95% 涵蓋率」是 GO 判準，**隨機 20 檔無法證明全市場覆蓋**。改為**全量逐檔列舉**（普查），加節流與快取，POC 一次性是可行的：

新增 `src/coverage_mops.ts`：

```ts
// src/coverage_mops.ts
// 用法：ROC_YEAR=115 MONTH=05 npx tsx src/coverage_mops.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fetchText } from './http';
import { parseMopsRatio } from './sources/mops';

const ROC_YEAR = Number(process.env.ROC_YEAR);   // 例 115（= 西元 2026）
const MONTH = process.env.MONTH;                  // 例 '05'，對齊 DATA_MONTH
if (!ROC_YEAR || !MONTH) throw new Error('需 ROC_YEAR 與 MONTH，對齊 DATA_MONTH');

const basic = JSON.parse(readFileSync(new URL('../out/tpex-basic.raw', import.meta.url), 'utf8'));
const ids: string[] = [...new Set(basic.map((x: any) => String(x['公司代號']).trim()).filter(Boolean))];

const cacheDir = new URL('../out/mops-coverage/', import.meta.url); // out/ 已 gitignore，避免上百檔進版控
mkdirSync(cacheDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let ok = 0, fail = 0;
for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  const cache = new URL(`./${id}.html`, cacheDir);
  let html: string;
  if (existsSync(cache)) {
    html = readFileSync(cache, 'utf8');               // 已快取 → 續跑、不重打 MOPS
  } else {
    const body = `co_id=${id}&year=${ROC_YEAR}&month=${MONTH}&step=1&firstin=1`;
    html = (await fetchText('https://mops.twse.com.tw/mops/web/ajax_stapap1', { method: 'POST', body })).text;
    writeFileSync(cache, html);
    await sleep(400);                                 // 節流，禮貌存取
  }
  try { parseMopsRatio(html); ok++; } catch { fail++; }
  if ((i + 1) % 50 === 0) console.log(`${i + 1}/${ids.length} ok=${ok} fail=${fail}`);
}
console.log(`MOPS 上櫃涵蓋率 = ${ok}/${ids.length} = ${((ok / ids.length) * 100).toFixed(1)}%`);
```

Run: `cd poc/director-holdings && ROC_YEAR=115 MONTH=05 npx tsx src/coverage_mops.ts`
Expected: 跑完全部上櫃代號（節流下約數分鐘，可中斷續跑），印出**實際**涵蓋率。GO 要求 ≥ 95%。

> **封鎖/限流時的退路**：若 MOPS 擋下無法全量，改取**確定性大樣本**（每第 4 檔，約 200 檔），以 Wilson 95% 下界 `p̂ - 1.96·√(p̂(1-p̂)/n)`（粗略）判定，要求**下界 ≥ 95%**，並於 FINDINGS 標注為抽樣估計與樣本數。

對照各市場基本資料總檔數計算比例，記錄到 FINDINGS。目標 ≥ 95%。

- [ ] **Step 3: 寫 `FINDINGS.md`**

```markdown
# 董監持股資料 POC — 結論

## 判定：GO / NO-GO
<填入 go 或 no-go，並一句話總結>

## 選定來源（分上市/上櫃）
- 上市：來源＝<data.gov 明細 / MOPS 比率>、端點＝<確切 URL>、更新頻率＝<每月>、最新月份＝<YYYY-MM>
- 上櫃：來源＝<data.gov 明細 / MOPS 比率>、端點＝<確切 URL>、更新頻率＝<每月>、最新月份＝<YYYY-MM>
- 發行股數來源（採加總股數法時）：<TWSE t187ap03_L 已發行股數欄位名 / TPEx 對應欄位名>（**直接取已發行股數欄位，非用資本額估算**）
- 出表日期/資料年月欄位＝<欄位名>
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

## 涵蓋率（普查，非抽樣）
- 上市：方法＝<datagov 明細列舉>、可取得 / 總檔數＝<…>/<…>＝<…>%
- 上櫃：方法＝<datagov 明細列舉 / MOPS 全量逐檔普查>、可取得 / 總檔數＝<…>/<…>＝<…>%
- 若上櫃因封鎖改抽樣：樣本數 n＝<…>、點估計＝<…>%、Wilson 95% 下界＝<…>%（GO 需下界 ≥ 95%）

## 風險 / 注意
- 已發行股數欄位的特例（TDR 原股、特別股、私募股）：<是否需含特別股、處理方式>
- 上櫃來源更新頻率（data.gov 若為年更已改 MOPS）：<結論>
- 月資料延遲：當月公布日約為 <…>
- 反爬 / 速率限制 / 編碼（Big5）：<…>

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
