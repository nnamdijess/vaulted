"use client";
import { PlayerIcon } from "./player-icon";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, apiUrl } from '@/lib/api';
import { usePlayer } from './audio-player';

type Result = { id: number; project_id: number; title: string; artist: string; song_artist: string; fallback_artist: string; uses_owner_name: boolean; version_name: string | null; latest_version_id: number | null; project_name: string; cover_path: string | null };
export function SongSearch({ onNavigate }: { onNavigate?: () => void }) {
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{ query: string; offset: number; items: Result[]; has_more: boolean } | null>(null);
  const [error, setError] = useState('');
  const player = usePlayer();
  useEffect(() => {
    if (!query.trim()) return;
    let active = true; const controller = new AbortController();
    const timer = setTimeout(() => {
      void api<{ items: Result[]; has_more: boolean }>(`/search/songs?q=${encodeURIComponent(query)}&offset=${offset}`, { signal: controller.signal })
        .then(data => { if (active) setResult({ query, offset, ...data }); })
        .catch(err => { if (active) setError(err.message); });
    }, 250);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, offset]);
  const loading = query.trim() && !error && (result?.query !== query || result?.offset !== offset);
  return <section className="song-search" aria-label="Song search">
    <div className="search-controls"><label>Search songs<input data-initial-focus type="search" value={query} maxLength={200} placeholder="Find a song in your Vault" onChange={e => { setQuery(e.target.value); setOffset(0); setError(''); }} /></label>{query && <button className="secondary" onClick={() => { setQuery(''); setError(''); setOffset(0); }}>Clear search</button>}</div>
    {error && <p role="alert">{error} <button onClick={() => { setError(''); setResult(null); setQuery(query + ' '); }}>Retry</button></p>}
    {loading && <p role="status">Searching...</p>}
    {query.trim() && !loading && !error && result && <><ul className="search-results">{result.items.map(song => <li key={song.id}>
      <span className="search-cover">{song.cover_path ?
        // eslint-disable-next-line @next/next/no-img-element -- private local cover
        <img src={apiUrl(`/songs/${song.id}/cover?v=${encodeURIComponent(song.cover_path)}`)} alt={`${song.project_name} cover`} /> : <span aria-hidden="true">♫</span>}</span>
      <div><Link onClick={onNavigate} href={`/songs/${song.id}`}>{song.title}</Link><small>{song.artist}</small><Link className="muted" href={`/projects/${song.project_id}`}>{song.project_name}</Link></div>
      <button disabled={!song.latest_version_id} aria-label={`Play ${song.title}`} onClick={() => player.playQueue([{ songId: song.id, projectId: song.project_id, title: song.title, artist: song.song_artist, fallbackArtist: song.fallback_artist, usesOwnerName: song.uses_owner_name, versionName: song.version_name, versionId: song.latest_version_id!, preservedCover:true, coverUrl: song.cover_path ? apiUrl(`/songs/${song.id}/cover?v=${encodeURIComponent(song.cover_path)}`) : undefined }])}><PlayerIcon name="play" /></button>
    </li>)}</ul>{!result.items.length && <p role="status">No songs found.</p>}<div className="dialog-buttons">{offset > 0 && <button onClick={() => { setError(''); setOffset(Math.max(0,offset-50)); }}>Previous results</button>}{result.has_more && <button onClick={() => { setError(''); setOffset(offset+50); }}>More results</button>}</div></>}
  </section>;
}
