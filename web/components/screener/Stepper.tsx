// web/components/screener/Stepper.tsx
export function Stepper({ value, min, max, unit, label, onChange }: {
  value: number; min: number; max: number; unit?: string; label?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="stepper">
      <button className="step-btn" aria-label={'減少' + (label ?? '')} disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <div className="step-val num">{value}{unit && <span className="unit">{unit}</span>}</div>
      <button className="step-btn" aria-label={'增加' + (label ?? '')} disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}
