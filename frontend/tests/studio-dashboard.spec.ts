import { expect } from '@playwright/test';
import { test, png } from './fixtures';

test('Studio keeps recent lists short and allows cleanup through all exports', async ({ page }, testInfo) => {
  await page.route('**/api/studio/projects', route => route.fulfill({ json: Array.from({ length: 7 }, (_, i) => ({
    id: i + 1, title: `Project ${i + 1}`, song_title: 'Song', status: i === 6 ? 'draft' : 'completed', project_id: 1, cover_path: null,
    jobs: [{ id: i + 1, status: 'completed' }],
  })) }));
  await page.route('**/renders/*/poster', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.route('**/api/studio/projects/1/renders/1', route => route.fulfill({ json: { ok: true } }));
  await page.goto('/studio');
  await expect(page.getByRole('heading', {name:'Drafts',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link', {name:'Create New'}).locator('svg')).toHaveCount(1);
  const projects = page.getByRole('region', { name: 'Recent Content Projects' });
  const exports = page.getByRole('region', { name: 'Completed exports' });
  await expect(projects.locator('.studio-card')).toHaveCount(5);
  await expect(exports.locator('.studio-render-card')).toHaveCount(3);
  await projects.getByRole('button', { name: 'View all projects (7)' }).click();
  const allProjects = page.getByRole('dialog', { name: 'All content projects' });
  await expect(allProjects.locator('.studio-card')).toHaveCount(7);
  await expect(allProjects.getByRole('link', { name: /Project 7/ })).toHaveAttribute('href', '/studio/7');
  await page.keyboard.press('Escape');
  const link = exports.getByRole('button', { name: 'View all exports (7)' });
  expect(await link.evaluate(el => getComputedStyle(el).color !== getComputedStyle(document.body).backgroundColor)).toBe(true);
  await link.click();
  const allExports = page.getByRole('dialog', { name: 'All exports', exact: true });
  await expect(allExports.locator('.studio-render-card')).toHaveCount(7);
  page.once('dialog', dialog => dialog.accept());
  await allExports.locator('.studio-render-card').filter({ hasText: 'Export 1' }).getByRole('button', { name: 'Delete export', exact: true }).click();
  await expect(allExports.locator('.studio-render-card')).toHaveCount(6);
  await page.keyboard.press('Escape');
  await expect(exports.getByRole('button', { name: 'View all exports (6)' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await projects.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('studio-dashboard-mobile.png') });
});
