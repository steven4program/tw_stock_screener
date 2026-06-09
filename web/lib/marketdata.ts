// web/lib/marketdata.ts — server-only
// Free TWSE/TPEx government endpoints replacing FinMind for daily price + 三大法人.
// All endpoints: public, GET, JSON, no token. Parsing is pure functions; fetch wrappers are thin.
import type { Market } from './types';

export interface PriceRow { stockId: string; tradeDate: string; open: number; high: number; low: number; close: number; volumeLots: number; }
export interface InstRow { stockId: string; tradeDate: string; netLots: number; }

// ── date helpers ──────────────────────────────────────────────────────────
/** ISO 'YYYY-MM-DD' → TWSE 'YYYYMMDD'. */
function isoToTwse(iso: string): string { return iso.replace(/-/g, ''); }
/** ISO 'YYYY-MM-DD' → TPEx 'YYYY/MM/DD'. */
function isoToTpex(iso: string): string { return iso.replace(/-/g, '/'); }
/** ROC date 'YYY/MM/DD' (e.g. '115/06/09') → ISO 'YYYY-MM-DD' (year = roc + 1911). */
export function rocToIso(roc: string): string {
  const [y, m, d] = roc.trim().split('/');
  return `${Number(y) + 1911}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** Parse a comma-formatted number string. Returns NaN for non-numeric ('--', ''). */
function num(v: unknown): number { return Number(String(v).replace(/,/g, '')); }

// ── pure parsers ────────────────────────────────────────────────────────────

interface TwseTable { title?: string; fields?: string[]; data?: unknown[][]; }
interface TwseMiIndex { tables?: TwseTable[]; }
interface TwseFlat { fields?: string[]; data?: unknown[][]; }

/** STOCK_DAY 2330 JSON → ascending ISO trade dates. First column of each row is a ROC date. */
export function parseStockDayDates(json: unknown): string[] {
  const j = json as TwseFlat;
  const rows = j.data ?? [];
  return rows
    .map((r) => rocToIso(String(r[0])))
    .sort();
}

/** MI_INDEX JSON → PriceRow[]. Locates the per-stock table via fields.indexOf('收盤價'). */
export function parseTwsePrices(json: unknown, dateIso: string): PriceRow[] {
  const j = json as TwseMiIndex;
  const table = (j.tables ?? []).find((t) => (t.fields ?? []).includes('收盤價'));
  if (!table || !table.fields || !table.data) return [];
  const f = table.fields;
  const iCode = f.indexOf('證券代號');
  const iOpen = f.indexOf('開盤價');
  const iHigh = f.indexOf('最高價');
  const iLow = f.indexOf('最低價');
  const iClose = f.indexOf('收盤價');
  const iVol = f.indexOf('成交股數');
  const out: PriceRow[] = [];
  for (const r of table.data) {
    const close = num(r[iClose]);
    if (!Number.isFinite(close)) continue; // skip no-trade rows ('--' / '')
    out.push({
      stockId: String(r[iCode]).trim(),
      tradeDate: dateIso,
      open: num(r[iOpen]),
      high: num(r[iHigh]),
      low: num(r[iLow]),
      close,
      volumeLots: num(r[iVol]) / 1000,
    });
  }
  return out;
}

/** T86 JSON (flat) → InstRow[]. Net column = fields.indexOf('三大法人買賣超股數'). */
export function parseTwseInst(json: unknown, dateIso: string): InstRow[] {
  const j = json as TwseFlat;
  const f = j.fields ?? [];
  const data = j.data ?? [];
  const iCode = f.indexOf('證券代號');
  const iNet = f.indexOf('三大法人買賣超股數');
  if (iCode < 0 || iNet < 0) return [];
  const out: InstRow[] = [];
  for (const r of data) {
    const net = num(r[iNet]);
    out.push({
      stockId: String(r[iCode]).trim(),
      tradeDate: dateIso,
      netLots: Number.isFinite(net) ? net / 1000 : 0,
    });
  }
  return out;
}

/** TPEx dailyQuotes JSON → PriceRow[]. Per-stock table[0] '上櫃股票行情'; filter to 4-digit codes. */
export function parseTpexPrices(json: unknown, dateIso: string): PriceRow[] {
  const j = json as TwseMiIndex;
  const table = (j.tables ?? []).find((t) => (t.fields ?? []).includes('收盤'));
  if (!table || !table.fields || !table.data) return [];
  const f = table.fields;
  const iCode = f.indexOf('代號');
  const iOpen = f.indexOf('開盤');
  const iHigh = f.indexOf('最高');
  const iLow = f.indexOf('最低');
  const iClose = f.indexOf('收盤');
  const iVol = f.indexOf('成交股數');
  const out: PriceRow[] = [];
  for (const r of table.data) {
    const code = String(r[iCode]).trim();
    if (!/^\d{4}$/.test(code)) continue; // exclude warrants/6-digit/etc.
    const close = num(r[iClose]);
    if (!Number.isFinite(close)) continue;
    out.push({
      stockId: code,
      tradeDate: dateIso,
      open: num(r[iOpen]),
      high: num(r[iHigh]),
      low: num(r[iLow]),
      close,
      volumeLots: num(r[iVol]) / 1000,
    });
  }
  return out;
}

/** TPEx insti dailyTrade JSON → InstRow[]. Net = single total col '三大法人買賣超股數合計'; 4-digit only. */
export function parseTpexInst(json: unknown, dateIso: string): InstRow[] {
  const j = json as TwseMiIndex;
  const table = (j.tables ?? []).find((t) => (t.fields ?? []).includes('三大法人買賣超股數合計'));
  if (!table || !table.fields || !table.data) return [];
  const f = table.fields;
  const iCode = f.indexOf('代號');
  const iNet = f.indexOf('三大法人買賣超股數合計');
  const out: InstRow[] = [];
  for (const r of table.data) {
    const code = String(r[iCode]).trim();
    if (!/^\d{4}$/.test(code)) continue;
    const net = num(r[iNet]);
    out.push({
      stockId: code,
      tradeDate: dateIso,
      netLots: Number.isFinite(net) ? net / 1000 : 0,
    });
  }
  return out;
}

/** MI_INDEX / dailyQuotes price table → Map<code, name> for stock-info building. */
function parseTwsePriceNames(json: unknown): Map<string, string> {
  const j = json as TwseMiIndex;
  const table = (j.tables ?? []).find((t) => (t.fields ?? []).includes('收盤價'));
  const m = new Map<string, string>();
  if (!table || !table.fields || !table.data) return m;
  const iCode = table.fields.indexOf('證券代號');
  const iName = table.fields.indexOf('證券名稱');
  for (const r of table.data) m.set(String(r[iCode]).trim(), String(r[iName]).trim());
  return m;
}

function parseTpexPriceNames(json: unknown): Map<string, string> {
  const j = json as TwseMiIndex;
  const table = (j.tables ?? []).find((t) => (t.fields ?? []).includes('收盤'));
  const m = new Map<string, string>();
  if (!table || !table.fields || !table.data) return m;
  const iCode = table.fields.indexOf('代號');
  const iName = table.fields.indexOf('名稱');
  for (const r of table.data) {
    const code = String(r[iCode]).trim();
    if (!/^\d{4}$/.test(code)) continue;
    m.set(code, String(r[iName]).trim());
  }
  return m;
}

// ── network wrappers ──────────────────────────────────────────────────────

/** 抓 JSON，含逾時與重試退避。TWSE/TPEx 網站後端常間歇性斷線（undici terminated）。 */
async function getJson(url: string, attempts = 4): Promise<unknown> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`市場資料請求失敗 ${res.status}：${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw new Error(`市場資料重試 ${attempts} 次仍失敗：${url}\n${(lastErr as Error)?.message ?? lastErr}`);
}

const TWSE_MIINDEX = (twseDate: string) =>
  `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${twseDate}&type=ALLBUT0999&response=json`;
const TWSE_T86 = (twseDate: string) =>
  `https://www.twse.com.tw/rwd/zh/fund/T86?date=${twseDate}&selectType=ALLBUT0999&response=json`;
const TPEX_DAILYQUOTES = (tpexDate: string) =>
  `https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date=${tpexDate}&type=Daily&id=&response=json`;
const TPEX_INSTI = (tpexDate: string) =>
  `https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=${tpexDate}&type=Daily&id=&response=json`;
const TWSE_STOCKDAY = (twseMonth: string) =>
  `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=2330&date=${twseMonth}&response=json`;

/** ISO of the most recent published TWSE trading day (from 2330 STOCK_DAY this month). */
export async function latestTradeDate(): Promise<string> {
  const now = new Date();
  const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}01`;
  let dates = parseStockDayDates(await getJson(TWSE_STOCKDAY(month)));
  if (dates.length === 0) {
    // start-of-month edge: fall back to previous month
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const pm = `${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, '0')}01`;
    dates = parseStockDayDates(await getJson(TWSE_STOCKDAY(pm)));
  }
  if (dates.length === 0) throw new Error('無法取得最新交易日（STOCK_DAY 2330 無資料）');
  return dates[dates.length - 1];
}

/** Trading days in [fromIso, toIso] inclusive (ascending), from 2330 STOCK_DAY across covered months. */
export async function tradingDaysInRange(fromIso: string, toIso: string): Promise<string[]> {
  const months = monthsBetween(fromIso, toIso);
  const all: string[] = [];
  for (const m of months) {
    const dates = parseStockDayDates(await getJson(TWSE_STOCKDAY(m)));
    all.push(...dates);
  }
  return all.filter((d) => d >= fromIso && d <= toIso).sort();
}

/** Unique 'YYYYMM01' tokens covering [fromIso, toIso]. */
function monthsBetween(fromIso: string, toIso: string): string[] {
  const [fy, fm] = fromIso.split('-').map(Number);
  const [ty, tm] = toIso.split('-').map(Number);
  const out: string[] = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}${String(m).padStart(2, '0')}01`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Daily prices for both markets merged (TWSE + TPEx) for the given ISO date. */
