// web/lib/snapshot.server.ts — server-only Supabase snapshot reader
import 'server-only';
import { getSupabase } from './supabase';
import { readSignalsByDate } from './repo';
import type { StockSignal } from './types';
import { deriveScenario, type JobStatus, type SnapshotPayload } from './snapshot';

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(r: Record<string, unknown>): StockSignal {
  return {
    dataDate: r.data_date as string, stockId: r.stock_id as string, stockName: r.stock_name as string,
    market: r.market as StockSignal['market'],
    close: num(r.close) as number, changeRatio: num(r.change_ratio), volumeLots: num(r.volume_lots) as number,
    instNetLots: num(r.inst_net_lots) as number, instBuyStreak: (r.inst_buy_streak as number) ?? 0,
    directorHoldingPct: num(r.director_holding_pct), directorDataMonth: (r.director_data_month as string | null) ?? null,
    ma20: num(r.ma20), ma20Prev: num(r.ma20_prev), ma20Holdflat5d: num(r.ma20_holdflat_5d),
    ma60: num(r.ma60), ma60Prev: num(r.ma60_prev), ma60Holdflat5d: num(r.ma60_holdflat_5d),
    distMa20Ratio: num(r.dist_ma20_ratio), distMa60Ratio: num(r.dist_ma60_ratio),
    eligibleA: !!r.eligible_a, eligibleB: !!r.eligible_b,
    excludeReasonA: (r.exclude_reason_a as StockSignal['excludeReasonA']) ?? null,
    excludeReasonB: (r.exclude_reason_b as StockSignal['excludeReasonB']) ?? null,
  };
}

/** Server-only. Reads the latest displayable snapshot + derives the status scenario. */
export async function getLatestSnapshot(): Promise<SnapshotPayload> {
  // E2E fixture seam — active ONLY under E2E=1, inert in production. Lets Playwright
  // render deterministic data per scenario via the `e2e_scenario` cookie (no DB).
  // Dynamic imports keep next/headers + fixtures off the production code path.
  if (process.env.E2E === '1') {
    const { cookies } = await import('next/headers');
    const scenario = (await cookies()).get('e2e_scenario')?.value ?? 'success';
    const { getFixtureSnapshot } = await import('./snapshot.fixture');
    return getFixtureSnapshot(scenario);
  }

  const db = getSupabase();

  // Deterministic "latest displayable run": newest data_date, then the most
  // recently finished run for that date, then highest id as a final tie-break.
  // (Same-data_date displayable duplicates are currently prevented upstream by
  // the no_new_data guard, but ordering here must not depend on that invariant.)
  const { data: disp, error: dErr } = await db
    .from('job_runs').select('data_date, status, finished_at')
    .in('status', ['success', 'partial_success']).not('data_date', 'is', null)
    .order('data_date', { ascending: false })
    .order('finished_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(1);
  if (dErr) throw new Error(`getLatestSnapshot display: ${dErr.message}`);
  if (!disp || disp.length === 0) {
    return { signals: [], scenario: 'no_data', dataDate: null, lastSuccessDate: null, generatedAt: null, directorDataMonthLatest: null };
  }
  const display = disp[0] as { data_date: string; status: 'success' | 'partial_success'; finished_at: string | null };

  const { data: lat, error: lErr } = await db
    .from('job_runs').select('status')
    .order('started_at', { ascending: false }).order('id', { ascending: false }).limit(1);
  if (lErr) throw new Error(`getLatestSnapshot latest: ${lErr.message}`);
  const latestStatus = ((lat?.[0]?.status as JobStatus) ?? display.status);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }); // 'YYYY-MM-DD'
  const scenario = deriveScenario({ latestStatus, displayStatus: display.status, displayDataDate: display.data_date, today });

  const rows = await readSignalsByDate(display.data_date);
  const signals = rows.map(mapRow);
  const directorDataMonthLatest = signals.reduce<string | null>(
    (m, s) => (s.directorDataMonth && (!m || s.directorDataMonth > m) ? s.directorDataMonth : m), null);

  return {
    signals, scenario,
    dataDate: display.data_date, lastSuccessDate: display.data_date,
    generatedAt: display.finished_at, directorDataMonthLatest,
  };
}
