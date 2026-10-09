"use client";
import { useRef } from 'react';
import type { Framing } from '@/lib/studio';
import { defaultFraming } from '@/lib/studio-geometry';
export function CropControls({ value, onChange, disabled }: { value?: Framing; onChange: (f: Framing) => void; disabled: boolean }) {
  const f = { ...defaultFraming, ...value };
  return <fieldset disabled={disabled} className="studio-crop-controls"><legend>Clip framing</legend>
    <div className="studio-actions">{(['fit','fill'] as const).map(mode => <button type="button" key={mode} aria-pressed={f.mode === mode} onClick={() => onChange({ ...f, mode })}>{mode === 'fit' ? 'Fit' : 'Fill'}</button>)}<button onClick={() => onChange(defaultFraming)}>Reset Crop</button></div>
    <label>Zoom {f.zoom.toFixed(2)}×<input aria-label="Crop zoom" type="range" min="1" max="4" step="0.01" value={f.zoom} onChange={e => onChange({ ...f, zoom: Number(e.target.value) })}/></label>
    {(['x','y'] as const).map(axis => <label key={axis}>{axis === 'x' ? 'Horizontal position' : 'Vertical position'}<input type="range" min="0" max="1" step="0.01" value={f[axis]} onChange={e => onChange({ ...f, [axis]: Number(e.target.value) })}/></label>)}
    <p>Drag the video to reframe it, or pinch to zoom. Fit may add black borders; Fill keeps the frame covered.</p>
  </fieldset>;
}
export function useCropGesture(value: Framing | undefined, change: (f: Framing) => void) {
  const points = useRef(new Map<number, { x: number; y: number }>());
  return {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); points.current.set(e.pointerId, { x:e.clientX,y:e.clientY }); },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const old=points.current.get(e.pointerId); if (!old) return;
      const f={...defaultFraming,...value}, box=e.currentTarget.getBoundingClientRect();
      const other=[...points.current.entries()].find(([id]) => id!==e.pointerId)?.[1];
      if(other) { const a=Math.hypot(old.x-other.x,old.y-other.y), b=Math.hypot(e.clientX-other.x,e.clientY-other.y); if(a>5) change({...f,zoom:Math.max(1,Math.min(4,f.zoom*b/a))}); }
      else change({...f,x:Math.max(0,Math.min(1,f.x-(e.clientX-old.x)/box.width)),y:Math.max(0,Math.min(1,f.y-(e.clientY-old.y)/box.height))});
      points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {points.current.delete(e.pointerId);},
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => {points.current.delete(e.pointerId);},
  };
}
