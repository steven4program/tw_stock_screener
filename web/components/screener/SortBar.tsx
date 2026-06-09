// web/components/screener/SortBar.tsx
import type { SortKey } from './types';
import { SORT_OPTIONS } from './types';

export function SortBar({ sort, onSort, count }: {
  sort: SortKey; onSort: (s: SortKey) => void; count: number;
}) {
  return (
    <div className="sortbar">
      <label className="s-label" htmlFor="sortsel">排序</label>
      <select id="sortsel" className="sort-select" value={sort} onChange={(e) => onSort(e.target.value as SortKey)}>
        {SORT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <span className="list-meta num">共 {count} 檔</span>
    </div>
  );
}
