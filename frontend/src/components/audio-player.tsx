"use client";

import { Waveform } from "./waveform";
import Link from "next/link";
import { createContext, useContext, useRef, useState } from "react";
import { apiUrl, Project, projectCoverUrl, Song } from "@/lib/api";
import { usePlaybackInsights } from "@/lib/playback-insights";

export type QueueTrack = { songId: number; title: string; artist: string; versionId: number; publicToken?: string; projectId?: number; coverUrl?: string };
export function trackFor(song: Song, project?: Project | null): QueueTrack | null {
  return song.latest_version_id ? { songId: song.id, title: song.title, artist: song.artist, versionId: song.latest_version_id, projectId: song.project_id, coverUrl: projectCoverUrl(project) } : null;
}

type Player = {
  current: QueueTrack | null;
  playing: boolean;
  playQueue: (tracks: QueueTrack[], index?: number) => void;
  toggle: () => void;
  updateSong: (song: Song) => void;
  updateProject: (project: Project) => void;
  removeSong: (songId: number) => void;
  removeSongs: (songIds: number[]) => void;
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

function PlayerArtwork({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="mini-cover">{src && !failed
    // Uploaded artwork uses the same owner/token-scoped URL as its project.
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt={`Cover for ${title}`} onError={() => setFailed(true)} />
    : <span aria-hidden="true">♫</span>}</span>;
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
  const canPlay = Boolean(current);
  const canPrevious = Boolean(current && index > 0);
  const canNext = Boolean(current && index < queue.length - 1);
  const insights = usePlaybackInsights();
  const waveformEndpoint = current ? current.publicToken ? `/api/public/${encodeURIComponent(current.publicToken)}/songs/${current.songId}/waveform` : apiUrl(`/versions/${current.versionId}/waveform`) : null;

  function resume() {
    const element = audio.current;
    if (!element) return;
    setError("");
    void element.play().catch((err: Error) => {
      if (err.name !== "AbortError") setError("Playback could not start. Press play to retry or choose another track.");
    });
  }
  function playQueue(tracks: QueueTrack[], start = 0, autoPlay = true) {
    if (!tracks[start] || !audio.current) return;
    queueRef.current = tracks;
    indexRef.current = start;
    setQueue(tracks); setIndex(start); setElapsed(0); setDuration(0); setError("");
    const track = tracks[start];
    const publicBase = track.publicToken ? `/api/public/${encodeURIComponent(track.publicToken)}/songs/${track.songId}` : null;
    insights.begin(publicBase ? `${publicBase}/listens` : apiUrl(`/songs/${track.songId}/listens`));
    audio.current.src = publicBase ? `${publicBase}/audio` : apiUrl(`/versions/${track.versionId}/audio`);
    if (autoPlay) resume();
    else audio.current.load();
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
  function updateProject(project: Project) {
    queueRef.current = queueRef.current.map((track) => track.projectId === project.id && !track.publicToken
      ? { ...track, coverUrl: projectCoverUrl(project) } : track);
    setQueue(queueRef.current);
  }
  function removeSong(songId: number) {
    removeSongs([songId]);
  }
  function removeSongs(songIds: number[]) {
    const removed = new Set(songIds);
    const oldCurrent = queueRef.current[indexRef.current];
    const remaining = queueRef.current.filter((track) => !removed.has(track.songId));
    if (oldCurrent && removed.has(oldCurrent.songId)) {
      const wasPlaying = Boolean(audio.current && !audio.current.paused);
      audio.current?.pause();
      if (remaining.length) playQueue(remaining, Math.min(indexRef.current, remaining.length - 1), wasPlaying);
      else {
        queueRef.current = []; indexRef.current = 0; setIndex(0); setQueue([]); setElapsed(0); setDuration(0); setError(''); setPlaying(false);
        audio.current?.removeAttribute("src"); audio.current?.load();
      }
    } else {
      queueRef.current = remaining;
      indexRef.current = Math.max(0, remaining.findIndex((track) => track === oldCurrent));
      setQueue(remaining); setIndex(indexRef.current);
    }
  }

  return <Context.Provider value={{ current, playing, playQueue, toggle, updateSong, updateProject, removeSong, removeSongs }}>
    {children}
    <aside className="audio-dock" aria-label="Audio player">
      <audio ref={audio} data-testid="global-audio" preload="metadata"
        onPlay={() => { setPlaying(true); if (audio.current) insights.resetSample(audio.current); }} onPause={() => setPlaying(false)}
        onSeeking={() => { if (audio.current) insights.resetSample(audio.current); }}
        onSeeked={() => { if (audio.current) insights.resetSample(audio.current); }}
        onTimeUpdate={() => { setElapsed(audio.current?.currentTime ?? 0); if (audio.current) insights.tick(audio.current); }}
        onDurationChange={() => setDuration(Number.isFinite(audio.current?.duration) ? audio.current!.duration : 0)}
        onEnded={() => { setPlaying(false); move(1); }}
        onError={() => { setPlaying(false); setError("Unable to play this file. Check the backend and browser codec support."); }} />
      <div className="now-playing"><PlayerArtwork key={current?.coverUrl ?? 'placeholder'} src={current?.coverUrl} title={current?.title ?? 'current track'} /><div>
        {current ? <Link href={current.publicToken ? `/share/${current.publicToken}` : `/songs/${current.songId}`}>{current.title}</Link> : <strong>Nothing playing</strong>}
        <small>{current?.artist || (current ? "Unreleased" : "Choose a track to listen")}</small>
      </div></div>
      <div className="transport">
        <button className="icon-button" aria-label="Previous track" disabled={!canPrevious} onClick={() => move(-1)}>⏮</button>
        <button className="play-button" aria-label={playing ? "Pause playback" : "Resume playback"} disabled={!canPlay} onClick={toggle}>{playing ? "Ⅱ" : "▶"}</button>
        <button className="icon-button" aria-label="Next track" disabled={!canNext} onClick={() => move(1)}>⏭</button>
      </div>
      <div className="timeline"><span aria-label="Elapsed time">{clock(elapsed)}</span>
        <Waveform key={waveformEndpoint ?? 'empty'} endpoint={waveformEndpoint} elapsed={elapsed} duration={duration} onSeek={time => {
          if (audio.current) { audio.current.currentTime = time; insights.resetSample(audio.current); }
          setElapsed(time);
        }} /><span aria-label="Duration">{clock(duration)}</span></div>
      {error && <p role="alert" className="player-error">{error}</p>}
    </aside>
  </Context.Provider>;
}
