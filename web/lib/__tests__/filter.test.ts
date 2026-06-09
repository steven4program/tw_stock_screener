// web/lib/__tests__/filter.test.ts
import { describe, it, expect } from 'vitest';
import { matchesA, matchesB, reasonsForA, reasonsForB, runFilter, manualSort } from '../filter';
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

describe('runFilter 標籤與統計', () => {
  it('依符合度標 A / B / A+B，並只收 matchA||matchB', () => {
    const aOnly = sig({ stockId: 'A1', distMa20Ratio: 0.5 });
    const bOnly = sig({ stockId: 'B1', distMa60Ratio: 0.5 });
    const both = sig({ stockId: 'AB1' });
    const none = sig({ stockId: 'N1', instBuyStreak: 0 });
    const { rows, summary } = runFilter([aOnly, bOnly, both, none], { n: 2, x: 15 });
    const byId = Object.fromEntries(rows.map((r) => [r.signal.stockId, r.tag]));
    expect(byId['A1']).toBe('A');
    expect(byId['B1']).toBe('B');
    expect(byId['AB1']).toBe('A+B');
    expect('N1' in byId).toBe(false);
    expect(summary).toEqual({ total: 3, countA: 2, countB: 2, countAB: 1 });
  });

  it('綜合排序：A+B 優先，其次連買天數多', () => {
    const ab = sig({ stockId: 'AB', instBuyStreak: 3 });
    const aHi = sig({ stockId: 'AHI', distMa20Ratio: 0.5, instBuyStreak: 9 });
    const aLo = sig({ stockId: 'ALO', distMa20Ratio: 0.5, instBuyStreak: 4 });
    const { rows } = runFilter([aLo, aHi, ab], { n: 2, x: 15 });
    expect(rows.map((r) => r.signal.stockId)).toEqual(['AB', 'AHI', 'ALO']);
  });

  it('rows 帶 reasonsA/reasonsB（依符合的條件）', () => {
    const both = sig({ stockId: 'AB1' });
    const { rows } = runFilter([both], { n: 2, x: 15 });
    expect(rows[0].reasonsA.length).toBe(4);
    expect(rows[0].reasonsB.length).toBe(4);
  });
});

describe('manualSort', () => {
  const rows = () => runFilter([
    sig({ stockId: 'X', instBuyStreak: 2, volumeLots: 300, directorHoldingPct: 16 }),
    sig({ stockId: 'Y', instBuyStreak: 8, volumeLots: 100, directorHoldingPct: 40 }),
  ], { n: 2, x: 15 }).rows;

  it('依連買天數遞減', () => {
    expect(manualSort(rows(), 'streak', 'desc').map((r) => r.signal.stockId)).toEqual(['Y', 'X']);
  });
  it('依成交量遞減', () => {
    expect(manualSort(rows(), 'volume', 'desc').map((r) => r.signal.stockId)).toEqual(['X', 'Y']);
  });
  it('依董監持股遞增', () => {
    expect(manualSort(rows(), 'director', 'asc').map((r) => r.signal.stockId)).toEqual(['X', 'Y']);
  });
});

describe('runFilter 市場別前置篩選', () => {
  const twseA = sig({ stockId: 'T1', market: 'TWSE', distMa20Ratio: 0.5 }); // A-only（B 帶寬不過）
  const twseAB = sig({ stockId: 'T2', market: 'TWSE' });                    // A+B
  const tpexB = sig({ stockId: 'P1', market: 'TPEx', distMa60Ratio: 0.5 }); // B-only

  it("market='all'（預設）不過濾，等同舊行為", () => {
    const { rows, summary } = runFilter([twseA, twseAB, tpexB], { n: 2, x: 15 });
    expect(rows).toHaveLength(3);
    expect(summary).toEqual({ total: 3, countA: 2, countB: 2, countAB: 1 });
  });

  it("market='TWSE' 只保留上市，計數同步只算上市", () => {
    const { rows, summary } = runFilter([twseA, twseAB, tpexB], { n: 2, x: 15 }, 'TWSE');
    expect(rows.map((r) => r.signal.stockId)).toEqual(['T2', 'T1']); // A+B 排序優先
    expect(rows.every((r) => r.signal.market === 'TWSE')).toBe(true);
    expect(summary).toEqual({ total: 2, countA: 2, countB: 1, countAB: 1 });
  });

  it("market='TPEx' 只保留上櫃", () => {
    const { rows, summary } = runFilter([twseA, twseAB, tpexB], { n: 2, x: 15 }, 'TPEx');
    expect(rows.map((r) => r.signal.stockId)).toEqual(['P1']);
    expect(summary).toEqual({ total: 1, countA: 0, countB: 1, countAB: 0 });
  });
});
