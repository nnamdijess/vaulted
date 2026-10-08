"use client";
import { useState } from 'react';
import { api, postJson } from '@/lib/api';
import { AestheticCollection, Media, Presets } from '@/lib/studio';
import { MediaCredit, ProviderSelect } from './media-provider';
import { Modal } from '../modal';

export function AestheticEditor({ aesthetic, presets, onSaved }: { aesthetic: string; presets: Presets; onSaved: (value: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [identifier, setIdentifier] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [base, setBase] = useState('night-drive');
  const [keywords, setKeywords] = useState('');
  const [media, setMedia] = useState<Media[]>([]);
  const [results, setResults] = useState<Media[]>([]);
  const [provider, setProvider] = useState<'pixabay' | 'pexels'>('pixabay');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(work: () => Promise<void>) {
    setBusy(true); setError('');
    try { await work(); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update aesthetic'); } finally { setBusy(false); }
  }
  async function edit() {
    const collections = await api<AestheticCollection[]>('/studio/aesthetics');
    const collection = collections.find(item => `custom:${item.id}` === aesthetic);
    const preset = presets.aesthetics.find(item => item.id === aesthetic)!;
    setIdentifier(collection?.id ?? null); setName(collection?.name ?? `${preset.name} — my collection`);
    setBase(collection?.base_aesthetic ?? aesthetic); setKeywords((collection?.keywords ?? preset.keywords.map(item => item.query)).join('\n'));
    setMedia(collection?.media ?? []); setResults([]); setQuery(''); setOpen(true);
  }
  return <><button type="button" disabled={busy} onClick={() => void run(edit)}>{aesthetic.startsWith('custom:') ? 'Edit aesthetic collection' : 'Customize aesthetic'}</button>
    {!open && error && <p role="alert">{error}</p>}
    {open && <Modal title="Aesthetic collection" busy={busy} className="studio-aesthetic-dialog" onClose={() => setOpen(false)}>
      <p>Reusable across your Studio drafts. Built-in presets stay unchanged.</p>{error && <p role="alert">{error}</p>}
      <label>Collection name<input data-initial-focus value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label>
      <label>Search keywords (one per line)<textarea rows={4} value={keywords} onChange={event => setKeywords(event.target.value)} /></label>
      <p>Chosen videos ({media.length}). Generate Immediately uses this collection’s videos when available.</p>
      <div className="studio-media-grid">{media.map(item => <article key={item.id}><video src={item.preview_url} controls muted playsInline preload="none" /><small>{item.tags}</small><MediaCredit media={item} /><button disabled={busy} onClick={() => setMedia(media.filter(value => value.id !== item.id))}>Remove video</button></article>)}</div>
      <ProviderSelect value={provider} disabled={busy} onChange={value => { setProvider(value); setResults([]); }} /><label>Find videos<input value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="e.g. city at night" /></label>
      <div className="studio-actions"><button disabled={busy} onClick={() => void run(async () => setResults(await api<Media[]>('/studio/visuals/search', postJson({ provider, aesthetic: base, query: query.trim() || keywords.split('\n')[0].trim(), count: 18 }))))}>Search videos</button><button disabled={busy} onClick={() => void run(async () => setResults(await api<Media[]>('/studio/media/favorites')))}>Browse saved clips</button></div>
      <div className="studio-media-grid">{results.map(item => <article key={item.id}><video src={item.preview_url} controls muted playsInline preload="none" /><MediaCredit media={item} /><button disabled={busy || media.some(value => value.id === item.id) || media.length >= 100} onClick={() => setMedia([...media, item])}>{media.some(value => value.id === item.id) ? 'Added' : 'Add to collection'}</button></article>)}</div>
      <div className="dialog-buttons"><button className="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button disabled={busy} onClick={() => void run(async () => {
        const body = { name, base_aesthetic: base, keywords: keywords.split('\n').map(value => value.trim()).filter(Boolean), media_ids: media.map(item => item.id) };
        const value = await api<AestheticCollection>(identifier ? `/studio/aesthetics/${identifier}` : '/studio/aesthetics', { ...postJson(body), method: identifier ? 'PUT' : 'POST' });
        await onSaved(`custom:${value.id}`); setOpen(false);
      })}>Save collection</button></div>
    </Modal>}
  </>;
}
