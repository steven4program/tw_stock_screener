// web/lib/fonts.ts — CJK fonts via next/font/google (no subsets, preload:false; see plan gotcha 5)
import { Noto_Sans_TC, Noto_Serif_TC } from 'next/font/google';

export const notoSans = Noto_Sans_TC({
  weight: ['400', '600', '700', '800', '900'],
  display: 'swap',
  preload: false,
  variable: '--font-sans-tc',
  fallback: ['system-ui', 'sans-serif'],
});

export const notoSerif = Noto_Serif_TC({
  weight: ['700'],
  display: 'swap',
  preload: false,
  variable: '--font-serif-tc',
  fallback: ['Songti TC', 'serif'],
});
