# 台股選股器 — 前端實作設計

- 日期：2026-06-09
- 狀態：設計（待使用者確認後進入實作計畫）
- 里程碑：前端選股器主頁（第 4 個里程碑；POC → 訊號/篩選核心 → 管線/儲存/API 之後）

本文件只記錄**前端實作設計與今日決策**。畫面與行為的權威來源：
- 視覺/元件規格：`docs/design_handoff_stock_screener/`（Claude Design 高擬真稿，含 `README.md`、`styles.css`、`components.jsx`）。
- 功能/資訊架構：`docs/superpowers/specs/2026-06-09-stock-screener-design.md` §6、§8、§9。

不重複上述內容，只補上「如何在 Next.js 既有環境中落地」。

---

## 1. 範圍

把高擬真設計稿一比一重建為正式前端：單一唯讀主頁，讀取當日快照，瀏覽器端依使用者參數即時篩選/排序/展開。

**今日確定的決策（與使用者）**
1. **樣式**：直接移植設計稿的 `styles.css`（design tokens + container queries）為全域 CSS，不引入 Tailwind。
2. **狀態列**：擴充 API 以支援設計的全部 5 種狀態（success / stale / partial / failed / empty）。
3. **元件位置**：`web/components/screener/`（對齊既有的頂層 `web/lib/`，非 `app/_components/`）。
4. **皮膚**：保留三種皮膚（預設 / 報紙 paper / 大字高對比 bold），提供正式的切換器（cookie 持久化）。
5. **狀態優先序**：failed › stale › partial › success。

**不做（非目標）**：登入、下單、歷史回測、prototype 的 DemoBar / tweaks-panel、新增 React 測試框架（jsdom/RTL）。

---

## 2. 架構：RSC 外殼 + 單一 Client island

依 Next.js 資料擷取最佳實務（Server Component 直接讀資料再傳給 Client，避免 client-fetch-on-mount 的 waterfall 與 loading 閃爍）：

```
app/page.tsx (Server Component)
   └─ getLatestSnapshot()  ← 伺服器端直接讀（不繞自家 API）
        → { signals, scenario, dataDate, lastSuccessDate, generatedAt, directorDataMonthLatest }
   └─ <Screener initial={...} />   ← 傳純可序列化資料

components/screener/Screener.tsx ('use client')
   └─ 持有互動狀態 n / x / tab / sort / open
   └─ 呼叫既有 lib/filter.ts 的 runFilter()、manualSort()
   └─ 組裝 StatusBar / ParamPanel / StatsRow / Tabs / SortBar / StockList / EmptyState / Footer
```

- `app/page.tsx` 設 `export const dynamic = 'force-dynamic'`（快照每日更新、狀態需即時反映；先求正確，之後可改 `revalidate`）。
- `/api/snapshots/latest` 仍保留為對外 REST 端點，**改用同一個 `getLatestSnapshot()`**（DRY），但主頁不經它。
- 傳入 Client 的 props 皆為 plain object/array/string/number（遵守 RSC 序列化邊界；無 Date、Map、函式）。

---

## 3. 資料流與 API 擴充

新增 `web/lib/snapshot.ts`，由 `page.tsx` 與 API route 共用：

```ts
getLatestSnapshot(): Promise<{
  signals: StockSignal[];          // 最新一筆 success|partial_success 快照（readSignalsByDate 分頁讀全部）
  scenario: Scenario;              // 'success' | 'stale' | 'partial' | 'failed' | 'no_data'
  dataDate: string | null;         // 顯示中的快照資料日（= lastSuccessDate）
  lastSuccessDate: string | null;  // 同上；stale/failed 文案使用
  generatedAt: string | null;
  directorDataMonthLatest: string | null; // = max(signals[].directorDataMonth)，給「資料較舊」⚠ 用
}>
```

