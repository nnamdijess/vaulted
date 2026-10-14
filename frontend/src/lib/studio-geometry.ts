import type { CSSProperties } from 'react';
import { outputDimensions, type OutputFormat, type Framing } from './studio';
export const defaultFraming: Framing = { mode: 'fill', zoom: 1, x: .5, y: .5 };
export function videoFrame(width: number, height: number, value?: Framing, format?: OutputFormat): CSSProperties {
  const [cw,ch] = outputDimensions(format);
  const f = { ...defaultFraming, ...value };
  const scale = (f.mode === 'fill' ? Math.max(cw / width, ch / height) : Math.min(cw / width, ch / height)) * f.zoom;
  const w = width * scale, h = height * scale;
  return { position: 'absolute', width: `${w / cw * 100}%`, height: `${h / ch * 100}%`, left: `${(cw - w) * f.x / cw * 100}%`, top: `${(ch - h) * f.y / ch * 100}%`, maxWidth: 'none', objectFit: 'fill' };
}
export const sourceTime = (time: number, start: number, duration: number) => duration > 0 ? ((time + start) % duration + duration) % duration : 0;
