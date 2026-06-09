// web/components/screener/ParamPanel.tsx
import { Stepper } from './Stepper';
import { FIXED } from './types';

export function ParamPanel({ n, x, onN, onX, dataDate }: {
  n: number; x: number; onN: (v: number) => void; onX: (v: number) => void; dataDate: string;
}) {
  return (
    <section className="params card" aria-label="篩選參數">
      <div className="params-head">
        <h2 className="serif">篩選參數</h2>
        <span className="data-date">資料日期 <b className="num">{dataDate}</b></span>
      </div>
      <div className="param-grid">
        <div className="param">
          <div className="p-name">法人連買天數 <b>N</b><span className="p-range">1–10・預設 2</span></div>
          <Stepper value={n} min={1} max={10} unit="天" label="法人連買天數" onChange={onN} />
        </div>
        <div className="param">
          <div className="p-name">董監持股門檻 <b>X</b><span className="p-range">5–50・預設 15</span></div>
          <Stepper value={x} min={5} max={50} unit="%" label="董監持股門檻" onChange={onX} />
        </div>
      </div>
      <div className="fixed-params">
        <span className="fp-label">固定條件</span>
        <span className="fixed-chip">距均線 {FIXED.distLow}~{FIXED.distHigh}%</span>
        <span className="fixed-chip">月線 {FIXED.ma20}MA</span>
        <span className="fixed-chip">季線 {FIXED.ma60}MA</span>
        <span className="fixed-chip">扣抵 {FIXED.holdflatDays} 個交易日</span>
      </div>
    </section>
  );
}
