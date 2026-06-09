// web/components/screener/MarketTabs.tsx
import type { MarketFilter } from '@/lib/types';

const ITEMS: [MarketFilter, string][] = [
  ['all', '全部'], ['TWSE', '上市'], ['TPEx', '上櫃'],
];

export function MarketTabs({ market, onMarket }: {
  market: MarketFilter; onMarket: (m: MarketFilter) => void;
}) {
  return (
    <div className="tabs market-tabs" role="group" aria-label="市場別">
      {ITEMS.map(([k, label]) => (
        <button key={k} aria-pressed={market === k} className="tab" onClick={() => onMarket(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}