export async function fetchPrices(dateIso: string): Promise<PriceRow[]> {
  const [twse, tpex] = await Promise.all([
    getJson(TWSE_MIINDEX(isoToTwse(dateIso))),
    getJson(TPEX_DAILYQUOTES(isoToTpex(dateIso))),
  ]);
  return [...parseTwsePrices(twse, dateIso), ...parseTpexPrices(tpex, dateIso)];
}

/** Daily 三大法人 net for both markets merged for the given ISO date. */
export async function fetchInstitutional(dateIso: string): Promise<InstRow[]> {
  const [twse, tpex] = await Promise.all([
    getJson(TWSE_T86(isoToTwse(dateIso))),
    getJson(TPEX_INSTI(isoToTpex(dateIso))),
  ]);
  return [...parseTwseInst(twse, dateIso), ...parseTpexInst(tpex, dateIso)];
}

/** Stock names + market, derived from today's TWSE + TPEx price tables (no FinMind). */
export async function fetchStockInfo(): Promise<Map<string, { stockName: string; market: Market }>> {
  const dateIso = await latestTradeDate();
  const [twse, tpex] = await Promise.all([
    getJson(TWSE_MIINDEX(isoToTwse(dateIso))),
    getJson(TPEX_DAILYQUOTES(isoToTpex(dateIso))),
  ]);
  const m = new Map<string, { stockName: string; market: Market }>();
  for (const [code, name] of parseTwsePriceNames(twse)) m.set(code, { stockName: name, market: 'TWSE' });
  for (const [code, name] of parseTpexPriceNames(tpex)) {
    if (!m.has(code)) m.set(code, { stockName: name, market: 'TPEx' });
  }
  return m;
}
