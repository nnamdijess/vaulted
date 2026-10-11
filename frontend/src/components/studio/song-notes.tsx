"use client";
import { useState } from 'react';
import { api, postJson, Song } from '@/lib/api';
import { Modal } from '../modal';
export function SongNotes({ songId, lyrics, onUse }: { songId: number; lyrics: string; onUse: (text: string) => void }) {
 const [open,setOpen]=useState(false),[notes,setNotes]=useState(''),[original,setOriginal]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function show(){setBusy(true);setError('');try{const song=await api<Song>(`/songs/${songId}`);setNotes(song.notes);setOriginal(song.notes);setOpen(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function close(){if(notes!==original&&!confirm('Discard unsaved changes to song notes?'))return;setOpen(false);}
 async function save(){setBusy(true);setError('');try{const song=await api<Song>(`/songs/${songId}`,{...postJson({notes}),method:'PATCH'});setOriginal(song.notes);setNotes(song.notes);setOpen(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <><button disabled={busy} onClick={()=>void show()}>Song notes</button>{error&&!open&&<p role="alert">{error}</p>}{open&&<Modal title="Song notes" onClose={close} busy={busy}>
 <p>These are the same notes saved with your song in the Library.</p>
 <label>Song notes<textarea data-initial-focus disabled={busy} rows={12} maxLength={10000} value={notes} onChange={e=>setNotes(e.target.value)} /></label>
 <div className="studio-actions"><button disabled={busy||!lyrics.trim()||(notes.length+lyrics.length+2)>10000} onClick={()=>setNotes(value=>value ? value+'\n\n'+lyrics : lyrics)}>Append draft lyrics</button><button disabled={busy||!notes.trim()} onClick={()=>{if(confirm('Replace this draft’s lyrics with the notes? Save the draft afterward to update its timing.'))onUse(notes);}}>Use notes as draft lyrics</button></div>
 {error&&<p role="alert">{error}</p>}<div className="studio-actions"><button disabled={busy||notes===original} onClick={()=>void save()}>Save song notes</button><button disabled={busy} onClick={close}>Cancel</button></div>
 </Modal>}</>;
}
