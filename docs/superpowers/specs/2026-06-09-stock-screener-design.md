# 台股選股器 MVP — 設計文件

- 日期：2026-06-09
- 狀態：設計（待使用者最終確認後進入實作計畫）
- 作者：brainstorming 協作產出

---

## 1. 目標與範圍

做一個**台股選股器網頁**，每天收盤後自動掃描上市＋上櫃股票，撈出同時符合「條件 A（季線型）」**或**「條件 B（月線型）」的股票清單，並清楚說明每檔的入選原因。

使用者輪廓：以 **65 歲、非工程師** 為主要使用者。介面需大字體、高對比、狀態清楚。

**MVP 包含：**

- 每日收盤後自動更新的「當日選股結果頁」
- 條件 A／B／A+B 分頁與標籤
- 兩個可調參數：三大法人連買天數 `N`（預設 2）、董監持股門檻 `X%`（預設 15）
- 每檔股票的「為什麼入選」說明
- 資料更新狀態與資料日期顯示

**MVP 不做（非目標）：**

- 使用者登入／帳號
- 歷史回測
- 盤中即時掃描
- 下單／券商串接
- 推播／通知
- 自選股同步

---

## 2. 系統架構

```
[Vercel Cron 每日台灣 22:00]
        │ 觸發（亦可手動補跑）
        ▼
[資料管線：POST /api/jobs/run（受 CRON_SECRET 保護）]
   1. 抓 FinMind：全市場每日股價 + 三大法人買賣超
   2. 抓 公開資訊觀測站：董監持股（每月）
   3. 以「API 實際回傳的資料日期」為準，寫入原始來源表
   4. 計算每檔原始訊號 → 寫入 daily_stock_signals
   5. 寫入 job_runs（成功 / 失敗 / 無新資料）
        │
        ▼
[Supabase Postgres]
   原始來源：stock_price_history / institutional_daily / director_holdings_monthly
   衍生快照：daily_stock_signals
   營運狀態：job_runs
        │ 經 API 讀取
        ▼
[GET /api/snapshots/latest]  →  回傳當日快照 + 更新狀態
        │
        ▼
[Next.js 前端]
   一次載入當日快照 → 在瀏覽器依使用者參數即時篩選 → A / B / A+B 分頁
```

**技術棧**

- 前端／後端：Next.js（App Router）+ TypeScript
- 部署：Vercel（含 Vercel Cron）
- 資料庫：Supabase Postgres

**關鍵設計原則**

1. **原始訊號與門檻分離**：管線只計算與門檻無關的「原始訊號」（連買天數、董監%、各均線值與扣抵值、距均線比例等）。A／B 的判定在前端讀取快照時即時套用使用者參數 —— 因此調整 `N`、`X%` 是**瞬間重篩、不需重抓資料**。
2. **持久化原始來源**：股價、法人、董監三類原始資料各自落地存表，使衍生訊號可完整重算、可稽核。
3. **前端不直接查資料表**：一律經由 `/api/*`，前端不持有資料庫憑證。

---

## 3. 資料來源

| 資料 | 來源 | 更新頻率 | 對應資料表 |
|---|---|---|---|
| 每日股價（開高低收、量） | FinMind `TaiwanStockPrice` | 每交易日 | `stock_price_history` |
| 三大法人買賣超 | FinMind `TaiwanStockInstitutionalInvestorsBuySell` | 每交易日 | `institutional_daily` |
| 董監持股 | 公開資訊觀測站（董監事持股餘額／全體董監持股成數） | 每月 | `director_holdings_monthly` |

- FinMind 速率限制：有 token 600 次/小時。管線採「依日期一次取全市場」方式，呼叫次數很少。
- 市場範圍：上市（TWSE）＋上櫃（TPEx），約 1,800 檔。
- 董監持股實際抓取／解析端點為**待定項目**（見 §11），但資料本身確定免費、每月更新。

---

