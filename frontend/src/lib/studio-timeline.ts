import type { ContentProject } from './studio';
export type TimelineClip = ContentProject['clips'][number];
export const clipLength = (clip: TimelineClip) => clip.end_time - clip.start_time;
export const snapFrame = (value: number) => Math.round(value * 30) / 30;
const minimum = 1 / 30;
export function packClips(clips: TimelineClip[]) {
  let time = 0;
  return clips.map(clip => { const duration = clipLength(clip); const result = { ...clip, start_time: time, end_time: time + duration }; time += duration; return result; });
}
function sourceOffset(clip: TimelineClip, amount: number) {
  const offset = clip.source_start + amount;
  return clip.loop_source ? ((offset % clip.media.duration) + clip.media.duration) % clip.media.duration : Math.max(0, offset);
}
export function trimClips(original: TimelineClip[], index: number, side: 'left' | 'right', delta: number, limit: number) {
  const clip = original[index], duration = clipLength(clip);
  const spare = Math.max(0, limit - (original.at(-1)?.end_time ?? 0));
  const borrow = original.slice(index + 1).reduce((sum, next) => sum + Math.max(0, clipLength(next) - minimum), 0);
  const sourceRoom = clip.loop_source ? limit : side === 'left' ? duration + clip.source_start : clip.media.duration - clip.source_start;
  const nextDuration = Math.max(minimum, Math.min(sourceRoom, duration + spare + borrow, duration + (side === 'left' ? -delta : delta)));
  let remaining = Math.max(0, nextDuration - duration - spare);
  const next = original.map((item, position) => {
    if (position === index) return { ...item, source_start: side === 'left' ? sourceOffset(item, duration - nextDuration) : item.source_start, end_time: item.start_time + nextDuration };
    if (position <= index || remaining <= 0) return item;
    const take = Math.min(remaining, Math.max(0, clipLength(item) - minimum)); remaining -= take;
    return { ...item, source_start: sourceOffset(item, take), end_time: item.end_time - take };
  });
  return packClips(next);
}
// A fixed song section bounds the edit. Insertions ripple right and trim overflow.
export function insertClip(clips: TimelineClip[], inserted: TimelineClip, index: number, limit: number) {
  const result: TimelineClip[] = [];
  let remaining = limit;
  for (const clip of [...clips.slice(0, index), inserted, ...clips.slice(index)]) {
    if (remaining < minimum - 0.00001) break;
    const duration = Math.min(remaining, clipLength(clip));
    result.push({ ...clip, start_time: 0, end_time: duration }); remaining -= duration;
  }
  return packClips(result);
}
