export const accentPresets: Record<string, string> = { green: '#9be532', blue: '#58adff', purple: '#b28aff', pink: '#ff75b5', orange: '#ff9b42', teal: '#30d6bb' };
export function accentHex(color: string) { return /^#[0-9a-f]{6}$/i.test(color) ? color : accentPresets[color] ?? accentPresets.green; }
function luminance(rgb: number[]) { return rgb.map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0); }
export function readableAccent(hex: string, light: boolean) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const bg = luminance(light ? [247, 248, 244] : [16, 17, 19]);
  for (let step = 0; step <= 100; step++) {
    const next = rgb.map(v => Math.round(v + ((light ? 0 : 255) - v) * step / 100));
    const fg = luminance(next);
    if ((Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) >= 4.5) return '#' + next.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  return light ? '#000000' : '#ffffff';
}
