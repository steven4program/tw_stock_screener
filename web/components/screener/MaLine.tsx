// web/components/screener/MaLine.tsx
import type { StockSignal } from '@/lib/types';
import { fmt, trendShort } from '@/lib/format';

export function MaLine({ kind, sig }: { kind: 'A' | 'B'; sig: StockSignal }) {
  const isA = kind === 'A';
  const name = isA ? '季線(60MA)' : '月線(20MA)';
  const val = isA ? sig.ma60 : sig.ma20;
  const dist = isA ? sig.distMa60Ratio : sig.distMa20Ratio;
  const status = trendShort(kind, sig);
  return (
    <div className="ma-line num">
      <span>{name} <b>{val !== null ? fmt.price(val) : '—'}</b></span>
      <span>距均線 <b>{dist !== null ? `${dist >= 0 ? '+' : ''}${fmt.pct1(dist)}%` : '—'}</b></span>
      <span>狀態 <b>{status === '已上彎' ? '↑ 已上彎' : '↗ 扣抵向上'}</b></span>
    </div>
  );
}
