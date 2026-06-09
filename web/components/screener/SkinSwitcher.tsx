// web/components/screener/SkinSwitcher.tsx
'use client';
import { useState } from 'react';
import { SKINS, type Skin, SKIN_COOKIE } from '@/lib/skin';

const LABELS: Record<Skin, string> = { default: '預設', paper: '報紙', bold: '大字高對比' };

export function SkinSwitcher({ current }: { current: Skin }) {
  const [skin, setSkin] = useState<Skin>(current);
  const choose = (s: Skin) => {
    setSkin(s);
    document.documentElement.dataset.skin = s;
    document.cookie = `${SKIN_COOKIE}=${s}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <div className="skin-switcher" role="group" aria-label="顯示樣式">
      <span className="ss-label">顯示樣式</span>
      {SKINS.map((s) => (
        <button key={s} type="button" aria-pressed={skin === s} onClick={() => choose(s)}>
          {LABELS[s]}
        </button>
      ))}
    </div>
  );
}
