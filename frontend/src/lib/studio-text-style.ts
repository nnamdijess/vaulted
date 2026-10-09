import type { CSSProperties } from 'react';

export type TextStyle = { letter_spacing?: number; text_width?: number; color: string; font: 'default' | 'abel' | 'anton' | 'lobster' | 'blackletter' | 'mono'; align: 'left' | 'center' | 'right' };
export const studioFonts = { default: 'sans-serif', abel: 'Vaulted Abel', anton: 'Vaulted Anton', lobster: 'Vaulted Lobster', blackletter: 'Vaulted Blackletter', mono: 'Vaulted Mono' };
export function resolveTextStyle(style: Partial<TextStyle> | undefined, preset: string): TextStyle {
  return { color: preset === 'highlight' ? '#FFFF80' : '#FFFFFF', font: 'default', align: 'center', ...style };
}
export function lyricCss(style: TextStyle): CSSProperties {
  return { color: style.color, fontFamily: studioFonts[style.font], textAlign: style.align, letterSpacing: `${style.letter_spacing ?? 0}em`, width: `${style.text_width ?? 82}%`, left: `${(100 - (style.text_width ?? 82)) / 2}%`, right: 'auto' };
}
