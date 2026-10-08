"use client";
import { useRef, useState } from 'react';
import { api, postJson } from '@/lib/api';
import { AestheticCollection, ContentProject, Media } from '@/lib/studio';
import { DraftTimeline } from './draft-timeline';
import { ClipPreview } from './clip-preview';
import { TextStylePanel } from './text-style-panel';
import { TextStyle, resolveTextStyle } from '@/lib/studio-text-style';

export function Visuals({ project, setProject, disabled, pause, run }: { project: ContentProject; setProject: (project: ContentProject) => void; disabled: boolean; pause: () => void; run: (work: () => Promise<void>) => Promise<void> }) {
  const [results, setResults] = useState<Media[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [replace, setReplace] = useState<number | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const browser = useRef<HTMLDivElement>(null);
  const draft = useRef<HTMLDivElement>(null);
  const [pendingStyle, setPendingStyle] = useState<TextStyle | null>(null);
  const [styleSaved, setStyleSaved] = useState(false);
  const textStyle = pendingStyle ?? resolveTextStyle(project.text_style, project.lyric_style);
  function closeBrowser() {
    pause(); setReplace(null); setBrowsing(false);
    requestAnimationFrame(() => {
      draft.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
      draft.current?.scrollIntoView({ block: 'start' });
    });
  }
  async function search(nextPage = 1) {
    setResults(await api<Media[]>('/studio/visuals/search', postJson({ aesthetic: project.aesthetic, query, page: nextPage, count: 24 })));
    setPage(nextPage); setReviewed(true);
  }
  async function generate(mode: string) {
    pause();
    setProject(await api<ContentProject>(`/studio/projects/${project.id}/draft`, postJson({ mode, media_ids: selected })));
    setBrowsing(false); setReplace(null);
  }
  async function review() {
    if (project.aesthetic.startsWith('custom:')) {
      const collections = await api<AestheticCollection[]>('/studio/aesthetics');
      const collection = collections.find(item => `custom:${item.id}` === project.aesthetic);
      if (collection?.media.length) { setResults(collection.media); setReviewed(true); return; }
    }
    await search();
  }
  function openBrowser() {
    setBrowsing(true);
    requestAnimationFrame(() => { browser.current?.scrollIntoView({ block: 'start' }); browser.current?.querySelector('input')?.focus({ preventScroll: true }); });
  }
  return <section className="studio-panel"><h2>4. Visuals</h2><p>Stock footage from <a href="https://pixabay.com/" target="_blank" rel="noreferrer">Pixabay</a>. Landscape clips are center-cropped to vertical.</p>
    <div className="studio-visual-layout">
      {!!project.clips.length ? <div ref={draft}><DraftTimeline project={project} textStyle={textStyle} disabled={disabled} onReplace={item => { setReplace(item.id); openBrowser(); }} /></div>
        : <div className="studio-empty-draft"><h3>Your draft</h3><p>Generate a draft or choose footage to preview your lyrics over video.</p></div>}
      <TextStylePanel value={textStyle} dirty={pendingStyle !== null} disabled={disabled} saved={styleSaved}
        onChange={value => { setPendingStyle(value); setStyleSaved(false); }} cancel={() => setPendingStyle(null)}
        save={() => void run(async () => {
          const updated = await api<ContentProject>(`/studio/projects/${project.id}/text-style`, { ...postJson(textStyle), method: 'PUT' });
          setProject(updated); setPendingStyle(null); setStyleSaved(true);
        })} />
    </div>
    <div className="studio-actions"><button disabled={disabled} onClick={() => void run(() => generate('automatic'))}>{project.clips.length ? 'Regenerate draft' : 'Generate Immediately'}</button><button disabled={disabled} onClick={() => { openBrowser(); void run(review); }}>Review Media</button>
    {!!project.clips.length && <><button disabled={disabled} onClick={() => void run(() => generate('reroll'))}>Reroll Visuals</button><button disabled={disabled} onClick={() => void run(() => generate('order'))}>Reroll clip order</button></>}</div>
    <div ref={browser} hidden={!!project.clips.length && !browsing}>
    <form onSubmit={event => { event.preventDefault(); void run(() => search()); }}><label>Search visuals<input maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. rain window" /></label><div className="studio-actions"><button disabled={disabled}>Search footage</button><button type="button" disabled={disabled} onClick={() => void run(async () => { setResults(await api<Media[]>('/studio/media/favorites')); setReviewed(true); })}>Saved clips</button><button type="button" disabled={disabled} onClick={() => void run(() => search(page % 10 + 1))}>Reroll results</button></div></form>
    {replace !== null && <p role="status">Choose footage below for section {project.clips.findIndex(item => item.id === replace) + 1}. Its timing will stay the same. <button onClick={closeBrowser}>Cancel replacement</button></p>}
    {reviewed && !results.length && <p>No clips found. Try another search.</p>}
    <div className="studio-media-grid">{results.map(media => <article key={media.id}><ClipPreview key={media.preview_url} media={media} label={`Preview ${media.tags}`} onPlay={pause} /><small>{media.tags} · {media.duration}s</small><a href={media.source_url} target="_blank" rel="noreferrer">View on Pixabay</a><div className="studio-actions"><button disabled={disabled} aria-pressed={selected.includes(media.id)} onClick={() => {
      if (replace !== null) void run(async () => { setProject(await api<ContentProject>(`/studio/projects/${project.id}/clips/${replace}`, { ...postJson({ media_id: media.id }), method: 'PUT' })); closeBrowser(); });
      else setSelected(selected.includes(media.id) ? selected.filter(id => id !== media.id) : [...selected, media.id]);
    }}>{replace !== null ? 'Use replacement' : selected.includes(media.id) ? 'Deselect' : 'Select'}</button><button disabled={disabled} aria-pressed={media.favorite} onClick={() => void run(async () => { await api(`/studio/media/${media.id}`, { ...postJson({ favorite: !media.favorite }), method: 'PATCH' }); setResults(results.map(item => item.id === media.id ? { ...item, favorite: !item.favorite } : item)); })}>{media.favorite ? 'Unsave' : 'Save clip'}</button></div></article>)}</div>
    {!!selected.length && <button disabled={disabled} onClick={() => void run(() => generate('selected'))}>Generate Draft ({selected.length} clips)</button>}
    </div>
  </section>;
}
