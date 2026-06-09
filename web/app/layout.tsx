// web/app/layout.tsx
import './globals.css';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { notoSans, notoSerif } from '@/lib/fonts';
import { normalizeSkin, SKIN_COOKIE } from '@/lib/skin';

export const metadata = {
  title: '台股選股器',
  description: '每日收盤後・上市＋上櫃技術選股',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const skin = normalizeSkin((await cookies()).get(SKIN_COOKIE)?.value);
  return (
    <html lang="zh-Hant" data-skin={skin} className={`${notoSans.variable} ${notoSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
