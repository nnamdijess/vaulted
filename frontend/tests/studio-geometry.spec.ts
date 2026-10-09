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
