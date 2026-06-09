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
