// web/app/page.tsx
import { cookies } from 'next/headers';
import { getLatestSnapshot } from '@/lib/snapshot.server';
import { normalizeSkin, SKIN_COOKIE } from '@/lib/skin';
import { PageTitle } from '@/components/screener/PageTitle';
import { SkinSwitcher } from '@/components/screener/SkinSwitcher';
import { StatusBar } from '@/components/screener/StatusBar';
import { Screener } from '@/components/screener/Screener';
import { Footer } from '@/components/screener/Footer';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const snap = await getLatestSnapshot();
  const skin = normalizeSkin((await cookies()).get(SKIN_COOKIE)?.value);

  return (
    <main className="app">
      <div className="app-title">
        <PageTitle />
        <SkinSwitcher current={skin} />
      </div>

      {snap.scenario === 'no_data' ? (
        <div className="no-data card">
          <div className="nd-ico" aria-hidden="true">📊</div>
          <div className="nd-title serif">資料準備中</div>
          <div className="nd-sub">每日晚上 10:00 收盤後自動更新，更新後即可看到當日選股，請晚一點再回來看看。</div>
        </div>
      ) : (
        <>
          <StatusBar scenario={snap.scenario} dataDate={snap.dataDate}
            lastSuccessDate={snap.lastSuccessDate} directorDataMonthLatest={snap.directorDataMonthLatest} />
          <Screener signals={snap.signals} dataDate={snap.dataDate as string}
            directorDataMonthLatest={snap.directorDataMonthLatest} />
          <Footer />
        </>
      )}
    </main>
  );
}
