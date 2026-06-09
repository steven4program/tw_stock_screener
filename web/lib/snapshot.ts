// web/lib/snapshot.ts — pure (vitest-safe) snapshot types + scenario logic; no I/O
import type { StockSignal } from './types';

export type JobStatus = 'running' | 'success' | 'partial_success' | 'failed' | 'no_new_data';
export type Scenario = 'success' | 'stale' | 'partial' | 'failed' | 'no_data';

export interface SnapshotPayload {
  signals: StockSignal[];
  scenario: Scenario;
  dataDate: string | null;        // displayed snapshot date (= lastSuccessDate)
  lastSuccessDate: string | null;
  generatedAt: string | null;
  directorDataMonthLatest: string | null;
}

/** Calendar days (to - from); both 'YYYY-MM-DD', compared at UTC midnight. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Pure. `today` is injected (Asia/Taipei) so this stays testable. Precedence: failed › stale › partial › success. */
export function deriveScenario(input: {
  latestStatus: JobStatus;
  displayStatus: 'success' | 'partial_success';
  displayDataDate: string;
  today: string;
  staleAfterDays?: number;
}): 'success' | 'stale' | 'partial' | 'failed' {
  const { latestStatus, displayStatus, displayDataDate, today, staleAfterDays = 4 } = input;
  if (latestStatus === 'failed') return 'failed';
  if (daysBetween(displayDataDate, today) > staleAfterDays) return 'stale';
  if (displayStatus === 'partial_success') return 'partial';
  return 'success';
}
