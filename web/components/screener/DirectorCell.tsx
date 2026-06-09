// web/components/screener/DirectorCell.tsx
import type { StockSignal } from '@/lib/types';
import { isStaleDirectorMonth } from '@/lib/format';

export function DirectorCell({ sig, directorDataMonthLatest }: {
  sig: StockSignal; directorDataMonthLatest: string | null;
}) {
  const stale = isStaleDirectorMonth(sig.directorDataMonth, directorDataMonthLatest);
  return (
    <div className="cell director m-cell">
      <span className="col-label">董監持股</span>
      <div className="c-num num">{sig.directorHoldingPct !== null ? sig.directorHoldingPct.toFixed(1) : '—'}%</div>
      <div className="c-sub num">
        {stale
          ? <span className="director-stale">⚠ {sig.directorDataMonth}・資料較舊</span>
          : <span>{sig.directorDataMonth}</span>}
      </div>
    </div>
  );
}
