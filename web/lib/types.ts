// web/lib/types.ts
export type Market = 'TWSE' | 'TPEx';

export type ExcludeReason =
  | 'insufficient_history_60'
  | 'insufficient_history_20'
  | 'missing_director';

/** 訊號計算的原始輸入（門檻無關）。closes 與 instNetLots 皆為「時間升冪」，最後一筆為最新交易日。 */
export interface SignalInput {
  stockId: string;
  stockName: string;
  market: Market;
  dataDate: string;                 // 最新交易日 'YYYY-MM-DD'
  closes: number[];                 // 收盤價，時間升冪，最後一筆＝今日 c[t]；長度 ≥ 1
  volumeLots: number;               // 今日成交量（張）
  instNetLots: (number | null)[];   // 三大法人合計買超（張），時間升冪；null＝當日無資料（未交易）
  directorHoldingPct: number | null;
  directorDataMonth: string | null; // 採用的董監資料月份，如 '2026-05'
}

/** 門檻無關的當日快照（對應 daily_stock_signals 的衍生欄位）。 */
export interface StockSignal {
  dataDate: string;
  stockId: string;
  stockName: string;
  market: Market;
  close: number;
  changeRatio: number | null;        // (close - 前一交易日收盤)/前一交易日收盤；無前一日為 null
  volumeLots: number;
  instNetLots: number;               // 今日三大法人合計買超（張）
  instBuyStreak: number;             // 連續買超天數（>0 連續）
  directorHoldingPct: number | null;
  directorDataMonth: string | null;
  ma20: number | null;
  ma20Prev: number | null;
  ma20Holdflat5d: number | null;
  ma60: number | null;
  ma60Prev: number | null;
  ma60Holdflat5d: number | null;
  distMa20Ratio: number | null;
  distMa60Ratio: number | null;
  eligibleA: boolean;
  eligibleB: boolean;
  excludeReasonA: ExcludeReason | null;
  excludeReasonB: ExcludeReason | null;
}

/** 篩選參數（使用者可調）。 */
export interface FilterParams {
  n: number; // 三大法人連買天數門檻（整數 1–10）
  x: number; // 董監持股 % 門檻（5–50）
}

export type Tag = 'A' | 'B' | 'A+B';

export interface FilterRow {
  signal: StockSignal;
  tag: Tag;
  matchA: boolean;
  matchB: boolean;
  reasonsA: string[];
  reasonsB: string[];
}

export interface FilterSummary {
  total: number;   // matchA || matchB
  countA: number;  // matchA（含 A+B）
  countB: number;  // matchB（含 A+B）
  countAB: number; // matchA && matchB
}
