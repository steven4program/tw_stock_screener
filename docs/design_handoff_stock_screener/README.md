# Handoff: 台股選股器（TW Stock Screener）主頁

## Overview
單一唯讀主頁：每日收盤後掃描上市＋上櫃股票，列出符合兩種技術條件的股票，並逐條說明「為什麼入選」。
- A 季線型（60MA）、B 月線型（20MA）、A+B 同時符合。
- 無登入、無下單。主要使用者為 **65 歲、非工程師**，可能在手機/平板使用。
- 介面語言：繁體中文。**紅漲綠跌**（台股慣例，與歐美相反）。

## About the Design Files
此資料夾中的 HTML/CSS/JS 是**設計參考稿**（用 HTML + 透過 Babel 的 React 製作的原型），用來呈現預期的外觀與行為，**不是要直接搬上線的產品程式碼**。
任務是：**在你 repo 既有環境（React + 你的 CSS/Tailwind/型別）中，依這些設計稿一比一重建這些畫面與元件**，沿用你既有的元件庫與慣例。
唯一例外是 `data.js` 中的篩選/格式化邏輯——那是與真實前端流程對齊的純函式，可直接移植（見下方 Design Logic）。

## Fidelity
**High-fidelity (hifi)。** 含最終色票、字級、間距、互動與所有狀態。請以像素級忠實度重建，並滿足 WCAG 2.1 AA 與大字體/大觸控目標約束。

## 無障礙約束（最高優先，務必保留）
- 內文 ≥ 18px；股名/百分比/連買天數等重要數字更大更粗。
- 文字對比 ≥ 4.5:1，大字 ≥ 3:1（WCAG 2.1 AA）。避免細灰字。
- 按鈕/可點區 ≥ 44×44px（本稿用 48px）；參數 +/− 鈕為 56px。
- 狀態用 **顏色＋圖示＋文字** 三重提示（色盲也要懂），不可只靠顏色。
- 資訊密度低；手機上表格轉為卡片。

---

## Screens / Views

### 主頁（單一畫面，由上到下）
排版容器：`.app`，`max-width: 980px`，置中，`container-type: inline-size`（響應式以容器寬度判斷，非視窗）。

依序區塊：
1. **示範狀態切換條（DemoBar）** — 僅原型用，正式產品請移除。深色列，可切五種資料狀態以預覽 StatusBar/清單。
2. **頁面標題** — 「台股選股器」(宋體) + 副標「每日收盤後・上市＋上櫃技術選股」。
3. **頂部更新狀態列（StatusBar）** — 最顯眼。見下方「States」。
4. **參數區（ParamPanel）** — 兩個大 +/− 可調參數 + 固定條件 chips + 資料日期。
5. **結果統計（StatsRow）** — 4 張卡：全部 / A 季線型 / B 月線型 / A+B 同時。
6. **分頁（Tabs）** — 全部 / A 季線型 / B 月線型 / A+B 同時符合（含計數）。
7. **排序控制（SortBar）** — 下拉 + 「共 N 檔」。
8. **股票清單** — 桌機列、手機卡片；每筆可展開「為什麼入選」。
9. **頁尾免責（Footer）**。

---

## Components（精確規格）

### StatusBar（頂部更新狀態列）
- 容器：`.status.card`，`padding: 16px 20px`，`border: 2px solid <tone-bd>`，`border-radius: 16px`。
- 結構：`[圖示 28px] + .st-text(flex column, gap 8px){ .st-main + .st-sub? }`。
- `.st-main`：21px / 800。`.st-sub`：pill，16px / 700，琥珀底（`--st-warn-bg`），`border-radius: 999px`，`padding: 4px 12px`。
- 四種 tone（見 States）。

### ParamPanel（參數區）
- `.params.card`，`padding: 20px`。標題「篩選參數」(宋體 21px) + 右上「資料日期 YYYY-MM-DD」。
- `.param-grid`：桌機兩欄、容器 ≤560px 單欄。
- 每個 `.param`：標題（如「法人連買天數 N」）+ **Stepper** + 範圍說明。
- **Stepper**：`[− 56×56px] [數值 30px/800 + 單位] [+ 56×56px]`。按鈕 `border: 2px solid var(--accent)`，圓角 12px，到達 min/max 時 `disabled`（opacity .35）。
  - N（法人連買天數）：min 1, max 10, 預設 2, 單位「天」。
  - X（董監持股門檻）：min 5, max 50, 預設 15, 單位「%」。
- 固定條件 chips（只顯示不可調）：距均線 0~10%、月線 20MA、季線 60MA、扣抵 5 個交易日。

### StatsRow
- 4 張 `.stat` 卡，flex 等寬，min-width 120px。`.s-num` 26px/800（A+B 卡用主色），`.s-lab` 16px/600。

### Tabs
- `role="tablist"`，每顆 `.tab` 高度 48px，圓角 12px，`border: 2px`。選中：實心主色底白字。含 `.t-count` pill。

### SortBar
- `<select>` 高 48px，18px/700。選項：綜合排序 / 連買天數 / 距均線% / 買超張數 / 成交量 / 董監持股%。右側「共 N 檔」。

### StockItem（股票列 / 卡片）
桌機 `.srow-main` 為 6 欄 grid：`minmax(150px,1.6fr) 1.1fr .9fr .9fr 1fr 132px`，欄序：
1. **名稱欄**：`代號(16px/700) + 股名(宋體 30px)`，下方「上市/上櫃」小字，再下方**類型徽章**。
   - 徽章：`A 季線型`(藍系)、`B 月線型`(紫系)、`★ A+B`(實心主色，最醒目，帶陰影)。