讀取步驟：
1. `display` = 最新一筆 `status ∈ {success, partial_success}` 且 `data_date` 非 null 的 `job_runs`（依 `data_date` 降序）。其 `signals` 經 `readSignalsByDate(display.data_date)` 讀出。
2. `latest` = 最新一筆**任意狀態**的 `job_runs`（依 `started_at` 降序）—— 僅用其 `status` 判斷最近一次是否 `failed`。
3. `today` = 伺服器計算的**台北時區當日**（`'YYYY-MM-DD'`，例：`new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'})`）；注入 `deriveScenario` 以保純函式可測。
4. `scenario = deriveScenario({ latestStatus: latest.status, displayStatus: display.status, displayDataDate: display.data_date, today, staleAfterDays: 4 })`（見 §4）。
5. 無任何 `display`（全新 DB）→ `scenario = 'no_data'`、`signals = []`，不呼叫 `deriveScenario`。

API route `/api/snapshots/latest` 回傳上述完整物件（取代目前的 `{ dataDate, jobStatus, generatedAt, signals }`；尚無前端消費者，可自由變更）。

**伺服器專用邊界（重要）**：`web/lib/snapshot.ts` 使用 service-role Supabase client（讀伺服器端 env），**僅供伺服器端**（RSC `page.tsx` 與 route handler）使用，檔首加 `import 'server-only'` 作 build-time 守門，**嚴禁被 client component import**。`Screener`（client island）只透過 props 取得資料，絕不直接連 DB —— 與系統 spec §2「前端不直接查資料表」一致（憑證始終留在伺服器；client 從不持有）。需新增 `server-only` 套件（1 行依賴）。

---

## 4. 狀態判定（純函式，須測試）

```ts
type Scenario = 'success' | 'stale' | 'partial' | 'failed' | 'no_data';
// no_data 在 getLatestSnapshot 處理（無 display 時）；empty 由 Client 端「某分頁/參數 0 檔」即時判定
deriveScenario(input: {
  latestStatus: JobStatus;                          // 最近一次 job_run 狀態（running|success|partial_success|failed|no_new_data）
  displayStatus: 'success' | 'partial_success';     // 顯示中快照的狀態
  displayDataDate: string;                          // 顯示中快照的資料日 'YYYY-MM-DD'
  today: string;                                    // 台北時區當日（注入）
  staleAfterDays?: number;                          // 預設 4
}): 'success' | 'stale' | 'partial' | 'failed'
```

```ts
// 純函式；daysBetween 以 UTC 午夜相減算日曆天數
const days = daysBetween(displayDataDate, today);        // (today - displayDataDate)
if (latestStatus === 'failed') return 'failed';
if (days > (staleAfterDays ?? 4)) return 'stale';
if (displayStatus === 'partial_success') return 'partial';
return 'success';
```

優先序 **failed › stale › partial › success**：

| 順位 | scenario | 條件 | StatusBar |
|---|---|---|---|
| 1 | `failed` | `latestStatus === 'failed'` | ⛔ bad；「更新失敗（顯示為上次成功資料 {lastSuccessDate}）」，日期用 `lastSuccessDate` |
| 2 | `stale` | `daysBetween(displayDataDate, today) > staleAfterDays`（預設 4） | ⚠️ warn；「資料尚未更新（最後更新 {lastSuccessDate}）」 |
| 3 | `partial` | `displayStatus === 'partial_success'` | ✅ ok 主訊息 + 琥珀子標「董監資料沿用 {directorDataMonthLatest} 月份」 |
| 4 | `success` | 以上皆非 | ✅ ok；「今日已更新 ・ 資料日期 {dataDate}」 |

**設計理由**：系統不自維交易日曆（系統 spec §4），故 `no_new_data`/`running` 是「目前已是最新」的健康狀態（含週末/假日），**不可視為 stale**；同日成功後再次 `no_new_data` 因 `days==0` 自然不會誤判為 stale。`stale` 改以「顯示中資料日距今超過 `staleAfterDays`」這個粗略時鐘新鮮度判定（非交易日曆），用於偵測「管線疑似卡住、資料明顯過舊」。`staleAfterDays=4` 可容忍一般週末；超長假期（如農曆年）可能短暫示警，數值可調。文案改用「資料較舊/最後更新」而非「今日尚未更新」，以符合新鮮度語意。

