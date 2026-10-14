"use client";
import { useEffect, useState } from 'react';
import { api, postJson } from '@/lib/api';
import { Media } from '@/lib/studio';
import { Modal } from '../modal';
export type MediaFolder = {id:number;name:string;count:number};
export function MediaFolders({folders,setFolders,folder,onFolder,revision,disabled}: {folders:MediaFolder[];setFolders:(folders:MediaFolder[])=>void;folder:string;onFolder:(folder:string)=>void;revision:number;disabled:boolean}) {
 const [dialog,setDialog]=useState<'create'|'rename'|'delete'|null>(null),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const current=folders.find(f=>String(f.id)===folder);
 useEffect(()=>{let active=true;api<MediaFolder[]>('/studio/folders').then(items=>{if(active)setFolders(items);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[revision,setFolders]);
 async function save(){setBusy(true);setError('');try{
  if(dialog==='delete'){await api(`/studio/folders/${current!.id}`,{method:'DELETE'});onFolder('all');}
  else await api(dialog==='rename'?`/studio/folders/${current!.id}`:'/studio/folders',{...postJson({name}),method:dialog==='rename'?'PUT':'POST'});
  setFolders(await api<MediaFolder[]>('/studio/folders'));setDialog(null);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <><div className="studio-folder-bar"><label>Media folder<select disabled={disabled} value={folder} onChange={e=>onFolder(e.target.value)}><option value="all">All Media</option><option value="unfiled">Unfiled</option><optgroup label="My Folders">{folders.map(f=><option key={f.id} value={f.id}>{f.name} ({f.count})</option>)}</optgroup></select></label><button disabled={disabled} onClick={()=>{setName('');setError('');setDialog('create');}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M3 6h6l2 2h10v12H3zM12 11v6m-3-3h6" /></svg> Create Folder</button>{current&&<details><summary aria-label="Folder menu">Folder options</summary><button disabled={disabled} onClick={()=>{setName(current.name);setError('');setDialog('rename');}}>Rename folder</button><button disabled={disabled} onClick={()=>{if(current.count){setError('Move or delete the videos in this folder before deleting it.');return;}setError('');setDialog('delete');}}>Delete folder</button></details>}</div>{error&&!dialog&&<p role="alert">{error}</p>}
 {dialog&&<Modal title={dialog==='delete'?'Delete empty folder':dialog==='rename'?'Rename folder':'Create Folder'} busy={busy} onClose={()=>setDialog(null)}><form onSubmit={e=>{e.preventDefault();void save();}}>{dialog==='delete'?<p>Delete “{current?.name}”? Only empty folders can be deleted.</p>:<label>Folder name<input autoFocus maxLength={80} required value={name} onChange={e=>setName(e.target.value)} /></label>}{error&&<p role="alert">{error}</p>}<div className="studio-actions"><button type="button" disabled={busy} onClick={()=>setDialog(null)}>Cancel</button><button disabled={busy||dialog!=='delete'&&!name.trim()}>{dialog==='delete'?'Delete Folder':'Save folder'}</button></div></form></Modal>}</>;
}
export function MoveMedia({media,folders,disabled,onMoved}: {media:Media;folders:MediaFolder[];disabled:boolean;onMoved:(media:Media)=>void}){
 const [open,setOpen]=useState(false),[destination,setDestination]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <><button disabled={disabled} onClick={()=>{setDestination(media.folder_id?String(media.folder_id):'');setError('');setOpen(true);}}>Move to Folder</button>{open&&<Modal title="Move to Folder" onClose={()=>setOpen(false)} busy={busy}><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{onMoved(await api<Media>(`/studio/media/${media.id}/folder`,{...postJson({folder_id:destination?Number(destination):null}),method:'PUT'}));setOpen(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><label>Destination folder<select value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Unfiled</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>{error&&<p role="alert">{error}</p>}<div className="studio-actions"><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button disabled={busy}>Move video</button></div></form></Modal>}</>;
}
