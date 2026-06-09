// web/components/screener/StatsRow.tsx
import type { FilterSummary } from '@/lib/types';

export function StatsRow({ summary }: { summary: FilterSummary }) {
  const items: [string, number, boolean][] = [
    ['全部', summary.total, false],
    ['A 季線型', summary.countA, false],
    ['B 月線型', summary.countB, false],
    ['A+B 同時', summary.countAB, true],
  ];
  return (
    <div className="stats">
      {items.map(([lab, n, ab]) => (
        <div key={lab} className={'stat' + (ab ? ' is-ab' : '')}>
          <div className="s-num num">{n} <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink-2)' }}>檔</span></div>
          <div className="s-lab">{lab}</div>
        </div>
      ))}
    </div>
  );
}
