// web/lib/filter.ts
import type { StockSignal, FilterParams, MarketFilter, Tag, FilterRow, FilterSummary } from './types';

const BAND_MIN = 0;
const BAND_MAX = 0.10;

function maTurningUp(ma: number | null, maPrev: number | null, maHoldflat: number | null): boolean {
  if (ma === null) return false;
  const turnedUp = maPrev !== null && ma > maPrev;
  const carryUp = maHoldflat !== null && maHoldflat > ma;
  return turnedUp || carryUp;
}

function inBand(dist: number | null): boolean {
  return dist !== null && dist >= BAND_MIN && dist <= BAND_MAX;
}

export function matchesA(s: StockSignal, p: FilterParams): boolean {
  if (!s.eligibleA) return false;
  return (
    s.instBuyStreak >= p.n &&
    s.directorHoldingPct !== null && s.directorHoldingPct >= p.x &&
    maTurningUp(s.ma60, s.ma60Prev, s.ma60Holdflat5d) &&
    inBand(s.distMa60Ratio)
  );
}

export function matchesB(s: StockSignal, p: FilterParams): boolean {
  if (!s.eligibleB) return false;
  return (
    s.instBuyStreak >= p.n &&
    s.directorHoldingPct !== null && s.directorHoldingPct >= p.x &&
    maTurningUp(s.ma20, s.ma20Prev, s.ma20Holdflat5d) &&
    inBand(s.distMa20Ratio)
  );
}
function pct1(ratio: number): string {
  return (ratio * 100).toFixed(1);
}

function streakReason(s: StockSignal, p: FilterParams): string {
  return `三大法人連買 ${s.instBuyStreak} 天（門檻 ≥ ${p.n} 天）`;
}

function directorReason(s: StockSignal, p: FilterParams): string {
  const v = s.directorHoldingPct ?? 0;
  return `董監持股 ${v.toFixed(1)}%，達門檻 ${p.x}%`;
}

function bandReason(distRatio: number | null, lineName: string): string {
  return `股價在${lineName}上方 ${pct1(distRatio ?? 0)}%（位於 0~10% 區間）`;
}

function maStateReason(
  ma: number | null, maPrev: number | null, maHoldflat: number | null, lineName: string,
): string {
  if (maPrev !== null && ma !== null && ma > maPrev) return `${lineName}已上彎`;
  return `${lineName} 5 個交易日內扣抵向上`;
}

export function reasonsForA(s: StockSignal, p: FilterParams): string[] {
  return [
    streakReason(s, p),
    directorReason(s, p),
    bandReason(s.distMa60Ratio, '季線'),
    maStateReason(s.ma60, s.ma60Prev, s.ma60Holdflat5d, '季線'),
  ];
}

export function reasonsForB(s: StockSignal, p: FilterParams): string[] {
  return [
    streakReason(s, p),
    directorReason(s, p),
    bandReason(s.distMa20Ratio, '月線'),
    maStateReason(s.ma20, s.ma20Prev, s.ma20Holdflat5d, '月線'),
  ];
}
export type ManualSortKey = 'streak' | 'dist' | 'buyLots' | 'volume' | 'director';
export type SortDir = 'asc' | 'desc';

const FAR = Number.POSITIVE_INFINITY;

function sortDist(row: FilterRow): number {
  const a = row.signal.distMa60Ratio;
  const b = row.signal.distMa20Ratio;
  if (row.tag === 'A') return a ?? FAR;
  if (row.tag === 'B') return b ?? FAR;
  return Math.min(a ?? FAR, b ?? FAR); // A+B 取較近
}

function tagRank(tag: Tag): number {
  return tag === 'A+B' ? 0 : 1;
}

/** 綜合排序：A+B 優先 → 連買天數多 → 距均線近 → 買超張數多。 */
function compositeCompare(p: FilterRow, q: FilterRow): number {
  return (
    tagRank(p.tag) - tagRank(q.tag) ||
    q.signal.instBuyStreak - p.signal.instBuyStreak ||
    sortDist(p) - sortDist(q) ||
    q.signal.instNetLots - p.signal.instNetLots
  );
}

export function summarize(rows: FilterRow[]): FilterSummary {
  return {
    total: rows.length,
    countA: rows.filter((r) => r.matchA).length,
    countB: rows.filter((r) => r.matchB).length,
    countAB: rows.filter((r) => r.matchA && r.matchB).length,
  };
}

export function runFilter(
  signals: StockSignal[],
  p: FilterParams,
  market: MarketFilter = 'all',
): { rows: FilterRow[]; summary: FilterSummary } {
  const pool = market === 'all' ? signals : signals.filter((s) => s.market === market);
  const rows: FilterRow[] = [];
  for (const s of pool) {
    const matchA = matchesA(s, p);
    const matchB = matchesB(s, p);
    if (!matchA && !matchB) continue;
    const tag: Tag = matchA && matchB ? 'A+B' : matchA ? 'A' : 'B';
    rows.push({
      signal: s, tag, matchA, matchB,
      reasonsA: matchA ? reasonsForA(s, p) : [],
      reasonsB: matchB ? reasonsForB(s, p) : [],
    });
  }
  rows.sort(compositeCompare);
  return { rows, summary: summarize(rows) };
}

export function manualSort(rows: FilterRow[], key: ManualSortKey, dir: SortDir): FilterRow[] {
  const val = (r: FilterRow): number => {
    switch (key) {
      case 'streak': return r.signal.instBuyStreak;
      case 'dist': return sortDist(r);
      case 'buyLots': return r.signal.instNetLots;
      case 'volume': return r.signal.volumeLots;
      case 'director': return r.signal.directorHoldingPct ?? FAR;
    }
  };
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => sign * (val(a) - val(b)));
}
