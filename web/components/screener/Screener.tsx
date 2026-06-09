// web/components/screener/Screener.tsx
'use client';
import { useMemo, useState } from 'react';
import type { StockSignal, FilterRow, MarketFilter } from '@/lib/types';
import { runFilter, manualSort } from '@/lib/filter';
import type { Tab, SortKey } from './types';
import { SORT_DIR } from './types';
import { ParamPanel } from './ParamPanel';
import { MarketTabs } from './MarketTabs';
import { StatsRow } from './StatsRow';
import { Tabs } from './Tabs';
import { SortBar } from './SortBar';
import { StockList } from './StockList';
import { EmptyState } from './EmptyState';

export function Screener({ signals, dataDate, directorDataMonthLatest }: {
  signals: StockSignal[]; dataDate: string; directorDataMonthLatest: string | null;
}) {
  const [n, setN] = useState(2);
  const [x, setX] = useState(15);
  const [market, setMarket] = useState<MarketFilter>('all');
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<SortKey>('composite');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { rows, summary } = useMemo(() => runFilter(signals, { n, x }, market), [signals, n, x, market]);

  const listRows = useMemo(() => {
    let r: FilterRow[] = rows;
    if (tab === 'A') r = rows.filter((v) => v.matchA);
    else if (tab === 'B') r = rows.filter((v) => v.matchB);
    else if (tab === 'AB') r = rows.filter((v) => v.matchA && v.matchB);
    return sort === 'composite' ? r : manualSort(r, sort, SORT_DIR[sort]);
  }, [rows, tab, sort]);

  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <>
      <ParamPanel n={n} x={x} onN={setN} onX={setX} dataDate={dataDate} />
      <MarketTabs market={market} onMarket={setMarket} />
      <StatsRow summary={summary} />
      <Tabs tab={tab} onTab={setTab} summary={summary} />
      <SortBar sort={sort} onSort={setSort} count={listRows.length} />
      <div className="list-head">
        <span>代號 / 名稱</span>
        <span>收盤價 / 漲跌</span>
        <span>法人連買</span>
        <span>買超 / 成交量</span>
        <span>董監持股</span>
        <span></span>
      </div>
      {listRows.length === 0
        ? <EmptyState tab={tab} />
        : <StockList rows={listRows} tab={tab} open={open} onToggle={toggle} directorDataMonthLatest={directorDataMonthLatest} />}
    </>
  );
}
