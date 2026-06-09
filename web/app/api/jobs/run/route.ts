// web/app/api/jobs/run/route.ts
import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { runPipeline } from '@/lib/pipeline';

export const maxDuration = 300; // Vercel：給管線足夠時間

const STALE_MINUTES = 30;

export async function POST(req: Request): Promise<Response> {
  // 1) 認證
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${env.cronSecret()}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = getSupabase();

  // 2) 防重複：若有未逾時的 running → 409
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const { data: runningRows, error: qErr } = await db
    .from('job_runs').select('id, started_at').eq('status', 'running').gte('started_at', staleBefore).limit(1);
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  if (runningRows && runningRows.length > 0) {
    return NextResponse.json({ status: 'already_running' }, { status: 409 });
  }

  // 3) 寫一筆 running 作為鎖
  const { data: lockRow, error: lockErr } = await db
    .from('job_runs').insert({ status: 'running' }).select('id').single();
  if (lockErr || !lockRow) return NextResponse.json({ error: lockErr?.message ?? 'lock failed' }, { status: 500 });
  const runId = lockRow.id as number;

  // 4) 跑管線；無論成敗都更新該列
  try {
    const r = await runPipeline();
    await db.from('job_runs').update({
      finished_at: new Date().toISOString(),
      data_date: r.dataDate, status: r.status,
      stocks_processed: r.stocksProcessed,
      eligible_a_count: r.eligibleACount, eligible_b_count: r.eligibleBCount,
      excluded_count: r.excludedCount, exclude_stats: r.excludeStats,
      error_message: r.errorMessage,
    }).eq('id', runId);
    return NextResponse.json({ status: r.status, dataDate: r.dataDate, stocksProcessed: r.stocksProcessed }, { status: 200 });
  } catch (e) {
    await db.from('job_runs').update({
      finished_at: new Date().toISOString(), status: 'failed', error_message: (e as Error).message,
    }).eq('id', runId);
    return NextResponse.json({ status: 'failed', error: (e as Error).message }, { status: 500 });
  }
}
