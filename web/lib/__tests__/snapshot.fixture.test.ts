import { describe, it, expect } from 'vitest';
import { runFilter } from '../filter';
import { FIXTURE_SIGNALS, getFixtureSnapshot } from '../snapshot.fixture';

const byId = (id: string) => FIXTURE_SIGNALS.find((s) => s.stockId === id)!;
const idsAt = (n: number, x: number) =>
  new Set(runFilter(FIXTURE_SIGNALS, { n, x }).rows.map((r) => r.signal.stockId));
const tagAt = (id: string, n: number, x: number) =>
  runFilter(FIXTURE_SIGNALS, { n, x }).rows.find((r) => r.signal.stockId === id)?.tag;

describe('e2e fixture sanity', () => {
  it('named anchors carry their intended fields', () => {
    expect(byId('1101').instBuyStreak).toBe(2);           // N-anchor: drops at N=3
    expect(byId('9999').directorHoldingPct).toBe(16);     // X-anchor: in [15,20)
    expect(byId('6488').changeRatio).toBeNull();          // null-change → — render
    expect(byId('2330').changeRatio).toBeGreaterThan(0);  // 紅漲
    expect(byId('1101').changeRatio).toBeLessThan(0);     // 綠跌
    expect(byId('3008').directorDataMonth).toBe('2026-03'); // stale vs latest 2026-05
  });

  it('tab membership at defaults (n=2,x=15) matches the E2E anchors', () => {
    expect(tagAt('2330', 2, 15)).toBe('A+B');
    expect(tagAt('6488', 2, 15)).toBe('B');
    expect(tagAt('3008', 2, 15)).toBe('A');
  });

  it('N=3 drops the streak-2 anchor; X=20 drops the director-16 anchor', () => {
    expect(idsAt(2, 15).has('1101')).toBe(true);
    expect(idsAt(3, 15).has('1101')).toBe(false);
    expect(idsAt(2, 15).has('9999')).toBe(true);
    expect(idsAt(2, 20).has('9999')).toBe(false);
  });

  it('raising params past every match yields zero rows (client EmptyState source)', () => {
    expect(idsAt(10, 15).size).toBe(0); // max streak is 9
  });

  it('scenarios are valid; no_data is empty; unknown falls back to success', () => {
    for (const s of ['success', 'partial', 'stale', 'failed', 'no_data']) {
      expect(getFixtureSnapshot(s).scenario).toBeTruthy();
    }
    expect(getFixtureSnapshot('success').signals.length).toBeGreaterThan(0);
    expect(getFixtureSnapshot('no_data').signals).toHaveLength(0);
    expect(getFixtureSnapshot('zzz').scenario).toBe('success');
  });
});
