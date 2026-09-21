import { expect } from '@playwright/test';
import { test, wav } from './fixtures';

test('large batch reaches the authenticated backend through the frontend proxy intact', async ({ page }) => {
  test.setTimeout(90000);
  const projectResponse = await page.request.post('/api/projects', { data: { name: 'Large upload regression' } });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const buffer = Buffer.concat([wav(), Buffer.alloc(600 * 1024)]);
  try {
    await page.goto(`/projects/${project.id}`);
    await page.getByRole('button', { name: 'Add Tracks', exact: true }).click();
    await page.getByLabel('Audio files').setInputFiles(Array.from({ length: 20 }, (_, i) => ({ name: `Track ${i + 1}.wav`, mimeType: 'audio/wav', buffer })));
    const responsePromise = page.waitForResponse(response => response.url().endsWith(`/api/projects/${project.id}/tracks`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Upload tracks', exact: true }).click();
    const response = await responsePromise;
    expect(response.status(), await response.text()).toBe(201);
    const songs = await response.json();
    expect(songs).toHaveLength(20);
    const audio = await page.request.get(`/api/versions/${songs[19].latest_version_id}/audio`);
    expect(audio.status()).toBe(200);
    expect(await audio.body()).toEqual(buffer);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/projects/${project.id}`);
  }
});

