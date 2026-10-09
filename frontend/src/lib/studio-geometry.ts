import type { CSSProperties } from 'react';
import type { Framing } from './studio';
export const defaultFraming: Framing = { mode: 'fill', zoom: 1, x: .5, y: .5 };
export function videoFrame(width: number, height: number, value?: Framing): CSSProperties {
  const f = { ...defaultFraming, ...value };
  const scale = (f.mode === 'fill' ? Math.max(1080 / width, 1920 / height) : Math.min(1080 / width, 1920 / height)) * f.zoom;
  const w = width * scale, h = height * scale;
  return { position: 'absolute', width: `${w / 1080 * 100}%`, height: `${h / 1920 * 100}%`, left: `${(1080 - w) * f.x / 1080 * 100}%`, top: `${(1920 - h) * f.y / 1920 * 100}%`, maxWidth: 'none', objectFit: 'fill' };
}
export const sourceTime = (time: number, start: number, duration: number) => duration > 0 ? ((time + start) % duration + duration) % duration : 0;
