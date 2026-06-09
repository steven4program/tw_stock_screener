// web/lib/finmind-normalize.ts
import type { Market } from './types';

export interface RawPrice { date: string; stock_id: string; open: number; max: number; min: number; close: number; Trading_Volume: number; }
export interface RawInst { date: string; stock_id: string; name: string; buy: number; sell: number; }
export interface RawInfo { stock_id: string; stock_name: string; type: string; }

export interface PriceRow { stockId: string; tradeDate: string; open: number; high: number; low: number; close: number; volumeLots: number; }
export interface InstRow { stockId: string; tradeDate: string; netLots: number; }

export function normalizePrice(rows: RawPrice[]): PriceRow[] {
  return rows.map((r) => ({
    stockId: r.stock_id, tradeDate: r.date,
    open: r.open, high: r.max, low: r.min, close: r.close,
    volumeLots: r.Trading_Volume / 1000,
  }));
}

/** long 格式：同 (stock_id, date) 多列（各法人類別），合計 Σ(buy-sell)/1000 = 三大法人合計買超（張）。
 *  FinMind 實際回傳的 name 欄位值：Foreign_Investor, Foreign_Dealer_Self, Investment_Trust,
 *  Dealer_self, Dealer_Hedging — 剛好就是三大法人全部，無預加總列，直接全加即正確。
 */
export function normalizeInstitutional(rows: RawInst[]): InstRow[] {
  const acc = new Map<string, { stockId: string; tradeDate: string; netShares: number }>();
  for (const r of rows) {
    const key = `${r.stock_id}|${r.date}`;
    const cur = acc.get(key) ?? { stockId: r.stock_id, tradeDate: r.date, netShares: 0 };
    cur.netShares += (r.buy - r.sell);
    acc.set(key, cur);
  }
  return [...acc.values()].map((v) => ({ stockId: v.stockId, tradeDate: v.tradeDate, netLots: v.netShares / 1000 }));
}

export function normalizeStockInfo(rows: RawInfo[]): Map<string, { stockName: string; market: Market }> {
  const m = new Map<string, { stockName: string; market: Market }>();
  for (const r of rows) {
    const market: Market | null = r.type === 'twse' ? 'TWSE' : r.type === 'tpex' ? 'TPEx' : null;
    if (!market) continue;
    if (!m.has(r.stock_id)) m.set(r.stock_id, { stockName: r.stock_name, market });
  }
  return m;
}
