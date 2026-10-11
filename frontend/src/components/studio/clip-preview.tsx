"use client";
import { useEffect, useRef, useState } from 'react';
import { PlayerIcon } from '../player-icon';
import { Media } from '@/lib/studio';

// Posters only until a user presses Play. Release offscreen media connections.
export function ClipPreview({ media, label, start = 0, length, onPlay }: {
  media: Media; label: string; start?: number; length?: number; onPlay: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  async function togglePreview() {
    const element = video.current;
    if (!element) return;
    if (!element.paused) { element.pause(); return; }
    setFailed(false);
    window.dispatchEvent(new CustomEvent('vaulted:clip-preview', { detail: element }));
    onPlay();
    // Start playback directly in the tap handler for mobile autoplay policies.
    if (!element.getAttribute('src')) element.src = media.preview_url;
    else if (element.error) element.load();
    setActive(true);
    if (element.ended) element.currentTime = start;
    try { await element.play(); } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setFailed(true);
    }
  }
  useEffect(() => {
    const element = video.current!;
    const release = () => {
      element.pause();
      if (element.hasAttribute('src')) { element.removeAttribute('src'); element.load(); }
    };
    const reset = () => { release(); setActive(false); setPlaying(false); setFailed(false); };
    const otherPreview = (event: Event) => { if ((event as CustomEvent).detail !== element) reset(); };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) reset();
    });
    observer.observe(element);
    window.addEventListener('vaulted:clip-preview', otherPreview);
    return () => { observer.disconnect(); window.removeEventListener('vaulted:clip-preview', otherPreview); release(); };
  }, [media.preview_url]);
  return <div className="studio-clip-preview">
    <video ref={video} controls={active} muted playsInline preload="none" poster={media.thumbnail || undefined}
      aria-label={label}
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
    {failed && <div role="status">Video preview unavailable. <button type="button" className="secondary" onClick={() => void togglePreview()}>Retry preview</button></div>}
  </div>;
}
