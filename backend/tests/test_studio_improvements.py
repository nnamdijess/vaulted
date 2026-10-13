import io
import unittest
import uuid
import subprocess
from unittest.mock import patch
from PIL import Image
from app.models.studio import ContentMedia, ContentRenderJob
from app.services.studio_storage import content_path, ffmpeg
from app.services.studio_layout import layout, raster
import test_studio


class ImprovementsTest(unittest.TestCase):
    setUp = test_studio.StudioTest.setUp
    tearDown = test_studio.StudioTest.tearDown
    register = test_studio.StudioTest.register
    edit = test_studio.StudioTest.edit

    def media(self, real=False):
        key = uuid.uuid4().hex
        folder = content_path(f'library/{key}')
        folder.mkdir(parents=True)
        (folder / 'poster.jpg').write_bytes(b'test')
        if real:
            subprocess.run([ffmpeg(), '-v','error','-f','lavfi','-i','color=black:s=108x192:r=30:d=3',
                '-c:v','libx264','-pix_fmt','yuv420p',str(folder/'video.mp4')], check=True)
        else:
            (folder / 'video.mp4').write_bytes(b'test')
        with self.sessions() as db:
            row = ContentMedia(owner_id=self.client.get('/api/auth/me').json()['id'], provider='upload', provider_id=key,
                metadata_json={'provider':'upload','duration':3,'local_path':f'library/{key}/video.mp4'}, favorite=True)
            db.add(row); db.commit(); identifier = row.id
        return identifier, folder

    def test_deletion_ownership_missing_files_and_pending_render(self):
        identifier, folder = self.media()
        url = f'/api/studio/media/{identifier}'
        self.assertEqual(self.public.delete(url).status_code, 401)
        self.assertEqual(self.other.delete(url).status_code, 404)
        self.assertTrue(folder.exists())
        with self.sessions() as db:
            job = ContentRenderJob(content_project_id=self.project['id'], status='queued', snapshot={'revision':1,'clips':[{'media_id':identifier}]})
            db.add(job); db.commit(); job_id=job.id
        self.assertEqual(self.client.delete(url).status_code, 409)
        with self.sessions() as db:
            db.get(ContentRenderJob, job_id).status='completed'; db.commit()
        (folder/'poster.jpg').unlink()
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertFalse(folder.exists())
        self.assertEqual(self.client.delete(url).status_code, 404)

    def test_timeline_and_stock_protection(self):
        identifier, folder = self.media()
        draft = self.client.post(self.url+'/draft', json={'media_ids':[identifier]}).json()
        self.assertTrue(draft['clips'])
        self.assertEqual(self.client.delete(f'/api/studio/media/{identifier}').status_code,409)
        self.client.delete(self.url+'/clips')
        with self.sessions() as db:
            media=db.get(ContentMedia,identifier);media.provider='pixabay';db.commit()
        self.assertEqual(self.client.delete(f'/api/studio/media/{identifier}').status_code,409)
        self.assertTrue(folder.exists())

    def test_custom_accent_persists_and_validates(self):
        url='/api/auth/preferences'
        payload={'library_name':'Vault','accent_color':'#ae34dd'}
        self.assertEqual(self.client.patch(url,json=payload).status_code,200)
        self.assertEqual(self.client.get('/api/auth/me').json()['accent_color'],'#ae34dd')
        self.assertNotEqual(self.other.get('/api/auth/me').json()['accent_color'],'#ae34dd')
        for color in ('#xyzxyz','red','url(secret)','#fff'):
            self.assertEqual(self.client.patch(url,json={**payload,'accent_color':color}).status_code,422)

    def test_canonical_layout_rows_weights_and_overflow(self):
        for font in ('oswald','barlow_condensed','archivo_narrow','teko','fjalla_one','saira_condensed','league_gothic','roboto_condensed'):
            for size in (32,96):
                model,_ = layout('she sucking\n\nout my\nsoul like a\ndemon',dict(font=font,font_size=size,font_weight=700,align='justify',text_width_px=500,text_x=.2,tracking=1))
                self.assertFalse(model['lines'][1])
                self.assertEqual(model['lines'][-1][0]['text'],'demon')
                for row in model['lines']:
                    for word in row:
                        self.assertGreaterEqual(word['x'],0)
                        self.assertLessEqual(word['x']+word['width'],1080)
                        self.assertLess(word['y'],1920)
        model,_=layout('x'*100,dict(font='oswald',font_size=160,text_width_px=240))
        self.assertGreater(len(model['lines']),1)

    def test_worker_mp4_uses_identical_preview_pixels(self):
        identifier,_=self.media(real=True)
        self.edit(lyrics_text='she sucking out my soul like a demon\nending')
        self.client.put(self.url+'/timings',json={'starts':[.5,1.5]})
        self.client.post(self.url+'/draft',json={'media_ids':[identifier]})
        text='she sucking out my soul like a demon'
        style={'font':'oswald','font_size':64,'font_weight':500,'color':'#FFFFFF','align':'justify','text_width_px':500,
               'line_breaks':{text:'she sucking\nout my\nsoul like a\ndemon'}}
        saved=self.client.put(self.url+'/text-style',json=style).json()
        job=self.client.post(self.url+'/renders').json()
        with patch('app.studio_worker.SessionLocal',self.sessions):
            from app.studio_worker import process_one
            self.assertTrue(process_one())
        state=self.client.get(self.url+f"/renders/{job['id']}").json()
        self.assertEqual(state['status'],'completed',state)
        output=content_path(f"projects/{self.project['id']}/renders/{job['id']}.mp4")
        for second, cue in ((.1, None), (1, text), (2, 'ending')):
            frame=subprocess.run([ffmpeg(),'-v','error','-ss',str(second),'-i',str(output),'-frames:v','1','-f','image2pipe','-vcodec','png','-'],capture_output=True,check=True).stdout
            actual=Image.open(io.BytesIO(frame)).convert('L').point(lambda p:255 if p>100 else 0).getbbox()
            if cue is None:
                self.assertIsNone(actual, 'Lyrics must not appear before their first cue')
                continue
            preview=Image.open(io.BytesIO(raster(cue,saved['text_style'],'minimal'))).convert('L').point(lambda p:255 if p>100 else 0).getbbox()
            self.assertIsNotNone(actual)
            for a,b in zip(actual,preview): self.assertLessEqual(abs(a-b),2)

    def test_alignment_rules_and_extreme_blocks_stay_inside_canvas(self):
        for last in ('left','center','right','justify'):
            model,_=layout('one two three\nfour five\nalone',dict(font='oswald',font_size=64,align='justify',last_line_align=last,text_width_px=600))
            left,width=model['region']['x'],model['region']['width']
            for row in model['lines'][:2]:
                self.assertAlmostEqual(row[0]['x'],left)
                self.assertAlmostEqual(row[-1]['x']+row[-1]['width'],left+width)
            word=model['lines'][-1][0]
            expected=left if last=='left' else left+width-word['width'] if last=='right' else left+(width-word['width'])/2
            self.assertAlmostEqual(word['x'],expected)
        for x in (0,1):
            data=raster(('Wide text words\n'*29)+'last',dict(font='oswald',font_size=160,align='justify',text_width_px=972,text_x=x,italic=True))
            bounds=Image.open(io.BytesIO(data)).getchannel('A').getbbox()
            self.assertGreater(bounds[0],0);self.assertLess(bounds[2],1080)
            self.assertGreater(bounds[1],0);self.assertLess(bounds[3],1920)