2. **收盤價/漲跌**：收盤價 26px/800；漲跌幅 `▲ +x.xx%`(紅) / `▼ -x.xx%`(綠) / `— 0.00%`。
3. **法人連買**：`連買 N 天`，N 用 26px 紅字。
4. **買超/成交量**：`買超張數 張`(22px/800) + 小字「量 X 張」。
5. **董監持股**：`xx.x%`(22px) + 月份小字；若月份非最新（`directorDataMonthLatest`），顯示 `⚠ YYYY-MM・資料較舊`(琥珀)。
6. **看原因按鈕**：寬 100%，高 48px，主色描邊；展開時轉實心 + 箭頭旋轉。

手機（容器 ≤720px）：`.srow-main` 改 `grid-template-columns: 1fr 1fr`；名稱欄 `grid-column: 1/-1`；數字格各自帶 `.col-label` 標籤、上方細分隔線；按鈕 `grid-column: 1/-1`。

**展開區（.reasons）**：每組 = 徽章 + 「為什麼符合季線/月線型」標題 + **MaLine** + **原因清單**。
- **MaLine**：`季線(60MA) 154.6 ・ 距均線 +9.0% ・ 狀態 ↑已上彎 / ↗扣抵向上`。
- 原因清單：每條 `[✓ 綠圓圈 26px] + 文字(18px)`。
- 顯示哪幾組依分頁：A 分頁只季線、B 分頁只月線、A+B 與全部分頁的 A+B 列同時顯示兩組（`.reasons.two` 兩欄，容器 ≤640px 轉單欄）。

### EmptyState
- 置中，🔍 48px + 「今日無<分類>的股票」(宋體 21px) + 引導文「可試著調低 N 或 X% …」。

### Footer
- 免責摘要：本工具僅為個人選股資訊整理，不構成投資建議；資料可能延遲/缺漏。15px。

---

## Interactions & Behavior
- **調 N / X**：即時重跑 `runFilter` → 統計、清單、原因句中的門檻數字同步更新。
- **分頁切換**：過濾顯示的列，並決定展開時顯示哪組均線原因。
- **排序**：見 SortBar 選項；預設綜合（A+B 優先 → 連買天數 → 買超）。
- **看原因**：每列獨立展開/收合（以 stockId 記錄於 `open` map）。
- **響應式**：以 `.app` 容器寬度切換（720px 表格→卡片、640px 雙欄原因→單欄、560px 參數雙欄→單欄）。
- 展開區**不要用 opacity 進場動畫**（會在截圖/列印/reduced-motion 下隱藏內容）。

## States（StatusBar 五態 + 清單空態，務必全做）
1. **success**：`✅ 今日已更新 ・ 資料日期 2026-06-09`（tone=ok 綠）。
2. **stale 未更新**：`⚠️ 今日尚未更新（沿用 2026-06-06 資料）`（tone=warn 琥珀）；顯示日期改用 `lastSuccessDate`。
3. **partial 部分成功**：success 主訊息 + 琥珀子標 `⚠️ 董監資料沿用 2026-04 月份`。
4. **failed 更新失敗**：`⛔ 今日更新失敗（顯示為上次成功資料 2026-06-06）`（tone=bad 紅）；日期用 `lastSuccessDate`。
5. **empty 空清單**：某分頁/某參數下 0 檔 → EmptyState（友善引導）。

## State Management
- `scenario`（success/stale/partial/failed/empty，正式版由後端 jobStatus 決定）、`n`、`x`、`tab`（all/A/B/AB）、`sort`、`open`（展開 map）。
- 資料：正式版 `fetch('/api/snapshots/latest')` → `signals[]` → `runFilter(signals,{n,x})` 產出 `rows` 與 `summary`。

## Design Logic（可直接移植 — 見 data.js）
- `runFilter(rows,{n,x})`：A/B 結構候選 × `instBuyStreak >= n` × `directorHoldingPct >= x`，產 `tag` 與 `summary{total,countA,countB,countAB}`。N/X 只「收緊」結果。
- `sortRows(rows,key)`、`fmt`（千分位、價格小數、漲跌幅±）、`isStaleDirectorMonth`、`trendShort/trendText`、`reasonsFor`。

## Design Tokens（見 styles.css `:root`；三種皮膚由 `[data-skin=paper|bold]` 覆寫）
- **字體**：`--font-serif: Noto Serif TC`（股名/標題）、`--font-sans: Noto Sans TC`（內文/數字，`tabular-nums`）。
- **字級**：display 30 / num-xl 26 / num-lg 22 / title 21 / body 18 / meta 16 / small 15。
- **間距**：4 / 8 / 12 / 16 / 20 / 24 / 32 / 40。
- **圓角**：card 16、ctrl 12、pill 999（paper 皮膚 6px）。
- **價格色**：漲 `--up #c0282d`、跌 `--down #1d7a45`。
- **狀態色**：ok `#15803d`、warn `#a65a00`、bad `#b3261e`（各含 -bg / -bd）。
- **主色**：`--accent #1d4ed8`（可換）。
- **觸控**：`--hit 48px`。

## Assets
無圖檔。圖示使用 emoji（✅⚠️⛔🔍）與幾何符號（▲▼✓ ↑↗ ★）。字體用 Google Fonts：Noto Serif TC + Noto Sans TC。請改用你 repo 的字體載入方式與既有 icon set。

## Files
- `台股選股器.html` — 入口，載入 React/Babel 與下列腳本。
- `data.js` — 資料 + `runFilter`/`sortRows`/`fmt`（可直接移植）。
- `styles.css` — design tokens + 三種皮膚 + 響應式（容器查詢）。
- `components.jsx` — 所有 UI 元件。
- `App.jsx` — 狀態管理、分頁、排序、展開、皮膚切換。
- `tweaks-panel.jsx` — 原型用的可調面板，正式版不需要。
