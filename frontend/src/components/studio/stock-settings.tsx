"use client";
import { useEffect, useState } from 'react';
import { api, postJson } from '@/lib/api';
import { ContentProject, Presets } from '@/lib/studio';
import { AestheticEditor } from './aesthetic-editor';
export function StockSettings({project,onSaved,disabled,run}:{project:ContentProject;onSaved:(p:ContentProject)=>void;disabled:boolean;run:(work:()=>Promise<void>)=>Promise<void>}) {
 const [presets,setPresets]=useState<Presets>({aesthetics:[],styles:[]});
 useEffect(()=>{let active=true;void api<Presets>('/studio/presets').then(p=>{if(active)setPresets(p);}).catch(()=>{});return()=>{active=false;};},[]);
 async function choose(aesthetic:string){await run(async()=>{onSaved(await api<ContentProject>(`/studio/projects/${project.id}`,{...postJson({title:project.title,start_time:project.start_time,end_time:project.end_time,lyrics_text:project.lyrics_text,aesthetic,lyric_style:project.lyric_style}),method:'PATCH'}));});}
 return <details><summary>Stock footage settings</summary><label>Aesthetic<select disabled={disabled} value={project.aesthetic} onChange={e=>void choose(e.target.value)}>{presets.aesthetics.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><AestheticEditor aesthetic={project.aesthetic} presets={presets} onSaved={async value=>{setPresets(await api<Presets>('/studio/presets'));await choose(value);}} /></details>;
}
