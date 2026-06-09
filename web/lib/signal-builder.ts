// web/lib/signal-builder.ts
import { computeSignals } from './signals';
import type { StockSignal, SignalInput, Market } from './types';

/** 以價格視窗的交易日為基準，對齊法人（缺日 null）。回傳每檔 StockSignal。 */
export function buildSignals(
  dataDate: string,
  stockIds: string[],
  prices: Map<string, { date: string; close: number }[]>,
  inst: Map<string, { date: string; netLots: number }[]>,
  directors: Map<string, { pct: number; dataMonth: string }>,
  info: Map<string, { stockName: string; market: Market }>,
): StockSignal[] {
  const out: StockSignal[] = [];
  for (const stockId of stockIds) {
    const priceRows = prices.get(stockId);
    if (!priceRows || priceRows.length === 0) continue;

    const closes = priceRows.map((p) => p.close);
    const instByDate = new Map((inst.get(stockId) ?? []).map((r) => [r.date, r.netLots]));
    const instNetLots = priceRows.map((p) => (instByDate.has(p.date) ? instByDate.get(p.date)! : null));

    const meta = info.get(stockId);
    const director = directors.get(stockId);
    const input: SignalInput = {
      stockId,
      stockName: meta?.stockName ?? stockId,
      market: meta?.market ?? 'TWSE',
      dataDate,
      closes,
      volumeLots: 0, // 由管線在組裝後另填當日量（見 pipeline；此處不需精確）
      instNetLots,
      directorHoldingPct: director ? director.pct : null,
      directorDataMonth: director ? director.dataMonth : null,
    };
    out.push(computeSignals(input));
  }
  return out;
}
