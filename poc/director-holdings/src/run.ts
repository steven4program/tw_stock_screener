// src/run.ts
// 用法：DATA_MONTH=2026-04 npx tsx src/run.ts
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseDirectorRows } from './sources/datagov';
import { aggregateByShares } from './aggregate';
import type { DirectorHoldingResult } from './types';

type Market = 'TWSE' | 'TPEx';
const SAMPLES: { id: string; name: string; market: Market }[] = [
  { id: '2330', name: '台積電', market: 'TWSE' },
  { id: '2317', name: '鴻海', market: 'TWSE' },
  { id: '9921', name: '巨大', market: 'TWSE' },
  { id: '5371', name: '中光電', market: 'TPEx' },
  { id: '6488', name: '環球晶', market: 'TPEx' },
];

const DATA_MONTH = process.env.DATA_MONTH ?? ''; // 對齊 fixture 資料年月，例 '2026-04'
if (!DATA_MONTH) throw new Error('請以 DATA_MONTH=YYYY-MM 執行，對齊 fixture 的資料年月');

// 兩市場皆採 datagov/OpenAPI 明細（parseDirectorRows 已對齊 MOPS 全體董監持股）。
// 基本資料 schema 兩市場不同：TWSE 中文欄名、TPEx 英文欄名。
const CODE_COL: Record<Market, string> = { TWSE: '公司代號', TPEx: 'SecuritiesCompanyCode' };
const SHARES_COL: Record<Market, string> = { TWSE: '已發行普通股數或TDR原股發行股數', TPEx: 'IssueShares' };

const detailCsv: Record<Market, string> = {
  TWSE: readFileSync(new URL('../fixtures/datagov-listed.csv', import.meta.url), 'utf8'),
  TPEx: readFileSync(new URL('../fixtures/datagov-otc.csv', import.meta.url), 'utf8'),
};
const basic: Record<Market, Record<string, unknown>[]> = {
  TWSE: JSON.parse(readFileSync(new URL('../out/twse-basic.raw', import.meta.url), 'utf8')),
  TPEx: JSON.parse(readFileSync(new URL('../out/tpex-basic.raw', import.meta.url), 'utf8')),
};

function outstandingShares(market: Market, id: string): number {
  const co = basic[market].find((x) => String(x[CODE_COL[market]]).trim() === id);
  if (!co) throw new Error(`${market} 基本資料缺 ${id}`);
  const shares = Number(String(co[SHARES_COL[market]] ?? '').replace(/,/g, ''));
  if (!(shares > 0)) throw new Error(`${market} ${id} 已發行股數讀取失敗（欄位 ${SHARES_COL[market]}）`);
  return shares;
}

const results: DirectorHoldingResult[] = SAMPLES.map((s) => {
  const rows = parseDirectorRows(detailCsv[s.market], s.id);
  if (rows.length === 0) throw new Error(`${s.market} ${s.id} 明細無董監列`);
  const pct = aggregateByShares(rows, outstandingShares(s.market, s.id));
  return {
    stockId: s.id, stockName: s.name, market: s.market,
    dataMonth: DATA_MONTH, directorHoldingPct: Number(pct.toFixed(2)), method: 'shares',
  };
});

mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
const header = 'stock_id,stock_name,market,data_month,director_holding_pct,method';
const body = results
  .map((r) => `${r.stockId},${r.stockName},${r.market},${r.dataMonth},${r.directorHoldingPct},${r.method}`)
  .join('\n');
writeFileSync(new URL('../out/director-holdings-sample.csv', import.meta.url), `${header}\n${body}\n`);
console.table(results);
