"use client";
import { useEffect, useRef, useState } from 'react';
import { Media } from '@/lib/studio';

// Load only nearby cards, and never autoplay a grid of stock footage.
export function ClipPreview({ media, label, start = 0, length, onPlay }: {
  media: Media; label: string; start?: number; length?: number; onPlay: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
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
        document.querySelectorAll<HTMLVideoElement>('.studio-workspace video').forEach(other => { if (other !== element) other.pause(); });
        if (element.currentTime < start || (length !== undefined && element.currentTime >= start + length)) element.currentTime = start;
        onPlay();
      }}
      onTimeUpdate={event => {
        if (length !== undefined && event.currentTarget.currentTime >= start + length) event.currentTarget.pause();
      }} onError={() => setFailed(true)} />
    {failed && <div role="status">Video preview unavailable. <button type="button" className="secondary" onClick={() => { setFailed(false); video.current?.load(); }}>Retry preview</button></div>}
  </div>;
}
