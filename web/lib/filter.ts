// web/lib/filter.ts
import type { StockSignal, FilterParams, Tag, FilterRow, FilterSummary } from './types';

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

// 追加到 web/lib/filter.ts
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
