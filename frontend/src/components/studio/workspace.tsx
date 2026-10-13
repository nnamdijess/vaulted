"use client";
import { BrandMark } from "@/components/brand-mark";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AccountArea, PrivateArea } from '../auth-provider';
import { WorkspaceNav } from '../workspace-nav';
import { api, postJson } from '@/lib/api';
import { ContentProject, StudioSong } from '@/lib/studio';
import { RenderGallery } from './render-gallery';
import { RecentProjects } from './recent-projects';
import { StudioEditor } from './editor';
import './studio.css';
import { StudioIcon } from './studio-icon';

export function Studio({ create = false, identifier }: { create?: boolean; identifier?: string }) {
  return <PrivateArea><main className="studio-workspace"><header><Link href="/projects" className="brand"><BrandMark /></Link><AccountArea /></header><WorkspaceNav studio />
    {identifier ? <StudioEditor identifier={identifier} /> : create ? <SongPicker /> : <Dashboard />}
  </main></PrivateArea>;
}

function Dashboard() {
  const [projects, setProjects] = useState<ContentProject[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; api<ContentProject[]>('/studio/projects').then(value => { if (active) setProjects(value); }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  return <><div className="studio-heading"><div><p className="eyebrow">A space to create</p><h1>Studio</h1><p>Turn a moment from your music into a lyric video.</p></div><Link className="button" href="/studio/new"><StudioIcon name="plus" /> Create New</Link></div>
    {error && <p role="alert">{error}</p>}{loading && <p role="status">Loading Studio…</p>}
    <RecentProjects projects={projects} />
    {!loading && !projects.length && <p>Your first video starts with a song already in your Library.</p>}
    <RenderGallery projects={projects} onDeleted={(projectId,jobId)=>setProjects(items=>items.map(item=>item.id===projectId?{...item,jobs:item.jobs.filter(job=>job.id!==jobId)}:item))} />
  </>;
}

export function Cover({ project }: { project: { project_id: number; cover_path: string | null } }) {
  // eslint-disable-next-line @next/next/no-img-element -- private same-origin artwork
  return project.cover_path ? <img className="studio-cover" alt="Project artwork" src={`/api/projects/${project.project_id}/cover?v=${encodeURIComponent(project.cover_path)}`} /> : <span className="studio-cover studio-cover-fallback" aria-hidden="true">V</span>;
}

function SongPicker() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [songs, setSongs] = useState<StudioSong[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => { api<StudioSong[]>(`/studio/songs?q=${encodeURIComponent(query)}`).then(value => { if (active) setSongs(value); }).catch(err => { if (active) setError(err.message); }); }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);
  async function choose(song: StudioSong, version: number) {
    setBusy(true); setError('');
    try { const project = await api<ContentProject>('/studio/projects', postJson({ song_version_id: version, title: `${song.title} — video` })); router.push(`/studio/${project.id}`); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not start draft'); setBusy(false); }
  }
  return <><h1>Choose your song</h1><p>Use an existing version from your Library.</p><label>Find a song<input value={query} onChange={event => setQuery(event.target.value)} type="search" /></label>{error && <p role="alert">{error}</p>}
    <div className="studio-song-list">{songs.map(song => <article key={song.id}><Cover project={song} /><div><h2>{song.title}</h2><p>{song.artist} · {song.project_name}</p><label>Version<select disabled={busy} defaultValue="" onChange={event => { if (event.target.value) void choose(song, Number(event.target.value)); }}><option value="">Choose version…</option>{song.versions.map((version, index) => <option key={version.id} value={version.id}>{version.name}{index === 0 ? ' (latest)' : ''}</option>)}</select></label></div></article>)}</div>{busy && <p role="status">Reading audio and creating draft…</p>}
  </>;
}
