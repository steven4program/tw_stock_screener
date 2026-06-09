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
