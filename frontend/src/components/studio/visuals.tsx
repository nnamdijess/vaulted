"use client";
import Link from 'next/link';
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { api, postJson } from '@/lib/api';
import { ContentProject, Media } from '@/lib/studio';
import { MediaFolders, MoveMedia, MediaFolder } from './media-folders';
import { ClipLibraryTools, ClipDetails } from './clip-library';
import { DraftTimeline } from './draft-timeline';
import { useEditorAutosave } from './use-editor-autosave';
import { MediaCredit, ProviderSelect } from './media-provider';
import { Modal } from '../modal';
import { StudioIcon as ExportIcon } from './studio-icon';
import { ClipPreview } from './clip-preview';
import { StockSettings } from './stock-settings';
import { TextStylePanel } from './text-style-panel';
import { TextStyle, resolveTextStyle } from '@/lib/studio-text-style';

export function Visuals({ project, setProject, disabled: baseDisabled, pause, run, timelineDirty, onTimelineDirty, pendingStyle, setPendingStyle, selected, setSelected }: { timelineDirty: boolean; onTimelineDirty: (dirty: boolean) => void; pendingStyle: TextStyle | null; setPendingStyle: Dispatch<SetStateAction<TextStyle | null>>; selected: number[]; setSelected: Dispatch<SetStateAction<number[] | null>>; project: ContentProject; setProject: (project: ContentProject) => void; disabled: boolean; pause: () => void; run: (work: () => Promise<void>) => Promise<void> }) {
  const [vaultName,setVaultName]=useState('');
  useEffect(()=>{let active=true;api<{vault:null|{name:string}}>('/studio/vault').then(value=>{if(active)setVaultName(value.vault?.name??'');}).catch(()=>{});return()=>{active=false;};},[]);
  const [folders,setFolders]=useState<MediaFolder[]>([]);
  const [folder,setFolder]=useState('all');
  const [folderRevision,setFolderRevision]=useState(0);
  const [deleting, setDeleting] = useState<Media | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const disabled = baseDisabled || timelineDirty;
  const [results, setResults] = useState<Media[]>([]);
  const [librarySource, setLibrarySource] = useState('all');
  const [libraryError, setLibraryError] = useState('');
  const [tab, setTab] = useState<'library' | 'upload' | 'search'>('library');
  const [provider, setProvider] = useState<'pixabay' | 'pexels'>('pixabay');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [replace, setReplace] = useState<number | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const browser = useRef<HTMLDivElement>(null);
  const draft = useRef<HTMLDivElement>(null);
  const autosave = useEditorAutosave(project, setProject, onTimelineDirty, () => setPendingStyle(null));
  useEffect(() => {
    if (tab !== 'library') return;
    let active = true;
    void api<Media[]>('/studio/media/favorites').then(items => { if (active) { setResults(items); setReviewed(true); } }).catch(error => { if (active) setLibraryError(error.message); });
    return () => { active = false; };
  }, [tab]);
  const textStyle = autosave.edits.text_style ?? pendingStyle ?? resolveTextStyle(project.text_style, project.lyric_style);
  function closeBrowser() {
    pause(); setReplace(null); setBrowsing(false);
    requestAnimationFrame(() => {
      draft.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
      draft.current?.scrollIntoView({ block: 'start' });
    });
  }
  async function search(nextPage = 1) {
    setResults(await api<Media[]>('/studio/visuals/search', postJson({ provider, aesthetic: project.aesthetic, query, page: nextPage, count: 24 })));
    setPage(nextPage); setReviewed(true);
  }
  async function generate(mode: string) {
    pause();
    const requestMode = mode === 'reroll' && selected.length ? 'selected' : mode;
    const updated = await api<ContentProject>(`/studio/projects/${project.id}/draft`, postJson({ provider, mode: requestMode, media_ids: requestMode === 'selected' ? selected : [] }));
    setProject(updated); setSelected(updated.media_pool ?? []);
    setBrowsing(false); setReplace(null);
  }
  async function review() {
    setTab('library');
    setResults(await api<Media[]>('/studio/media/favorites')); setReviewed(true);
  }
  function switchTab(value: 'library' | 'upload' | 'search') {
    if (value === tab) return;
    setLibraryError(''); setTab(value); setResults([]); setReviewed(false);

  }
  function openBrowser() {
    setBrowsing(true);
    requestAnimationFrame(() => { browser.current?.scrollIntoView({ block: 'start' }); browser.current?.querySelector('input')?.focus({ preventScroll: true }); });
  }
  const shown = tab === 'library' ? results.filter(item => (folder === 'all' || (folder === 'unfiled' ? item.provider === 'upload' && !item.folder_id : String(item.folder_id) === folder)) && (librarySource === 'all' || (librarySource === 'upload' ? item.provider === 'upload' : item.provider !== 'upload'))) : results;
  return <section className="studio-panel studio-visuals"><h2>4. Visuals</h2><p>Build with your clips, or discover footage from <a href="https://pixabay.com/" target="_blank" rel="noreferrer">Pixabay</a> and <a href="https://www.pexels.com/" target="_blank" rel="noreferrer">Pexels</a>. Select a timeline clip to adjust its crop and position in the selected frame.</p>
    {vaultName&&<p>Shared footage from {vaultName}. New uploads are shared with members; your music and draft stay private. <Link href="/studio/vault">Manage membership</Link></p>}
    <div className="studio-autosave" role="status" aria-live="polite">{autosave.status === 'saved' ? 'Saved' : autosave.status === 'error' ? 'Not saved' : 'Saving…'}{autosave.error && <><span role="alert">{autosave.error}</span><button onClick={autosave.retry}>Retry saving</button></>}</div>
    <div className="studio-visual-layout">
      <div ref={draft}><DraftTimeline clips={autosave.edits.clips ?? project.clips} onEdit={clips => autosave.queue({ clips })} saving={timelineDirty} project={project} textStyle={textStyle} disabled={baseDisabled} onReplace={item => { setReplace(item.id); openBrowser(); }} /></div>
      <TextStylePanel outputFormat={project.output_format} lyrics={project.lines.map(line => line.text)} value={textStyle} disabled={baseDisabled}
        onChange={value => { setPendingStyle(value); autosave.queue({ text_style: value }); }} />
    </div>
    <div className="studio-actions"><button disabled={disabled} onClick={() => { openBrowser(); void run(review); }}>Review Media</button>
      <button type="button" disabled={!project.clips.length} onClick={() => draft.current?.querySelector('.studio-draft-preview')?.scrollIntoView({block:'start', behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'})}><ExportIcon name="up" /> Back to Video</button>
    <details className="studio-more-tools"><summary>More visual options</summary><div className="studio-actions">
    {(!!project.clips.length || !!project.media_pool?.length) && <button disabled={disabled} onClick={() => void run(() => generate('reroll'))}>Reroll Visuals</button>}
    {!!project.clips.length && <><button disabled={disabled} onClick={() => void run(() => generate('order'))}>Reroll clip order</button>
      <button disabled={disabled} onClick={() => void run(async () => { pause(); setProject(await api<ContentProject>(`/studio/projects/${project.id}/clips`, { method: 'DELETE' })); })}>Clear draft visuals</button></>}
    </div></details></div>
    {!!project.media_pool?.length && <p>Rerolls use your {project.media_pool.length} chosen clips, preferring footage not in the current draft. Your library stays unchanged.</p>}
    <div ref={browser} hidden={!!project.clips.length && !browsing}>
    <div className="studio-media-tabs" role="tablist" aria-label="Media source">
      {(['library', 'upload', 'search'] as const).map((value, index, values) => <button key={value} role="tab" id={`media-tab-${value}`} aria-controls={`media-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} disabled={disabled}
        onClick={() => switchTab(value)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? values[(index + 1) % 3] : event.key === 'ArrowLeft' ? values[(index + 2) % 3] : event.key === 'Home' ? values[0] : event.key === 'End' ? values[2] : null;
          if (next) { event.preventDefault(); switchTab(next); document.getElementById(`media-tab-${next}`)?.focus(); }
        }}>{value === 'library' ? (vaultName ? 'Vault clips' : 'My clips') : value === 'upload' ? 'Upload media' : 'Search'}</button>)}
    </div>
    <div role="tabpanel" id={`media-panel-${tab}`} aria-labelledby={`media-tab-${tab}`}>
    {tab !== 'search' && <ClipLibraryTools shared={!!vaultName} mode={tab === 'upload' ? 'upload' : 'library'} disabled={disabled} run={run} onResults={items => { setResults(current => tab === 'upload' ? [...current.filter(item => !items.some(upload => upload.id === item.id)), ...items] : items); setReviewed(true); }} />}
    {libraryError && <p role="alert">{libraryError}</p>}
    {tab === 'library' && <MediaFolders folders={folders} setFolders={setFolders} folder={folder} onFolder={setFolder} revision={folderRevision} disabled={disabled} />}
    {tab === 'library' && <label>Clip source<select aria-label="Clip source" value={librarySource} onChange={event => setLibrarySource(event.target.value)}><option value="all">Uploaded and saved</option><option value="upload">Uploaded videos</option><option value="stock">Saved stock only</option></select></label>}
    {tab === 'search' && <>
      <StockSettings project={project} onSaved={setProject} disabled={disabled} run={run} />
      <ProviderSelect value={provider} disabled={disabled} onChange={value => { setProvider(value); setResults([]); setReviewed(false); setPage(1); }} />
      <form onSubmit={event => { event.preventDefault(); void run(() => search()); }}><label>Search visuals<input maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. neon street, abstract texture" /></label><div className="studio-actions"><button disabled={disabled}>Search footage</button><button type="button" disabled={disabled} onClick={() => void run(() => search(page % 10 + 1))}>New stock results</button><button type="button" disabled={disabled} onClick={() => void run(() => generate('automatic'))}>Generate from stock</button></div></form>
    </>}
    {replace !== null && <p role="status">Choose footage below for section {project.clips.findIndex(item => item.id === replace) + 1}. Its timing will stay the same. <button onClick={closeBrowser}>Cancel replacement</button></p>}
    {reviewed && !shown.length && <p>No clips found. Try another search.</p>}
    {replace === null && <>
      <p role="status">{selected.length} clips selected · Maximum 1,000. Drafts randomly choose from this pool without repeating clips. Add more footage if the section is not filled.</p>
      <div className="studio-actions"><button aria-pressed={shown.length > 0 && shown.every(item => selected.includes(item.id))} disabled={disabled || !shown.length || new Set([...selected, ...shown.map(item => item.id)]).size > 1000}
        onClick={() => setSelected(current => [...new Set([...(current ?? []), ...shown.map(item => item.id)])])}>Select all shown</button>
        <button className="secondary" disabled={disabled || !selected.length} onClick={() => setSelected([])}>Clear selection</button>
        {!!selected.length && <button disabled={disabled} onClick={() => void run(() => generate('selected'))}>Generate selected draft</button>}</div>
      {!!shown.length && new Set([...selected, ...shown.map(item => item.id)]).size > 1000 && <p>These results exceed the 1,000-clip limit. Filter your saved clips or clear your selection first.</p>}
    </>}
    <div className="studio-media-grid">{shown.map(media => <article key={media.id}><div className="studio-library-thumb">{media.provider === 'upload' && media.can_delete !== false && <button className="studio-delete-clip" aria-label={`Delete uploaded clip ${media.title || media.tags}`} disabled={disabled} onClick={() => { setDeleting(media); setDeleteError(''); }}><ExportIcon name="delete" /></button>}<ClipPreview key={media.preview_url} media={media} label={`Preview ${media.tags}`} onPlay={pause} /></div><small>{media.title || media.tags} · {media.duration.toFixed(1)}s</small>{media.uploaded_by&&<small>Uploaded by {media.uploaded_by}{media.vault_id ? " · Shared" : " · Private"}</small>}{media.can_manage!==false&&<ClipDetails media={media} disabled={disabled} run={run} onSaved={updated => setResults(items => items.map(item => item.id === updated.id ? updated : item))} />}{media.provider === 'upload' && media.can_manage !== false && <MoveMedia media={media} folders={folders} disabled={disabled} onMoved={updated=>{setResults(items=>items.map(item=>item.id===updated.id?updated:item));setFolderRevision(value=>value+1);}} />}<MediaCredit media={media} /><div className="studio-actions"><button disabled={disabled || (replace === null && selected.length >= 1000 && !selected.includes(media.id))} aria-pressed={selected.includes(media.id)} onClick={() => {
      if (replace !== null) void run(async () => { setProject(await api<ContentProject>(`/studio/projects/${project.id}/clips/${replace}`, { ...postJson({ media_id: media.id }), method: 'PUT' })); closeBrowser(); });
      else setSelected(selected.includes(media.id) ? selected.filter(id => id !== media.id) : [...selected, media.id]);
    }}>{replace !== null ? 'Use replacement' : selected.includes(media.id) ? 'Deselect' : 'Select'}</button>{media.provider !== 'upload' && <button disabled={disabled} aria-pressed={media.favorite} onClick={() => void run(async () => { await api(`/studio/media/${media.id}`, { ...postJson({ favorite: !media.favorite }), method: 'PATCH' }); setResults(results.map(item => item.id === media.id ? { ...item, favorite: !item.favorite } : item)); })}>{media.favorite ? 'Unsave' : 'Save clip'}</button>}</div></article>)}</div>
    {!!selected.length && <button disabled={disabled} onClick={() => void run(() => generate('selected'))}>Generate Draft ({selected.length} clips)</button>}
    <div className="studio-actions"><button type="button" onClick={() => browser.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}><ExportIcon name="up" /> Back to top</button></div>
    </div></div>
    {deleting && <Modal title="Delete uploaded clip" busy={deleteBusy} onClose={() => setDeleting(null)}><p>Delete “{deleting.title || deleting.tags}” from the library and this server? If it is used in Studio projects, those clips will be replaced with a black screen. Timing and lyrics are preserved in every affected draft, including other members’ drafts.</p><p>Files needed by a pending render are removed after that render finishes.</p>{deleteError && <p role="alert">{deleteError}</p>}<div className="studio-actions"><button disabled={deleteBusy} onClick={() => setDeleting(null)}>Cancel</button><button disabled={deleteBusy} onClick={async () => { setDeleteBusy(true); setDeleteError(''); try { await api(`/studio/media/${deleting.id}`, { method: 'DELETE' }); setResults(items => items.filter(item => item.id !== deleting.id)); setSelected(items => (items ?? []).filter(id => id !== deleting.id)); setFolderRevision(value=>value+1); pause(); setProject(await api<ContentProject>(`/studio/projects/${project.id}`)); setDeleting(null); } catch (error) { setDeleteError((error as Error).message); } finally { setDeleteBusy(false); } }} className="studio-destructive">Delete and Replace</button></div></Modal>}
  </section>;
}
