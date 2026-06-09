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
