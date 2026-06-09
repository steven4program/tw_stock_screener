// web/lib/__tests__/signals.test.ts
import { describe, it, expect } from 'vitest';
import { sma, holdflat, buyStreak, changeRatio, computeSignals } from '../signals';
import type { SignalInput } from '../types';

describe('sma（時間升冪，視窗取結尾）', () => {
  const closes = [1, 2, 3, 4, 5]; // 最後一筆＝今日

  it('視窗 3、offset 0 = 最後三筆 (3+4+5)/3 = 4', () => {
    expect(sma(closes, 3, 0)).toBeCloseTo(4, 9);
  });

  it('視窗 3、offset 1 = 結尾往前一格 (2+3+4)/3 = 3', () => {
    expect(sma(closes, 3, 1)).toBeCloseTo(3, 9);
  });

  it('視窗超過資料長度回 null', () => {
    expect(sma(closes, 6, 0)).toBeNull();
  });

  it('視窗剛好等於長度可算、但 offset 1 不足回 null', () => {
    expect(sma(closes, 5, 0)).toBeCloseTo(3, 9);
    expect(sma(closes, 5, 1)).toBeNull();
  });
});

describe('holdflat（假設未來 5 日收盤＝今日收盤）', () => {
  it('視窗 20：取最後 15 筆 + 5×今日，再除以 20', () => {
    const flat = Array(25).fill(10);
    expect(holdflat(flat, 20, 5)).toBeCloseTo(10, 9);
  });

  it('今日收盤高於過去 → holdflat 高於過去段平均', () => {
    const closes = [...Array(19).fill(10), 40]; // 20 筆，最後一筆＝40
    // (10×15 + 5×40)/20 = (150+200)/20 = 17.5
    expect(holdflat(closes, 20, 5)).toBeCloseTo(17.5, 9);
  });

  it('資料不足視窗回 null', () => {
    expect(holdflat([1, 2, 3], 20, 5)).toBeNull();
  });
});

describe('buyStreak（從最新往前數連續 >0）', () => {
  it('結尾連續 3 天 >0', () => {
    expect(buyStreak([-1, 0, 5, 2, 8])).toBe(3);
  });
  it('最新一天為 0 → 0', () => {
    expect(buyStreak([5, 5, 0])).toBe(0);
  });
  it('null（無資料）中斷連續', () => {
    expect(buyStreak([3, null, 4, 6])).toBe(2);
  });
  it('全部 >0 → 等於長度', () => {
    expect(buyStreak([1, 2, 3])).toBe(3);
  });
});

describe('changeRatio', () => {
  it('(close - 前一日)/前一日', () => {
    expect(changeRatio([100, 102])).toBeCloseTo(0.02, 9);
  });
  it('僅一筆收盤 → null', () => {
    expect(changeRatio([100])).toBeNull();
  });
});

function baseInput(closes: number[], overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    stockId: '0001', stockName: '測試', market: 'TWSE', dataDate: '2026-06-09',
    closes, volumeLots: 100, instNetLots: closes.map(() => 1),
    directorHoldingPct: 20, directorDataMonth: '2026-05',
    ...overrides,
  };
}

describe('computeSignals 均線與距離', () => {
  it('70 筆遞增收盤：ma20/ma60/ma_prev/holdflat/dist 皆有值且關係正確', () => {
    const closes = Array.from({ length: 70 }, (_, i) => 100 + i); // 100..169，今日=169
    const s = computeSignals(baseInput(closes));
    expect(s.ma20).not.toBeNull();
    expect(s.ma60).not.toBeNull();
    expect(s.ma20Prev).not.toBeNull();
    expect(s.ma60Prev).not.toBeNull();
    expect(s.ma20! > s.ma20Prev!).toBe(true);
    expect(s.ma60! > s.ma60Prev!).toBe(true);
    expect(s.distMa60Ratio! > 0).toBe(true);
    expect(s.close).toBe(169);
  });
});

describe('computeSignals 資格與 reason（§9）', () => {
  it('完整（≥60 且有董監）→ eligibleA/B 皆 true、reason 皆 null', () => {
    const s = computeSignals(baseInput(Array(60).fill(50)));
    expect(s.eligibleA).toBe(true);
    expect(s.eligibleB).toBe(true);
    expect(s.excludeReasonA).toBeNull();
    expect(s.excludeReasonB).toBeNull();
  });

  it('歷史 20~59 日（有 20MA、無 60MA）→ A 不合格(insufficient_history_60)、B 合格', () => {
    const s = computeSignals(baseInput(Array(30).fill(50)));
    expect(s.eligibleA).toBe(false);
    expect(s.eligibleB).toBe(true);
    expect(s.excludeReasonA).toBe('insufficient_history_60');
    expect(s.excludeReasonB).toBeNull();
    expect(s.ma60).toBeNull();
    expect(s.ma20).not.toBeNull();
  });

  it('歷史 < 20 日 → A insufficient_history_60、B insufficient_history_20', () => {
    const s = computeSignals(baseInput(Array(10).fill(50)));
    expect(s.eligibleA).toBe(false);
    expect(s.eligibleB).toBe(false);
    expect(s.excludeReasonA).toBe('insufficient_history_60');
    expect(s.excludeReasonB).toBe('insufficient_history_20');
  });

  it('缺董監 → A、B 皆 missing_director', () => {
    const s = computeSignals(baseInput(Array(60).fill(50), { directorHoldingPct: null, directorDataMonth: null }));
    expect(s.eligibleA).toBe(false);
    expect(s.eligibleB).toBe(false);
    expect(s.excludeReasonA).toBe('missing_director');
    expect(s.excludeReasonB).toBe('missing_director');
  });

  it('恰 60 筆：ma60 有值但 ma60Prev 為 null（需 61 筆）', () => {
    const s = computeSignals(baseInput(Array(60).fill(50)));
    expect(s.ma60).not.toBeNull();
    expect(s.ma60Prev).toBeNull();
  });

  it('連買天數與今日法人/量帶入', () => {
    const closes = Array(60).fill(50);
    const inst = Array(60).fill(1); inst[59] = 7;
    const s = computeSignals(baseInput(closes, { instNetLots: inst, volumeLots: 250 }));
    expect(s.instNetLots).toBe(7);
    expect(s.instBuyStreak).toBe(60);
    expect(s.volumeLots).toBe(250);
  });
});
