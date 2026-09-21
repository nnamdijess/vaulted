"use client";
import { useEffect, useState } from 'react';
import { api, Project, postJson } from '@/lib/api';
export function ArtworkPicker({ project, onSelect, disabled }: { project: Project; onSelect: (project: Project) => void; disabled: boolean }) {
  const [items, setItems] = useState<{ id: number; file_path: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void api<typeof items>('/artworks').then(data => { if (active) setItems(data); }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  return <section aria-label="Saved artwork"><h3>Saved artwork</h3>{loading && <p role="status">Loading artwork...</p>}{error && <p role="alert">{error} <button onClick={() => { setError(''); setLoading(true); setRevision(v => v+1); }}>Retry</button></p>}
    {!loading && !error && !items.length && <p className="muted">Uploaded project covers will appear here for reuse.</p>}
    <div className="artwork-grid">{items.map((item,index) => <button key={item.id} disabled={busy || disabled} aria-label={`Use saved artwork ${index+1}`} aria-pressed={item.file_path === project.cover_path} onClick={async () => {
      setBusy(true); setError('');
      try { onSelect(await api<Project>(`/projects/${project.id}/cover`, { ...postJson({ artwork_id: item.id }), method: 'PUT' })); }
      catch (err) { setError(err instanceof Error ? err.message : 'Could not select artwork'); }
      finally { setBusy(false); }
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated artwork */}
      <img src={`/api/artworks/${item.id}/image`} alt={`Saved artwork ${index+1}`} />{item.file_path === project.cover_path && <span>Selected</span>}
    </button>)}</div>
  </section>;
}
