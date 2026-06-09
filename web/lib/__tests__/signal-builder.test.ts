// web/lib/__tests__/signal-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildSignals } from '../signal-builder';

const info = new Map([['2330', { stockName: '台積電', market: 'TWSE' as const }]]);

describe('buildSignals', () => {
  it('以交易日對齊法人（缺日填 null 以中斷連買），組出 StockSignal', () => {
    const prices = new Map([['2330', [
      { date: '2026-06-04', close: 100 }, { date: '2026-06-05', close: 101 }, { date: '2026-06-06', close: 102 },
    ]]]);
    const inst = new Map([['2330', [
      { date: '2026-06-05', netLots: 3 }, { date: '2026-06-06', netLots: 5 }, // 6-04 缺
    ]]]);
    const directors = new Map([['2330', { pct: 6.52, dataMonth: '2026-04' }]]);
    const out = buildSignals('2026-06-06', ['2330'], prices, inst, directors, info);
    expect(out).toHaveLength(1);
    expect(out[0].stockId).toBe('2330');
    expect(out[0].close).toBe(102);
    expect(out[0].instNetLots).toBe(5);
    expect(out[0].instBuyStreak).toBe(2); // 6-05、6-06 連兩天 >0（6-04 為 null 不影響結尾）
    expect(out[0].directorHoldingPct).toBe(6.52);
    expect(out[0].directorDataMonth).toBe('2026-04');
    expect(out[0].market).toBe('TWSE');
  });

  it('缺董監 → directorHoldingPct null（computeSignals 會標 missing_director）', () => {
    const prices = new Map([['2330', [{ date: '2026-06-06', close: 100 }]]]);
    const out = buildSignals('2026-06-06', ['2330'], prices, new Map(), new Map(), info);
    expect(out[0].directorHoldingPct).toBeNull();
    expect(out[0].excludeReasonA).toBe('missing_director');
  });

  it('無價格資料的股票直接略過', () => {
    const out = buildSignals('2026-06-06', ['9999'], new Map(), new Map(), new Map(), info);
    expect(out).toHaveLength(0);
  });
});
