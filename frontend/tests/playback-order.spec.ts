import { test, expect } from '@playwright/test';
import { PlaybackOrder } from '../src/lib/playback-order';

test('shuffle cycles, history, repeat and reorder preserve the selected track', () => {
  const order = new PlaybackOrder();
  order.reset([1,2,3,4], 1); order.setShuffle(true);
  const visited = [1, order.next()!, order.next()!, order.next()!];
  expect(new Set(visited).size).toBe(4); expect(order.next()).toBeNull();
  expect(order.previous()).toBe(visited[2]); expect(order.next()).toBe(visited[3]);
  order.repeat = 'all';
  const cycle = [order.next()!,order.next()!,order.next()!,order.next()!];
  expect(new Set(cycle).size).toBe(4); expect(cycle[0]).not.toBe(visited[3]);
  const selected = order.current;
  order.setShuffle(false); expect(order.current).toBe(selected);
  expect(order.canPrevious).toBe(true);
  order.reconcile([4,3,2,1]); expect(order.current).toBe(selected);
  order.reset([1,2],1); order.repeat = 'one';
  expect(order.next()).toBe(2); // Repeat-one applies to natural ending, not manual Next.
  expect(order.next()).toBeNull();
  order.reset([1],1); order.repeat = 'all'; expect(order.next()).toBe(1);
  order.repeat = 'off'; expect(order.next()).toBeNull(); expect(order.previous()).toBe(1);
});

test('removing queued songs removes their shuffle history and future entries', () => {
  const order = new PlaybackOrder(); order.reset([1,2,3],1); order.setShuffle(true);
  const next = order.next()!; order.reconcile([next]);
  expect(order.current).toBe(next); expect(order.canPrevious).toBe(false); expect(order.canNext).toBe(false);
});
