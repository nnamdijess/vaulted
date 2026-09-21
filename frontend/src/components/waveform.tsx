"use client";
import { useEffect, useState } from 'react';

type Peaks = { peaks: number[]; duration: number };
export function Waveform({ endpoint, elapsed, duration, onSeek }: { endpoint: string | null; elapsed: number; duration: number; onSeek: (time: number) => void }) {
  const [data, setData] = useState<Peaks | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController(); let active = true;
    const timeout = setTimeout(() => controller.abort(), 65000);
    void fetch(endpoint, { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' })
      .then(async response => { if (!response.ok) throw new Error('Unavailable'); return response.json() as Promise<Peaks>; })
      .then(peaks => { if (active) setData(peaks); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [endpoint]);
  const maximum = Math.max(...(data?.peaks ?? []), 0.001);
  return <div className="waveform-area">
    <div className={`waveform ${data ? 'waveform-ready' : ''}`}>
      {data && <svg data-testid="audio-waveform" viewBox={`0 0 ${data.peaks.length * 3} 48`} preserveAspectRatio="none" aria-label="Audio waveform" role="img">
        {data.peaks.map((peak, i) => { const height = Math.max(1, peak / maximum * 44); return <rect key={i} x={i * 3} y={(48 - height) / 2} width="2" height={height} fill={i / data.peaks.length <= elapsed / (duration || 1) ? 'var(--accent)' : 'var(--muted)'} />; })}
      </svg>}
      <input aria-label="Seek audio" aria-valuetext={`${Math.floor(elapsed)} of ${Math.floor(duration)} seconds`} type="range" min={0} max={duration || 0} step="0.1" value={Math.min(elapsed, duration)} disabled={!duration} onChange={event => onSeek(Number(event.target.value))} />
    </div>
    {endpoint && !data && <small className="waveform-status">{failed ? 'Waveform unavailable — seeking still works' : 'Loading waveform…'}</small>}
  </div>;
}
