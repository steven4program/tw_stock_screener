// web/lib/finmind.ts — server-only
import { env } from './env';
import {
  normalizePrice, normalizeInstitutional, normalizeStockInfo,
  type RawPrice, type RawInst, type RawInfo, type PriceRow, type InstRow,
} from './finmind-normalize';
import type { Market } from './types';

const BASE = 'https://api.finmindtrade.com/api/v4/data';

async function fetchDataset<T>(params: Record<string, string>): Promise<T[]> {
  const u = new URL(BASE);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('token', env.finmindToken());
  const res = await fetch(u);
  const json = (await res.json()) as { msg?: string; status?: number; data?: T[] };
  if (json.status !== 200 || !Array.isArray(json.data)) {
    throw new Error(`FinMind ${params.dataset} 失敗：status=${json.status} msg=${json.msg}`);
  }
  return json.data;
}

export async function latestTradeDate(): Promise<string> {
  const start = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
  const rows = await fetchDataset<RawPrice>({ dataset: 'TaiwanStockPrice', data_id: '2330', start_date: start });
  const dates = rows.map((r) => r.date).sort();
  if (dates.length === 0) throw new Error('FinMind 無法取得最新交易日（2330 近兩週無資料）');
  return dates[dates.length - 1];
}

/** 在 [from, to] 之間 2330 實際有交易的日期（升冪）。 */
export async function tradingDaysInRange(from: string, to: string): Promise<string[]> {
  const rows = await fetchDataset<RawPrice>({ dataset: 'TaiwanStockPrice', data_id: '2330', start_date: from, end_date: to });
  return rows.map((r) => r.date).sort();
}

export async function fetchPrices(date: string): Promise<PriceRow[]> {
  return normalizePrice(await fetchDataset<RawPrice>({ dataset: 'TaiwanStockPrice', start_date: date, end_date: date }));
}

export async function fetchInstitutional(date: string): Promise<InstRow[]> {
  return normalizeInstitutional(
    await fetchDataset<RawInst>({ dataset: 'TaiwanStockInstitutionalInvestorsBuySell', start_date: date, end_date: date }),
  );
}

export async function fetchStockInfo(): Promise<Map<string, { stockName: string; market: Market }>> {
  return normalizeStockInfo(await fetchDataset<RawInfo>({ dataset: 'TaiwanStockInfo' }));
}
