"use client";
import { useEffect, useRef, useState } from 'react';
import { ContentProject } from '@/lib/studio';
import { usePlayer } from '../audio-player';
import { timestamp } from './section-selector';
import { TextStyle, lyricCss, resolveTextStyle } from '@/lib/studio-text-style';

type Clip = ContentProject['clips'][number];

function DraftVideo({ clip, time, playing, pause }: { clip: Clip; time: number; playing: boolean; pause: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const target = clip.source_start + Math.max(0, time - clip.start_time);
  function sync(element: HTMLVideoElement) {
    if (element.readyState < 1) return;
    const position = Math.min(target, Math.max(0, element.duration - 0.01));
    if (Math.abs(element.currentTime - position) > 0.25) element.currentTime = position;
    if (playing) void element.play().catch(error => { if (error.name !== 'AbortError') { setFailed(true); pause(); } });
    else element.pause();
  }
  useEffect(() => {
    const element = video.current;
    if (element) sync(element);
  });
  return <>
    <video ref={video} src={clip.media.preview_url} poster={clip.media.thumbnail || undefined} muted playsInline preload="auto"
      aria-label="Draft preview" onLoadedMetadata={event => { event.currentTarget.currentTime = Math.min(target + 0.01, event.currentTarget.duration); sync(event.currentTarget); }}
      onError={() => { setFailed(true); pause(); }} />
    {failed && <div className="studio-video-error" role="status">This footage could not load.
      <button className="secondary" onClick={() => { setFailed(false); video.current?.load(); }}>Retry video</button>
    </div>}
  </>;
}

export function DraftTimeline({ project, disabled, onReplace, textStyle }: {
  project: ContentProject; disabled: boolean; onReplace: (clip: Clip) => void; textStyle?: TextStyle;
}) {
  const player = usePlayer();
  const [cursor, setCursor] = useState(0);
  const [followingAudio, setFollowingAudio] = useState(false);
  const length = project.end_time - project.start_time;
  const time = Math.min(length, Math.max(0, followingAudio ? player.elapsed - project.start_time : cursor));
  const clip = project.clips.find(item => time >= item.start_time && time < item.end_time) ?? project.clips.at(-1)!;
  const index = project.clips.indexOf(clip);
  const line = project.lines.find(item => item.start_time !== null && time >= item.start_time && time < (item.end_time ?? 0));
  const playing = followingAudio && player.playing;
  const surface = useRef<HTMLDivElement>(null);
  const pauseRef = useRef(player.pause);
  useEffect(() => {
    const pause = pauseRef.current;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) pause();
    });
    observer.observe(surface.current!);
    return () => { observer.disconnect(); pause(); };
  }, []);
  function seek(value: number) {
    player.pause();
    setFollowingAudio(false);
    setCursor(Math.max(0, Math.min(length, value)));
  }
  function play() {
    document.querySelectorAll<HTMLVideoElement>('.studio-workspace video').forEach(element => element.pause());
    setFollowingAudio(true);
    player.beginStudio(project.song_version_id, project.start_time + (time >= length ? 0 : time), project.end_time);
  }
  return <div ref={surface} className="studio-timeline-editor">
    <h3>Your draft</h3>
    <div className={`studio-draft-preview lyric-${project.lyric_style}`}>
      <DraftVideo key={`${clip.id}:${clip.media.preview_url}`} clip={clip} time={time} playing={playing} pause={player.pause} />
      <p style={lyricCss(textStyle ?? resolveTextStyle(project.text_style, project.lyric_style))}>{line?.text}</p>
    </div>
    <div className="studio-actions">
      <button disabled={disabled} onClick={playing ? player.pause : play}>{playing ? 'Pause draft' : time >= length ? 'Replay draft' : 'Play draft'}</button>
      <span aria-live="off">{timestamp(time)} / {timestamp(length)}</span>
    </div>
    {player.previewError && <p role="alert">{player.previewError}</p>}
    <label>Draft position<input type="range" min={0} max={length} step={0.01} value={time}
      aria-valuetext={timestamp(time)} onChange={event => seek(Number(event.target.value))} /></label>
    <div className="studio-timeline-scroll" role="group" aria-label="Draft timeline">
      <div className="studio-timeline-track">
        {project.clips.map((item, itemIndex) => <button key={item.id} type="button" className="secondary studio-timeline-segment"
          style={{ flexGrow: item.end_time - item.start_time }} aria-pressed={clip.id === item.id}
          aria-label={`Select section ${itemIndex + 1}, ${timestamp(item.start_time)} to ${timestamp(item.end_time)}`}
          onClick={() => seek(item.start_time)}>
          {/* Provider thumbnails are optional on older saved drafts. */}
          {item.media.thumbnail && <span className="studio-timeline-thumb" style={{ backgroundImage: `url("${item.media.thumbnail}")` }} />}
          <strong>Section {itemIndex + 1}</strong><small>{timestamp(item.start_time)}–{timestamp(item.end_time)}</small>
        </button>)}
      </div>
    </div>
    <div className="studio-selected-section">
      <div><strong>Section {index + 1}</strong><p>{timestamp(clip.start_time)}–{timestamp(clip.end_time)} · {clip.media.tags}</p></div>
      <button disabled={disabled} onClick={() => { seek(clip.start_time); onReplace(clip); }}>Replace selected clip</button>
    </div>
    <small>Preview plays your sequence with music and lyrics. Export produces the final video with frame-aligned cuts.</small>
  </div>;
}
