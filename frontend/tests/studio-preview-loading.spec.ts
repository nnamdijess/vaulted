import { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, wav, png } from './fixtures';

test('50 preview cards load only the requested video and release offscreen connections', async ({ page, request }, testInfo) => {
  const base = 'http://127.0.0.1:8011/api';
  const python = path.resolve('../backend', process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
  const ffmpeg = execFileSync(python, ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
  const fixture = testInfo.outputPath('preview.mp4');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x240:rate=10', '-t', '6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fixture]);
  const body = readFileSync(fixture);
  const music = await (await request.post(`${base}/projects`, { data: { name: 'Previews' } })).json();
  const [song] = await (await request.post(`${base}/projects/${music.id}/tracks`, { multipart: { files: { name: 'Demo.wav', mimeType: 'audio/wav', buffer: wav() } } })).json();
  const draft = await (await request.post(`${base}/studio/projects`, { data: { title: 'Previews', song_version_id: song.latest_version_id } })).json();
  const media = Array.from({ length: 50 }, (_, id) => ({ id: id + 1, provider: 'upload', favorite: true, title: `Clip ${id}`, tags: `clip ${id}`, duration: 6, preview_url: `/fixture-video/${id}`, thumbnail: '/fixture-poster' }));
  const requests: string[] = [];
  let fail = true;
  await page.route('**/fixture-video/*', route => {
    requests.push(route.request().url());
    if (fail) { fail = false; return route.fulfill({ status: 503, body: 'Temporary failure' }); }
    return route.fulfill({ contentType: 'video/mp4', body });
  });
  await page.route('**/fixture-poster', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.route('**/api/studio/media/favorites*', route => route.fulfill({ json: media }));
  await page.goto(`/studio/${draft.id}`);
  await page.getByRole('button', { name: '4. Visuals', exact: true }).click();
  const cards = page.locator('.studio-media-grid article');
  await expect(cards).toHaveCount(50);
  await cards.last().scrollIntoViewIfNeeded();
  await cards.first().scrollIntoViewIfNeeded();
  expect(requests).toHaveLength(0);
  await expect(page.locator('.studio-clip-preview video[src]')).toHaveCount(0);
  await cards.first().getByRole('button', { name: 'Play Preview clip 0', exact: true }).click();
  await expect(cards.first().getByText('Video preview unavailable.')).toBeVisible();
  await cards.first().getByRole('button', { name: 'Retry preview' }).click();
  await expect(cards.first().locator('video')).toHaveJSProperty('paused', false);
  await cards.nth(1).getByRole('button', { name: 'Play Preview clip 1', exact: true }).click();
  await expect(cards.nth(1).locator('video')).toHaveJSProperty('paused', false);
  await expect(cards.first().locator('video')).not.toHaveAttribute('src');
  await expect(page.locator('.studio-clip-preview video[src]')).toHaveCount(1);
  await cards.last().scrollIntoViewIfNeeded();
  await expect(page.locator('.studio-clip-preview video[src]')).toHaveCount(0);
  await cards.nth(1).scrollIntoViewIfNeeded();
  await cards.nth(1).getByRole('button', { name: 'Play Preview clip 1', exact: true }).click();
  await expect(cards.nth(1).locator('video')).toHaveJSProperty('paused', false);
  expect(requests.every(url => /fixture-video\/[01]$/.test(url))).toBe(true);
});
