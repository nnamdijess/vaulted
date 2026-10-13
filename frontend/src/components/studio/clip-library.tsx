"use client";
import { useRef, useState } from 'react';
import { api, postJson } from '@/lib/api';
import { Media } from '@/lib/studio';

type Runner = (work: () => Promise<void>) => Promise<void>;

export function ClipLibraryTools({ disabled, run, onResults, mode = 'upload' }: { mode?: 'upload' | 'library'; disabled: boolean; run: Runner; onResults: (items: Media[]) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const [failures, setFailures] = useState<{ name: string; message: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const active = useRef(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [duplicateStatus, setDuplicateStatus] = useState('');
  return <section aria-label="Your clip library">
    <h3>{mode === 'upload' ? 'Upload media' : 'Find your clips'}</h3>
    <form hidden={mode !== 'upload'} onSubmit={event => { event.preventDefault(); void run(async () => {
      if (active.current) return;
      active.current = true; setUploading(true); setFailures([]); setDuplicates([]);
      const batch = [...files];
      const remaining: File[] = [];
      const errors: { name: string; message: string }[] = [];
      const uploaded: Media[] = [];
      const skipped: string[] = [];
      // The native file input cannot represent a partially completed queue.
      if (picker.current) picker.current.value = '';
      try {
        for (const [index, file] of batch.entries()) {
          setStatus(`Uploading and preparing ${file.name} (${index + 1}/${batch.length})…`);
          try {
            const body = new FormData(); body.append('file', file);
            const result = await api<Media & { duplicate?: boolean }>('/studio/media/upload', { method: 'POST', body });
            uploaded.push(result);
            if (result.duplicate) { skipped.push(file.name); setDuplicates([...skipped]); }
            onResults([...new Map(uploaded.map(item => [item.id, item])).values()]);
          } catch (error) {
            remaining.push(file);
            const message = error instanceof Error ? error.message : 'Upload failed. Please try again.';
            errors.push({ name: file.name, message });
            setFailures([...errors]);
          }
        }
        setStatus(skipped.length
          ? `${uploaded.length - skipped.length} new clips saved. ${skipped.length} already in your library.${errors.length ? ` ${errors.length} failed; only those files are queued for retry.` : ''}`
          : errors.length
            ? `${uploaded.length} of ${batch.length} clips uploaded. ${errors.length} failed; only those files are queued for retry.`
            : `${uploaded.length} clips added to Saved clips.`);
      } finally {
        setFiles(remaining); setUploading(false); active.current = false;
      }
    }); }}>
      <label>Video files<input ref={picker} type="file" multiple accept=".mp4,.mov,.m4v,.webm,.gif" disabled={disabled || uploading} onChange={event => { setFiles(Array.from(event.target.files || [])); setStatus(''); setFailures([]); setDuplicates([]); }} /></label>
      <p>MP4, MOV, M4V, WebM or animated GIF. GIFs become MP4 clips using one animation cycle. Up to 250 MiB and 10 minutes per clip. Videos are copied into your private library and prepared without audio for Studio.</p>
      {!!files.length && !uploading && <p>{files.length} files queued.</p>}
      <button disabled={disabled || uploading || !files.length}>{failures.length && !uploading ? 'Retry failed uploads' : 'Upload videos'}{files.length ? ` (${files.length})` : ''}</button>
      <p role="status">{status}</p>
      {!!duplicates.length && <details><summary>Already uploaded ({duplicates.length})</summary><p>These files reused the saved clip instead of creating another copy.</p><ul>{duplicates.map((name,index) => <li key={index}>{name}</li>)}</ul></details>}
      {!!failures.length && <div role="alert"><p>These files could not be uploaded:</p><ul>{failures.map((failure, index) => <li key={index}><strong>{failure.name}</strong>: {failure.message}</li>)}</ul><p>If a connection was interrupted, check My clips before retrying: the server may have saved the video even if its response was lost.</p></div>}
    </form>
    <form hidden={mode !== 'library'} onSubmit={event => { event.preventDefault(); void run(async () => onResults(await api<Media[]>(`/studio/media/favorites?q=${encodeURIComponent(query)}`))); }}>
      <label>Search saved clips<input value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="Title or tag, e.g. neon" /></label>
      <button disabled={disabled}>Filter saved clips</button>
      <button type="button" className="secondary" disabled={disabled} onClick={() => void run(async () => {
        setDuplicateStatus('Checking uploaded clips…');
        try {
          const copies = await api<Media[]>('/studio/media/duplicates');
          onResults(copies);
          setDuplicateStatus(copies.length ? `${copies.length} extra copies found. The oldest copy of each clip is kept out of this list. Use the trash buttons to delete extras; clips used by projects or pending renders are protected.` : 'No exact duplicate clips found.');
        } catch (error) { setDuplicateStatus(error instanceof Error ? error.message : 'Could not check duplicates.'); }
      })}>Find duplicate clips</button>
      <p role="status">{duplicateStatus}</p>
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