## 4. 資料管線（每日一次 + 可手動補跑）

**觸發**

- Vercel Cron 每日台灣 22:00（= 14:00 UTC）觸發 `POST /api/jobs/run`。
- 同一端點支援**手動補跑**（帶 `CRON_SECRET`），用於排程失敗時補救。
- 未來可加「隔天早上補跑」的第二個 Cron（非 MVP）。

**流程**

1. 向 FinMind 取得「最新可得交易日」的全市場股價與法人資料。
2. **以 API 實際回傳的資料日期為 `data_date`**，不假設固定在 20:00 更新。
3. 比對 `data_date` 是否比資料庫既有最新快照更新：
   - 更新 → 寫入原始來源表，續跑計算。
   - 未更新（同一天或更舊）→ `job_runs.status = no_new_data`，不覆蓋既有快照。
4. 維護滾動股價歷史（`stock_price_history`）：每日只新增當天，足以計算 60MA（保留至少約 70 個交易日）。首次啟動時回補近期歷史以建立均線與連買天數基準。
5. 計算每檔原始訊號（見 §6 與 §5 schema），寫入 `daily_stock_signals`。
6. 寫入 `job_runs`（狀態、處理檔數、耗時、錯誤訊息、處理的 `data_date`）。

---

## 5. 資料模型（Supabase Postgres）

> 單位約定：
> - `*_lots`：張（1 張 = 1,000 股）。
> - `*_ratio`：小數比例（例：0.021 代表 +2.1%；前端顯示時 ×100 加上 %）。
> - `*_pct`（僅 `director_holding_pct`）：百分比數值本身（例：18.2 代表 18.2%）。

### 5.1 `stock_price_history`（原始：每檔每日股價）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `stock_id` | text | 股票代號 |
| `trade_date` | date | 交易日 |
| `open` / `high` / `low` / `close` | numeric | 開高低收（未還原權值） |
| `volume_lots` | numeric | 成交量（張） |
| 主鍵 | | `(stock_id, trade_date)` |

### 5.2 `institutional_daily`（原始：每檔每日三大法人）— *建議新增*

| 欄位 | 型別 | 說明 |
|---|---|---|
| `stock_id` | text | 股票代號 |
| `trade_date` | date | 交易日 |
| `net_lots` | numeric | 三大法人**合計**買超（張）＝(外資+投信+自營商) 買-賣 |
| 主鍵 | | `(stock_id, trade_date)` |

> 用途：計算「連買天數」並可完整重算，與另兩張原始表設計一致。

### 5.3 `director_holdings_monthly`（原始：每檔每月董監持股）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `stock_id` | text | 股票代號 |
| `data_month` | text | 資料月份（如 `2026-05`） |
| `director_holding_pct` | numeric | 全體董監持股 %（如 18.2） |
| 主鍵 | | `(stock_id, data_month)` |

### 5.4 `daily_stock_signals`（衍生：當日快照，前端讀取對象）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `data_date` | date | 資料交易日 |
| `stock_id` / `stock_name` | text | 代號 / 名稱 |
| `market` | text | `TWSE`（上市）/ `TPEx`（上櫃） |
| `close` | numeric | 收盤價 |
| `change_ratio` | numeric | 漲跌幅（小數比例，相對前一交易日收盤） |
| `volume_lots` | numeric | 成交量（張） |
| `inst_net_lots` | numeric | 當日三大法人合計買超（張） |
| `inst_buy_streak` | int | 三大法人合計**連續買超天數** |
| `director_holding_pct` | numeric, null | 董監持股 %（可為空） |
| `director_data_month` | text, null | 採用的董監資料月份（如 `2026-05`） |
| `ma20` | numeric, null | 今日月線（20MA） |
| `ma20_prev` | numeric, null | 昨日月線 |
| `ma20_holdflat_5d` | numeric, null | 假設未來 5 交易日收盤＝今日收盤的扣抵後月線（純計算，非預測） |
| `ma60` | numeric, null | 今日季線（60MA） |
| `ma60_prev` | numeric, null | 昨日季線 |
| `ma60_holdflat_5d` | numeric, null | 假設未來 5 交易日收盤＝今日收盤的扣抵後季線（純計算，非預測） |
| `dist_ma20_ratio` | numeric, null | (close − ma20) / ma20（小數比例） |
| `dist_ma60_ratio` | numeric, null | (close − ma60) / ma60（小數比例） |
| `data_quality_status` | text | `ok` / `insufficient_history` / `missing_director` / `partial`（見 §9） |
| `exclude_reason` | text, null | 被排除原因（可為空；null 代表資料完整） |
| 主鍵 | | `(data_date, stock_id)` |

