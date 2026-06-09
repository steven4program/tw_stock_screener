// web/components/screener/EmptyState.tsx
import type { Tab } from './types';

export function EmptyState({ tab }: { tab: Tab }) {
  const labelMap: Record<Tab, string> = { all: '符合條件', A: 'A 季線型', B: 'B 月線型', AB: 'A+B 同時符合' };
  return (
    <div className="empty card">
      <div className="e-ico" aria-hidden="true">🔍</div>
      <div className="e-title serif">今日無{labelMap[tab]}的股票</div>
      <div className="e-sub">可試著調低「法人連買天數 N」或「董監持股門檻 X%」，<br />放寬條件後再看看。</div>
    </div>
  );
}
