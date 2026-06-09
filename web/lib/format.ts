// web/lib/format.ts — pure presentation helpers (no I/O)
export const fmt = {
  int(n: number): string {
    return Math.round(n).toLocaleString('en-US');
  },
  price(n: number): string {
    const d = n >= 100 ? 1 : 2;
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  /** ratio is a decimal (0.09 → "9.0"). NOT for director % (already a percent). */
  pct1(ratio: number): string {
    return (ratio * 100).toFixed(1);
  },
  changePct(ratio: number): string {
    const v = (ratio * 100).toFixed(2);
    return (ratio > 0 ? '+' : '') + v + '%';
  },
};

type MaFields = { ma20: number | null; ma20Prev: number | null; ma60: number | null; ma60Prev: number | null };

export function trendShort(kind: 'A' | 'B', s: MaFields): '已上彎' | '扣抵向上' {
  const ma = kind === 'A' ? s.ma60 : s.ma20;
  const prev = kind === 'A' ? s.ma60Prev : s.ma20Prev;
  return ma !== null && prev !== null && ma > prev ? '已上彎' : '扣抵向上';
}

/** month is older than the latest available director month. latest = max(directorDataMonth). */
export function isStaleDirectorMonth(month: string | null, latest: string | null): boolean {
  return month !== null && latest !== null && month < latest;
}
