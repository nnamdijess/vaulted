import type { CSSProperties } from 'react';

export type TextStyle = { color: string; font: 'default' | 'abel' | 'anton' | 'lobster'; align: 'left' | 'center' | 'right' };
export const studioFonts = { default: 'sans-serif', abel: 'Vaulted Abel', anton: 'Vaulted Anton', lobster: 'Vaulted Lobster' };
export function resolveTextStyle(style: Partial<TextStyle> | undefined, preset: string): TextStyle {
  return { color: preset === 'highlight' ? '#FFFF80' : '#FFFFFF', font: 'default', align: 'center', ...style };
}
export function lyricCss(style: TextStyle): CSSProperties {
  return { color: style.color, fontFamily: studioFonts[style.font], textAlign: style.align };
}
