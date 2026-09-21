import { expect } from '@playwright/test';
import { test, wav } from './fixtures';

// Run in Firefox with TEST_BROWSER=firefox; defaults to Chromium for standard CI.
test.use({ browserName: process.env.TEST_BROWSER === 'firefox' ? 'firefox' : 'chromium' });

test('Firefox reload after enabling player controls preserves hydration', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  const base = 'http://127.0.0.1:8011/api';
  const project = await (await request.post(`${base}/projects`, { data: { name: 'Firefox reload' } })).json();
  for (const title of ['One','Two','Three']) {
    await request.post(`${base}/projects/${project.id}/tracks`, { multipart: { files: { name: `${title}.wav`, mimeType: 'audio/wav', buffer: wav() } } });
  }
  await page.goto(`/projects/${project.id}`);
  await page.getByRole('button', { name: 'Play Two', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Previous track', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Next track', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  for (const name of ['Previous track', 'Resume playback', 'Next track']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('autocomplete', 'off');
  }
  await expect(page.getByRole('slider', { name: 'Seek audio' })).toHaveAttribute('autocomplete', 'off');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play Two', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous track', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next track', exact: true })).toBeDisabled();
  expect(errors.filter(error => /hydrat|didn't match|does not match|server rendered/i.test(error))).toEqual([]);
});
