// web/lib/snapshot.fixture.ts — PURE deterministic E2E fixtures (no I/O, no server-only).
// Imported by the E2E seam (server) and the vitest sanity test (node).
import type { StockSignal } from './types';
import type { SnapshotPayload } from './snapshot';

/** Non-matching baseline; each fixture stock overrides only what it needs. */
function mk(o: Partial<StockSignal> & Pick<StockSignal, 'stockId' | 'stockName'>): StockSignal {
  return {
    dataDate: '2026-06-09', market: 'TWSE',
    close: 100, changeRatio: 0.01, volumeLots: 1000, instNetLots: 500,
    instBuyStreak: 0, directorHoldingPct: 0, directorDataMonth: '2026-05',
    ma20: null, ma20Prev: null, ma20Holdflat5d: null,
    ma60: null, ma60Prev: null, ma60Holdflat5d: null,
    distMa20Ratio: null, distMa60Ratio: null,
    eligibleA: false, eligibleB: false, excludeReasonA: null, excludeReasonB: null,
    ...o,
  };
}

// Defaults: N=2 (streak ≥ 2), X=15 (director ≥ 15%); band = distMa*Ratio ∈ [0, 0.10].
export const FIXTURE_SIGNALS: StockSignal[] = [
  // 2330 — A+B; smallest dist (sort anchor); +change (紅); expand-reasons target.
  mk({ stockId: '2330', stockName: '台積電股', market: 'TWSE',
    close: 605, changeRatio: 0.02, volumeLots: 25000, instNetLots: 8000,
    instBuyStreak: 9, directorHoldingPct: 30, directorDataMonth: '2026-05',
    ma20: 600, ma20Prev: 598, ma20Holdflat5d: 600, distMa20Ratio: 0.005,
    ma60: 590, ma60Prev: 588, ma60Holdflat5d: 590, distMa60Ratio: 0.005,
    eligibleA: true, eligibleB: true }),
  // 1101 — A-only; N-anchor (streak 2 → drops at N=3); -change (綠).
  mk({ stockId: '1101', stockName: '水泥股', market: 'TWSE',
    close: 42.5, changeRatio: -0.015, volumeLots: 6000, instNetLots: 1200,
    instBuyStreak: 2, directorHoldingPct: 25, directorDataMonth: '2026-05',
    ma60: 42, ma60Prev: 41.5, ma60Holdflat5d: 42, distMa60Ratio: 0.03,
    ma20: 43, ma20Prev: 43.5, ma20Holdflat5d: 42, distMa20Ratio: 0.2,
    eligibleA: true, eligibleB: false }),
  // 6488 — B-only; null change (— render).
  mk({ stockId: '6488', stockName: '環球晶股', market: 'TPEx',
    close: 410, changeRatio: null, volumeLots: 3000, instNetLots: 900,
    instBuyStreak: 5, directorHoldingPct: 40, directorDataMonth: '2026-05',
    ma20: 405, ma20Prev: 403, ma20Holdflat5d: 405, distMa20Ratio: 0.04,
    ma60: 400, ma60Prev: 401, ma60Holdflat5d: 400, distMa60Ratio: 0.2,
    eligibleA: false, eligibleB: true }),
  // 9999 — A-only; X-anchor (director 16 ∈ [15,20) → drops at X=20).
  mk({ stockId: '9999', stockName: '邊緣股', market: 'TPEx',
    close: 88, changeRatio: 0.005, volumeLots: 1500, instNetLots: 400,
    instBuyStreak: 4, directorHoldingPct: 16, directorDataMonth: '2026-05',
    ma60: 86, ma60Prev: 85, ma60Holdflat5d: 86, distMa60Ratio: 0.05,
    ma20: 87, ma20Prev: 87.5, ma20Holdflat5d: 86, distMa20Ratio: 0.2,
    eligibleA: true, eligibleB: false }),
  // 3008 — A-only; stale director month (2026-03 < latest 2026-05 → 資料較舊); +change.
  mk({ stockId: '3008', stockName: '大立光股', market: 'TWSE',
    close: 2500, changeRatio: 0.01, volumeLots: 800, instNetLots: 300,
    instBuyStreak: 6, directorHoldingPct: 22, directorDataMonth: '2026-03',
    ma60: 2450, ma60Prev: 2440, ma60Holdflat5d: 2450, distMa60Ratio: 0.06,
    ma20: 2480, ma20Prev: 2485, ma20Holdflat5d: 2470, distMa20Ratio: 0.2,
    eligibleA: true, eligibleB: false }),
];

const SCENARIOS: Record<string, SnapshotPayload> = {
  success: { signals: FIXTURE_SIGNALS, scenario: 'success', dataDate: '2026-06-09',
    lastSuccessDate: '2026-06-09', generatedAt: '2026-06-09T14:05:00Z', directorDataMonthLatest: '2026-05' },
  partial: { signals: FIXTURE_SIGNALS, scenario: 'partial', dataDate: '2026-06-09',
    lastSuccessDate: '2026-06-09', generatedAt: '2026-06-09T14:05:00Z', directorDataMonthLatest: '2026-04' },
  stale: { signals: FIXTURE_SIGNALS, scenario: 'stale', dataDate: '2026-06-03',
    lastSuccessDate: '2026-06-03', generatedAt: '2026-06-03T14:05:00Z', directorDataMonthLatest: '2026-05' },
  failed: { signals: FIXTURE_SIGNALS, scenario: 'failed', dataDate: '2026-06-06',
    lastSuccessDate: '2026-06-06', generatedAt: '2026-06-06T14:05:00Z', directorDataMonthLatest: '2026-05' },
  no_data: { signals: [], scenario: 'no_data', dataDate: null,
    lastSuccessDate: null, generatedAt: null, directorDataMonthLatest: null },
};

/** Pick a fixture snapshot by scenario name; unknown → success. */
export function getFixtureSnapshot(scenario: string): SnapshotPayload {
  return SCENARIOS[scenario] ?? SCENARIOS.success;
}
