"use client";
import { useEffect, useRef, useState } from 'react';
import { ContentProject, Framing } from '@/lib/studio';
import { sourceTime, videoFrame } from '@/lib/studio-geometry';
import { resolveTextStyle, TextStyle } from '@/lib/studio-text-style';
import { LyricOverlay } from './lyric-overlay';
import { useCropGesture } from './crop-controls';
type Clip = ContentProject['clips'][number];
function VideoSlot({ clip, time, active, playing, pause }: { clip?: Clip; time: number; active: boolean; playing: boolean; pause: () => void }) {
  const video=useRef<HTMLVideoElement>(null);
  const [dimensions,setDimensions]=useState({width:1080,height:1920});
  const [failed,setFailed]=useState(false);
  const target=clip ? Math.max(0,time-clip.start_time) : 0;
  useEffect(() => {
    const el=video.current; if(!el || !clip || el.readyState<1) return;
    if(!active) {el.pause();return;}
    const position=clip.loop_source ? sourceTime(target,clip.source_start,el.duration) : Math.min(target+clip.source_start,Math.max(0,el.duration-.01));
    // Only correct substantial drift; normal playback runs in the media engine.
    if(Math.abs(el.currentTime-position) > (playing ? .6 : .02)) el.currentTime=position;
    if(playing && el.paused) void el.play().catch(e=>{if(e.name!=='AbortError'){setFailed(true);pause();}});
    if(!playing) el.pause();
  },[target,playing,active,clip,pause]);
  return <><video ref={video} src={clip?.media.preview_url} muted playsInline loop={!!clip?.loop_source} preload={clip ? 'auto' : 'none'}
    aria-label={active ? 'Draft preview' : 'Preloaded next clip'} aria-hidden={!active}
    style={{...videoFrame(dimensions.width,dimensions.height,clip?.framing),visibility:active?'visible':'hidden'}}
    onLoadedMetadata={e=>{const el=e.currentTarget;setDimensions({width:el.videoWidth,height:el.videoHeight});setFailed(false);el.currentTime=clip?.loop_source ? sourceTime(target,clip.source_start,el.duration) : Math.min(target+(clip?.source_start??0),Math.max(0,el.duration-.01));if(active&&playing) void el.play().catch(()=>pause());}}
    onError={()=>{if(clip&&active){setFailed(true);pause();}}}/>
    {failed&&active&&<div className="studio-video-error">Footage unavailable.<button onClick={()=>{setFailed(false);video.current?.load();}}>Retry video</button></div>}</>;
}
export function TimelinePreview({ project, clips, index, time, playing, pause, style, framing, cropEnabled }: {
  project: ContentProject; clips: Clip[]; index: number; time: number; playing: boolean; pause: () => void;
  style?: TextStyle; framing: (f: Framing) => void; cropEnabled: boolean;
}) {
  const clip=clips[index];
  const gesture=useCropGesture(clip?.framing,framing);
  const selected=style??resolveTextStyle(project.text_style,project.lyric_style);
  const line=project.lines.find(item=>item.start_time!==null&&time>=item.start_time&&time<(item.end_time??0));
  return <div className="studio-preview-frame studio-draft-preview" style={{touchAction:cropEnabled?'none':'auto'}} {...(cropEnabled?gesture:{})}>
    {[0,1].map(slot=>{const active=index%2===slot;return <VideoSlot key={slot} clip={active?clip:clips[index+1]} active={active} time={active?time:clips[index+1]?.start_time??0} playing={playing&&active} pause={pause}/>;})}
    <LyricOverlay projectId={project.id} text={line?.text??''} nextText={project.lines[project.lines.indexOf(line!)+1]?.text} style={selected} preset={project.lyric_style}/>

  </div>;
}
