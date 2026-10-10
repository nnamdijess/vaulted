"use client";
import { useEffect, useRef, useState } from 'react';
import { api, postJson } from '@/lib/api';
import type { ContentProject } from '@/lib/studio';
import type { TextStyle } from '@/lib/studio-text-style';
export type EditorEdits = { clips?: ContentProject['clips']; text_style?: TextStyle };

// One in-flight save for both domains. New edits survive an older response.
export function useEditorAutosave(project: ContentProject, onSaved: (value: ContentProject) => void,
  onPending: (pending: boolean) => void, onStyleSaved: () => void) {
  const [edits, setEdits] = useState<EditorEdits>({});
  const [status, setStatus] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved');
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const pending = useRef<EditorEdits>({});
  const revision = useRef(project.revision);
  const inFlight = useRef(false);
  const callbacks = useRef({ onSaved, onPending, onStyleSaved });
  useEffect(() => { callbacks.current = { onSaved, onPending, onStyleSaved }; });
  useEffect(() => { revision.current = Math.max(revision.current, project.revision); }, [project.revision]);

  function queue(patch: EditorEdits) {
    pending.current = { ...pending.current, ...patch };
    setEdits(pending.current);
    setError(''); setStatus('pending'); setTick(value => value + 1);
    callbacks.current.onPending(true);
  }
  function retry() { setError(''); setStatus('pending'); setTick(value => value + 1); }

  useEffect(() => {
    if (inFlight.current || status === 'error' || !Object.keys(pending.current).length) return;
    const timer = setTimeout(async () => {
      if (inFlight.current) return;
      const snapshot = pending.current;
      inFlight.current = true; setStatus('saving');
      try {
        const body = { revision: revision.current,
          ...(snapshot.text_style ? { text_style: snapshot.text_style } : {}),
          ...(snapshot.clips ? { clips: snapshot.clips.map(c => ({ media_id: c.media_id,
            duration: c.end_time - c.start_time, source_start: c.source_start,
            framing: c.framing ?? {}, loop_source: !!c.loop_source })) } : {}) };
        const value = await api<ContentProject>(`/studio/projects/${project.id}/editor`, { ...postJson(body), method: 'PUT' });
        revision.current = value.revision;
        const remaining = { ...pending.current };
        if (remaining.clips === snapshot.clips) delete remaining.clips;
        if (remaining.text_style === snapshot.text_style) {
          delete remaining.text_style;
          if (snapshot.text_style) callbacks.current.onStyleSaved();
        }
        pending.current = remaining; setEdits(remaining);
        callbacks.current.onSaved(value);
        const more = Object.keys(remaining).length > 0;
        callbacks.current.onPending(more); setStatus(more ? 'pending' : 'saved');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save edits.'); setStatus('error');
      } finally { inFlight.current = false; setTick(value => value + 1); }
    }, 500);
    return () => clearTimeout(timer);
  }, [project.id, tick, status]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    // In-app links also must not discard a failed or still-pending save.
    const guard = (event: MouseEvent) => {
      if (Object.keys(pending.current).length && (event.target as Element).closest('a[href]')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    document.addEventListener('click', guard, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guard, true); };
  }, []);
  return { edits, queue, status, error, retry };
}
