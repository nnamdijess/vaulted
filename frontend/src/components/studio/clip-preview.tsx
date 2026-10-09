"use client";
import { useEffect, useRef, useState } from 'react';
import { PlayerIcon } from '../player-icon';
import { Media } from '@/lib/studio';

// Load only nearby cards, and never autoplay a grid of stock footage.
export function ClipPreview({ media, label, start = 0, length, onPlay }: {
  media: Media; label: string; start?: number; length?: number; onPlay: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  async function togglePreview() {
    const element = video.current;
    if (!element) return;
    if (!element.paused) { element.pause(); return; }
    setFailed(false);
    // Start playback directly in the tap handler for mobile autoplay policies.
    if (!element.getAttribute('src')) { element.src = media.preview_url; setVisible(true); }
    if (element.ended) element.currentTime = start;
    try { await element.play(); } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setFailed(true);
    }
  }
  useEffect(() => {
    const element = video.current!;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
      else element.pause();
    }, { rootMargin: '200px' });
    observer.observe(element);
    return () => { observer.disconnect(); element.pause(); };
  }, []);
  return <div className="studio-clip-preview">
    <video ref={video} controls muted playsInline preload="metadata" poster={media.thumbnail || undefined}
      src={visible ? media.preview_url : undefined} aria-label={label}
      onLoadedMetadata={event => {
        // Seeking slightly into the video also displays a frame on iOS without a poster.
        event.currentTarget.currentTime = Math.min(start + 0.01, event.currentTarget.duration);
      }}
      onPlay={event => {
        const element = event.currentTarget;
        setPlaying(true);
        document.querySelectorAll<HTMLVideoElement>('.studio-workspace video').forEach(other => { if (other !== element) other.pause(); });
        if (element.currentTime < start || (length !== undefined && element.currentTime >= start + length)) element.currentTime = start;
        onPlay();
      }}
      onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onTimeUpdate={event => {
        if (length !== undefined && event.currentTarget.currentTime >= start + length) event.currentTarget.pause();
      }} onError={() => setFailed(true)} />
    <button type="button" className="studio-preview-toggle" aria-label={`${playing ? 'Pause' : 'Play'} ${label}`} onClick={() => void togglePreview()}><PlayerIcon name={playing ? 'pause' : 'play'} /><span>{playing ? 'Pause preview' : 'Play preview'}</span></button>
    {failed && <div role="status">Video preview unavailable. <button type="button" className="secondary" onClick={() => { setFailed(false); video.current?.load(); }}>Retry preview</button></div>}
  </div>;
}
