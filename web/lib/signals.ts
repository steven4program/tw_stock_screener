// web/lib/signals.ts
import type { SignalInput, StockSignal, ExcludeReason } from './types';

/** 時間升冪陣列，取「結尾往前位移 offsetFromEnd 格」結束的 window 筆平均；不足回 null。
 *  offset 0 ＝最新一筆結尾（含今日）；offset 1 ＝昨日結尾。 */
export function sma(closes: number[], window: number, offsetFromEnd = 0): number | null {
  const end = closes.length - offsetFromEnd; // 不含
  const start = end - window;
  if (start < 0 || end > closes.length) return null;
  let sum = 0;
  for (let i = start; i < end; i++) sum += closes[i];
  return sum / window;
}

/** 扣抵後均線：(Σ 最後 (window - simDays) 筆 + simDays × 今日收盤) / window；不足回 null。 */
export function holdflat(closes: number[], window: number, simDays = 5): number | null {
  if (closes.length < window) return null;
  const today = closes[closes.length - 1];
  const keep = window - simDays;
  let sum = simDays * today;
  const keepEnd = closes.length - 1; // exclude today
  const keepStart = keepEnd - keep;
  for (let i = keepStart; i < keepEnd; i++) sum += closes[i];
  return sum / window;
}

/** 三大法人合計連續買超天數：從最新往前數，遇 null 或 <=0 中斷。 */
export function buyStreak(instNetLots: (number | null)[]): number {
  let streak = 0;
  for (let i = instNetLots.length - 1; i >= 0; i--) {
    const v = instNetLots[i];
    if (v !== null && v > 0) streak++;
    else break;
  }
  return streak;
}

/** 漲跌幅（小數比例），相對前一交易日收盤；不足兩筆回 null。 */
export function changeRatio(closes: number[]): number | null {
  if (closes.length < 2) return null;
  const today = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  if (prev === 0) return null;
  return (today - prev) / prev;
}

const SIM_DAYS = 5;

export function computeSignals(input: SignalInput): StockSignal {
  const { closes } = input;
  const close = closes[closes.length - 1];

  const ma20 = sma(closes, 20, 0);
  const ma20Prev = sma(closes, 20, 1);
  const ma20Holdflat5d = holdflat(closes, 20, SIM_DAYS);
  const ma60 = sma(closes, 60, 0);
  const ma60Prev = sma(closes, 60, 1);
  const ma60Holdflat5d = holdflat(closes, 60, SIM_DAYS);

  const distMa20Ratio = ma20 !== null ? (close - ma20) / ma20 : null;
  const distMa60Ratio = ma60 !== null ? (close - ma60) / ma60 : null;

  const hasDirector = input.directorHoldingPct !== null;
  const has60 = closes.length >= 60;
  const has20 = closes.length >= 20;

  const excludeReasonA: ExcludeReason | null = !hasDirector
    ? 'missing_director'
    : !has60
      ? 'insufficient_history_60'
      : null;
  const excludeReasonB: ExcludeReason | null = !hasDirector
    ? 'missing_director'
    : !has20
      ? 'insufficient_history_20'
      : null;

  const todayInst = input.instNetLots[input.instNetLots.length - 1] ?? 0;

  return {
    dataDate: input.dataDate,
    stockId: input.stockId,
    stockName: input.stockName,
    market: input.market,
    close,
    changeRatio: changeRatio(closes),
    volumeLots: input.volumeLots,
    instNetLots: todayInst,
    instBuyStreak: buyStreak(input.instNetLots),
    directorHoldingPct: input.directorHoldingPct,
    directorDataMonth: input.directorDataMonth,
    ma20, ma20Prev, ma20Holdflat5d,
    ma60, ma60Prev, ma60Holdflat5d,
    distMa20Ratio, distMa60Ratio,
    eligibleA: hasDirector && has60,
    eligibleB: hasDirector && has20,
    excludeReasonA,
    excludeReasonB,
  };
}
