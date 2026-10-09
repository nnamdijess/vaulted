"use client";
import { useEffect, useRef, useState } from 'react';
import { ContentProject, Media } from '@/lib/studio';
import { usePlayer } from '../audio-player';
import { timestamp } from './section-selector';
import { TextStyle } from '@/lib/studio-text-style';
import { CropControls } from './crop-controls';
import { TimelinePreview } from './timeline-preview';
import { api, postJson } from '@/lib/api';
type Clip=ContentProject['clips'][number];
const lengthOf=(clip:Clip)=>clip.end_time-clip.start_time;
const frame=(n:number)=>Math.round(n*30)/30;
function packed(clips:Clip[]) {let elapsed=0;return clips.map(clip=>{const length=lengthOf(clip);const result={...clip,start_time:elapsed,end_time:elapsed+length};elapsed+=length;return result;});}
export function DraftTimeline({ project, disabled, onReplace, textStyle, onSaved, onDirty }: {
 project: ContentProject; disabled: boolean; onReplace: (clip:Clip)=>void; textStyle?:TextStyle; onSaved:(project:ContentProject)=>void; onDirty:(dirty:boolean)=>void;
}) {
 const player=usePlayer();
 const [clips,setClips]=useState(project.clips);
 const [savedClips,setSavedClips]=useState(project.clips);
 const [selected,setSelected]=useState(0);
 const [cursor,setCursor]=useState(0);
 const [following,setFollowing]=useState(false);
 const [zoom,setZoom]=useState(50);
 const [dirty,setDirty]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [crop,setCrop]=useState(false);
 const [library,setLibrary]=useState<Media[]|null>(null);
 const [insertId,setInsertId]=useState('');
 const [insertBefore,setInsertBefore]=useState(false);
 if(savedClips!==project.clips&&!dirty){setSavedClips(project.clips);setClips(project.clips);setSelected(Math.max(0,Math.min(selected,project.clips.length-1)));}
 const gesture=useRef<{kind:'order'|'left'|'right';index:number;x:number;duration:number;source:number}|null>(null);
 const freshId=useRef(-1);
 const limit=project.end_time-project.start_time;
 const total=clips.at(-1)?.end_time??0;
 const spare=Math.max(0,limit-total);
 const time=Math.max(0,Math.min(limit,following?player.elapsed-project.start_time:cursor));
 const playbackIndex=clips.findIndex(c=>time>=c.start_time&&time<c.end_time);
 const previewIndex=following?(playbackIndex<0?Math.max(0,clips.length-1):playbackIndex):selected;
 const clip=clips[selected];
 const playing=following&&player.playing;
 const locked=disabled||busy;
 const pauseRef=useRef(player.pause);
 useEffect(()=>()=>pauseRef.current(),[]);
 function seek(value:number,index?:number){player.pause();setFollowing(false);setCursor(Math.max(0,Math.min(limit,value)));if(index!==undefined)setSelected(index);else {const i=clips.findIndex(c=>value>=c.start_time&&value<c.end_time);if(i>=0)setSelected(i);}}
 function edit(next:Clip[],index=selected){player.pause();setFollowing(false);setClips(packed(next));setSelected(Math.max(0,Math.min(index,next.length-1)));setDirty(true);onDirty(true);setError('');}
 function updateClip(values:Partial<Clip>){if(clip)edit(clips.map((c,i)=>i===selected?{...c,...values}:c));}
 async function save(){setBusy(true);setError('');try{const value=await api<ContentProject>(`/studio/projects/${project.id}/timeline`,{...postJson({revision:project.revision,clips:clips.map(c=>({media_id:c.media_id,duration:lengthOf(c),source_start:c.source_start,framing:c.framing??{}}))}),method:'PUT'});setDirty(false);onDirty(false);onSaved(value);}catch(e){setError(e instanceof Error?e.message:'Could not save');}finally{setBusy(false);}}
 function play(last=false){if(!clips.length)return;document.querySelectorAll<HTMLVideoElement>('.studio-workspace video').forEach(v=>v.pause());setFollowing(true);const start=last?Math.max(clip.start_time,clip.end_time-3):(time>=total?0:time);player.beginStudio(project.song_version_id,project.start_time+start,project.start_time+(last?clip.end_time:total));}
 function reorder(from:number,to:number){if(from===to||to<0||to>=clips.length)return;const next=[...clips];const [c]=next.splice(from,1);next.splice(to,0,c);edit(next,to);}
 function begin(e:React.PointerEvent<HTMLButtonElement>,index:number,kind:'order'|'left'|'right'){if(locked)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);gesture.current={kind,index,x:e.clientX,duration:lengthOf(clips[index]),source:clips[index].source_start};seek(clips[index].start_time,index);}
 function finish(e:React.PointerEvent<HTMLButtonElement>){const g=gesture.current;gesture.current=null;if(!g)return;const delta=frame((e.clientX-g.x)/zoom);if(g.kind==='order'){const hit=document.elementsFromPoint(e.clientX,e.clientY).map(el=>el.closest('[data-timeline-index]')).find(Boolean);if(hit)reorder(g.index,Number(hit.getAttribute('data-timeline-index')));return;}
   const old=clips[g.index];const duration=Math.max(1/30,Math.min(g.duration+spare,g.duration+(g.kind==='left'?-delta:delta)));const source=g.kind==='left'?((g.source+g.duration-duration)%old.media.duration+old.media.duration)%old.media.duration:g.source;
   edit(clips.map((c,i)=>i===g.index?{...c,end_time:c.start_time+duration,source_start:source}:c),g.index);
 }
 return <div className="studio-timeline-editor"><h3>Your draft</h3>
 {clips.length>0&&<TimelinePreview project={project} clips={clips} index={previewIndex} time={time} playing={playing} pause={player.pause} style={textStyle} cropEnabled={crop&&!locked} framing={framing=>updateClip({framing})}/>}
 <div className="studio-actions"><button disabled={locked||!clips.length} onClick={()=>playing?player.pause():play()}>{playing?'Pause draft':time>=total?'Replay draft':'Play draft'}</button><span>{timestamp(time)} / {timestamp(limit)}</span><button disabled={locked||!clip} onClick={()=>play(true)}>Last 3s</button></div>
 {player.previewError&&<p role="alert">{player.previewError}</p>}
 <label>Draft position<input type="range" min="0" max={limit} step={1/30} value={time} aria-valuetext={timestamp(time)} onChange={e=>seek(Number(e.target.value))}/></label>
 <label>Timeline zoom<input type="range" min="20" max="160" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>
 <div className="studio-timeline-scroll" role="group" aria-label="Draft timeline"><div className="studio-edit-track" style={{width:limit*zoom}}>
 <div className="studio-ruler">{Array.from({length:Math.floor(limit)+1},(_,i)=><span key={i} style={{left:i*zoom}}>{i%5===0?timestamp(i):'·'}</span>)}</div>
 <div className="studio-edit-clips">{clips.map((c,i)=><div key={c.id} data-timeline-index={i} className="studio-edit-clip" style={{width:lengthOf(c)*zoom}}>
 <button className="studio-trim left" aria-label={`Trim start section ${i+1}`} disabled={locked} onPointerDown={e=>begin(e,i,'left')} onPointerUp={finish} onPointerCancel={()=>gesture.current=null}>↔</button>
 <button className="studio-clip-select" aria-pressed={i===(following?previewIndex:selected)} aria-label={`Select section ${i+1}, ${timestamp(c.start_time)} to ${timestamp(c.end_time)}`} onClick={()=>seek(c.start_time,i)} style={c.media.thumbnail?{backgroundImage:`linear-gradient(#0008,#0008),url("${c.media.thumbnail}")`}:undefined}><span>Section {i+1}</span><small>{timestamp(lengthOf(c))}</small></button>
 <button className="studio-reorder" aria-label={`Drag section ${i+1}`} disabled={locked} onPointerDown={e=>begin(e,i,'order')} onPointerUp={finish} onPointerCancel={()=>gesture.current=null}>⠿</button>
 <button className="studio-trim right" aria-label={`Trim end section ${i+1}`} disabled={locked} onPointerDown={e=>begin(e,i,'right')} onPointerUp={finish} onPointerCancel={()=>gesture.current=null}>↔</button>
 </div>)}</div><div className="studio-edit-playhead" style={{left:time*zoom}}/></div></div>
 <p>{spare>.03?`${spare.toFixed(2)}s unfilled. Insert or extend a clip before exporting.`:'Timeline fills the song section.'} Short footage loops automatically.</p>
 {clip&&<><strong>Section {selected+1}</strong><div className="studio-fields"><label>Clip duration<input type="number" min={1/30} max={lengthOf(clip)+spare} step={1/30} value={Number(lengthOf(clip).toFixed(3))} disabled={locked} onChange={e=>{const n=Number(e.target.value);if(n>=1/30&&n<=lengthOf(clip)+spare+.01)updateClip({end_time:clip.start_time+frame(n)});}}/></label><label>Source start<input type="number" min="0" max={clip.media.duration-.01} step="0.01" value={clip.source_start} disabled={locked} onChange={e=>{const n=Number(e.target.value);if(n>=0&&n<clip.media.duration)updateClip({source_start:n});}}/></label></div>
 <div className="studio-actions"><button disabled={locked||selected===0} onClick={()=>reorder(selected,selected-1)}>Move earlier</button><button disabled={locked||selected===clips.length-1} onClick={()=>reorder(selected,selected+1)}>Move later</button>
 <button disabled={locked||time<=clip.start_time+1/30||time>=clip.end_time-1/30} onClick={()=>{const cut=frame(time);edit([...clips.slice(0,selected),{...clip,end_time:cut},{...clip,id:freshId.current--,start_time:cut,source_start:(clip.source_start+cut-clip.start_time)%clip.media.duration},...clips.slice(selected+1)]);}}>Split at playhead</button>
 <button disabled={locked||spare<lengthOf(clip)-.01} onClick={()=>edit([...clips.slice(0,selected+1),{...clip,id:freshId.current--},...clips.slice(selected+1)],selected+1)}>Duplicate clip</button>
 <button disabled={locked} onClick={()=>edit(clips.filter((_,i)=>i!==selected))}>Delete clip</button><button disabled={locked||dirty} onClick={()=>{seek(clip.start_time);onReplace(clip);}}>Replace selected clip</button>
 <button aria-pressed={crop} onClick={()=>{player.pause();setCrop(!crop);}}>Crop / Zoom</button></div>
 {crop&&<CropControls value={clip.framing} disabled={locked} onChange={framing=>updateClip({framing})}/>}</>}
 <div className="studio-actions"><button disabled={locked||spare<1/30} onClick={()=>{setError('');void api<Media[]>('/studio/media/favorites').then(items=>{setLibrary(items);setInsertId(String(items[0]?.id??''));}).catch(e=>setError(e.message));}}>Insert clip</button><button disabled={locked||!dirty} onClick={()=>void save()}>Save timeline</button>{dirty&&<button disabled={locked} onClick={()=>{setClips(project.clips);setSelected(0);setDirty(false);onDirty(false);setFollowing(false);player.pause();}}>Cancel timeline edits</button>}</div>
 {library&&<div className="studio-insert"><label>Insert from saved clips<select value={insertId} onChange={e=>setInsertId(e.target.value)}>{library.map(m=><option key={m.id} value={m.id}>{m.title||m.tags||`Clip ${m.id}`}</option>)}</select></label><label>Position<select value={insertBefore?'before':'after'} onChange={e=>setInsertBefore(e.target.value==='before')}><option value="before">Before selected clip</option><option value="after">After selected clip</option></select></label><button disabled={!insertId||locked} onClick={()=>{const media=library.find(m=>m.id===Number(insertId));if(!media)return;const i=clips.length?selected+(insertBefore?0:1):0;edit([...clips.slice(0,i),{id:freshId.current--,media_id:media.id,media,start_time:0,end_time:Math.min(4,spare),source_start:0},...clips.slice(i)],i);setLibrary(null);}}>Insert selected media</button><button onClick={()=>setLibrary(null)}>Cancel insertion</button></div>}
 {dirty&&<p role="status">Unsaved timeline. Save before replacing footage or exporting. Changes snap together without gaps.</p>}{error&&<p role="alert">{error}</p>}
 </div>;
}
