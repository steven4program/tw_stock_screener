# 台股選股器 — web

## 資料來源（皆免費、無需金鑰）
- **股價＋三大法人**：TWSE / TPEx 政府開放端點（`lib/marketdata.ts`，by-date，含每日與歷史回補）。
- **董監持股**：TWSE / TPEx 董監事持股餘額明細（`lib/director/`，每月）。
- （早期曾規劃 FinMind，但其免費 tier 擋全市場查詢，已改用上述政府端點。）

## 環境變數（`.env.local`，見 `.env.local.example`）
- `SUPABASE_URL`：Supabase 專案 **API URL**（`https://<ref>.supabase.co`，非 Postgres 連線字串）
- `SUPABASE_SERVICE_ROLE_KEY`：service_role 金鑰或新版 `sb_secret_…`（伺服器端用）
- `CRON_SECRET`：保護 `/api/jobs/run`；Vercel 設同名環境變數後，Cron 觸發會自動帶 `Authorization: Bearer`

## 初始化資料庫
把 `db/schema.sql` 貼到 Supabase SQL Editor 執行（建立 5 張表＋授權 service_role）。

## 首次歷史回補（seed，一次性）
管線首次執行會回補最近約 75 個交易日（~10 分鐘，**超過 Vercel 函式 300 秒上限**），故**首次請在本機 seed**：
```bash
cd web && set -a && . ./.env.local && set +a && npx tsx -e "import('./lib/pipeline.ts').then(m=>m.runPipeline()).then(r=>console.log(JSON.stringify(r)))"
```
之後 Vercel Cron 每日只抓 1 天增量（很快、<60 秒）。

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
- 設定上述環境變數（注意 `SUPABASE_URL` 用 API URL、非連線字串）。
- 先在本機完成首次 seed（見上），再讓 `vercel.json` 設定的每日 14:00 UTC（台灣 22:00）Cron 觸發 `/api/jobs/run`。
- 排程失敗可手動補跑（同上 curl，帶 CRON_SECRET）。

## 測試
`npm run test`（純函式：訊號、篩選、TWSE/TPEx 市場資料解析、董監解析、訊號組裝）
