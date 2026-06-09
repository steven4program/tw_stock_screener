// web/components/screener/StockItem.tsx
import type { FilterRow } from '@/lib/types';
import type { Tab } from './types';
import { fmt } from '@/lib/format';
import { Change } from './Change';
import { DirectorCell } from './DirectorCell';
import { ReasonGroup } from './ReasonGroup';

export function StockItem({ row, tab, expanded, onToggle, directorDataMonthLatest }: {
  row: FilterRow; tab: Tab; expanded: boolean; onToggle: () => void; directorDataMonthLatest: string | null;
}) {
  const s = row.signal;
  const badge = row.tag === 'A+B'
    ? <span className="badge ab">★ A+B</span>
    : row.tag === 'A'
      ? <span className="badge a">A 季線型</span>
      : <span className="badge b">B 月線型</span>;

  let groups: ('A' | 'B')[] = [];
  if (tab === 'A') { if (row.matchA) groups = ['A']; }
  else if (tab === 'B') { if (row.matchB) groups = ['B']; }
  else if (tab === 'AB') { groups = ['A', 'B']; }
  else { if (row.matchA) groups.push('A'); if (row.matchB) groups.push('B'); }

  return (
    <article className="srow card">
      <div className="srow-main">
        <div className="s-name-wrap">
          <div className="s-id-name">
            <span className="s-id num">{s.stockId}</span>
            <span className="s-name serif">{s.stockName}</span>
          </div>
          <span className="s-market">{s.market === 'TWSE' ? '上市' : '上櫃'}</span>
          <div className="s-badges">{badge}</div>
        </div>

        <div className="cell price m-cell">
          <span className="col-label">收盤價</span>
          <div className="c-num num">{fmt.price(s.close)}</div>
          <Change r={s.changeRatio} />
        </div>

        <div className="cell streak m-cell">
          <span className="col-label">法人連買</span>
          <div className="c-num num"><span className="big">連買 {s.instBuyStreak}</span> 天</div>
        </div>

        <div className="cell m-cell">
          <span className="col-label">買超 / 成交量</span>
          <div className="c-num num">{fmt.int(s.instNetLots)} 張</div>
          <div className="c-sub num">量 {fmt.int(s.volumeLots)} 張</div>
        </div>

        <DirectorCell sig={s} directorDataMonthLatest={directorDataMonthLatest} />

        <div className="cell action m-cell">
          <button className="reason-btn" aria-expanded={expanded} onClick={onToggle}>
            {expanded ? '收合' : '看原因'} <span className="chev" aria-hidden="true">▾</span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className={'reasons' + (groups.length > 1 ? ' two' : '')}>
          {groups.map((k) => (
            <ReasonGroup key={k} kind={k} sig={s} reasons={k === 'A' ? row.reasonsA : row.reasonsB} />
          ))}
        </div>
      )}
    </article>
  );
}
