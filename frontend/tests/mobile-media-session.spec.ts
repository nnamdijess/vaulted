import { expect } from '@playwright/test';
import { test, wav, png } from './fixtures';
const base = 'http://127.0.0.1:8011/api';

test('music metadata carries private artwork and follows system controls', async ({ page, request }) => {
  await page.addInitScript(() => {
    const actions: Record<string, ((d: object) => void) | null> = {};
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: { metadata: null, playbackState: 'none', setPositionState() {}, setActionHandler(name: string, fn: (d: object) => void) { actions[name] = fn; } } });
    Object.assign(window, { mediaAction: (name: string, data = {}) => actions[name]?.(data) });
  });
  const project = await (await request.post(`${base}/projects`, { data: { name: 'Lock screen album' } })).json();
  for (const title of ['First', 'Second']) await request.post(`${base}/projects/${project.id}/tracks`, { multipart: { files: { name: `${title}.wav`, mimeType: 'audio/wav', buffer: wav() } } });
  await page.route(`**/api/projects/${project.id}/cover*`, route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.route(`**/api/projects/${project.id}`, async route => { const response = await route.fetch(); const json = await response.json(); json.cover_path = 'test-cover.png'; await route.fulfill({ json }); });
  await page.goto(`/projects/${project.id}`);
  await page.getByRole('button', { name: 'Play All' }).click();
  await page.getByTestId('global-audio').evaluate((a: HTMLAudioElement) => a.pause());
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('First');
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.artwork[0]?.src)).toMatch(/^data:image\/png/);
  expect(await page.evaluate(() => navigator.mediaSession.metadata?.album)).toBe('Lock screen album');
  expect(await page.evaluate(() => navigator.mediaSession.metadata?.artist)).toBe('Test owner');
  await page.evaluate(() => (window as unknown as { mediaAction: (name: string) => void }).mediaAction('nexttrack'));
  await page.getByTestId('global-audio').evaluate((a: HTMLAudioElement) => a.pause());
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('Second');
  await page.evaluate(() => (window as unknown as { mediaAction: (name: string, data: object) => void }).mediaAction('seekto', { seekTime: 1 }));
  await expect.poll(() => page.getByTestId('global-audio').evaluate((a: HTMLAudioElement) => a.currentTime)).toBeCloseTo(1, 1);
});

test('export sharing has a second user gesture, safe fallback and confirmed deletion', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => { Object.assign(window, { sharedName: data.files?.[0].name }); } });
  });
  let exists = true;
  await page.route('**/api/studio/projects', route => route.fulfill({ json: [{ id: 9, title: 'Share test', song_title: 'Demo', status: 'completed', project_id: 1, cover_path: null, jobs: exists ? [{ id: 7, status: 'completed' }] : [] }] }));
  await page.route('**/api/studio/projects/9/renders/7/video*', route => route.fulfill({ contentType: 'video/mp4', body: Buffer.from('fixture-video') }));
  await page.route('**/api/studio/projects/9/renders/7', route => { expect(route.request().method()).toBe('DELETE'); exists = false; return route.fulfill({ status: 204 }); });
  await page.goto('/studio');
  await expect(page.getByRole('link', { name: 'Download MP4 in separate tab' })).toHaveAttribute('target', '_blank');
  await page.getByRole('button', { name: 'Prepare Save / Share MP4', exact: true }).click();
  await page.getByRole('button', { name: 'Save / Share MP4', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { sharedName: string }).sharedName)).toBe('vaulted-studio-7.mp4');
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: () => false }));
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save / Share MP4', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe('vaulted-studio-7.mp4');
  await expect(page).toHaveURL(/\/studio$/);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete render', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete render', exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete render', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete render', exact: true })).toHaveCount(0);
});
