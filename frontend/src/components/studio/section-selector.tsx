"use client";
import { useEffect, useRef, useState } from 'react';

export function timestamp(seconds: number) {
  const ticks = Math.round(Math.max(0, seconds) * 10);
  return `${Math.floor(ticks / 600)}:${String(Math.floor(ticks / 10) % 60).padStart(2, '0')}.${ticks % 10}`;
}

export function SectionSelector({ endpoint, duration, start, end, elapsed, onChange }: {
  endpoint: string; duration: number; start: number; end: number; elapsed: number;
  onChange: (start: number, end: number) => void;
}) {
  const [peaks, setPeaks] = useState<number[]>([]);
  const [failed, setFailed] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number; end: number; width: number } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal, credentials: 'same-origin' })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => setPeaks(data.peaks)).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [endpoint]);
  const length = end - start;
  const maximum = Math.max(...peaks, 0.001);
  function move(value: number) {
    const next = Math.max(0, Math.min(duration - length, value));
    onChange(Number(next.toFixed(2)), Number((next + length).toFixed(2)));
  }
  return <div className="section-selector">
    <p><strong>{timestamp(start)} → {timestamp(end)}</strong> · {length.toFixed(1)} seconds</p>
    <div className="section-wave" ref={surface}>
      <svg viewBox="0 0 720 80" preserveAspectRatio="none" role="img" aria-label="Song waveform">
        {peaks.map((peak, index) => { const height = Math.max(1, peak / maximum * 66); return <rect key={index} x={index / peaks.length * 720} y={(80 - height) / 2} width={720 / peaks.length * .65} height={height} fill="var(--muted)" />; })}
      </svg>
      <div className="section-window" role="slider" tabIndex={0} aria-label="Move selected section" aria-valuemin={0} aria-valuemax={Math.max(0, duration - length)} aria-valuenow={start} aria-valuetext={`${timestamp(start)} to ${timestamp(end)}`}
        style={{ left: `${start / duration * 100}%`, width: `${length / duration * 100}%` }}
        onKeyDown={event => { const delta = event.shiftKey ? 5 : 1; if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); move(event.key === 'Home' ? 0 : event.key === 'End' ? duration - length : start + (event.key === 'ArrowLeft' ? -delta : delta)); } }}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, start, end, width: surface.current!.getBoundingClientRect().width }; }}
        onPointerMove={event => { const origin = drag.current; if (!origin) return; const width = origin.end - origin.start; const value = Math.max(0, Math.min(duration - width, origin.start + (event.clientX - origin.x) / origin.width * duration)); onChange(Number(value.toFixed(2)), Number((value + width).toFixed(2))); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { const origin = drag.current; drag.current = null; if (origin) onChange(origin.start, origin.end); }}><span aria-hidden="true">↔</span></div>
      {elapsed >= start && elapsed <= end && <span className="section-playhead" style={{ left: `${elapsed / duration * 100}%` }} />}
    </div>
    <div className="section-ruler" aria-label="Waveform times">{[0, .25, .5, .75, 1].map(fraction => <span key={fraction}>{timestamp(duration * fraction)}</span>)}</div>
    <p className="muted">Drag the highlighted window to move your selection. Arrow keys move one second; Shift + arrow moves five.</p>
    {failed && <p role="status">Waveform unavailable. The selection controls still work.</p>}
  </div>;
}
