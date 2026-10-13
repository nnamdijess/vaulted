import { expect } from '@playwright/test';
import { test, wav, png } from './fixtures';

test('batch uploads continue after errors and retry only failed files without losing successes', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8011/api';
  const music = await (await request.post(`${base}/projects`, { data: { name: 'Batch upload regression' } })).json();
  const [song] = await (await request.post(`${base}/projects/${music.id}/tracks`, { multipart: { files: { name: 'test.wav', mimeType: 'audio/wav', buffer: wav() } } })).json();
  const project = await (await request.post(`${base}/studio/projects`, { data: { title: 'Batch', song_version_id: song.latest_version_id } })).json();
  const names = ['bad.mp4', 'good.mp4', 'busy.mp4', 'last.mp4'];
  const calls: string[] = [];
  await page.route('**/api/studio/media/upload', async route => {
    const name = route.request().postData()!.match(/filename="([^"]+)"/)![1];
    calls.push(name);
    if (name === 'renamed.mp4') {
      await route.fulfill({status:201,json:{id:1001,provider:'upload',title:'good.mp4',tags:'',favorite:true,duration:3,duplicate:true,thumbnail:'/api/studio/media/1001/poster',preview_url:'/api/studio/media/1001/video',source_url:''}});
      return;
    }
    if (calls.filter(value => value === name).length === 1 && ['bad.mp4','busy.mp4'].includes(name)) {
      await route.fulfill({ status: name === 'bad.mp4' ? 422 : 503, json: { detail: name === 'bad.mp4' ? 'Could not convert this video.' : 'Another video is being prepared.' } });
      return;
    }
    const id = names.indexOf(name) + 1000;
    await route.fulfill({ status: 201, json: { id, provider:'upload', title:name, tags:'', favorite:true, duration:3, thumbnail:`/api/studio/media/${id}/poster`, preview_url:`/api/studio/media/${id}/video`, source_url:'' } });
  });
  await page.route('**/api/studio/media/*/poster', route => route.fulfill({ contentType:'image/png', body:png }));
  await page.goto(`/studio/${project.id}`);
  await page.getByRole('button', { name:'4. Visuals', exact:true }).click();
  await page.getByRole('tab', { name:'Upload media', exact:true }).click();
  await page.getByLabel('Video files').setInputFiles(names.map(name => ({name, mimeType:'video/mp4', buffer:Buffer.from('test-only mock video')})));
  await page.getByRole('button', { name:'Upload videos (4)', exact:true }).click();
  await expect(page.getByText('2 of 4 clips uploaded. 2 failed; only those files are queued for retry.', {exact:true})).toBeVisible();
  expect(calls).toEqual(names);
  await expect(page.getByRole('region', {name:'Your clip library'}).getByRole('alert')).toContainText('bad.mp4: Could not convert this video.');
  await expect(page.getByRole('region', {name:'Your clip library'}).getByRole('alert')).toContainText('busy.mp4: Another video is being prepared.');
  await expect(page.getByLabel('Video files')).toHaveValue('');
  await expect(page.locator('.studio-media-grid article')).toHaveCount(2);
  await page.getByRole('button', {name:'Retry failed uploads (2)',exact:true}).click();
  await expect(page.getByText('2 clips added to Saved clips.',{exact:true})).toBeVisible();
  expect(calls).toEqual([...names,'bad.mp4','busy.mp4']);
  await expect(page.locator('.studio-media-grid article')).toHaveCount(4);
  await expect(page.getByRole('region', {name:'Your clip library'}).getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Upload videos',exact:true})).toBeDisabled();
  await page.getByLabel('Video files').setInputFiles({name:'renamed.mp4',mimeType:'video/mp4',buffer:Buffer.from('same test video')});
  await page.getByRole('button',{name:'Upload videos (1)',exact:true}).click();
  await expect(page.getByText('0 new clips saved. 1 already in your library.',{exact:true})).toBeVisible();
  await expect(page.locator('.studio-media-grid article')).toHaveCount(4);
  await expect(page.getByRole('button',{name:'Upload videos',exact:true})).toBeDisabled();
  await page.route('**/api/studio/media/duplicates', route => route.fulfill({json:[{id:1003,provider:'upload',title:'last.mp4',tags:'',favorite:true,duration:3,duplicate_of:1001,thumbnail:'/api/studio/media/1003/poster',preview_url:'/api/studio/media/1003/video',source_url:''}]}));
  await page.getByRole('tab',{name:'My clips',exact:true}).click();
  await page.getByRole('button',{name:'Find duplicate clips',exact:true}).click();
  await expect(page.getByText(/1 extra copies found/)).toBeVisible();
  await expect(page.locator('.studio-media-grid article')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Delete uploaded clip last.mp4',exact:true})).toBeVisible();
});
