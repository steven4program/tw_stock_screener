// web/lib/skin.ts — shared by server (cookie read) and client (SkinSwitcher)
export const SKINS = ['default', 'paper', 'bold'] as const;
export type Skin = (typeof SKINS)[number];
export const SKIN_COOKIE = 'skin';

export function normalizeSkin(v: string | undefined | null): Skin {
  return v && (SKINS as readonly string[]).includes(v) ? (v as Skin) : 'default';
}
