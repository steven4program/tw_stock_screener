// web/lib/__tests__/filter.test.ts
import { describe, it, expect } from 'vitest';
import { matchesA, matchesB, reasonsForA, reasonsForB } from '../filter';
import type { StockSignal } from '../types';

function sig(overrides: Partial<StockSignal>): StockSignal {
  return {
    dataDate: '2026-06-09', stockId: '0001', stockName: '測試', market: 'TWSE',
    close: 100, changeRatio: 0.01, volumeLots: 100, instNetLots: 5, instBuyStreak: 3,
    directorHoldingPct: 20, directorDataMonth: '2026-05',
    ma20: 95, ma20Prev: 94, ma20Holdflat5d: 96, ma60: 98, ma60Prev: 97, ma60Holdflat5d: 99,
    distMa20Ratio: 0.05, distMa60Ratio: 0.02,
    eligibleA: true, eligibleB: true, excludeReasonA: null, excludeReasonB: null,
    ...overrides,
  };
}

describe('matchesA（條件 A 季線型）', () => {
  it('全部成立 → true', () => {
    expect(matchesA(sig({}), { n: 2, x: 15 })).toBe(true);
  });
  it('連買天數不足 → false', () => {
    expect(matchesA(sig({ instBuyStreak: 1 }), { n: 2, x: 15 })).toBe(false);
  });
  it('董監持股不足 → false', () => {
    expect(matchesA(sig({ directorHoldingPct: 10 }), { n: 2, x: 15 })).toBe(false);
  });
  it('距季線 > 10% → false', () => {
    expect(matchesA(sig({ distMa60Ratio: 0.12 }), { n: 2, x: 15 })).toBe(false);
  });
  it('距季線為負（在均線下）→ false', () => {
    expect(matchesA(sig({ distMa60Ratio: -0.01 }), { n: 2, x: 15 })).toBe(false);
  });
  it('季線未上彎但扣抵向上 → true', () => {
    expect(matchesA(sig({ ma60: 98, ma60Prev: 99, ma60Holdflat5d: 98.5 }), { n: 2, x: 15 })).toBe(true);
  });
  it('季線未上彎且扣抵未向上 → false', () => {
    expect(matchesA(sig({ ma60: 98, ma60Prev: 99, ma60Holdflat5d: 97 }), { n: 2, x: 15 })).toBe(false);
  });
  it('ma60Prev 為 null 但扣抵向上 → true', () => {
    expect(matchesA(sig({ ma60Prev: null, ma60Holdflat5d: 99 }), { n: 2, x: 15 })).toBe(true);
  });
  it('不具 A 資格 → false（即使數值符合）', () => {
    expect(matchesA(sig({ eligibleA: false }), { n: 2, x: 15 })).toBe(false);
  });
  it('距季線剛好 0% 與 10% 邊界 → true', () => {
    expect(matchesA(sig({ distMa60Ratio: 0 }), { n: 2, x: 15 })).toBe(true);
    expect(matchesA(sig({ distMa60Ratio: 0.10 }), { n: 2, x: 15 })).toBe(true);
  });
});

describe('matchesB（條件 B 月線型，用 20MA）', () => {
  it('全部成立 → true', () => {
    expect(matchesB(sig({}), { n: 2, x: 15 })).toBe(true);
  });
  it('距月線 > 10% → false', () => {
    expect(matchesB(sig({ distMa20Ratio: 0.2 }), { n: 2, x: 15 })).toBe(false);
  });
  it('不具 B 資格 → false', () => {
    expect(matchesB(sig({ eligibleB: false }), { n: 2, x: 15 })).toBe(false);
  });
});

// 追加到 web/lib/__tests__/filter.test.ts

describe('reasonsForA（季線型入選原因）', () => {
  it('涵蓋連買、董監、距季線、季線狀態四條', () => {
    const r = reasonsForA(sig({ instBuyStreak: 5, directorHoldingPct: 18.2, distMa60Ratio: 0.021 }), { n: 2, x: 15 });
    expect(r).toHaveLength(4);
    expect(r[0]).toContain('連買');
    expect(r[0]).toContain('5');
    expect(r[1]).toContain('董監持股');
    expect(r[1]).toContain('18.2');
    expect(r[2]).toContain('季線上方');
    expect(r[2]).toContain('2.1');
    expect(r[3]).toContain('季線');
  });

  it('季線已上彎時用「已上彎」字樣', () => {
    const r = reasonsForA(sig({ ma60: 98, ma60Prev: 97, ma60Holdflat5d: 97.5 }), { n: 2, x: 15 });
    expect(r[3]).toContain('已上彎');
  });

  it('季線未上彎但扣抵向上時用「扣抵向上」字樣', () => {
    const r = reasonsForA(sig({ ma60: 98, ma60Prev: 99, ma60Holdflat5d: 98.5 }), { n: 2, x: 15 });
    expect(r[3]).toContain('扣抵');
  });
});

describe('reasonsForB（月線型）', () => {
  it('用「月線」字樣與 20MA 距離', () => {
    const r = reasonsForB(sig({ distMa20Ratio: 0.05 }), { n: 2, x: 15 });
    expect(r[2]).toContain('月線上方');
    expect(r[3]).toContain('月線');
  });
});
