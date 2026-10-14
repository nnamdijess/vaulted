"use client";
import Link from 'next/link';
import { useState } from 'react';
import { api, Project, Song } from '@/lib/api';
import { usePlayer, trackFor, QueueTrack } from './audio-player';
import { ProjectCover } from './project-cover';
import { ProjectActions, ProjectAction } from './project-actions';
import { PlayerIcon } from './player-icon';
export function LibraryCard({project,onChange,onDeleted,fallback}: {project:Project;onChange:(project:Project)=>void;onDeleted:()=>void;fallback:string}) {
 const player=usePlayer(),[action,setAction]=useState<ProjectAction|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const active=player.current?.projectId===project.id&&player.playing;
 async function play(){if(player.current?.projectId===project.id){player.toggle();return;}setBusy(true);setError('');try{const songs=await api<Song[]>(`/projects/${project.id}/songs`);const queue=songs.map(song=>trackFor(song,project)).filter((track):track is QueueTrack=>!!track);if(queue.length)player.playQueue(queue);else setError('Add tracks to play this project.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <article className="library-card"><div className="library-art"><Link href={`/projects/${project.id}`} aria-label={`Open ${project.name}`}><ProjectCover project={project}/></Link><button className="library-art-play" disabled={busy} aria-label={`${active?'Pause':'Play'} ${project.name}`} onClick={()=>void play()}><PlayerIcon name={active?'pause':'play'}/></button></div><div className="library-card-title"><Link href={`/projects/${project.id}`}><h2>{project.name}</h2></Link><ProjectActions project={project} songs={[]} action={action} setAction={setAction} onChange={updated=>{onChange(updated);player.updateProject(updated);}} onDeleted={onDeleted}/></div><p className="muted">{project.artist||fallback}</p>{error&&<p role="status">{error}</p>}</article>;
}
