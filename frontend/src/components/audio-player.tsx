"use client";

import Link from "next/link";
import { createContext, useContext, useRef, useState } from "react";
import { apiUrl, Song } from "@/lib/api";

export type QueueTrack = { songId: number; title: string; artist: string; versionId: number };
export function trackFor(song: Song): QueueTrack | null {
  return song.latest_version_id ? { songId: song.id, title: song.title, artist: song.artist, versionId: song.latest_version_id } : null;
}

type Player = {
  current: QueueTrack | null;
  playing: boolean;
  playQueue: (tracks: QueueTrack[], index?: number) => void;
  toggle: () => void;
  updateSong: (song: Song) => void;
  removeSong: (songId: number) => void;
};
const Context = createContext<Player | null>(null);
export function usePlayer() {
  const player = useContext(Context);
  if (!player) throw new Error("AudioPlayerProvider is required");
  return player;
}
function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const queueRef = useRef<QueueTrack[]>([]);
  const indexRef = useRef(0);
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const current = queue[index] ?? null;

  function resume() {
    const element = audio.current;
    if (!element) return;
    setError("");
    void element.play().catch((err: Error) => {
      if (err.name !== "AbortError") setError("Playback could not start. Press play to retry or choose another track.");
    });
  }
  function playQueue(tracks: QueueTrack[], start = 0) {
    if (!tracks[start] || !audio.current) return;
    queueRef.current = tracks;
    indexRef.current = start;
    setQueue(tracks); setIndex(start); setElapsed(0); setDuration(0); setError("");
    audio.current.src = apiUrl(`/versions/${tracks[start].versionId}/audio`);
    resume();
  }
  function toggle() {
    if (!audio.current || !queueRef.current.length) return;
    if (audio.current.paused) resume();
    else audio.current.pause();
  }
  function move(offset: number) {
    const next = indexRef.current + offset;
    if (queueRef.current[next]) playQueue(queueRef.current, next);
  }
  function updateSong(song: Song) {
    queueRef.current = queueRef.current.map((track) => track.songId === song.id ? { ...track, title: song.title, artist: song.artist } : track);
    setQueue(queueRef.current);
  }
  function removeSong(songId: number) {
    const oldCurrent = queueRef.current[indexRef.current];
    const remaining = queueRef.current.filter((track) => track.songId !== songId);
    if (oldCurrent?.songId === songId) {
      audio.current?.pause();
      if (remaining.length) playQueue(remaining, Math.min(indexRef.current, remaining.length - 1));
      else {
        queueRef.current = []; setQueue([]); setElapsed(0); setDuration(0);
        audio.current?.removeAttribute("src"); audio.current?.load();
      }
    } else {
      queueRef.current = remaining;
      indexRef.current = Math.max(0, remaining.findIndex((track) => track === oldCurrent));
      setQueue(remaining); setIndex(indexRef.current);
    }
  }

  return <Context.Provider value={{ current, playing, playQueue, toggle, updateSong, removeSong }}>
    {children}
    <aside className="audio-dock" aria-label="Audio player">
      <audio ref={audio} data-testid="global-audio" preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={() => setElapsed(audio.current?.currentTime ?? 0)}
        onDurationChange={() => setDuration(Number.isFinite(audio.current?.duration) ? audio.current!.duration : 0)}
        onEnded={() => { setPlaying(false); move(1); }}
        onError={() => { setPlaying(false); setError("Unable to play this file. Check the backend and browser codec support."); }} />
      <div className="now-playing"><span className="mini-cover" aria-hidden="true">♫</span><div>
        {current ? <Link href={`/songs/${current.songId}`}>{current.title}</Link> : <strong>Nothing playing</strong>}
        <small>{current?.artist || (current ? "Unreleased" : "Choose a track to listen")}</small>
      </div></div>
      <div className="transport">
        <button className="icon-button" aria-label="Previous track" disabled={!current || index === 0} onClick={() => move(-1)}>⏮</button>
        <button className="play-button" aria-label={playing ? "Pause playback" : "Resume playback"} disabled={!current} onClick={toggle}>{playing ? "Ⅱ" : "▶"}</button>
        <button className="icon-button" aria-label="Next track" disabled={!current || index >= queue.length - 1} onClick={() => move(1)}>⏭</button>
      </div>
      <div className="timeline"><span aria-label="Elapsed time">{clock(elapsed)}</span>
        <input aria-label="Seek audio" type="range" min={0} max={duration || 0} step="0.1" value={Math.min(elapsed, duration)} disabled={!duration} onChange={(event) => {
          const time = Number(event.target.value);
          if (audio.current) audio.current.currentTime = time;
          setElapsed(time);
        }} /><span aria-label="Duration">{clock(duration)}</span></div>
      {error && <p role="alert" className="player-error">{error}</p>}
    </aside>
  </Context.Provider>;
}
