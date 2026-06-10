// web/components/screener/StatusBar.tsx — static, server-rendered
import type { Scenario } from '@/lib/snapshot';

export function StatusBar({ scenario, dataDate, lastSuccessDate, directorDataMonthLatest }: {
  scenario: Scenario;
  dataDate: string | null;
  lastSuccessDate: string | null;
  directorDataMonthLatest: string | null;
}) {
  let tone = 'ok', ico = '✅', main = '', sub: string | null = null;
  if (scenario === 'stale') {
    tone = 'warn'; ico = '⚠️'; main = `資料尚未更新（以下為 ${lastSuccessDate} 最後更新內容）`;
  } else if (scenario === 'failed') {
    tone = 'bad'; ico = '⛔'; main = `更新失敗（顯示為上次成功資料 ${lastSuccessDate}）`;
  } else if (scenario === 'partial') {
    tone = 'warn'; ico = '⚠️'; main = `今日已更新 ・ 部分資料較舊`;
    sub = directorDataMonthLatest ? `董監資料沿用 ${directorDataMonthLatest} 月份` : '董監資料暫缺';
  } else {
    main = `今日已更新 ・ 資料日期 ${dataDate}`;
  }
  return (
    <div className="status card" data-tone={tone} role="status" aria-live="polite">
      <span className="ico" aria-hidden="true">{ico}</span>
      <div className="st-text">
        <div className="st-main">{main}</div>
        {sub && <span className="st-sub">{sub}</span>}
      </div>
      {/* 更新時間需與 web/vercel.json 的 cron（0 14 * * * = 台灣 22:00）一致 */}
      <span className="st-freq">🕙 每日晚上 10:00 自動更新</span>
    </div>
  );
}