> 註：系統不自維交易日曆（系統 spec §4），故「stale」語意為「最近一次嘗試未產生更新的資料」，而非以日曆日比對。

---

## 5. 元件分解（`web/components/screener/`，各司一職）

| 元件 | 對應設計稿 | 重點 |
|---|---|---|
| `Screener.tsx` `'use client'` | App.jsx（去除 prototype） | 狀態總管；跑 `runFilter`/`manualSort`；組裝子元件 |
| `StatusBar.tsx` | StatusBar | 依 `scenario` 切 tone（ok/warn/bad）、圖示、主訊息、子標 |
| `ParamPanel.tsx` + `Stepper.tsx` | ParamPanel | N(1–10,預設2)、X(5–50,預設15) 大 +/− 步進；達上下限 `disabled`；固定條件 chips；資料日期 |
| `StatsRow.tsx` | StatsRow | 4 卡：全部 / A / B / A+B（A+B 用主色） |
| `Tabs.tsx` | Tabs | `role=tablist`；全部/A/B/A+B + 計數 pill |
| `SortBar.tsx` | SortBar | `<select>`：綜合 + `ManualSortKey`（streak/dist/buyLots/volume/director）；「共 N 檔」 |
| `StockList.tsx` → `StockItem.tsx` | StockList/StockItem | 桌機 6 欄 grid／手機卡片（container query）；徽章 A/B/★A+B |
| `Reasons.tsx`（含 `MaLine`） | 展開區 | 依分頁決定顯示哪組均線原因；A+B 列雙欄 `.reasons.two` |
| `EmptyState.tsx` | EmptyState | 某分頁/參數 0 檔的友善引導 |
| `Footer.tsx` | Footer | 免責摘要（系統 spec §13） |
| `PageTitle.tsx` + `SkinSwitcher.tsx` | 標題 + 新增 | 標題列；右側皮膚切換器（見 §8） |

**展開原因群組顯示規則**：A 分頁→只季線組；B 分頁→只月線組；A+B 與「全部」分頁的 A+B 列→兩組並列。原因文字直接用既有 `reasonsForA/reasonsForB`。`MaLine` 形如：`季線(60MA) 154.6 ・ 距均線 +9.0% ・ ↑已上彎`（箭頭：已上彎 ↑、扣抵向上 ↗）。

---

## 6. 純展示輔助：`web/lib/format.ts`

自設計稿 `data.js` 移植（`runFilter`/`reasonsForA|B` 已存在於 `lib/filter.ts`，不重複）：

- `fmt.int(n)`：整數千分位
- `fmt.price(n)`：≥100 取 1 位小數、否則 2 位
- `fmt.pct1(r)` / `fmt.changePct(r)`：百分比；漲跌幅帶 +/− 號
- `trendShort(kind, signal)`：`'已上彎' | '扣抵向上'`（MaLine 用）
- `isStaleDirectorMonth(month, latest)`：董監月份是否較舊

皆為純函式，配 vitest 單元測試。

---

## 7. 樣式與字體

- **`app/globals.css`**：移植 `styles.css`（`:root` tokens、三皮膚、container queries 原樣保留），於 `layout.tsx` 以 `import './globals.css'` 載入；移除 prototype 專用規則（`.demo-bar` 等）。
- **字體**：`next/font/google` 載入 Noto Serif TC + Noto Sans TC，輸出為 CSS 變數接到 `--font-serif` / `--font-sans`。
  - **CJK 注意事項**：不傳 `subsets`（TC 無標準子集名稱，會報錯）；明確列出所需 `weight`；`display:'swap'`；`preload:false`（CJK 檔大，不宜 preload）。設計稿既有 fallback stack（`"Songti TC"`、`system-ui`）保留為優雅降級。實作時驗證 next/font 設定可用。

---

## 8. 皮膚切換器（cookie，無閃爍）