> `ma60_holdflat_5d` 算法：`(sum(最近 55 日收盤) + 5 × 今日收盤) / 60`。`ma20_holdflat_5d` 同理：`(sum(最近 15 日收盤) + 5 × 今日收盤) / 20`。

### 5.5 `job_runs`（營運：每日更新狀態）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `run_at` | timestamptz | 執行時間 |
| `data_date` | date, null | 本次處理的交易日 |
| `status` | text | `running` / `success` / `failed` / `no_new_data` |
| `stocks_processed` | int | 處理檔數 |
| `duration_ms` | int | 耗時 |
| `error_message` | text, null | 失敗原因 |

---

## 6. 篩選引擎（讀取時即時計算，可調 `N`、`X`）

對快照中每一檔，套用條件。固定參數：距均線帶 `[0%, 10%]`、扣抵 5 個交易日、月線 20MA／季線 60MA。可調參數：`N`（連買天數，預設 2）、`X`（董監持股%，預設 15）。

**條件 A（季線型）— 全部成立：**

1. `inst_buy_streak ≥ N`
2. `director_holding_pct ≥ X`
3. `ma60 > ma60_prev`（季線已上彎）**或** `ma60_holdflat_5d > ma60`（5 日內扣抵向上）
4. `dist_ma60_ratio ∈ [0, 0.10]`

**條件 B（月線型）— 全部成立：**

1. `inst_buy_streak ≥ N`
2. `director_holding_pct ≥ X`
3. `ma20 > ma20_prev`（月線已上彎）**或** `ma20_holdflat_5d > ma20`（5 日內扣抵向上）
4. `dist_ma20_ratio ∈ [0, 0.10]`

**型別標籤**：同時符合 → `A+B`；僅一邊 → `A` 或 `B`。一檔股票在清單中只出現一次。

**入選原因**（展開顯示，由訊號即時組字），例如：

- 三大法人連買 5 天（≥ 2 天）
- 董監持股 18.2%，高於 15%
- 股價在季線上方 2.1%（位於 0~10% 區間）
- 季線已上彎（或：季線 5 個交易日內扣抵向上）

**連買天數計算**：以 `institutional_daily.net_lots > 0` 的連續天數計；當日無法人資料（未交易）視為中斷、歸零（保守）。

---

## 7. API

| 端點 | 方法 | 說明 |
|---|---|---|
| `/api/snapshots/latest` | GET | 回傳最新一筆成功快照：`data_date`、`generated_at`、`job_status`、`signals[]`（全市場原始訊號）。前端據此在瀏覽器端篩選／排序。 |
| `/api/jobs/run` | POST | 觸發資料管線；受 `CRON_SECRET` 保護。Vercel Cron 每日呼叫，亦供手動補跑。 |

> 前端不直接連 Supabase；資料庫憑證僅存在於伺服器端 API。

---

## 8. 前端 / UI

整體以 65 歲非工程師為主：**大字體、高對比、狀態一目了然**。手機上表格自動轉為卡片。

**頂部狀態列**

- 大字顯示更新狀態：`✅ 今日已更新 ・ 資料日期 2026-06-09` 或 `⚠️ 今日尚未更新（沿用 2026-06-06 資料）`，資料來源為 `job_runs` 與快照 `data_date`。

