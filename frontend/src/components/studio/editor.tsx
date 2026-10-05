"use client";
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, postJson } from '@/lib/api';
import { ContentProject, Presets } from '@/lib/studio';
import { usePlayer } from '../audio-player';
import { Waveform } from '../waveform';
import { Cover } from './workspace';
import { Visuals } from './visuals';

export function StudioEditor({ identifier }: { identifier: string }) {
  const [project, setProject] = useState<ContentProject | null>(null);
  const [presets, setPresets] = useState<Presets>({ aesthetics: [], styles: [] });
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [starts, setStarts] = useState<number[]>([]);
  const [notice, setNotice] = useState('');
  const [step, setStep] = useState(1);
  const player = usePlayer();
  const stop = useRef(player.stopStudio);
  const pauseOnEntry = useRef(player.pause);
  const router = useRouter();
  useEffect(() => {
    let active = true;
    const stopPreview = stop.current;
    pauseOnEntry.current();
    Promise.all([api<ContentProject>(`/studio/projects/${identifier}`), api<Presets>('/studio/presets')]).then(async ([value, options]) => {
      const metadata = await api<{ duration: number }>(`/studio/versions/${value.song_version_id}/metadata`);
      if (active) { setProject(value); setPresets(options); setDuration(metadata.duration); setStarts(value.lines.flatMap(line => line.start_time === null ? [] : [line.start_time])); }
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; stopPreview(); };
  }, [identifier]);
  // Poll only job state; never overwrite unsaved editing controls.
  const pending = project?.jobs.some(job => job.status === 'queued' || job.status === 'rendering');
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => { api<ContentProject>(`/studio/projects/${identifier}`).then(value => setProject(previous => previous ? { ...previous, jobs: value.jobs, status: value.status } : previous)).catch(err => setError(err.message)); }, 2500);
    return () => clearInterval(timer);
  }, [identifier, pending]);
  async function action(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong'); } finally { setBusy(false); }
  }
  if (!project) return <><p role="status">Loading draft…</p>{error && <p role="alert">{error}</p>}</>;
  const current = project;
  const length = current.end_time - current.start_time;
  const relative = Math.max(0, player.elapsed - current.start_time);
  const activeLine = current.lines.filter(line => line.start_time !== null && line.start_time <= relative && (line.end_time ?? length) > relative).at(-1);
  function update(values: Partial<ContentProject>) { player.pause(); setProject({ ...current, ...values }); setDirty(true); }
  async function save() {
    const result = await api<ContentProject>(`/studio/projects/${identifier}`, { ...postJson({ title: current.title, start_time: current.start_time, end_time: current.end_time, lyrics_text: current.lyrics_text, aesthetic: current.aesthetic, lyric_style: current.lyric_style }), method: 'PATCH' });
    setProject(result); setStarts(result.lines.flatMap(line => line.start_time === null ? [] : [line.start_time])); setDirty(false); setNotice('Draft saved');
  }
  return <><Link href="/studio">Back to Studio</Link><div className="studio-heading"><Cover project={current} /><div><h1>{current.song_title}</h1><p>{current.artist} · {current.version_name}</p></div></div>
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <nav className="studio-steps" aria-label="Studio steps">{['Section', 'Lyrics & look', 'Sync', 'Visuals', 'Export'].map((label, index) => <button key={label} style={{ color: step === index + 1 ? 'var(--background)' : 'var(--text)' }} aria-current={step === index + 1 ? 'step' : undefined} onClick={() => { player.pause(); setStep(index + 1); }}>{index + 1}. {label}</button>)}</nav>
    <section hidden={step !== 1} className="studio-panel"><h2>Choose a moment</h2><label>Video title<input value={current.title} maxLength={200} onChange={event => update({ title: event.target.value })} /></label>
      <Waveform key={current.song_version_id} endpoint={`/api/versions/${current.song_version_id}/waveform`} elapsed={player.elapsed} duration={duration} onSeek={time => { if (length > 0 && current.end_time <= duration) player.beginStudio(current.song_version_id, Math.max(current.start_time, Math.min(current.end_time, time)), current.end_time); }} />
      <div className="studio-fields"><label>Start (seconds)<input type="number" min={0} max={duration} step="0.01" value={current.start_time} onChange={event => update({ start_time: Number(event.target.value) })} /></label><label>End (seconds)<input type="number" min={0} max={duration} step="0.01" value={current.end_time} onChange={event => update({ end_time: Number(event.target.value) })} /></label></div>
      <p>{length.toFixed(2)} seconds selected · {duration.toFixed(2)} seconds available</p><div className="studio-actions">{[10, 15, 20, 30].map(seconds => <button type="button" key={seconds} onClick={() => update({ end_time: Math.min(duration, current.start_time + seconds) })}>{seconds}s</button>)}</div>
      <div className="studio-actions"><button disabled={length <= 0 || current.end_time > duration} onClick={() => player.beginStudio(current.song_version_id, current.start_time, current.end_time)}>Preview section</button><button onClick={player.pause} disabled={!player.playing}>Pause</button></div>{player.previewError && <p role="alert">{player.previewError}</p>}
    </section>
    <section hidden={step !== 2} className="studio-panel"><h2>Lyrics & look</h2><label>Lyrics<textarea rows={7} value={current.lyrics_text} maxLength={20000} placeholder="Paste lyrics, one line at a time" onChange={event => update({ lyrics_text: event.target.value })} /></label>
      <div className="studio-fields"><label>Aesthetic<select value={current.aesthetic} onChange={event => update({ aesthetic: event.target.value })}>{presets.aesthetics.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Lyric style<select value={current.lyric_style} onChange={event => update({ lyric_style: event.target.value })}>{presets.styles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <button disabled={busy} onClick={() => void action(save)}>Save draft</button>{dirty && <p>Save changes before syncing or generating. Changing the section resets timing and visuals.</p>}
    </section>
    <section hidden={step !== 3} className="studio-panel"><h2>Sync lines</h2><p>Start playback, then tap when each line begins. Times are relative to your section.</p>{dirty && <p>Save your changes in Lyrics & look first.</p>}<div className="studio-lyric-preview" aria-live="polite">{activeLine?.text || current.lines[starts.length]?.text || 'Instrumental / no lyrics'}</div>
      <div className="studio-actions"><button disabled={dirty} onClick={() => { setStarts([]); player.beginStudio(current.song_version_id, current.start_time, current.end_time); }}>Restart syncing</button><button disabled={dirty || !player.playing || starts.length >= current.lines.length} onClick={() => { if (relative < length && (!starts.length || relative > starts[starts.length - 1])) setStarts([...starts, Number(relative.toFixed(2))]); }}>Tap Next Line</button><button disabled={!starts.length} onClick={() => setStarts(starts.slice(0, -1))}>Undo timestamp</button></div>
      <ol className="studio-lines">{current.lines.map((line, index) => <li key={index}><span>{line.text}</span><label><span className="sr-only">Line {index + 1} start</span><input aria-label={`Line ${index + 1} start`} type="number" step="0.01" min={0} max={length} value={starts[index] ?? ''} onChange={event => { const values = [...starts]; values[index] = Number(event.target.value); setStarts(values); }} /></label></li>)}</ol>
      <div className="studio-actions"><button disabled={dirty} onClick={() => player.beginStudio(current.song_version_id, current.start_time, current.end_time)}>Preview synced lyrics</button><button onClick={player.pause}>Pause syncing</button></div>
      <button disabled={busy || dirty || starts.length !== current.lines.length} onClick={() => void action(async () => { const result = await api<ContentProject>(`/studio/projects/${identifier}/timings`, { ...postJson({ starts }), method: 'PUT' }); setProject(result); setNotice('Timing saved'); })}>Save timing</button>
    </section>
    <div hidden={step !== 4}><Visuals project={current} setProject={setProject} disabled={busy || dirty} pause={player.pause} run={action} /></div>
    <section hidden={step !== 5} className="studio-panel"><h2>Export</h2><p>1080 × 1920 · 30 fps · MP4. The Studio worker must be running.</p><button disabled={busy || dirty || pending || !current.clips.length} onClick={() => void action(async () => { await api(`/studio/projects/${identifier}/renders`, postJson({})); setProject(await api<ContentProject>(`/studio/projects/${identifier}`)); })}>Render video</button>
      {current.jobs.map(job => <div className="studio-export" key={job.id}><p>Export {job.id} · {job.status} · revision {job.revision}{job.revision !== current.revision ? ' (earlier draft)' : ''}</p>{['queued', 'rendering'].includes(job.status) && <progress max={100} value={job.progress} aria-label="Render progress" />}{job.error && <p role="alert">{job.error}</p>}{job.status === 'completed' && <><video controls playsInline preload="none" onPlay={player.pause} src={`/api/studio/projects/${identifier}/renders/${job.id}/video`} /><a className="button" href={`/api/studio/projects/${identifier}/renders/${job.id}/video?download=true`}>Download MP4</a></>}</div>)}
    </section><div className="studio-actions"><button disabled={step === 1} onClick={() => { player.pause(); setStep(step - 1); }}>Previous step</button><button disabled={step === 5} onClick={() => { player.pause(); setStep(step + 1); }}>Next step</button></div><button className="secondary" disabled={busy || pending} onClick={() => { if (window.confirm('Delete this Studio draft and its exports? Your original music stays in the Library.')) void action(async () => { await api(`/studio/projects/${identifier}`, { method: 'DELETE' }); router.push('/studio'); }); }}>Delete Studio draft</button>
  </>;
}
