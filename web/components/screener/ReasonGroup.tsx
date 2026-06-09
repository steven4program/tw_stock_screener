// web/components/screener/ReasonGroup.tsx
import type { StockSignal } from '@/lib/types';
import { MaLine } from './MaLine';

export function ReasonGroup({ kind, sig, reasons }: {
  kind: 'A' | 'B'; sig: StockSignal; reasons: string[];
}) {
  const isA = kind === 'A';
  return (
    <div className="reason-group">
      <div className="rg-head">
        <span className={'badge ' + (isA ? 'a' : 'b')}>{isA ? 'A 季線型' : 'B 月線型'}</span>
        <span className="rg-title serif">{isA ? '為什麼符合季線型' : '為什麼符合月線型'}</span>
      </div>
      <MaLine kind={kind} sig={sig} />
      <ul className="reason-list">
        {reasons.map((t, i) => (
          <li key={i}><span className="tick" aria-hidden="true">✓</span><span>{t}</span></li>
        ))}
      </ul>
    </div>
  );
}
