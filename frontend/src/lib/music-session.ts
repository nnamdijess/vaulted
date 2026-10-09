"use client";
import { useEffect } from 'react';
import type { QueueTrack } from '@/components/audio-player';
export function useMusicSession(track: QueueTrack|null, artist:string, active:boolean, playing:boolean, elapsed:number, duration:number,
 controls:{play:()=>void;pause:()=>void;previous:()=>void;next:()=>void;seek:(n:number)=>void}) {
 useEffect(()=>{
  if(!('mediaSession' in navigator)||typeof MediaMetadata==='undefined')return;
  let cancelled=false;
  if(!track||!active){navigator.mediaSession.metadata=null;return;}
  const metadata={title:track.title,artist,album:track.album??'',artwork:[] as MediaImage[]};
  navigator.mediaSession.metadata=new MediaMetadata(metadata);
  const abort=new AbortController();
  if(track.coverUrl)void fetch(track.coverUrl,{credentials:'same-origin',signal:abort.signal}).then(async response=>{
    if(!response.ok)throw new Error('Artwork unavailable');
    const blob=await response.blob();if(blob.size>10*1024*1024)return;
    const src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
    // Fetch with the existing private session, then hand system UI a local data URL.
    // No public artwork route or bearer token is created.
    if(!cancelled)navigator.mediaSession.metadata=new MediaMetadata({...metadata,artwork:[{src,type:blob.type}]});
  }).catch(()=>{});
  return()=>{cancelled=true;abort.abort();navigator.mediaSession.metadata=null;};
 },[track?.songId,track?.versionId,track?.title,track?.album,track?.coverUrl,artist,active,track]);
 useEffect(()=>{
  if(!('mediaSession' in navigator))return;
  navigator.mediaSession.playbackState=active?(playing?'playing':'paused'):'none';
  if(active&&duration>0&&Number.isFinite(duration))try{navigator.mediaSession.setPositionState({duration,playbackRate:1,position:Math.max(0,Math.min(duration,elapsed))});}catch{}
  else try{navigator.mediaSession.setPositionState();}catch{}
 },[active,playing,elapsed,duration]);
 useEffect(()=>{
  if(!('mediaSession' in navigator))return;
  const actions:Partial<Record<MediaSessionAction,MediaSessionActionHandler>>={play:controls.play,pause:controls.pause,previoustrack:controls.previous,nexttrack:controls.next,seekto:d=>controls.seek(d.seekTime??elapsed),seekbackward:d=>controls.seek(Math.max(0,elapsed-(d.seekOffset??10))),seekforward:d=>controls.seek(Math.min(duration,elapsed+(d.seekOffset??10)))};
  for(const [name,handler] of Object.entries(actions))try{navigator.mediaSession.setActionHandler(name as MediaSessionAction,active?handler:null);}catch{}
  return()=>{for(const name of Object.keys(actions))try{navigator.mediaSession.setActionHandler(name as MediaSessionAction,null);}catch{}};
 },[active,controls,elapsed,duration]);
}
