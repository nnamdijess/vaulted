import { test, expect } from '@playwright/test';
import { videoFrame, sourceTime } from '../src/lib/studio-geometry';

test('framing uses output coordinates and short footage wraps at every cycle', () => {
  const left = videoFrame(400, 200, { mode: 'fill', zoom: 1, x: 0, y: .5 });
  const right = videoFrame(400, 200, { mode: 'fill', zoom: 1, x: 1, y: .5 });
  expect(left.height).toBe('100%');
  expect(left.left).toBe('0%');
  expect(parseFloat(String(right.left))).toBeCloseTo(-255.5555, 3);
  const fit = videoFrame(400, 200, { mode: 'fit', zoom: 1, x: .5, y: .5 });
  expect(fit.width).toBe('100%');
  expect(fit.height).toBe('28.125%');
  expect(fit.top).toBe('35.9375%');
  expect([0, 4, 8, 11].map(time => sourceTime(time, 0, 4))).toEqual([0, 0, 0, 3]);
  expect(sourceTime(4, 1, 4)).toBe(1);
});

import { trimClips, insertClip, TimelineClip } from '../src/lib/studio-timeline';
const testClip = (id: number, start: number, end: number): TimelineClip => ({ id, media_id: id, start_time: start, end_time: end,
  source_start: 0, loop_source: false, media: { id, provider_id: String(id), favorite: true, preview_url: '/fixture.mp4', video_url: '', source_url: '', tags: 'fixture', duration: 5, width: 160, height: 240 } });
test('live trims can grow on a full timeline without looping ordinary sources', () => {
  const original = [testClip(1, 0, 2), testClip(2, 2, 4)];
  const grown = trimClips(original, 0, 'right', 1, 4);
  expect(grown.map(c => [c.start_time, c.end_time, c.source_start])).toEqual([[0, 3, 0], [3, 4, 1]]);
  const shortened = trimClips(original, 0, 'left', .5, 4);
  expect(shortened[0].source_start).toBe(.5);
  expect(shortened[0].end_time).toBe(1.5);
  const clamped = trimClips([testClip(1, 0, 2)], 0, 'right', 20, 10);
  expect(clamped[0].end_time).toBe(5);
  const replacement = trimClips([{ ...testClip(1, 0, 2), loop_source: true }], 0, 'right', 8, 10);
  expect(replacement[0].end_time).toBe(10);
  expect(original[0].end_time).toBe(2);
});
test('visual insertions ripple at a chosen boundary and retain framing', () => {
  const first = { ...testClip(1, 0, 2), framing: { mode: 'fill' as const, zoom: 2, x: .2, y: .4 } };
  const inserted = insertClip([first, testClip(2, 2, 4)], testClip(3, 0, 1), 1, 4);
  expect(inserted.map(c => [c.media_id, c.start_time, c.end_time])).toEqual([[1, 0, 2], [3, 2, 3], [2, 3, 4]]);
  expect(inserted[0].framing).toEqual(first.framing);
});