**參數摘要區**

- 顯示本次篩選參數：法人連買 ≥ N 天、董監持股 ≥ X%、距均線 0~10%、月線 20MA、季線 60MA、扣抵 5 個交易日、資料日期。
- `N`、`X` 提供大顆 +/− 控制即時調整；其餘參數固定顯示。

**結果統計**

- 全部 N 檔、A 季線型 N 檔、B 月線型 N 檔、A+B N 檔。

**分頁（Tab）**：全部 / A 季線型 / B 月線型 / A+B 同時符合。

**表格欄位**

- 共同欄位：代號、名稱、類型標籤（A/B/A+B）、收盤價、漲跌幅%、連買天數、買超張數、董監持股%、成交量。
- 均線相關欄位（均線值、距均線%、均線狀態：已上彎／扣抵向上）依分頁顯示：
  - **A 季線型**分頁：顯示季線（60MA）相關欄位。
  - **B 月線型**分頁：顯示月線（20MA）相關欄位。
  - **A+B 分頁**：**同時顯示月線與季線**兩組狀態。
  - **全部**分頁：對 A+B 列同時顯示兩線，A 列顯示季線、B 列顯示月線（不適用處以「—」表示）。

**每檔可展開**：顯示「為什麼入選」逐條說明（見 §6）。

**排序**

- 預設綜合排序：A+B 優先 → 連買天數多 → 距均線近 → 買超張數多。
- 手動排序：連買天數 / 距均線% / 買超張數 / 成交量 / 董監持股%。

---

## 9. 邊界情況與資料品質

每檔以 `data_quality_status` 標記，被排除者填 `exclude_reason`：

| 情況 | `data_quality_status` | 處理 |
|---|---|---|
| 資料完整 | `ok` | 正常參與篩選 |
| 上市未滿 60 日（無法算季線） | `insufficient_history` | 不納入 A；若亦未滿 20 日則一併不納入 B |
| 缺董監資料 | `missing_director` | 條件 2 無法確認 → 不納入 A、B（fail-closed） |
| 部分資料缺漏 | `partial` | 視缺漏項目保守排除對應條件 |

- **管線失敗**：`job_runs.status = failed`，前端頂部顯示警告，並沿用上一次成功快照與其資料日期。
- **非交易日**：管線照常觸發；若無新資料 → `no_new_data`，不覆蓋既有快照。
- 原則一致：**寧可漏報，不要誤報**（fail-closed）。

---

## 10. 未來（非 MVP）

- 隔天早上自動補跑 Cron。
- 歷史回測（已先持久化原始來源，為此鋪路）。
- 均線天數自訂、距均線帶自訂、扣抵天數自訂等進階參數。
- 「今日新進榜 vs 昨日」差異。

---

## 11. 待定項目（實作計畫階段鎖定）

- **董監持股確切來源端點與解析方式**：公開資訊觀測站「董監事持股餘額明細」或「全體董監持股成數」報表的實際抓取與欄位解析；如何由明細彙總為「全體董監持股 %」。資料本身確定免費、每月更新。

---

## 12. 名詞與單位

| 名詞 | 定義 |
|---|---|
| 三大法人 | 外資、投信、自營商 |
| 連買天數 | 三大法人**合計**買超（淨買超 > 0）的連續交易日數 |
| 季線 / 60MA | 最近 60 個交易日收盤價的簡單平均（SMA，未還原權值） |
| 月線 / 20MA | 最近 20 個交易日收盤價的簡單平均（SMA，未還原權值） |
| 已上彎 | 今日 MA > 昨日 MA |
| 扣抵向上（5 日內） | 假設未來 5 個交易日收盤＝今日收盤，模擬後 MA > 今日 MA（純計算，非預測） |
| 距均線 | (收盤 − MA) / MA，以小數比例儲存 |
| 張 | 1 張 = 1,000 股 |
