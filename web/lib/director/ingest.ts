// web/lib/director/ingest.ts — server-only
import { parseDirectorRowsByStock, rocMonthToIso } from './datagov';
import { aggregateByShares } from './aggregate';

const SRC = {
  TWSE: {
    detail: 'https://openapi.twse.com.tw/v1/opendata/t187ap11_L',
    basic: 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',
    codeKey: '公司代號', sharesKey: '已發行普通股數或TDR原股發行股數',
  },
  TPEx: {
    detail: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap11_O',
    basic: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O',
    codeKey: 'SecuritiesCompanyCode', sharesKey: 'IssueShares',
  },
} as const;

export interface DirectorHolding { stockId: string; pct: number; dataMonth: string; }

/** 抓文字含逾時與重試（body 讀取也在重試範圍內；董監明細 CSV 約 3MB，政府端點易斷線）。 */
async function getText(url: string, accept: string, attempts = 4): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: accept, 'User-Agent': 'stock-screener' }, signal: AbortSignal.timeout(45_000) });
      if (!res.ok) throw new Error(`請求失敗 ${res.status}：${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw new Error(`重試 ${attempts} 次仍失敗：${url}\n${(lastErr as Error)?.message ?? lastErr}`);
}

async function getCsv(url: string): Promise<string> {
  const text = await getText(url, 'text/csv');
  if (text.slice(0, 200).toLowerCase().includes('<html')) throw new Error(`董監明細回傳 HTML 而非 CSV：${url}`);
  return text;
}
async function getJson<T>(url: string): Promise<T> {
  return JSON.parse(await getText(url, 'application/json')) as T;
}

export async function ingestMarket(market: 'TWSE' | 'TPEx'): Promise<DirectorHolding[]> {
  const src = SRC[market];
  const [detailCsv, basic] = await Promise.all([getCsv(src.detail), getJson<Record<string, string>[]>(src.basic)]);
  const byStock = parseDirectorRowsByStock(detailCsv);
  const sharesById = new Map<string, number>();
  for (const co of basic) {
    const id = String(co[src.codeKey]).trim();
    const shares = Number(String(co[src.sharesKey] ?? '').replace(/,/g, ''));
    if (id && shares > 0) sharesById.set(id, shares);
  }
  const dataMonth = extractDataMonth(detailCsv);
  const out: DirectorHolding[] = [];
  for (const [stockId, rows] of byStock) {
    const shares = sharesById.get(stockId);
    if (!shares) continue;
    out.push({ stockId, pct: aggregateByShares(rows, shares), dataMonth });
  }
  return out;
}

function extractDataMonth(csv: string): string {
  const lines = csv.split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim());
  const idx = header.indexOf('資料年月');
  if (idx < 0) throw new Error('董監明細缺「資料年月」欄');
  const first = lines.find((l, i) => i > 0 && l.trim().length > 0)!;
  const cell = first.split(',')[idx].replace(/^"|"$/g, '').trim();
  return rocMonthToIso(cell);
}

export async function ingestAllDirectors(): Promise<DirectorHolding[]> {
  const [tw, otc] = await Promise.all([ingestMarket('TWSE'), ingestMarket('TPEx')]);
  return [...tw, ...otc];
}
