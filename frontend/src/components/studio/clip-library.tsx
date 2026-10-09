"use client";
import { useState } from 'react';
import { api, postJson } from '@/lib/api';
import { Media } from '@/lib/studio';

type Runner = (work: () => Promise<void>) => Promise<void>;

export function ClipLibraryTools({ disabled, run, onResults, mode = 'upload' }: { mode?: 'upload' | 'library'; disabled: boolean; run: Runner; onResults: (items: Media[]) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  return <section aria-label="Your clip library">
    <h3>{mode === 'upload' ? 'Upload media' : 'Find your clips'}</h3>
    <form hidden={mode !== 'upload'} onSubmit={event => { event.preventDefault(); void run(async () => {
      const uploaded: Media[] = [];
      try {
        for (const file of files) {
          setStatus(`Uploading and preparing ${file.name} (${uploaded.length + 1}/${files.length})…`);
          const body = new FormData(); body.append('file', file);
          uploaded.push(await api<Media>('/studio/media/upload', { method: 'POST', body }));
          onResults([...uploaded]);
        }
        setStatus(`${uploaded.length} clips added to Saved clips.`);
      } catch (error) {
        setStatus(`${uploaded.length} clips saved. Remaining files were not uploaded.`);
        throw error;
      } finally { setFiles(current => current.slice(uploaded.length)); }
    }); }}>
      <label>Video files<input type="file" multiple accept=".mp4,.mov,.m4v,.webm,.gif" disabled={disabled} onChange={event => { setFiles(Array.from(event.target.files || [])); setStatus(''); }} /></label>
      <p>MP4, MOV, M4V, WebM or animated GIF. GIFs become MP4 clips using one animation cycle. Up to 250 MiB and 10 minutes per clip. Videos are copied into your private library and prepared without audio for Studio.</p>
      <button disabled={disabled || !files.length}>Upload videos{files.length ? ` (${files.length})` : ''}</button>
      <p role="status">{status}</p>
    </form>
    <form hidden={mode !== 'library'} onSubmit={event => { event.preventDefault(); void run(async () => onResults(await api<Media[]>(`/studio/media/favorites?q=${encodeURIComponent(query)}`))); }}>
      <label>Search saved clips<input value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="Title or tag, e.g. neon" /></label>
      <button disabled={disabled}>Filter saved clips</button>
    </form>
  </section>;
}

export function ClipDetails({ media, disabled, run, onSaved }: { media: Media; disabled: boolean; run: Runner; onSaved: (item: Media) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(media.title || '');
  const [tags, setTags] = useState(media.tags);
  if (!editing) return <button className="secondary" disabled={disabled} onClick={() => { setTitle(media.title || ''); setTags(media.tags); setEditing(true); }}>Edit clip details</button>;
  return <form onSubmit={event => { event.preventDefault(); void run(async () => {
    onSaved(await api<Media>(`/studio/media/${media.id}/details`, { ...postJson({ title, tags }), method: 'PUT' })); setEditing(false);
  }); }}>
    <label>Clip title<input value={title} maxLength={200} onChange={event => setTitle(event.target.value)} /></label>
    <label>Clip tags<input value={tags} maxLength={1000} onChange={event => setTags(event.target.value)} placeholder="neon, city, night" /></label>
    <div className="studio-actions"><button disabled={disabled}>Save clip details</button><button type="button" className="secondary" disabled={disabled} onClick={() => setEditing(false)}>Cancel</button></div>
  </form>;
}
