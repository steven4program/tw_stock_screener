// web/app/api/snapshots/latest/route.ts
import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const revalidate = 0;

export async function GET(): Promise<Response> {
  const db = getSupabase();

  // 最新一筆成功/部分成功的 job_run（取狀態與資料日期）
  const { data: jobs, error: jErr } = await db
    .from('job_runs').select('data_date, status, finished_at')
    .in('status', ['success', 'partial_success']).not('data_date', 'is', null)
    .order('data_date', { ascending: false }).limit(1);
  if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 });
  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ dataDate: null, jobStatus: 'no_data', generatedAt: null, signals: [] }, { status: 200 });
  }
  const job = jobs[0];

  const { data: rows, error: sErr } = await db
    .from('daily_stock_signals').select('*').eq('data_date', job.data_date);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  // DB snake_case → 前端 camelCase（對齊 web/lib/types.ts 的 StockSignal）
  const signals = (rows ?? []).map((r) => ({
    dataDate: r.data_date, stockId: r.stock_id, stockName: r.stock_name, market: r.market,
    close: num(r.close), changeRatio: num(r.change_ratio), volumeLots: num(r.volume_lots),
    instNetLots: num(r.inst_net_lots), instBuyStreak: r.inst_buy_streak ?? 0,
    directorHoldingPct: num(r.director_holding_pct), directorDataMonth: r.director_data_month,
    ma20: num(r.ma20), ma20Prev: num(r.ma20_prev), ma20Holdflat5d: num(r.ma20_holdflat_5d),
    ma60: num(r.ma60), ma60Prev: num(r.ma60_prev), ma60Holdflat5d: num(r.ma60_holdflat_5d),
    distMa20Ratio: num(r.dist_ma20_ratio), distMa60Ratio: num(r.dist_ma60_ratio),
    eligibleA: !!r.eligible_a, eligibleB: !!r.eligible_b,
    excludeReasonA: r.exclude_reason_a, excludeReasonB: r.exclude_reason_b,
  }));

  return NextResponse.json({
    dataDate: job.data_date, jobStatus: job.status, generatedAt: job.finished_at, signals,
  }, { status: 200 });
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
