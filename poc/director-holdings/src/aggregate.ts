import type { DirectorRow } from './types';

/** 全體董監持股比率 = Σ 董監目前持股 ÷ 已發行股數 × 100 */
export function aggregateByShares(rows: DirectorRow[], outstandingShares: number): number {
  if (!(outstandingShares > 0)) throw new Error('outstandingShares must be > 0');
  const total = rows.reduce((s, r) => s + r.currentShares, 0);
  return (total / outstandingShares) * 100;
}

/** 若來源已提供每位董監的持股比率(%)，加總即為全體比率 */
export function aggregateByRatios(ratiosPct: number[]): number {
  return ratiosPct.reduce((s, r) => s + r, 0);
}
