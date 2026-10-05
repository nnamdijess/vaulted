"use client";
import { useEffect, useRef, useState } from 'react';
import { api, postJson } from '@/lib/api';
import { AestheticCollection, ContentProject, Media } from '@/lib/studio';
import { usePlayer } from '../audio-player';

export function Visuals({ project, setProject, disabled, pause, run }: { project: ContentProject; setProject: (project: ContentProject) => void; disabled: boolean; pause: () => void; run: (work: () => Promise<void>) => Promise<void> }) {
  const [results, setResults] = useState<Media[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [replace, setReplace] = useState<number | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [preview, setPreview] = useState(false);
  const player = usePlayer();
  const video = useRef<HTMLVideoElement>(null);
  const relative = Math.max(0, player.elapsed - project.start_time);
  const clip = project.clips.find(item => relative >= item.start_time && relative < item.end_time);
  const line = project.lines.find(item => item.start_time !== null && relative >= item.start_time && relative < (item.end_time ?? 0));
  useEffect(() => {
    const element = video.current;
    if (!element || !preview || !clip) return;
    const target = clip.source_start + relative - clip.start_time;
    if (Math.abs(element.currentTime - target) > 0.35) element.currentTime = target;
    if (player.playing) void element.play().catch(() => {}); else element.pause();
  }, [relative, clip, preview, player.playing]);
  async function search(nextPage = 1) {
    setResults(await api<Media[]>('/studio/visuals/search', postJson({ aesthetic: project.aesthetic, query, page: nextPage, count: 24 })));
    setPage(nextPage); setReviewed(true);
  }
  async function generate(mode: string) {
    pause(); setPreview(false);
    setProject(await api<ContentProject>(`/studio/projects/${project.id}/draft`, postJson({ mode, media_ids: selected })));
  }
  async function review() {
    if (project.aesthetic.startsWith('custom:')) {
      const collections = await api<AestheticCollection[]>('/studio/aesthetics');
      const collection = collections.find(item => `custom:${item.id}` === project.aesthetic);
      if (collection?.media.length) { setResults(collection.media); setReviewed(true); return; }
    }
    await search();
  }
  return <section className="studio-panel"><h2>4. Visuals</h2><p>Stock footage from <a href="https://pixabay.com/" target="_blank" rel="noreferrer">Pixabay</a>. Landscape clips are center-cropped to vertical.</p>
    <div className="studio-actions"><button disabled={disabled} onClick={() => void run(() => generate('automatic'))}>Generate Immediately</button><button disabled={disabled} onClick={() => void run(review)}>Review Media</button></div>
    <form onSubmit={event => { event.preventDefault(); void run(() => search()); }}><label>Search visuals<input maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. rain window" /></label><div className="studio-actions"><button disabled={disabled}>Search footage</button><button type="button" disabled={disabled} onClick={() => void run(async () => { setResults(await api<Media[]>('/studio/media/favorites')); setReviewed(true); })}>Saved clips</button><button type="button" disabled={disabled} onClick={() => void run(() => search(page % 10 + 1))}>Reroll results</button></div></form>
    {replace !== null && <p role="status">Choose a clip below to replace the selected segment. <button onClick={() => setReplace(null)}>Cancel replacement</button></p>}
    {reviewed && !results.length && <p>No clips found. Try another search.</p>}
    <div className="studio-media-grid">{results.map(media => <article key={media.id}><video controls playsInline preload="none" src={media.preview_url} onPlay={pause} aria-label={`Preview ${media.tags}`} /><small>{media.tags} · {media.duration}s</small><a href={media.source_url} target="_blank" rel="noreferrer">View on Pixabay</a><div className="studio-actions"><button disabled={disabled} aria-pressed={selected.includes(media.id)} onClick={() => {
      if (replace !== null) void run(async () => { setProject(await api<ContentProject>(`/studio/projects/${project.id}/clips/${replace}`, { ...postJson({ media_id: media.id }), method: 'PUT' })); setReplace(null); });
      else setSelected(selected.includes(media.id) ? selected.filter(id => id !== media.id) : [...selected, media.id]);
    }}>{replace !== null ? 'Use replacement' : selected.includes(media.id) ? 'Deselect' : 'Select'}</button><button disabled={disabled} aria-pressed={media.favorite} onClick={() => void run(async () => { await api(`/studio/media/${media.id}`, { ...postJson({ favorite: !media.favorite }), method: 'PATCH' }); setResults(results.map(item => item.id === media.id ? { ...item, favorite: !item.favorite } : item)); })}>{media.favorite ? 'Unsave' : 'Save clip'}</button></div></article>)}</div>
    {!!selected.length && <button disabled={disabled} onClick={() => void run(() => generate('selected'))}>Generate Draft ({selected.length} clips)</button>}
    {!!project.clips.length && <><h3>Your sequence</h3><ol className="studio-sequence">{project.clips.map(item => <li key={item.id}><span>{item.start_time.toFixed(1)}–{item.end_time.toFixed(1)}s · {item.media.tags}</span><button disabled={disabled} onClick={() => { setReplace(item.id); setPreview(false); pause(); }}>Replace Clip</button></li>)}</ol>
      <div className="studio-actions"><button disabled={disabled} onClick={() => { setPreview(true); player.beginStudio(project.song_version_id, project.start_time, project.end_time); }}>Preview draft</button><button onClick={pause}>Pause preview</button><button disabled={disabled} onClick={() => void run(() => generate('reroll'))}>Reroll Visuals</button><button disabled={disabled} onClick={() => void run(() => generate('order'))}>Reroll clip order</button></div>
      {preview && <div className={`studio-draft-preview lyric-${project.lyric_style}`}><video ref={video} key={clip?.id} src={clip?.media.preview_url} muted playsInline preload="auto" aria-label="Draft preview" /><p>{line?.text}</p></div>}<p><small>Draft playback is a browser preview; the exported video has frame-aligned cuts and rendered lyrics.</small></p>
    </>}
  </section>;
}
