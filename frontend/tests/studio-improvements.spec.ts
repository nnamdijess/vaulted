import { expect } from '@playwright/test';
import { test, wav } from './fixtures';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const base = 'http://127.0.0.1:8011/api';

test('custom accent previews, persists in a new browser session, and stays readable', async ({page, context, browser}) => {
  await page.goto('/profile');
  for (const theme of ['light','dark']) {
    await page.getByLabel('Theme', {exact:true}).selectOption(theme);
    for (const hex of ['#ffffff','#000000','#ae34dd','#fefe00']) {
      await page.getByLabel('Accent color picker', {exact:true}).fill(hex);
      await expect(page.locator('.account-scope')).toHaveAttribute('data-accent',hex);
      const colors = await page.getByRole('button',{name:'Save preferences'}).evaluate(el => {
        const s=getComputedStyle(el), bg=getComputedStyle(document.querySelector('.theme-scope')!);
        return [s.color,s.backgroundColor,bg.backgroundColor];
      });
      const lum=(color:string)=>color.match(/[\d.]+/g)!.slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
      const contrast=(a:string,b:string)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
      expect(contrast(colors[0],colors[1])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors[1],colors[2])).toBeGreaterThanOrEqual(4.5);
    }
  }
  await page.getByLabel('Accent color picker',{exact:true}).fill('#ae34dd');
  await page.getByRole('button',{name:'Save preferences'}).click();
  await expect(page.getByText('Preferences saved.',{exact:true})).toBeVisible();
  const fresh=await browser.newContext({storageState:await context.storageState()});
  const other=await fresh.newPage();
  await other.goto('http://127.0.0.1:3011/profile');
  await expect(other.getByLabel('Accent color picker',{exact:true})).toHaveValue('#ae34dd');
  await fresh.close();
});

test('mobile library deletion, preserved selection, editable rows and canonical portrait preview', async ({page,request},info) => {
  test.setTimeout(60000);
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  const music=await(await request.post(`${base}/projects`,{data:{name:'Improvements'}})).json();
  const [song]=await(await request.post(`${base}/projects/${music.id}/tracks`,{multipart:{files:{name:'demo.wav',mimeType:'audio/wav',buffer:wav()}}})).json();
  const draft=await(await request.post(`${base}/studio/projects`,{data:{title:'Typography',song_version_id:song.latest_version_id}})).json();
  const url=`${base}/studio/projects/${draft.id}`;
  const text='she sucking out my soul like a demon';
  await request.patch(url,{data:{title:'Typography',start_time:0,end_time:3,lyrics_text:text,aesthetic:'nature',lyric_style:'minimal'}});
  await request.put(url+'/timings',{data:{starts:[0]}});
  const python=path.resolve('../backend/.venv/Scripts/python.exe');
  const ffmpeg=execFileSync(python,['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
  const file=info.outputPath('clip.mp4');
  execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=black:s=108x192:r=30:d=3','-c:v','libx264','-pix_fmt','yuv420p',file]);
  await page.goto(`/studio/${draft.id}`);
  await page.getByRole('button',{name:'4. Visuals',exact:true}).click();
  await page.getByRole('tab',{name:'Upload media',exact:true}).click();
  await page.getByLabel('Video files').setInputFiles(file);
  await page.getByRole('button',{name:'Upload videos (1)',exact:true}).click();
  const card=page.locator('.studio-media-grid article').first();
  const trash=card.getByRole('button',{name:/Delete uploaded clip/});
  await expect(trash).toBeVisible();
  const box=(await trash.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
  await card.getByRole('button',{name:'Select',exact:true}).click();
  await page.getByRole('button',{name:'Back to top'}).click();
  await expect(card.getByRole('button',{name:'Deselect',exact:true})).toHaveAttribute('aria-pressed','true');
  await trash.click();
  const dialog=page.getByRole('dialog',{name:'Delete uploaded clip',exact:true});
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Generate Draft (1 clips)',exact:true}).click();
  const panel=page.getByRole('complementary',{name:'Text styling'});
  await panel.getByRole('button',{name:'Oswald',exact:true}).click();
  await panel.getByRole('button',{name:'Align justify',exact:true}).click();
  await panel.getByLabel('Text width',{exact:true}).fill('500');
  await panel.getByLabel('Font weight',{exact:true}).selectOption('500');
  await panel.getByText('Edit lyric line breaks',{exact:true}).click();
  await panel.getByLabel('Layout for lyric 1',{exact:true}).fill('she sucking\n\nout my\nsoul like a\ndemon');
  await expect(page.locator('.studio-autosave')).toHaveText('Saved');
  await expect(page.locator('.studio-lyric-raster')).toBeVisible();
  const preview=page.locator('.studio-draft-preview');
  await preview.scrollIntoViewIfNeeded();
  await preview.screenshot({path:info.outputPath('canonical-iphone.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.reload();
  await page.getByRole('button',{name:'4. Visuals',exact:true}).click();
  await panel.getByText('Edit lyric line breaks',{exact:true}).click();
  await expect(panel.getByLabel('Layout for lyric 1')).toHaveValue('she sucking\n\nout my\nsoul like a\ndemon');
  await page.getByRole('button',{name:'Review Media',exact:true}).click();
  await trash.click();
  await dialog.getByRole('button',{name:'Delete clip permanently'}).click();
  await expect(dialog.getByRole('alert')).toContainText('timeline');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  // Only this test-created project is removed, releasing the fixture for deletion.
  expect((await request.delete(url)).ok()).toBe(true);
  await trash.click();
  await dialog.getByRole('button',{name:'Delete clip permanently'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.studio-media-grid article')).toHaveCount(0);
  expect(readFileSync(file).length).toBeGreaterThan(0);
});
