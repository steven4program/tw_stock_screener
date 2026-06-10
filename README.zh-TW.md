# 台股選股器 · Taiwan Stock Screener

[English](./README.md) | **繁體中文**

[![CI](https://github.com/steven4program/tw_stock_screener/actions/workflows/ci.yml/badge.svg)](https://github.com/steven4program/tw_stock_screener/actions/workflows/ci.yml)

針對**整個台股市場**（上市 + 上櫃，約 1,800–2,260 檔）的每日收盤後技術選股工具。每天傍晚自動執行，套用兩種均線策略，並以專為**非工程背景的長輩（65 歲）**設計的介面呈現結果——大字、高對比，並用白話說明每檔股票「為什麼」入選。

> ⚠️ **不構成投資建議。** 本工具僅供教育與技術選股用途，不構成任何買賣特定證券的建議。請務必自行研究判斷。

---

## 它在做什麼

每天收盤後，掃描所有上市櫃股票，篩選出符合 **條件 A（季線 / 60 日均線）_或_ 條件 B（月線 / 20 日均線）** 的股票。

每個條件各有 **4 個子條件，必須全部成立**（A 與 B 只差在使用哪一條均線）：

1. **三大法人連續買超 ≥ N 天** — 法人連續淨買超至少 N 個交易日（N 預設 **2**，可於介面調整）。
2. **董監持股 ≥ X%** — 內部人持股高於門檻（X 預設 **15%**，可調整）。
3. **均線向上** — 今日均線 > 昨日均線，_或_ 扣抵 5 日均線 > 今日均線。
4. **股價貼近均線** — `(收盤 − 均線) / 均線` 落在 `[0%, 10%]` 區間。

`均線` 為未還原收盤價的簡單移動平均。**條件 A 用 60 日均線（季線）；條件 B 用 20 日均線（月線）。**

兩個可調參數（**N** 與 **X**）可在瀏覽器即時調整，無需重新執行。

## 特色

- **無障礙優先的介面** — 內文字級跟隨瀏覽器／系統放大設定（`rem`）、對比度全數通過 WCAG AA、觸控目標 ≥ 44px，並提供三種皮膚（`default`、`paper`、`bold`）。
- **白話「看原因」** — 每檔入選股票皆可展開為人話說明（例如「三大法人連買 9 天（門檻 ≥ 2 天）」）。
- **台股紅漲綠跌慣例** — 紅 = 漲、綠 = 跌，且狀態色與價格色刻意分離，避免混淆。
- **誠實的資料狀態** — 介面清楚區分 `success`、`partial`（部分資料沿用）、`stale`、`failed`、`no_data`，讓你隨時知道數字的新鮮度。
- **fail-closed（缺資料即排除）** — 任何資料缺漏都會排除該股而非猜測，因此畫面上的每筆入選都有完整資料支撐。

## 技術堆疊

| 層級 | 選用 |
|------|------|
| 框架 | Next.js 15（App Router）+ TypeScript |
| 資料庫 | Supabase（Postgres）|
| 部署 / CD | Vercel（自動部署 + 每日 Cron）|
| 資料來源 | 免費的證交所 / 櫃買中心政府端點 |
| 測試 | Vitest（單元）+ Playwright（e2e）|
| CI | GitHub Actions |

## 架構

```
免費 TWSE/TPEx 政府端點  →  Supabase（5 張表）  →  計算訊號  →  API  →  前端即時篩選
```

- **`web/lib/signals.ts`** — 純數學運算（`sma`、`holdflat`、`buyStreak`、`changeRatio`），無 I/O。
- **`web/lib/filter.ts`** — 純函式 `matchesA/B`、`runFilter`、排序、統計（驅動前端即時篩選）。
- **`web/lib/pipeline.ts`** — 冪等回補 → 讀取視窗 → 組訊號 → 寫入快照。
- **`web/app/api/jobs/run`** — Cron 進入點（以 `CRON_SECRET` 保護）；**`/api/snapshots/latest`** 提供最近一次成功的快照。
- 資料表：`stock_price_history`、`institutional_daily`、`director_holdings_monthly`、`daily_stock_signals`、`job_runs`（schema 見 `web/db/schema.sql`）。

每日更新由 Vercel Cron 於**台灣時間晚上 22:00** 執行（`0 14 * * *` UTC）。

> 完整架構、領域陷阱與開發慣例請見 **[`AGENTS.md`](./AGENTS.md)**——開發的單一真實來源。

## 專案結構

```
.
├── web/              # Next.js 應用（所有程式碼）
│   ├── app/          # App Router 頁面 + API 路由
│   ├── components/   # React 元件（選股器 UI）
│   ├── lib/          # 訊號、篩選、管線、資料抓取、Supabase repo
│   ├── db/           # schema.sql
│   └── e2e/          # Playwright 測試
├── docs/             # 設計筆記與計畫
├── AGENTS.md         # 開發指南（指令、架構、慣例）
└── .github/workflows # CI
```

## 開始使用

所有應用指令都在 `web/` 內執行。

### 1. 前置需求
- Node.js 20+
- 一個 Supabase 專案（Postgres）

### 2. 環境變數
建立 `web/.env.local`（僅伺服器端使用——切勿提交）：

| 變數 | 說明 |
|------|------|
| `SUPABASE_URL` | Supabase **API** URL——`https://<ref>.supabase.co`（不是 Postgres 連線字串）|
| `SUPABASE_SERVICE_ROLE_KEY` | service-role 金鑰（僅伺服器端；繞過 RLS）|
| `CRON_SECRET` | 保護 `POST /api/jobs/run` 的 Bearer token |

並將資料庫 schema（`web/db/schema.sql`）套用到你的 Supabase 專案。

### 3. 安裝與執行
```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

### 4. 首次資料回補
首次回補（約 10 分鐘）會超過 Vercel 300 秒的函式上限，請在**本機**執行：
```bash
cd web && set -a && . ./.env.local && set +a && \
  npx tsx -e "import('./lib/pipeline.ts').then(m=>m.runPipeline()).then(r=>console.log(JSON.stringify(r)))"
```
之後由每日的 Vercel Cron 自動保持更新（只回補缺少的日期——冪等且可自我修復）。

## 測試

```bash
cd web
npm run lint         # eslint
npm run test         # vitest（純函式單元測試）
npm run e2e          # next build + playwright（使用 fixtures，免資料庫）
npx tsc --noEmit     # 型別檢查
```

## CI / CD

- **CI** — [GitHub Actions](./.github/workflows/ci.yml) 於每個 PR 與 push 至 `main` 時執行 lint + 單元 + e2e。e2e 透過 fixture 機制（`E2E=1`）運作，CI 不需任何密鑰。
- **CD** — Vercel 於 push 時自動部署；每日 Cron 於台灣時間 22:00 更新快照。
- `main` 受保護：所有變更須透過通過 CI 的 PR 進入。