- 三皮膚規則全保留於 `globals.css`：`:root`(default) / `[data-skin="paper"]` / `[data-skin="bold"]`。
- **`SkinSwitcher.tsx` `'use client'`**：3 顆大按鈕（≥48px）radiogroup —「預設 / 報紙 / 大字高對比」，置於**頁面標題列右側**。
- **持久化（關鍵最佳實務）**：偏好存 cookie `skin=default|paper|bold`；於 `layout.tsx`（Server）用 `cookies()` 讀取，設 `<html data-skin={skin}>`。伺服器端就決定 → **無 FOUC、無 hydration 不一致**（純 localStorage 會每次載入閃爍）。
- 切換時：client 寫 cookie + 立即 `document.documentElement.dataset.skin = value`（即時生效；cookie 供下次 server render）。
- `layout.tsx` 因 `cookies()` 成為動態渲染，與 §2 的 `force-dynamic` 一致。

---

## 9. Client 端狀態（`Screener`）

| 狀態 | 型別 | 預設 |
|---|---|---|
| `n` | number | 2 |
| `x` | number | 15 |
| `tab` | `'all'｜'A'｜'B'｜'AB'` | `'all'` |
| `sort` | `'composite'｜ManualSortKey` | `'composite'` |
| `open` | `Set<stockId>` 或 map | 空 |

流程：`runFilter(initial.signals, {n,x})` → 依 `tab` 過濾 → 依 `sort` 排序 → 渲染。調 N/X/分頁/排序即時重算；展開以 `stockId` 記錄、各列獨立。展開區不用 opacity 進場動畫（截圖/reduced-motion 可見）。

**排序方向（`manualSort` 需 `dir`）**：`composite` 用 `runFilter` 內建排序；其餘呼叫 `manualSort(rows, key, SORT_DIR[key])`，方向固定對應（與 prototype `data.js` 一致）：

| key | 方向 | 理由 |
|---|---|---|
| `dist` | `asc` | 距均線越近越前 |
| `streak` / `buyLots` / `volume` / `director` | `desc` | 數值越大越前 |

即 `const SORT_DIR = { dist: 'asc', streak: 'desc', buyLots: 'desc', volume: 'desc', director: 'desc' } as const;`。

---

## 10. 測試與驗收

依專案慣例（純邏輯必有測試，不為 UI 引入 React 測試框架）：
- **vitest 單元測試**：
  - `lib/format.ts`：價格小數邊界（≥100 取 1 位、<100 取 2 位）、漲跌號（正帶 `+`、零、負）、stale 月份、trendShort（已上彎/扣抵向上）。
  - `lib/snapshot.ts` 的 `deriveScenario`，**至少涵蓋**：
    - **回歸（friend finding 1）**：同日成功後再次 `no_new_data`（`latestStatus='no_new_data'`、`displayStatus='success'`、`displayDataDate===today`）→ `success`（不得 stale）。
    - `latestStatus='success'`、新鮮 → `success`；`displayStatus='partial_success'`、新鮮 → `partial`。
    - `latestStatus='failed'`（不論新鮮度）→ `failed`（驗 failed › stale 優先）。
    - `displayDataDate` 距 `today` 5 天（>4）→ `stale`；display partial 且過舊 → `stale`（驗 stale › partial）。
    - 週末不誤判：`displayDataDate=週五`、`today=週一`（3 天）→ `success`。
    - `daysBetween` 純函式：跨月/UTC 邊界正確。
- `npx tsc --noEmit` 無誤 · `npm run test` 全綠 · `npm run build` 成功。
- 手動：`npm run dev` 載入主頁，驗 happy path、N/X 即時重篩、分頁/排序、展開原因、皮膚切換、手機卡片斷點（≤720px）。

---

## 11. 邊界情況

- **no_data**（全新 DB / 無成功快照）：主頁顯示中性「資料準備中」訊息，不渲染清單。
- **empty**：某分頁/某參數下 0 檔 → `EmptyState`（client 端判定）。
- **director 較舊**：`signal.directorDataMonth < directorDataMonthLatest` → 該列顯示 `⚠ {month}・資料較舊`（琥珀）。
- **fail-closed**：僅對 `eligibleA/eligibleB` 為真者套用條件（既有 `filter.ts` 已處理）。
