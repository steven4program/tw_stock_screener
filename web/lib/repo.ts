// web/lib/repo.ts — server-only
import { getSupabase } from './supabase';
import type { PriceRow, InstRow } from './marketdata';
import type { DirectorHolding } from './director/ingest';
import type { StockSignal } from './types';

const CHUNK = 1000;
async function upsertChunked<T>(table: string, rows: T[], onConflict: string): Promise<void> {
  const db = getSupabase();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + CHUNK) as object[], { onConflict });
    if (error) throw new Error(`upsert ${table} 失敗：${error.message}`);
  }
}

export async function upsertPrices(rows: PriceRow[]): Promise<void> {
  await upsertChunked('stock_price_history',
    rows.map((r) => ({ stock_id: r.stockId, trade_date: r.tradeDate, open: r.open, high: r.high, low: r.low, close: r.close, volume_lots: r.volumeLots })),
    'stock_id,trade_date');
}

export async function upsertInstitutional(rows: InstRow[]): Promise<void> {
  await upsertChunked('institutional_daily',
    rows.map((r) => ({ stock_id: r.stockId, trade_date: r.tradeDate, net_lots: r.netLots })),
    'stock_id,trade_date');
}

export async function upsertDirectors(rows: DirectorHolding[]): Promise<void> {
  await upsertChunked('director_holdings_monthly',
    rows.map((r) => ({ stock_id: r.stockId, data_month: r.dataMonth, director_holding_pct: r.pct })),
    'stock_id,data_month');
}

// ⚠️ PostgREST/Supabase 單次 select 預設最多回 1000 列。全市場視窗（~1800×70 ≈ 12.6 萬列）
// 必須分頁，否則會「靜默只拿到 1000 列」。以 range 迴圈分頁取全部。
async function selectAllPaged<T>(build: () => any): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(`分頁讀取失敗：${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** 由 asOf 往前 calendarDays 天的日期（YYYY-MM-DD），作為查詢下限以免全表掃描。 */
function floorDate(asOf: string, calendarDays: number): string {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - calendarDays);
  return d.toISOString().slice(0, 10);
}

/** DB 中某表在 [from, asOf] 已存在的交易日集合（用於只回補缺日）。 */
export async function existingDates(
  table: 'stock_price_history' | 'institutional_daily', from: string, asOf: string,
): Promise<Set<string>> {
  const rows = await selectAllPaged<{ trade_date: string }>(() =>
    getSupabase().from(table).select('trade_date').gte('trade_date', from).lte('trade_date', asOf).order('trade_date', { ascending: true }));
  return new Set(rows.map((r) => r.trade_date));
}

/** 某交易日各檔成交量（張）。 */
export async function readDayVolumes(date: string): Promise<Map<string, number>> {
  const rows = await selectAllPaged<{ stock_id: string; volume_lots: number }>(() =>
    getSupabase().from('stock_price_history').select('stock_id, volume_lots').eq('trade_date', date));
  return new Map(rows.map((r) => [r.stock_id, Number(r.volume_lots)]));
}

/** 讀「截至 asOf（含）最近 limitDays 個交易日」的收盤；時間升冪。 */
export async function readPriceWindow(asOf: string, limitDays: number): Promise<Map<string, { date: string; close: number }[]>> {
  const from = floorDate(asOf, Math.ceil(limitDays * 1.9)); // 70 交易日 ≈ 130 日曆日，留緩衝
  const rows = await selectAllPaged<{ stock_id: string; trade_date: string; close: number }>(() =>
    getSupabase().from('stock_price_history').select('stock_id, trade_date, close').gte('trade_date', from).lte('trade_date', asOf).order('trade_date', { ascending: true }));
  const m = new Map<string, { date: string; close: number }[]>();
  for (const r of rows) {
    const arr = m.get(r.stock_id) ?? [];
    arr.push({ date: r.trade_date, close: Number(r.close) });
    m.set(r.stock_id, arr);
  }
  for (const [id, arr] of m) m.set(id, arr.slice(-limitDays));
  return m;
}

export async function readInstWindow(asOf: string, limitDays: number): Promise<Map<string, { date: string; netLots: number }[]>> {
  const from = floorDate(asOf, Math.ceil(limitDays * 1.9));
  const rows = await selectAllPaged<{ stock_id: string; trade_date: string; net_lots: number }>(() =>
    getSupabase().from('institutional_daily').select('stock_id, trade_date, net_lots').gte('trade_date', from).lte('trade_date', asOf).order('trade_date', { ascending: true }));
  const m = new Map<string, { date: string; netLots: number }[]>();
  for (const r of rows) {
    const arr = m.get(r.stock_id) ?? [];
    arr.push({ date: r.trade_date, netLots: Number(r.net_lots) });
    m.set(r.stock_id, arr);
  }
  for (const [id, arr] of m) m.set(id, arr.slice(-limitDays));
  return m;
}

/** 每檔最新可得月份的董監持股（升冪掃描 → 最後寫入者為最新月份）。 */
export async function readLatestDirectors(): Promise<Map<string, { pct: number; dataMonth: string }>> {
  const rows = await selectAllPaged<{ stock_id: string; data_month: string; director_holding_pct: number }>(() =>
    getSupabase().from('director_holdings_monthly').select('stock_id, data_month, director_holding_pct').order('data_month', { ascending: true }));
  const m = new Map<string, { pct: number; dataMonth: string }>();
  for (const r of rows) m.set(r.stock_id, { pct: Number(r.director_holding_pct), dataMonth: r.data_month });
  return m;
}

export async function writeSignals(rows: StockSignal[]): Promise<void> {
  await upsertChunked('daily_stock_signals',
    rows.map((s) => ({
      data_date: s.dataDate, stock_id: s.stockId, stock_name: s.stockName, market: s.market,
      close: s.close, change_ratio: s.changeRatio, volume_lots: s.volumeLots,
      inst_net_lots: s.instNetLots, inst_buy_streak: s.instBuyStreak,
      director_holding_pct: s.directorHoldingPct, director_data_month: s.directorDataMonth,
      ma20: s.ma20, ma20_prev: s.ma20Prev, ma20_holdflat_5d: s.ma20Holdflat5d,
      ma60: s.ma60, ma60_prev: s.ma60Prev, ma60_holdflat_5d: s.ma60Holdflat5d,
      dist_ma20_ratio: s.distMa20Ratio, dist_ma60_ratio: s.distMa60Ratio,
      eligible_a: s.eligibleA, eligible_b: s.eligibleB,
      exclude_reason_a: s.excludeReasonA, exclude_reason_b: s.excludeReasonB,
    })),
    'data_date,stock_id');
}

/** 最新「成功/部分成功」快照的資料日期（無則 null）。 */
export async function latestSnapshotDate(): Promise<string | null> {
  const db = getSupabase();
  const { data, error } = await db
    .from('job_runs')
    .select('data_date')
    .in('status', ['success', 'partial_success'])
    .not('data_date', 'is', null)
    .order('data_date', { ascending: false })
    .limit(1);
  if (error) throw new Error(`latestSnapshotDate 失敗：${error.message}`);
  return data && data.length ? (data[0].data_date as string) : null;
}
