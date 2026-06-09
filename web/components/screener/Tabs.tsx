// web/components/screener/Tabs.tsx
import type { FilterSummary } from '@/lib/types';
import type { Tab } from './types';

export function Tabs({ tab, onTab, summary }: {
  tab: Tab; onTab: (t: Tab) => void; summary: FilterSummary;
}) {
  const items: [Tab, string, number][] = [
    ['all', '全部', summary.total],
    ['A', 'A 季線型', summary.countA],
    ['B', 'B 月線型', summary.countB],
    ['AB', 'A+B 同時符合', summary.countAB],
  ];
  return (
    <div className="tabs" role="tablist" aria-label="分類">
      {items.map(([k, label, c]) => (
        <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => onTab(k)}>
          {label}<span className="t-count num">{c}</span>
        </button>
      ))}
    </div>
  );
}
