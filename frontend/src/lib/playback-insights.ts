"use client";
import { useRef } from "react";

export function streamThreshold(duration: number) { return Math.min(30, duration / 2); }

type Playback = { id: string; session: string; endpoint: string; heard: number; previous: number; wallTime: number; sent: boolean; pending: boolean; retryAt: number };
function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // getRandomValues is also available on plain HTTP LAN origins.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function usePlaybackInsights() {
  const playback = useRef<Playback | null>(null);
  function begin(endpoint: string) {
    let session = randomId();
    try {
      const saved = sessionStorage.getItem('unreleased-listener');
      if (saved) session = saved;
      else sessionStorage.setItem('unreleased-listener', session);
    } catch { /* Ephemeral in-memory session when storage is unavailable. */ }
    playback.current = { id: randomId(), session, endpoint, heard: 0, previous: 0, wallTime: performance.now(), sent: false, pending: false, retryAt: 0 };
  }
  function resetSample(audio: HTMLAudioElement) {
    const event = playback.current;
    if (event) { event.previous = audio.currentTime; event.wallTime = performance.now(); }
  }
  function tick(audio: HTMLAudioElement) {
    const event = playback.current;
    if (!event) return;
    const now = performance.now();
    const delta = audio.currentTime - event.previous;
    const wall = (now - event.wallTime) / 1000;
    event.previous = audio.currentTime; event.wallTime = now;
    // Seek jumps, paused time and playback-rate acceleration are not listening time.
    if (!audio.seeking && delta > 0 && delta <= wall * Math.max(1, audio.playbackRate) + 0.25) {
      event.heard += Math.min(delta, wall);
    }
    if (!Number.isFinite(audio.duration) || audio.duration <= 0 || event.heard < streamThreshold(audio.duration) || event.sent || event.pending || now < event.retryAt) return;
    event.pending = true;
    void fetch(event.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ playback_id: event.id, session_id: event.session, listened_seconds: event.heard, duration: audio.duration }),
    }).then((response) => {
      if (response.ok || response.status === 404) event.sent = true;
      else event.retryAt = performance.now() + 5000;
    }).catch(() => { event.retryAt = performance.now() + 5000; }).finally(() => { event.pending = false; });
  }
  return { begin, resetSample, tick };
}
