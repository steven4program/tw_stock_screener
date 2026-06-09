// web/components/screener/Change.tsx
import { fmt } from '@/lib/format';

export function Change({ r }: { r: number | null }) {
  if (r === null) return <span className="chg num flat">—</span>;
  const cls = r > 0 ? 'up' : r < 0 ? 'down' : 'flat';
  const arrow = r > 0 ? '▲' : r < 0 ? '▼' : '—';
  return <span className={'chg num ' + cls}>{arrow} {fmt.changePct(r)}</span>;
}
