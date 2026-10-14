"use client";
import { FormatSelector } from './format-selector';
import { outputDimensions } from '@/lib/studio';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, postJson } from '@/lib/api';
import { ContentProject } from '@/lib/studio';
import { usePlayer } from '../audio-player';
import { SectionSelector, timestamp } from './section-selector';
import { Cover } from './workspace';
import { Visuals } from './visuals';
import { TextStyle, lyricCss, resolveTextStyle } from '@/lib/studio-text-style';
import { SongNotes } from './song-notes';
import { TimelinePreview } from './timeline-preview';
import { RenderGallery } from './render-gallery';

export function StudioEditor({ identifier }: { identifier: string }) {
  const [project, setProject] = useState<ContentProject | null>(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [starts, setStarts] = useState<number[]>([]);
  const [notice, setNotice] = useState('');
  const [timelineDirty, setTimelineDirty] = useState(false);
  const [step, setStep] = useState(1);
  const [pendingStyle, setPendingStyle] = useState<TextStyle | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<number[] | null>(null);
  const [syncMode, setSyncMode] = useState<'idle' | 'record' | 'preview'>('idle');
  const player = usePlayer();
  const sectionStarted = useRef(false);
  const stop = useRef(player.stopStudio);
  const pauseOnEntry = useRef(player.pause);
  const router = useRouter();
  useEffect(() => {
    let active = true;
    const stopPreview = stop.current;
    pauseOnEntry.current();
    api<ContentProject>(`/studio/projects/${identifier}`).then(async value => {
      const metadata = await api<{ duration: number }>(`/studio/versions/${value.song_version_id}/metadata`);
      if (active) { setProject(value); setDuration(metadata.duration); setStarts(value.lines.flatMap(line => line.start_time === null ? [] : [line.start_time])); }
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
  const timingValid = starts.length === current.lines.length && starts.every((time, index) => Number.isFinite(time) && time >= 0 && time < length && (index === 0 || time > starts[index - 1]));
  const previewLine = timingValid ? current.lines.find((_, index) => relative >= starts[index] && relative < (starts[index + 1] ?? length)) : undefined;
  function update(values: Partial<ContentProject>) { player.pause(); sectionStarted.current = false; setProject({ ...current, ...values }); setDirty(true); }
  async function save() {
    const result = await api<ContentProject>(`/studio/projects/${identifier}`, { ...postJson({ output_format: current.output_format ?? '9:16', title: current.title, start_time: current.start_time, end_time: current.end_time, lyrics_text: current.lyrics_text, aesthetic: current.aesthetic, lyric_style: current.lyric_style }), method: 'PATCH' });
    setProject(result); setStarts(result.lines.flatMap(line => line.start_time === null ? [] : [line.start_time])); setDirty(false); setNotice('Draft saved');
  }
  return <><Link href="/studio" className="studio-back"><span aria-hidden="true">← </span>Back to Studio</Link><div className="studio-heading studio-editor-heading"><Cover project={current} /><div><p className="eyebrow">Video studio</p><h1>{current.song_title}</h1><p>{current.artist} · {current.version_name}</p></div><span className="studio-project-status">{dirty ? "Unsaved changes" : "Draft"}</span></div>
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="studio-format-row"><FormatSelector value={current.output_format} disabled={busy || timelineDirty} onChange={output_format=>update({output_format})} />{dirty && <button disabled={busy || timelineDirty} onClick={()=>void action(save)}>Save changes</button>}</div>
    <nav className="studio-steps" aria-label="Studio steps">{['Section', 'Lyrics', 'Sync', 'Visuals', 'Export'].map((label, index) => <button key={label} disabled={timelineDirty} aria-current={step === index + 1 ? 'step' : undefined} onClick={() => { player.pause(); setError(''); setStep(index + 1); }}><span className="studio-step-number">{index + 1}.</span> {label}</button>)}</nav>
    <section hidden={step !== 1} className="studio-panel"><h2>Choose a moment</h2><label>Video title<input value={current.title} maxLength={200} onChange={event => update({ title: event.target.value })} /></label>
      {step === 1 && !!current.clips.length && <TimelinePreview project={current} clips={current.clips} index={relative >= length ? current.clips.length - 1 : Math.max(0,current.clips.findIndex(clip => relative >= clip.start_time && relative < clip.end_time))} time={Math.min(relative,length)} playing={player.playing} pause={player.pause} cropEnabled={false} framing={() => {}} />}
      <SectionSelector key={current.song_version_id} endpoint={`/api/versions/${current.song_version_id}/waveform`} elapsed={player.elapsed} duration={duration} start={current.start_time} end={current.end_time} onChange={(start_time, end_time) => update({ start_time, end_time })} />
      <div className="studio-fields"><label>Start (seconds)<input type="number" min={0} max={duration} step="0.01" value={current.start_time} onChange={event => update({ start_time: Number(event.target.value) })} /></label><label>End (seconds)<input type="number" min={0} max={duration} step="0.01" value={current.end_time} onChange={event => update({ end_time: Number(event.target.value) })} /></label></div>
      <p>{length.toFixed(2)} seconds selected · {duration.toFixed(2)} seconds available</p><div className="studio-actions">{[10, 15, 20, 30].map(seconds => <button type="button" key={seconds} onClick={() => update({ start_time: Math.min(current.start_time, Math.max(0, duration - seconds)), end_time: Math.min(duration, Math.min(current.start_time, Math.max(0, duration - seconds)) + seconds) })}>{seconds}s</button>)}</div>
      <div className="studio-actions studio-section-playback"><button disabled={length <= 0 || current.end_time > duration} onClick={() => { if (player.playing) player.pause(); else { player.beginStudio(current.song_version_id, sectionStarted.current && player.elapsed >= current.start_time && player.elapsed < current.end_time ? player.elapsed : current.start_time, current.end_time); sectionStarted.current = true; } }}>{player.playing ? 'Pause' : 'Play'}</button><button disabled={length <= 0 || current.start_time < 0 || current.end_time > duration} onClick={() => { sectionStarted.current = true; player.beginStudio(current.song_version_id, current.start_time, current.end_time); }}>Restart</button><button disabled={length <= 0 || current.start_time < 0 || current.end_time > duration} onClick={() => { sectionStarted.current = true; player.beginStudio(current.song_version_id, Math.max(current.start_time, current.end_time - 3), current.end_time); }}>Last 3s</button></div>{player.previewError && <p role="alert">{player.previewError}</p>}
      <button disabled={busy || !dirty} onClick={() => void action(save)}>Save section</button>
    </section>
    <section hidden={step !== 2} className="studio-panel"><h2>Lyrics</h2><label>Lyrics<textarea rows={7} value={current.lyrics_text} maxLength={20000} placeholder="Paste lyrics, one line at a time" onChange={event => update({ lyrics_text: event.target.value })} /></label>
      <div className="studio-actions"><SongNotes songId={current.song_id} lyrics={current.lyrics_text} onUse={lyrics_text=>update({lyrics_text})} /><button disabled={busy} onClick={() => void action(save)}>Save draft</button></div>{dirty && <p>Save changes before syncing or generating. Changing the section resets timing and visuals.</p>}
    </section>
    <section hidden={step !== 3} className="studio-panel"><h2>Sync lines</h2><p>Start playback, then tap when each line begins. Times are relative to your section.</p>{dirty && <p>Save your changes in Lyrics first.</p>}<div className={`studio-lyric-preview lyric-${current.lyric_style}`} style={lyricCss(resolveTextStyle(current.text_style, current.lyric_style))} data-testid="synced-lyric-preview" aria-live="polite">{syncMode === 'preview' ? (previewLine?.text ?? (relative >= length ? 'Preview finished' : '…')) : (current.lines[starts.length]?.text ?? (current.lines.length ? 'All lines timed' : 'Instrumental / no lyrics'))}</div>
      <div className="studio-actions"><button disabled={dirty} onClick={() => { setSyncMode('record'); setStarts([]); player.beginStudio(current.song_version_id, current.start_time, current.end_time); }}>Restart syncing</button><button disabled={dirty || syncMode !== 'record' || !player.playing || starts.length >= current.lines.length} onClick={() => { if (relative < length && (!starts.length || relative > starts[starts.length - 1])) setStarts([...starts, Number(relative.toFixed(2))]); }}>Tap Next Line</button><button disabled={!starts.length} onClick={() => setStarts(starts.slice(0, -1))}>Undo timestamp</button></div>
      <p>{timestamp(Math.min(relative, length))} / {timestamp(length)}</p>{!timingValid && current.lines.length > 0 && <p>Give every line an increasing start time inside this section to preview or save.</p>}{player.previewError && <p role="alert">{player.previewError}</p>}<ol className="studio-lines">{current.lines.map((line, index) => <li key={index}><span>{line.text}</span><label><span className="sr-only">Line {index + 1} start</span><input aria-label={`Line ${index + 1} start`} type="number" step="0.01" min={0} max={length} value={Number.isFinite(starts[index]) ? starts[index] : ''} onChange={event => { const values = [...starts]; values[index] = event.target.value === '' ? NaN : Number(event.target.value); setStarts(values); }} /></label></li>)}</ol>
      <div className="studio-actions"><button disabled={dirty || !timingValid} onClick={() => { setSyncMode('preview'); player.beginStudio(current.song_version_id, current.start_time, current.end_time); }}>Preview synced lyrics</button><button onClick={player.pause}>Pause syncing</button></div>
      <button disabled={busy || dirty || !timingValid} onClick={() => void action(async () => { const result = await api<ContentProject>(`/studio/projects/${identifier}/timings`, { ...postJson({ starts }), method: 'PUT' }); setProject(result); setNotice('Timing saved'); })}>Save timing</button>
    </section>
    {step === 4 && <Visuals timelineDirty={timelineDirty} onTimelineDirty={setTimelineDirty} pendingStyle={pendingStyle} setPendingStyle={setPendingStyle} selected={selectedMedia ?? current.media_pool ?? []} setSelected={setSelectedMedia} project={current} setProject={setProject} disabled={busy || dirty} pause={player.pause} run={action} />}
    <section hidden={step !== 5} className="studio-panel"><h2>Export</h2>{pendingStyle !== null && <p>Wait for your latest edits to finish saving before exporting.</p>}<p>{outputDimensions(current.output_format).join(' × ')} · 30 fps · MP4. The Studio worker must be running.</p><button disabled={busy || dirty || pending || pendingStyle !== null || !current.clips.length} onClick={() => void action(async () => { await api(`/studio/projects/${identifier}/renders`, postJson({})); setProject(await api<ContentProject>(`/studio/projects/${identifier}`)); })}>Render video</button>
      {current.jobs.filter(job=>job.status!=='completed').map(job=><div key={job.id}><p>Export {job.id} · {job.status}</p>{['queued','rendering'].includes(job.status)&&<progress max={100} value={job.progress} aria-label="Render progress" />}{job.error&&<p role="alert">{job.error}</p>}</div>)}
      <RenderGallery projects={[current]} onDeleted={(_,jobId)=>setProject(previous=>previous?{...previous,jobs:previous.jobs.filter(job=>job.id!==jobId)}:previous)} />
    </section><div className="studio-actions studio-step-navigation"><button aria-label="Previous step" disabled={step === 1 || timelineDirty} onClick={() => { player.pause(); setStep(step - 1); }}>← <span>Previous</span></button><button aria-label="Next step" disabled={step === 5 || timelineDirty} onClick={() => { player.pause(); setStep(step + 1); }}><span>Next</span> →</button></div><button className="secondary" disabled={busy || pending} onClick={() => { if (window.confirm('Delete this Studio draft and its exports? Your original music stays in the Library.')) void action(async () => { await api(`/studio/projects/${identifier}`, { method: 'DELETE' }); router.push('/studio'); }); }}>Delete Studio draft</button>
  </>;
}
