"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Modal } from '../modal';
import { StudioIcon as ExportIcon } from './studio-icon';
export { StudioIcon as ExportIcon } from './studio-icon';
export function RenderActions({ projectId, jobId, onDeleted }: { projectId:number; jobId:number; onDeleted:()=>void }) {
 const [open,setOpen]=useState(false),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const url=`/api/studio/projects/${projectId}/renders/${jobId}/video?download=true`;
 useEffect(()=>{
  if(!open)return;
  const controller=new AbortController();let active=true;
  void (async()=>{try{const response=await fetch(url,{credentials:'same-origin',signal:controller.signal});if(!response.ok)throw new Error('Could not load MP4. Try downloading directly.');if(Number(response.headers.get('content-length')??0)>150*1024*1024)throw new Error('Use Download MP4 for this large export.');const blob=await response.blob();if(blob.size>150*1024*1024)throw new Error('Use Download MP4 for this large export.');if(active)setFile(new File([blob],`vaulted-studio-${jobId}.mp4`,{type:'video/mp4'}));}catch(e){if(active)setError((e as Error).message);}finally{if(active)setBusy(false);}})();
  return()=>{active=false;controller.abort();};
 },[open,url,jobId]);
 async function share(){if(!file)return;setError('');try{if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'Vaulted Studio'});else{const objectUrl=URL.createObjectURL(file);const a=document.createElement('a');a.href=objectUrl;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);}}catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))setError('Sharing was unavailable. Try Download MP4.');}}
 return <div className="studio-render-actions"><button className="studio-export-icon" aria-label="Share export" title="Share export" onClick={()=>{setBusy(true);setError('');setFile(null);setOpen(true);}}><ExportIcon name="share" /></button><button className="studio-export-icon" aria-label="Delete export" title="Delete export" disabled={busy} onClick={()=>{if(!window.confirm('Permanently delete this exported MP4? Your draft and source clips will remain.'))return;setBusy(true);void api(`/studio/projects/${projectId}/renders/${jobId}`,{method:'DELETE'}).then(onDeleted).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}><ExportIcon name="delete" /></button>
 {error&&!open&&<p role="alert">{error}</p>}{open&&<Modal title="Share export" onClose={()=>{setOpen(false);setFile(null);setBusy(false);}}><p role="status">{busy?'Loading video…':file?'Your video is ready to share or save.':''}</p><button disabled={!file||busy} onClick={()=>void share()}>Share video</button><p><a href={url} target="_blank" rel="noopener noreferrer" download>Download MP4</a></p>{error&&<p role="alert">{error}</p>}</Modal>}</div>;
}
