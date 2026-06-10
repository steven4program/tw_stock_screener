// web/components/screener/StockList.tsx
import type { FilterRow } from '@/lib/types';
import type { Tab } from './types';
import { StockItem } from './StockItem';

export function StockList({ rows, tab, open, onToggle, directorDataMonthLatest }: {
  rows: FilterRow[]; tab: Tab; open: Record<string, boolean>;
  onToggle: (id: string) => void; directorDataMonthLatest: string | null;
}) {
  return (
    <div className="list" role="list">
      {rows.map((row) => (
        <StockItem key={row.signal.stockId} row={row} tab={tab}
          expanded={!!open[row.signal.stockId]} onToggle={() => onToggle(row.signal.stockId)}
          directorDataMonthLatest={directorDataMonthLatest} />
      ))}
    </div>
  );
}
