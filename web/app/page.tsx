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
          <div className="nd-sub">尚無可顯示的選股快照，請稍後再來。</div>
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
