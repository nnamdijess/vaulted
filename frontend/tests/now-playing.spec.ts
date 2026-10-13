import { expect, Page } from '@playwright/test';
import { test, wav } from './fixtures';

const base = 'http://127.0.0.1:8011/api';
async function pause(page: Page) { await page.getByTestId('global-audio').evaluate((node: HTMLAudioElement) => node.pause()); }

test('expanded player shares audio, favorites persist, modes preserve position and replay creates a fresh listen', async ({ page, request }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /hydrat/i.test(message.text())) errors.push(message.text()); });
  const project = await (await request.post(`${base}/projects`, { data: { name: 'Player album' } })).json();
  const songs = [];
  for (const title of ['One','Two','Three']) songs.push((await (await request.post(`${base}/projects/${project.id}/tracks`, { multipart: { files: { name: `${title}.wav`, mimeType: 'audio/wav', buffer: wav() } } })).json())[0]);
  await page.goto(`/projects/${project.id}`);
  await page.getByRole('button', { name: 'Play All' }).click(); await pause(page);
  const audio = page.getByTestId('global-audio');
  await audio.evaluate((node: HTMLAudioElement) => { node.currentTime = .5; node.dataset.original = 'yes'; });
  await page.getByRole('button', { name: 'Open Now Playing', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Now Playing' });
  await expect(dialog.getByRole('heading', { name: 'One', exact: true })).toBeVisible();
  await expect(dialog.getByText('Original', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Previous track' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Shuffle', exact: true }).click();
  await dialog.getByRole('button', { name: 'Repeat: off', exact: true }).click();
  expect(await audio.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeCloseTo(.5, 1);
  await expect(audio).toHaveAttribute('data-original', 'yes'); await expect(audio).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Add to favorites' }).click();
  await expect(dialog.getByRole('button', { name: 'Remove from favorites' })).toHaveAttribute('aria-pressed', 'true');
  expect((await (await request.get(`${base}/songs/${songs[0].id}/favorite`)).json()).favorite).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open Now Playing', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Now Playing: One', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Remove from favorites' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Shuffle', exact: true }).click();
  await dialog.getByRole('button', { name: 'Repeat: all' }).click(); // repeat one
  await audio.evaluate((node: HTMLAudioElement) => node.dispatchEvent(new Event('ended'))); await pause(page);
  await expect(dialog.getByRole('heading', { name: 'One', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Next track' }).click(); await pause(page);
  await expect(dialog.getByRole('heading', { name: 'Two', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Add to favorites' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Previous track' }).click(); await pause(page);
  await dialog.getByRole('button', { name: 'Repeat: one' }).click();
  await page.route('**/api/songs/*/favorite', route => route.request().method() === 'PUT' ? route.fulfill({ status: 500, json: { detail: 'Test failure' } }) : route.continue());
  await dialog.getByRole('button', { name: 'Remove from favorites' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Could not save favorite');
  await expect(dialog.getByRole('button', { name: 'Remove from favorites' })).toHaveAttribute('aria-pressed', 'true');
  await page.unroute('**/api/songs/*/favorite');
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(dialog.getByLabel('Seek audio')).toBeVisible();
  await dialog.getByLabel('Seek audio').focus(); await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('now-playing-mobile.png') });
  await page.keyboard.press('Escape');
  // Real playback qualifies once; seeking/mode toggles above did not qualify.
  expect((await (await request.get(`${base}/projects/${project.id}/insights`)).json()).total).toBe(0);
  await page.getByRole('button', { name: 'Play All' }).click();
  await expect.poll(async () => (await (await request.get(`${base}/projects/${project.id}/insights`)).json()).total).toBeGreaterThan(0);
  await pause(page);
  expect(errors).toEqual([]);
});

test('shared expanded playback has no favorite or private details and revoked requests fail', async ({ page, request, browser }) => {
  const project = await (await request.post(`${base}/projects`, { data: { name: 'Shared expanded' } })).json();
  const [song] = await (await request.post(`${base}/projects/${project.id}/tracks`, { multipart: { files: { name: 'Shared.wav', mimeType: 'audio/wav', buffer: wav() } } })).json();
  const token = (await (await request.put(`${base}/projects/${project.id}/share`, { data: { enabled: true } })).json()).token;
  const context = await browser.newContext(); const friend = await context.newPage();
  await friend.goto(`/share/${token}`); await friend.getByRole('button', { name: 'Play All' }).click(); await pause(friend);
  await friend.getByRole('button', { name: 'Open Now Playing', exact: true }).click();
  const dialog = friend.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: /favorites/ })).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'View song details' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Repeat: off' }).click();
  await dialog.getByRole('button', { name: 'Repeat: all' }).click();
  await request.put(`${base}/projects/${project.id}/share`, { data: { enabled: false } });
  const failed = friend.waitForResponse(response => response.url().includes(`/songs/${song.id}/audio`) && response.status() === 404);
  await friend.getByTestId('global-audio').evaluate((node: HTMLAudioElement) => node.dispatchEvent(new Event('ended')));
  await failed; await expect(dialog.getByRole('alert')).toBeVisible();
  await context.close();
  await page.goto('/profile'); // Owner remains signed in.
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
});

test('accent previews revert on navigation and display-name edits update current fallback', async ({ page, request }) => {
  const project = await (await request.post(`${base}/projects`, { data: { name: 'Owner name' } })).json();
  await request.post(`${base}/projects/${project.id}/tracks`, { multipart: { files: { name: 'Name.wav', mimeType: 'audio/wav', buffer: wav() } } });
  await page.goto(`/projects/${project.id}`); await page.getByRole('button', { name: 'Play All' }).click(); await pause(page);
  await page.getByRole('link', { name: 'Open profile' }).click();
  await page.getByLabel('Display name', { exact: true }).fill('  New artist  ');
  await page.getByRole('button', { name: 'Save display name' }).click();
  await expect(page.getByText('Display name saved.', { exact: true })).toBeVisible();
  await expect(page.locator('.now-playing small')).toHaveText('New artist');
  await page.getByLabel('Accent color picker').fill('#b28aff');
  await expect(page.locator('.account-scope')).toHaveAttribute('data-accent', '#b28aff');
  await expect(page.getByText(/Unsaved preview/)).toBeVisible();
  expect((await (await request.get(`${base}/auth/me`)).json()).accent_color).toBe('green');
  await page.getByRole('button', { name: 'Revert changes' }).click();
  await expect(page.locator('.account-scope')).toHaveAttribute('data-accent', 'green');
  await page.getByLabel('Accent color picker').fill('#58adff');
  await page.getByRole('link', { name: 'Back to Vault' }).click();
  await expect(page.locator('.account-scope')).toHaveAttribute('data-accent', 'green');
  await page.getByRole('link', { name: 'Open profile' }).click();
  await page.getByLabel('Accent color picker').fill('#ff75b5');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Preferences saved.', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.locator('.account-scope')).toHaveAttribute('data-accent', '#ff75b5');
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('New artist');
});
