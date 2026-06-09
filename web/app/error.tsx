// web/app/error.tsx — route-segment error boundary（接住 page.tsx／getLatestSnapshot 的拋錯，避免白屏）
'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 伺服器端已記錄帶 digest 的錯誤；這裡在瀏覽器再留一筆方便排查。
    console.error(error);
  }, [error]);

  return (
    <main className="app">
      <div className="no-data card" role="alert">
        <div className="nd-ico" aria-hidden="true">⚠️</div>
        <div className="nd-title serif">頁面載入失敗</div>
        <div className="nd-sub">讀取選股資料時發生問題，請稍後再試。</div>
        <button type="button" className="retry-btn" onClick={() => reset()}>重新載入</button>
      </div>
    </main>
  );
}
