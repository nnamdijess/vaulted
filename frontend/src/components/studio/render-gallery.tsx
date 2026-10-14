"use client";
import { useState } from 'react';
import { ContentProject, RenderJob, outputDimensions } from '@/lib/studio';
import { Modal } from '../modal';
import { usePlayer } from '../audio-player';
import { ExportIcon, RenderActions } from './render-actions';
type Entry={project:ContentProject;job:RenderJob};
export function RenderGallery({projects,onDeleted}:{projects:ContentProject[];onDeleted:(projectId:number,jobId:number)=>void}) {
 const [all,setAll]=useState(false),[page,setPage]=useState(0),[preview,setPreview]=useState<Entry|null>(null);
 const player=usePlayer();
 const entries=projects.flatMap(project=>project.jobs.filter(job=>job.status==='completed').map(job=>({project,job}))).sort((a,b)=>b.job.id-a.job.id);
 const pageIndex=Math.min(page,Math.max(0,Math.ceil(entries.length/12)-1));
 function cards(items:Entry[]){return <div className="studio-render-grid">{items.map(({project,job})=><article className="studio-render-card" key={job.id}>
 <button className="studio-render-thumb" aria-label={`Preview export ${job.id}`} onClick={()=>{player.pause();setPreview({project,job});}}>
 {/* eslint-disable-next-line @next/next/no-img-element -- private cached export thumbnail */}
 <img loading="lazy" src={`/api/studio/projects/${project.id}/renders/${job.id}/poster`} alt="" onError={e=>{e.currentTarget.style.visibility='hidden';}} /><span><ExportIcon name="play" /></span></button>
 <div className="studio-render-caption"><strong title={project.title}>{project.title}</strong><small>Export {job.id} · {outputDimensions(job.output_format).join(' × ')}</small><RenderActions projectId={project.id} jobId={job.id} onDeleted={()=>onDeleted(project.id,job.id)} /></div>
 </article>)}</div>;}
 return <section aria-label="Completed exports"><div className="studio-section-heading"><h2>Completed exports</h2>{entries.length>0&&<button className="studio-text-link" onClick={()=>{setPage(0);setAll(true);}}>View all exports ({entries.length}) →</button>}</div>{cards(entries.slice(0,3))}{!entries.length&&<p>No completed exports yet.</p>}
 {all&&<Modal title="All exports" className="studio-gallery-dialog" onClose={()=>setAll(false)}>{cards(entries.slice(pageIndex*12,pageIndex*12+12))}<div className="studio-actions"><button disabled={pageIndex===0} onClick={()=>setPage(pageIndex-1)}>Previous</button><span>Page {pageIndex+1} of {Math.max(1,Math.ceil(entries.length/12))}</span><button disabled={(pageIndex+1)*12>=entries.length} onClick={()=>setPage(pageIndex+1)}>Next</button></div></Modal>}
 {preview&&<Modal title={`Export ${preview.job.id}`} onClose={()=>setPreview(null)}><video className="studio-export-preview" controls playsInline preload="metadata" src={`/api/studio/projects/${preview.project.id}/renders/${preview.job.id}/video`} /></Modal>}
 </section>;
}
