// web/components/screener/Change.tsx
import { fmt } from '@/lib/format';

export function Change({ r }: { r: number | null }) {
  const v = r ?? 0;
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '—';
  return <span className={'chg num ' + cls}>{arrow} {fmt.changePct(v)}</span>;
}
