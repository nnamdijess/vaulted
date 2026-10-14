"use client";
import { useEffect, useRef, useState } from 'react';
import { ContentProject, Media } from '@/lib/studio';
import { clipLength, insertClip, packClips, snapFrame, TimelineClip, trimClips } from '@/lib/studio-timeline';
import { usePlayer } from '../audio-player';
import { timestamp } from './section-selector';
import { TextStyle } from '@/lib/studio-text-style';
import { CropControls } from './crop-controls';
import { TimelinePreview } from './timeline-preview';
import { ClipPreview } from './clip-preview';
import { api } from '@/lib/api';
import { PlayerIcon } from '../player-icon';

type Gesture = { kind: 'order' | 'left' | 'right'; index: number; x: number; original: TimelineClip[]; moved: boolean };
export function DraftTimeline({ project, clips, disabled, saving, onReplace, textStyle, onEdit }: {
  project: ContentProject; clips: TimelineClip[]; disabled: boolean; saving: boolean;
  onReplace: (clip: TimelineClip) => void; textStyle?: TextStyle; onEdit: (clips: TimelineClip[]) => void;
}) {
  const player = usePlayer();
  const [selected, setSelected] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [following, setFollowing] = useState(false);
  const [zoom, setZoom] = useState(70);
  const [error, setError] = useState('');
  const [crop, setCrop] = useState(false);
  const [library, setLibrary] = useState<Media[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [previewClips, setPreviewClips] = useState<TimelineClip[] | null>(null);
  const [history, setHistory] = useState<TimelineClip[][]>([]);
  const root = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const dragResult = useRef<TimelineClip[] | null>(null);
  const freshId = useRef(-1);
  const pauseRef = useRef(player.pause);
  useEffect(() => () => pauseRef.current(), []);
  const shown = previewClips ?? clips;
  const index = Math.max(0, Math.min(selected, shown.length - 1));
  const clip = shown[index];
  const limit = project.end_time - project.start_time;
  const total = shown.at(-1)?.end_time ?? 0;
  const time = Math.max(0, Math.min(limit, following ? player.elapsed - project.start_time : cursor));
  const playing = following && player.playing;
  const playbackIndex = shown.findIndex(c => time >= c.start_time && time < c.end_time);
  const previewIndex = following ? (playbackIndex < 0 ? Math.max(0, shown.length - 1) : playbackIndex) : index;

  function seek(value: number, selection?: number) {
    player.pause(); setFollowing(false); setCursor(Math.max(0, Math.min(limit, value)));
    const match = selection ?? clips.findIndex(c => value >= c.start_time && value < c.end_time);
    if (match >= 0) setSelected(match);
  }
  function edit(next: TimelineClip[], selection = index) {
    player.pause(); setCursor(time); setFollowing(false); setHistory(items => [...items.slice(-19), clips]);
    onEdit(packClips(next)); setSelected(Math.max(0, Math.min(selection, next.length - 1))); setError('');
  }
  function updateClip(values: Partial<TimelineClip>) { if (clip) edit(clips.map((c, i) => i === index ? { ...c, ...values } : c)); }
  function undo() { const previous = history.at(-1); if (!previous) return; player.pause(); setCursor(time); setFollowing(false); onEdit(previous); setHistory(items => items.slice(0, -1)); }
  function play() {
    if (!clips.length) return;
    if (playing) { player.pause(); return; }
    document.querySelectorAll<HTMLVideoElement>('.studio-workspace video').forEach(v => v.pause());
    setFollowing(true);
    player.beginStudio(project.song_version_id, project.start_time + (time >= total ? 0 : time), project.start_time + total);
  }
  function reorder(from: number, to: number) {
    if (from === to || to < 0 || to >= clips.length) return;
    const next = [...clips]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); edit(next, to);
  }
  function targetAt(x: number, y: number) {
    const hit = document.elementsFromPoint(x, y).map(el => el.closest('[data-timeline-index]')).find(Boolean);
    return hit ? Number(hit.getAttribute('data-timeline-index')) : null;
  }
  function begin(event: React.PointerEvent<HTMLButtonElement>, position: number, kind: Gesture['kind']) {
    if (disabled || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { kind, index: position, x: event.clientX, original: clips, moved: false };
    dragResult.current = null; setPreviewClips(clips); seek(clips[position].start_time, position);
  }
  function move(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = gesture.current; if (!drag) return;
    const delta = event.clientX - drag.x;
    if (Math.abs(delta) > 3) drag.moved = true;
    if (!drag.moved) return;
    if (drag.kind === 'order') {
      setDropIndex(targetAt(event.clientX, event.clientY));
      const box = scroll.current?.getBoundingClientRect();
      if (box && scroll.current) { if (event.clientX > box.right - 30) scroll.current.scrollLeft += 12; if (event.clientX < box.left + 30) scroll.current.scrollLeft -= 12; }
    } else {
      const next = trimClips(drag.original, drag.index, drag.kind, snapFrame(delta / zoom), limit);
      dragResult.current = next; setPreviewClips(next);
    }
  }
  function finish(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = gesture.current; gesture.current = null; setDropIndex(null); setPreviewClips(null);
    if (!drag) return;
    root.current?.focus({ preventScroll: true });
    if (drag.kind === 'order') {
      const target = targetAt(event.clientX, event.clientY);
      if (drag.moved && target !== null) reorder(drag.index, target);
    } else if (drag.moved) {
      edit(dragResult.current ?? trimClips(drag.original, drag.index, drag.kind, snapFrame((event.clientX - drag.x) / zoom), limit), drag.index);
    }
    dragResult.current = null;
  }
  function cancelGesture() { gesture.current = null; dragResult.current = null; setPreviewClips(null); setDropIndex(null); }
  function split() {
    if (!clip || time <= clip.start_time + 1 / 30 || time >= clip.end_time - 1 / 30) return;
    const cut = snapFrame(time), source = clip.source_start + cut - clip.start_time;
    edit([...clips.slice(0, index), { ...clip, end_time: cut }, { ...clip, id: freshId.current--, start_time: cut,
      source_start: clip.loop_source ? source % clip.media.duration : source }, ...clips.slice(index + 1)]);
  }
  async function openLibrary() {
    setLoading(true); setError('');
    try { setLibrary(await api<Media[]>('/studio/media/favorites')); } catch (err) { setError(err instanceof Error ? err.message : 'Could not load clips.'); }
    finally { setLoading(false); }
  }
  function insert(media: Media, position = clips.length ? index : 0) {
    const start = clips[position]?.start_time ?? total;
    const length = Math.min(4, media.duration, limit - start);
    if (length < 1 / 30) { setError('Drop before a clip, or shorten the last clip to make room.'); return; }
    edit(insertClip(clips, { id: freshId.current--, media_id: media.id, media, source_start: 0, loop_source: false, start_time: 0, end_time: length }, position, limit), position);
    setLibrary(null); setDropIndex(null); root.current?.focus({ preventScroll: true });
  }
  function drop(event: React.DragEvent, position: number) {
    event.preventDefault(); const media = library?.find(item => item.id === Number(event.dataTransfer.getData('application/x-vaulted-media')));
    if (media) insert(media, position);
  }
  function key(event: React.KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"], video, a, summary')) return;
    if (target.closest('button') && !target.classList.contains('studio-clip-select')) return;
    if (event.code === 'Space') { event.preventDefault(); if (!event.repeat && !disabled) play(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
    if ((event.key === 'Delete' || event.key === 'Backspace') && clip && !disabled) { event.preventDefault(); edit(clips.filter((_, i) => i !== index)); }
    if (event.key === 'Escape') cancelGesture();
  }

  return <div ref={root} className="studio-timeline-editor" tabIndex={0} aria-label="Timeline editor" onKeyDown={key}
    onPointerDownCapture={event => { if (!(event.target as HTMLElement).closest('button,input,select,textarea,summary,video')) root.current?.focus({ preventScroll: true }); }}>
    <h3>Your draft</h3>
    {shown.length > 0 && <TimelinePreview project={project} clips={shown} index={previewIndex} time={time} playing={playing} pause={player.pause}
      style={textStyle} cropEnabled={crop && !disabled} framing={framing => updateClip({ framing })} />}
    <div className="studio-playback-bar" role="group" aria-label="Draft playback">
      <button className="studio-play-button" disabled={disabled || !clips.length} onClick={play}><PlayerIcon name={playing ? 'pause' : 'play'} />{playing ? 'Pause' : 'Play'}</button>
      <span className="studio-playback-time">{timestamp(time)} <span>/ {timestamp(limit)}</span></span>
    </div>
    <div className="studio-timeline-toolbar" role="group" aria-label="Timeline tools">
      <button disabled={disabled || !clip || time <= clip.start_time + 1 / 30 || time >= clip.end_time - 1 / 30} onClick={split}>Split</button>
      <button disabled={disabled || loading} onClick={() => void openLibrary()}>{loading ? 'Loading clips…' : 'Add clips'}</button>
      <button disabled={disabled || !history.length} onClick={undo}>Undo</button>
    </div>
    {player.previewError && <p role="alert">{player.previewError}</p>}
    <label>Draft position<input type="range" min="0" max={limit} step={1 / 30} value={time} aria-valuetext={timestamp(time)} onChange={e => seek(Number(e.target.value))} /></label>
    <label className="studio-timeline-zoom">Timeline zoom<input type="range" min="30" max="240" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
    <div ref={scroll} className="studio-timeline-scroll" role="group" aria-label="Draft timeline">
      <div className="studio-edit-track" style={{ width: limit * zoom }}>
        <div className="studio-ruler" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); seek((event.clientX - event.currentTarget.getBoundingClientRect().left) / zoom); }}
          onPointerMove={event => { if (event.buttons === 1) seek((event.clientX - event.currentTarget.getBoundingClientRect().left) / zoom); }}>
          {Array.from({ length: Math.floor(limit) + 1 }, (_, i) => <span key={i} style={{ left: i * zoom }}>{i % 5 === 0 ? timestamp(i) : '·'}</span>)}
        </div>
        <div className="studio-edit-clips">{shown.map((c, i) => <div key={c.id} data-timeline-index={i}
          className={`studio-edit-clip${dropIndex === i ? ' drop-target' : ''}${i === (following ? previewIndex : index) ? ' selected' : ''}`}
          style={{ width: clipLength(c) * zoom }} onDragOver={event => { event.preventDefault(); setDropIndex(i); }} onDrop={event => drop(event, i)}>
          <button className="studio-trim left" aria-label={`Trim start section ${i + 1}`} disabled={disabled} onPointerDown={e => begin(e, i, 'left')} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancelGesture}>│</button>
          <button className="studio-clip-select" aria-pressed={i === (following ? previewIndex : index)} aria-label={`Select section ${i + 1}, ${timestamp(c.start_time)} to ${timestamp(c.end_time)}`}
            disabled={disabled} onPointerDown={e => begin(e, i, 'order')} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancelGesture}
            onClick={event => { if (event.detail === 0) seek(c.start_time, i); }}
            style={c.media.provider === 'placeholder' ? { background: '#000', color: '#fff' } : c.media.thumbnail ? { backgroundImage: `linear-gradient(#0004,#0009),url("${c.media.thumbnail}")` } : undefined}>
            <span>Section {i + 1}</span><small>{timestamp(clipLength(c))}</small>
          </button>
          <button className="studio-trim right" aria-label={`Trim end section ${i + 1}`} disabled={disabled} onPointerDown={e => begin(e, i, 'right')} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancelGesture}>│</button>
        </div>)}<div className="studio-timeline-tail" style={{ width: Math.max(0, limit - total) * zoom }} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, clips.length)} /></div>
        <div className="studio-edit-playhead" style={{ left: time * zoom }} />
      </div>
    </div>
    <p className="muted">Drag clips to reorder. Drag an edge to trim. Space plays or pauses. {limit - total > .03 && `${(limit - total).toFixed(2)}s left to fill.`}</p>
    {clip && <div className="studio-clip-inspector"><span>Section {index + 1}{clip.loop_source ? ' · Loops to fit replacement' : ''}</span>
      <button aria-pressed={crop} onClick={() => { player.pause(); setCrop(!crop); }}>Crop / Zoom</button>
      <details className="studio-clip-menu"><summary>Clip options</summary><div className="studio-actions">
        <button disabled={disabled || saving} onClick={() => onReplace(clip)}>Replace selected clip</button>
        <button disabled={disabled || clip.end_time >= limit} onClick={() => edit(insertClip(clips, { ...clip, id: freshId.current-- }, index + 1, limit), index + 1)}>Duplicate clip</button>
        <button disabled={disabled} onClick={() => edit(clips.filter((_, i) => i !== index))}>Delete clip</button>
        <button disabled={disabled || index === 0} onClick={() => reorder(index, index - 1)}>Move earlier</button>
        <button disabled={disabled || index === clips.length - 1} onClick={() => reorder(index, index + 1)}>Move later</button>
      </div><div className="studio-fields">
        <label>Clip duration<input type="number" min={1 / 30} max={clip.loop_source ? limit : clip.media.duration - clip.source_start} step={1 / 30}
          value={Number(clipLength(clip).toFixed(3))} disabled={disabled} onChange={e => { const value = Number(e.target.value); if (value >= 1 / 30) edit(trimClips(clips, index, 'right', snapFrame(value) - clipLength(clip), limit)); }} /></label>
        <label>Source start<input type="number" min="0" max={Math.max(0, clip.media.duration - 1 / 30)} step="0.01" value={clip.source_start} disabled={disabled}
          onChange={e => { const value = Number(e.target.value); if (value >= 0 && value <= clip.media.duration - 1 / 30) updateClip({ source_start: value, end_time: clip.start_time + (clip.loop_source ? clipLength(clip) : Math.min(clipLength(clip), clip.media.duration - value)) }); }} /></label>
      </div><p>Extending a clip uses free space, then shortens following clips. Original files stay intact.</p></details>
    </div>}
    {clip && crop && <CropControls value={clip.framing} disabled={disabled} onChange={framing => updateClip({ framing })} />}
    {library && <section className="studio-insert-browser" aria-label="Insert clips"><div className="studio-actions"><h4>Add footage</h4><button onClick={() => setLibrary(null)}>Close clips</button></div>
      <p>Preview a clip, then insert it before the selected section—or drag its Insert button onto the timeline. Later clips shift right; overflow past the song section is trimmed. Undo restores it.</p>
      <label>Find saved footage<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
      {!library.length && <p>No saved clips yet. Upload or save footage using Review Media.</p>}
      <div className="studio-insert-grid">{library.filter(m => `${m.title} ${m.tags}`.toLowerCase().includes(query.toLowerCase())).map(media => <article key={media.id}>
        <ClipPreview media={media} label={`Clip ${media.id} preview`} onPlay={player.pause} />
        <span>{timestamp(media.duration)}</span><small title={media.title || media.tags}>{media.title || media.tags || `Clip ${media.id}`}</small>
        <button disabled={disabled} draggable onDragStart={event => { event.dataTransfer.setData('application/x-vaulted-media', String(media.id)); event.dataTransfer.effectAllowed = 'copy'; }}
          onDragEnd={() => setDropIndex(null)} onClick={() => insert(media)}>Insert clip {media.id}</button>
      </article>)}</div>
    </section>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
