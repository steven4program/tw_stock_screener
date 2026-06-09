// web/lib/__tests__/snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { daysBetween, deriveScenario } from '../snapshot';

describe('daysBetween', () => {
  it('counts calendar days (to - from), UTC-safe across months', () => {
    expect(daysBetween('2026-06-09', '2026-06-09')).toBe(0);
    expect(daysBetween('2026-06-06', '2026-06-09')).toBe(3);
    expect(daysBetween('2026-01-30', '2026-02-02')).toBe(3);
  });
});

describe('deriveScenario', () => {
  const ok = { latestStatus: 'success', displayStatus: 'success', displayDataDate: '2026-06-09', today: '2026-06-09' } as const;

  it('regression (friend finding 1): same-day no_new_data after success is NOT stale', () => {
    expect(deriveScenario({ ...ok, latestStatus: 'no_new_data' })).toBe('success');
  });
  it('fresh success → success; fresh partial → partial', () => {
    expect(deriveScenario(ok)).toBe('success');
    expect(deriveScenario({ ...ok, displayStatus: 'partial_success' })).toBe('partial');
  });
  it('latest failed → failed regardless of freshness (failed › stale)', () => {
    expect(deriveScenario({ ...ok, latestStatus: 'failed' })).toBe('failed');
    expect(deriveScenario({ latestStatus: 'failed', displayStatus: 'success', displayDataDate: '2026-06-01', today: '2026-06-09' })).toBe('failed');
  });
  it('data older than staleAfterDays → stale (stale › partial)', () => {
    expect(deriveScenario({ latestStatus: 'no_new_data', displayStatus: 'success', displayDataDate: '2026-06-04', today: '2026-06-09' })).toBe('stale');
    expect(deriveScenario({ latestStatus: 'no_new_data', displayStatus: 'partial_success', displayDataDate: '2026-06-04', today: '2026-06-09' })).toBe('stale');
  });
  it('weekend gap within threshold → not stale (Fri shown, Mon today)', () => {
    expect(deriveScenario({ latestStatus: 'no_new_data', displayStatus: 'success', displayDataDate: '2026-06-05', today: '2026-06-08' })).toBe('success');
  });
});
