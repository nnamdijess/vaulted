import type { CSSProperties } from 'react';

export type TextStyle = { font_size?: number | null; bold?: boolean; italic?: boolean; underline?: boolean; letter_spacing?: number; text_width?: number; color: string; font: 'default' | 'abel' | 'anton' | 'lobster' | 'blackletter' | 'mono' | 'bebas' | 'dela' | 'bowlby' | 'montserrat' | 'playfair' | 'oswald' | 'unbounded' | 'josefin'; align: 'left' | 'center' | 'right' };
export const studioFonts = { default: 'sans-serif', abel: 'Vaulted Abel', anton: 'Vaulted Anton', lobster: 'Vaulted Lobster', blackletter: 'Vaulted Blackletter', mono: 'Vaulted Mono', bebas: 'Vaulted Bebas Neue', dela: 'Vaulted Dela Gothic One', bowlby: 'Vaulted Bowlby One SC', montserrat: 'Vaulted Montserrat', playfair: 'Vaulted Playfair Display', oswald: 'Vaulted Oswald', unbounded: 'Vaulted Unbounded', josefin: 'Vaulted Josefin Sans' };
export function resolveTextStyle(style: Partial<TextStyle> | undefined, preset: string): TextStyle {
  return { color: preset === 'highlight' ? '#FFFF80' : '#FFFFFF', font: 'default', align: 'center', ...style, font_size: style?.font_size ?? (preset === 'large' ? 72 : 48) };
}
export function lyricCss(style: TextStyle): CSSProperties {
  return { fontWeight: style.bold ? 700 : 400, fontStyle: style.italic ? 'italic' : 'normal', textDecoration: style.underline ? 'underline' : 'none', color: style.color, fontFamily: studioFonts[style.font], textAlign: style.align, letterSpacing: `${style.letter_spacing ?? 0}em`, width: `${style.text_width ?? 82}%`, left: `${(100 - (style.text_width ?? 82)) / 2}%`, right: 'auto' };
}
