// web/lib/pipeline.ts — server-only
import { latestTradeDate, tradingDaysInRange, fetchPrices, fetchInstitutional, fetchStockInfo } from './finmind';
import { ingestAllDirectors } from './director/ingest';
import { buildSignals } from './signal-builder';
import {
  upsertPrices, upsertInstitutional, upsertDirectors, existingDates, readDayVolumes,
  readPriceWindow, readInstWindow, readLatestDirectors,
  writeSignals, latestSnapshotDate,
} from './repo';
import type { StockSignal } from './types';

const PRICE_BACKFILL_DAYS = 70;   // 訊號視窗：最近 70 交易日收盤（足 60MA + prev）
const INST_BACKFILL_DAYS = 30;    // 訊號視窗：最近 30 交易日法人（足連買 N≤10）
const PRICE_LOOKBACK_CAL = 130;   // 回補價格的日曆天數（~75 交易日）
const INST_LOOKBACK_CAL = 60;     // 回補法人的日曆天數（~35 交易日）

function floorCal(asOf: string, days: number): string {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 確保最近視窗內每個「實際交易日」的全市場價量/法人都已落地；首次全回補、之後只補缺日（idempotent、self-healing）。 */
async function ensureMarketData(dataDate: string): Promise<void> {
  const priceFrom = floorCal(dataDate, PRICE_LOOKBACK_CAL);
  const days = await tradingDaysInRange(priceFrom, dataDate);          // 實際交易日清單（來自 2330）
  const havePrice = await existingDates('stock_price_history', priceFrom, dataDate);
  for (const d of days) {
    if (havePrice.has(d)) continue;
    await upsertPrices(await fetchPrices(d));                          // 逐缺日抓全市場
  }
  const instFrom = floorCal(dataDate, INST_LOOKBACK_CAL);
  const haveInst = await existingDates('institutional_daily', instFrom, dataDate);
  for (const d of days.filter((x) => x >= instFrom)) {
    if (haveInst.has(d)) continue;
    await upsertInstitutional(await fetchInstitutional(d));
  }
}

export interface PipelineResult {
  status: 'success' | 'partial_success' | 'no_new_data';
  dataDate: string | null;
  stocksProcessed: number;
  eligibleACount: number;
  eligibleBCount: number;
  excludedCount: number;
  excludeStats: Record<string, number>;
  errorMessage: string | null;
}

export async function runPipeline(): Promise<PipelineResult> {
  const dataDate = await latestTradeDate();
  const latest = await latestSnapshotDate();
  if (latest && latest >= dataDate) {
    return { status: 'no_new_data', dataDate, stocksProcessed: 0, eligibleACount: 0, eligibleBCount: 0, excludedCount: 0, excludeStats: {}, errorMessage: null };
  }

  // 1) 確保最近視窗的全市場原始資料齊備（首次回補 ~75 交易日，之後只補缺日）+ 股票資訊
  const info = await fetchStockInfo();
  await ensureMarketData(dataDate);

  // 2) 董監（每月）：抓當月明細；失敗則沿用 DB 既有 → partial_success
  let partial = false;
  let errorMessage: string | null = null;
  try {
    const directors = await ingestAllDirectors();
    if (directors.length > 0) await upsertDirectors(directors);
    else { partial = true; errorMessage = '董監抓取回傳 0 筆，沿用既有月份'; }
  } catch (e) {
    partial = true;
    errorMessage = `董監抓取失敗，沿用既有月份：${(e as Error).message}`;
  }

  // 3) 讀回視窗 + 最新董監 + 當日量，組訊號
  const [priceWin, instWin, directors, todayVolume] = await Promise.all([
    readPriceWindow(dataDate, PRICE_BACKFILL_DAYS),
    readInstWindow(dataDate, INST_BACKFILL_DAYS),
    readLatestDirectors(),
    readDayVolumes(dataDate),
  ]);
  const stockIds = [...priceWin.keys()];
  const signals: StockSignal[] = buildSignals(dataDate, stockIds, priceWin, instWin, directors, info)
    .map((s) => ({ ...s, volumeLots: todayVolume.get(s.stockId) ?? 0 })); // 覆寫當日真值

  await writeSignals(signals);

  // 4) 統計
  const excludeStats: Record<string, number> = {};
  let eligibleACount = 0, eligibleBCount = 0, excludedCount = 0;
  for (const s of signals) {
    if (s.eligibleA) eligibleACount++;
    if (s.eligibleB) eligibleBCount++;
    if (!s.eligibleA && !s.eligibleB) excludedCount++;
    for (const reason of [s.excludeReasonA, s.excludeReasonB]) {
      if (reason) excludeStats[reason] = (excludeStats[reason] ?? 0) + 1;
    }
  }

  return {
    status: partial ? 'partial_success' : 'success',
    dataDate, stocksProcessed: signals.length,
    eligibleACount, eligibleBCount, excludedCount, excludeStats, errorMessage,
  };
}
