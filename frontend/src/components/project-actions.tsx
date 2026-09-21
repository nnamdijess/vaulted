"use client";

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, postJson, Project, Song } from '@/lib/api';
import { ArtworkPicker } from './artwork-picker';
import { ImageUpload } from './image-upload';
import { Modal } from './modal';
import { usePlayer } from './audio-player';

export type ProjectAction = 'Insights' | 'Notes' | 'Share project' | 'Change cover' | 'Project settings' | 'Delete project';
type Share = { enabled: boolean; allow_downloads: boolean; token: string | null };
type Insights = { total: number; owner: number; shared: number; most_played: string | null; songs: { id: number; title: string; streams: number }[]; recent: { title: string; source: string; timestamp: string }[] };

export function ProjectActions({ project, songs, action, setAction, onChange }: {
  project: Project; songs: Song[]; action: ProjectAction | null; setAction: (action: ProjectAction | null) => void;
  onChange: (project: Project) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [share, setShare] = useState<Share | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [link, setLink] = useState('');
  const router = useRouter();
  const player = usePlayer();
  useEffect(() => {
    let active = true;
    if (action === 'Share project') void api<Share>(`/projects/${project.id}/share`).then((data) => {
      if (active) { setShare(data); setLink(data.token ? `${window.location.origin}/share/${data.token}` : ''); }
    }).catch((err) => { if (active) setError(err.message); });
    if (action === 'Insights') void api<Insights>(`/projects/${project.id}/insights`).then((data) => { if (active) setInsights(data); }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [action, project.id]);

  async function saveShare(data: Share, regenerate = false) {
    setBusy(true); setError('');
    try {
      const updated = await api<Share>(`/projects/${project.id}/share`, { ...postJson({ enabled: data.enabled, allow_downloads: data.allow_downloads, regenerate }), method: 'PUT' });
      setShare(updated); setLink(updated.token ? `${window.location.origin}/share/${updated.token}` : '');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save sharing settings'); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? '');
    setBusy(true); setError('');
    try {
      if (action === 'Share project') { await saveShare({ enabled: data.has('enabled'), allow_downloads: data.has('allow_downloads'), token: share?.token ?? null }); return; }
      if (action === 'Notes') onChange(await api<Project>(`/projects/${project.id}/notes`, { ...postJson({ notes: value('notes') }), method: 'PATCH' }));
      if (action === 'Project settings') onChange(await api<Project>(`/projects/${project.id}`, { ...postJson(Object.fromEntries(data)), method: 'PATCH' }));
      if (action === 'Delete project') {
        await api(`/projects/${project.id}`, { method: 'DELETE' });
        player.removeSongs(songs.map((song) => song.id));
        router.push('/projects');
      }
      setAction(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save changes'); }
    finally { setBusy(false); }
  }
  async function removeCover() {
    setBusy(true); setError('');
    try { onChange(await api<Project>(`/projects/${project.id}/cover`, { method: 'DELETE' })); setAction(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not remove artwork'); }
    finally { setBusy(false); }
  }
  return <div className="song-actions">
    <button className="icon-button" aria-label="Project actions" aria-expanded={menu} onClick={() => setMenu(!menu)}>•••</button>
    {menu && <><button className="menu-dismiss" aria-label="Close project actions" onClick={() => setMenu(false)} /><div className="actions-menu">
      {(['Insights','Notes','Share project','Change cover','Project settings','Delete project'] as ProjectAction[]).map((item) => <button key={item} onClick={() => { setError(''); setShare(null); setInsights(null); setAction(item); setMenu(false); }}>{item}</button>)}
    </div></>}
    {action && <Modal title={action} busy={busy} onClose={() => { setAction(null); setError(''); }}>
      {error && <p className="error" role="alert">{error}</p>}
      {action === 'Change cover' ? <><ArtworkPicker project={project} disabled={busy} onSelect={updated => { onChange(updated); setAction(null); }} /><ImageUpload label="Cover image" onCancel={() => setAction(null)} onRemove={project.cover_path ? removeCover : undefined} onSave={async file => {
        const data = new FormData(); data.set('file', file); setBusy(true);
        try { onChange(await api<Project>(`/projects/${project.id}/cover`, { method: 'POST', body: data })); setAction(null); } finally { setBusy(false); }
      }} /></> : action === 'Insights' ? insights ? <>
        <div className="insight-totals"><p><strong>{insights.total}</strong> total streams</p><p>{insights.owner} owner/local · {insights.shared} shared</p></div>
        <p>Most played: {insights.most_played || 'No streams yet'}</p>
        <h3>Streams per song</h3><ul>{insights.songs.map((song) => <li key={song.id}>{song.title}: {song.streams}</li>)}</ul>
        <h3>Recent listens</h3>{!insights.recent.length && <p>No listens yet.</p>}
        <ul>{insights.recent.map((event, index) => <li key={index}>{event.title} · {event.source} · {new Date(event.timestamp).toLocaleString()}</li>)}</ul>
      </> : <p>Loading insights…</p> : <form onSubmit={submit}><fieldset disabled={busy}>

        {action === 'Notes' && <><p className="muted">Private project notes. Never included in share links.</p><label>Project notes<textarea name="notes" defaultValue={project.notes} maxLength={10000} rows={8} /></label></>}
        {action === 'Project settings' && <><label>Project name<input name="name" defaultValue={project.name} required maxLength={200} /></label><label>Artist / owner<input name="artist" defaultValue={project.artist} maxLength={200} /></label><label>Description<textarea name="description" defaultValue={project.description} maxLength={10000} /></label></>}

        {action === 'Delete project' && <p>Delete “{project.name}”, its tracks, versions and listening history (saved artwork is retained)? This cannot be undone.</p>}
        {action === 'Share project' && (share ? <div key={`${share.token}-${share.enabled}-${share.allow_downloads}`}>
          <p className="muted">Anyone with the link can listen. Notes stay private.</p>
          <label className="checkbox"><input name="enabled" type="checkbox" defaultChecked={share.enabled} />Enable sharing</label>
          <label className="checkbox"><input name="allow_downloads" type="checkbox" defaultChecked={share.allow_downloads} />Allow downloads</label>
          {link && <><label>Share link<input readOnly value={link} onFocus={(event) => event.target.select()} /></label><button className="secondary" type="button" onClick={() => { void navigator.clipboard?.writeText(link).catch(() => setError('Select and copy the link manually.')); }}>Copy link</button> <button className="secondary" type="button" onClick={() => { void saveShare(share, true); }}>Regenerate link</button></>}
          <p className="muted">Disabling or regenerating immediately revokes the old link for new requests.</p>
        </div> : <p>Loading sharing settings…</p>)}
        <div className="dialog-buttons"><button className="secondary" type="button" onClick={() => setAction(null)}>Close</button><button type="submit" disabled={Boolean(busy || (action === 'Share project' && !share))}>{busy ? 'Saving…' : action === 'Delete project' ? 'Delete project permanently' : 'Save'}</button></div>
      </fieldset></form>}
    </Modal>}
  </div>;
}
