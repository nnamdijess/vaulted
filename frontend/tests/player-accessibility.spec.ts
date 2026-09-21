import { expect } from '@playwright/test';
import { test, wav } from './fixtures';
const base = 'http://127.0.0.1:8011/api';

function luminance(value: string) {
  const channels = value.match(/[\d.]+/g)!.slice(0,3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722;
}
function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }

test('all accent previews have AA text and essential-control contrast in both themes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/hydrat/i.test(message.text())) errors.push(message.text()); });
  await page.goto('/profile');
  for (const theme of ['light','dark']) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    for (const color of ['green','blue','purple','pink','orange','teal']) {
      await page.getByRole('button', { name: `Preview ${color}` }).click();
      const styles = await page.getByRole('button', { name: 'Save preferences' }).evaluate(button => {
        const b = getComputedStyle(button), main = getComputedStyle(document.querySelector('.theme-scope')!);
        return { text: b.color, accent: b.backgroundColor, background: main.backgroundColor };
      });
      expect(contrast(styles.text, styles.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(styles.accent, styles.background)).toBeGreaterThanOrEqual(4.5);
    }
    await page.reload(); await expect(page.getByLabel('Theme', { exact: true })).toHaveValue(theme);
  }
  expect(errors).toEqual([]);
});

test('touch reorder cancels, failed saves restore order, and text remains selectable outside handles', async ({ page, request, context }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const project = await (await request.post(`${base}/projects`, { data: { name: 'Drag checks' } })).json();
  const ids: number[] = [];
  for (let i=0; i<8; i++) ids.push((await (await request.post(`${base}/projects/${project.id}/tracks`, { multipart: { files: { name: `Track ${i}.wav`, mimeType: 'audio/wav', buffer: wav() } } })).json())[0].id);
  await page.goto(`/projects/${project.id}`);
  const handle = page.getByRole('button', { name: 'Reorder Track 0', exact: true });
  await expect(handle).toHaveCSS('user-select', 'none'); await expect(handle).toHaveCSS('touch-action', 'none');
  const title = page.getByRole('link', { name: 'Track 0', exact: true });
  expect(await title.evaluate(node => getComputedStyle(node).userSelect)).not.toBe('none');
  const cdp = await context.newCDPSession(page);
  await handle.scrollIntoViewIfNeeded(); const a = (await handle.boundingBox())!;
  const b = (await page.getByRole('button', { name: 'Reorder Track 1', exact: true }).boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x+20, y: a.y+20 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x+20, y: b.y+20 }] });
  await expect(page.locator('.track-list')).toHaveClass(/is-reordering/);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('.track-list')).not.toHaveClass(/is-reordering/);
  expect((await (await request.get(`${base}/projects/${project.id}/songs`)).json()).map((s: {id:number}) => s.id)).toEqual(ids);
  // Ordinary swipes outside the handle keep native page scrolling.
  const before = await page.evaluate(() => scrollY);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 240, y: 650 }] });
  for (const y of [600,550,500,450,400]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 240, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
  await cdp.detach();
  await page.route('**/api/projects/*/order', route => route.fulfill({ status: 500, json: { detail: 'Order was not saved' } }));
  await handle.press('Space'); await handle.press('ArrowDown'); await handle.press('Enter');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Order was not saved');
  await expect.poll(() => page.locator('[data-track-id]').evaluateAll(rows => rows.map(row => Number((row as HTMLElement).dataset.trackId)))).toEqual(ids);
  await expect(page.getByRole('button', { name: 'Play All' }).locator('svg')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Play Track 0', exact: true }).locator('svg')).toHaveCount(1);
});

test('repeat-one genuine replays qualify separately while pause and mode changes do not double count', async ({ page, request }) => {
  const project = await (await request.post(`${base}/projects`, { data: { name: 'Repeat listens' } })).json();
  await request.post(`${base}/projects/${project.id}/tracks`, { multipart: { files: { name: 'Loop.wav', mimeType: 'audio/wav', buffer: wav() } } });
  const total = async () => (await (await request.get(`${base}/projects/${project.id}/insights`)).json()).total;
  await page.goto(`/projects/${project.id}`); await page.getByRole('button', { name: 'Play All' }).click();
  await page.getByRole('button', { name: 'Open Now Playing', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Repeat: off' }).click(); await dialog.getByRole('button', { name: 'Repeat: all' }).click();
  await expect.poll(total).toBe(1);
  await dialog.getByRole('button', { name: 'Pause playback' }).click();
  await dialog.getByRole('button', { name: 'Shuffle', exact: true }).click();
  expect(await total()).toBe(1);
  await dialog.getByRole('button', { name: 'Resume playback' }).click();
  await expect.poll(total, { timeout: 7000 }).toBe(2);
  await dialog.getByRole('button', { name: 'Pause playback' }).click();
  await dialog.getByRole('button', { name: 'Repeat: one' }).click();
  await dialog.getByLabel('Seek audio').fill('2.9');
  await dialog.getByRole('button', { name: 'Resume playback' }).click();
  await expect.poll(() => page.getByTestId('global-audio').evaluate((audio: HTMLAudioElement) => audio.ended)).toBe(true);
  expect(await total()).toBe(2);
});
