// web/components/screener/types.ts
import type { ManualSortKey, SortDir } from '@/lib/filter';

export const FIXED = { distLow: 0, distHigh: 10, ma20: 20, ma60: 60, holdflatDays: 5 } as const;

export type Tab = 'all' | 'A' | 'B' | 'AB';
export type SortKey = 'composite' | ManualSortKey;

/** Per-key sort direction (matches prototype data.js). dist ascending = closer first. */
export const SORT_DIR: Record<ManualSortKey, SortDir> = {
  dist: 'asc', streak: 'desc', buyLots: 'desc', volume: 'desc', director: 'desc',
};

export const SORT_OPTIONS: [SortKey, string][] = [
  ['composite', '綜合排序'], ['streak', '連買天數'], ['dist', '距均線%'],
  ['buyLots', '買超張數'], ['volume', '成交量'], ['director', '董監持股%'],
];
