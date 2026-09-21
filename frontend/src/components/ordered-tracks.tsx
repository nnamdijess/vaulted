"use client";
import { ReactNode, useRef, useState } from 'react';
import { PlayerIcon } from "./player-icon";
import { Song } from '@/lib/api';

export function OrderedTracks({ songs, currentId, onReorder, children }: {
  songs: Song[]; currentId?: number; onReorder: (songs: Song[]) => Promise<void>; children: (song: Song) => ReactNode;
}) {
  const [preview, setPreview] = useState<Song[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const drag = useRef<{ id: number; order: Song[]; original: number[] } | null>(null);
  function start(id: number) {
    if (saving || drag.current) return;
    drag.current = { id, order: [...songs], original: songs.map(song => song.id) };
    setActiveId(id); setPreview([...songs]); setAnnouncement('Track picked up. Use arrow keys to move, Enter to save, Escape to cancel.');
  }
  function move(to: number) {
    const state = drag.current; if (!state || to < 0 || to >= state.order.length) return;
    const order = [...state.order], from = order.findIndex(song => song.id === state.id);
    if (from === to) return;
    const [item] = order.splice(from,1); order.splice(to,0,item); state.order = order;
    setPreview(order); setAnnouncement(`${item.title}, position ${to + 1} of ${order.length}`);
  }
  async function finish(cancel = false) {
    const state = drag.current; if (!state) return;
    drag.current = null; setActiveId(null);
    if (cancel || state.order.every((song, i) => song.id === state.original[i])) {
      setPreview(null); setAnnouncement(cancel ? 'Reorder cancelled' : 'Order unchanged'); return;
    }
    setSaving(true);
    try { await onReorder(state.order); setAnnouncement('Track order saved'); }
    catch { setAnnouncement('Could not save track order. Please try again.'); }
    finally { setPreview(null); setSaving(false); }
  }
  return <><p className="muted reorder-help">Drag the track numbers to reorder. Keyboard: Space to pick up, arrows to move, Enter to save.</p>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <ol className={`track-list ${activeId !== null ? "is-reordering" : ""}`} aria-label="Project tracks" aria-busy={saving}
        onPointerMove={event => {
          const state = drag.current; if (!state || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-track-id]');
          if (target) move(state.order.findIndex(item => item.id === Number(target.dataset.trackId)));
          if (event.clientY < 90) window.scrollBy(0,-18);
          else if (event.clientY > window.innerHeight - 140) window.scrollBy(0,18);
        }}
        onPointerUp={event => { void finish(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onLostPointerCapture={() => { if (drag.current) void finish(true); }}
        onPointerCancel={() => void finish(true)}
>{(preview ?? songs).map((song, index) => <li key={song.id} data-track-id={song.id} className={`track-row ${currentId === song.id ? 'is-current' : ''} ${activeId === song.id ? 'is-dragging' : ''}`}>
      <button className="track-number drag-handle" aria-label={`Reorder ${song.title}`} aria-pressed={activeId === song.id} disabled={saving || songs.length < 2}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => { if (event.button !== 0 || saving) return; event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); start(song.id); event.currentTarget.closest('ol')!.setPointerCapture(event.pointerId); }}
        onKeyDown={event => {
          if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (drag.current) void finish(); else start(song.id); }
          else if (event.key === 'Escape') { event.preventDefault(); void finish(true); }
          else if (drag.current && ['ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); move(drag.current.order.findIndex(item => item.id === song.id) + (event.key === 'ArrowUp' ? -1 : 1)); }
        }}><span>{index + 1}</span><span className="grip" aria-hidden="true"><PlayerIcon name="grip" /></span></button>
      {children(song)}
    </li>)}</ol></>;
}
