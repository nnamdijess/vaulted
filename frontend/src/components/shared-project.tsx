"use client";
import { useEffect, useState } from 'react';
import { QueueTrack, usePlayer } from './audio-player';
import { ThemeSwitch } from './theme-provider';

type SharedProject = { owner_name: string; name: string; artist: string; has_cover: boolean; allow_downloads: boolean; tracks: { id: number; title: string; artist: string; position: number; playable: boolean }[] };
export function SharedProjectView({ token }: { token: string }) {
  const [project, setProject] = useState<SharedProject | null>(null);
  const [error, setError] = useState('');
  const player = usePlayer();
  const base = `/api/public/${encodeURIComponent(token)}`;
  useEffect(() => {
    let active = true;
    void fetch(base, { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('This share link is unavailable.');
      const data = await response.json();
      if (active) setProject(data);
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [base]);
  const queue: QueueTrack[] = project?.tracks.filter((song) => song.playable).map((song) => ({ songId: song.id, title: song.title, artist: song.artist || project.artist || project.owner_name, versionId: 0, publicToken: token, coverUrl: project.has_cover ? `${base}/cover` : undefined })) ?? [];
  return <main><header><span className="brand">vaulted<span className="dot">.</span></span><ThemeSwitch /></header>
    {error ? <p className="error" role="alert">{error}</p> : !project ? <p>Loading shared project…</p> : <>
      <section className="album-header"><div className="album-cover">{project.has_cover
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={`${base}/cover`} alt={`${project.name} cover`} />
        : <>{project.name.slice(0,1).toUpperCase()}<span>VAULTED</span></>}</div>
        <div><p className="eyebrow">SHARED PROJECT</p><h1>{project.name}</h1><p>{project.artist} · {project.tracks.length} tracks</p><button disabled={queue.length === 0} onClick={() => player.playQueue(queue)}>▶ Play All</button></div></section>
      <ol className="track-list" aria-label="Shared tracks">{project.tracks.map((song) => <li className="track-row" key={song.id}>
        <span className="track-number">{song.position}</span><button className="row-play" aria-label={`Play ${song.title}`} disabled={!song.playable} onClick={() => {
          if (player.current?.publicToken === token && player.current.songId === song.id) player.toggle();
          else player.playQueue(queue, queue.findIndex((track) => track.songId === song.id));
        }}>{player.current?.songId === song.id && player.current.publicToken === token && player.playing ? 'Ⅱ' : '▶'}</button>
        <div className="track-title">{song.title}</div>{project.allow_downloads && song.playable && <a className="download-link" aria-label={`Download ${song.title}`} href={`${base}/songs/${song.id}/audio?download=true`}>↓</a>}
      </li>)}</ol>
    </>}
  </main>;
}
