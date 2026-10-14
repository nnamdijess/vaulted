import io
import subprocess
import unittest
from unittest.mock import patch
from PIL import Image
from sqlalchemy import select
import test_studio_improvements as existing
from app.models.studio import ContentRenderJob, MediaCleanup
from app.services.media_cleanup import cleanup_deleted_media
from app.services.studio_storage import content_path, ffmpeg
from app.services.studio_layout import raster
from app.db.migrations import upgrade_local_database


class FormatsFoldersTest(unittest.TestCase):
    setUp = existing.ImprovementsTest.setUp
    tearDown = existing.ImprovementsTest.tearDown
    register = existing.ImprovementsTest.register
    edit = existing.ImprovementsTest.edit
    media = existing.ImprovementsTest.media

    def test_legacy_additive_migration_preserves_data(self):
        from sqlalchemy import create_engine
        legacy = create_engine('sqlite://')
        try:
            with legacy.begin() as connection:
                connection.exec_driver_sql('CREATE TABLE projects (id INTEGER PRIMARY KEY)')
                connection.exec_driver_sql('CREATE TABLE songs (id INTEGER PRIMARY KEY, project_id INTEGER)')
                connection.exec_driver_sql('CREATE TABLE content_projects (id INTEGER PRIMARY KEY, title TEXT)')
                connection.exec_driver_sql('CREATE TABLE content_media (id INTEGER PRIMARY KEY, metadata_json JSON)')
                connection.exec_driver_sql("INSERT INTO content_projects VALUES (7, 'Existing draft')")
                connection.exec_driver_sql("INSERT INTO content_media VALUES (4, '{\"local_path\":\"existing.mp4\"}')")
            upgrade_local_database(legacy)
            upgrade_local_database(legacy)
            with legacy.connect() as connection:
                self.assertEqual(tuple(connection.exec_driver_sql('SELECT id,title,output_format FROM content_projects').one()), (7,'Existing draft','9:16'))
                self.assertEqual(tuple(connection.exec_driver_sql('SELECT id,metadata_json,folder_id FROM content_media').one()), (4,'{"local_path":"existing.mp4"}',None))
        finally:
            legacy.dispose()

    def test_failed_deletion_transaction_keeps_references_and_files(self):
        from sqlalchemy.orm import Session
        mid, path = self.media()
        before = self.client.post(self.url+'/draft', json={'media_ids':[mid]}).json()
        with patch.object(Session, 'commit', side_effect=RuntimeError('Simulated database failure')):
            with self.assertRaises(RuntimeError):
                self.client.delete(f'/api/studio/media/{mid}')
        self.assertTrue(path.exists())
        after = self.client.get(self.url).json()
        self.assertEqual(after['clips'], before['clips'])
        self.assertEqual(after['revision'], before['revision'])
        with self.sessions() as db:
            self.assertIsNone(db.scalar(select(MediaCleanup)))

    def test_landscape_framing_preserves_proportions_and_position(self):
        from pathlib import Path
        from PIL import ImageDraw
        from app.services.studio_renderer import framing_filter
        source = Image.new('RGB', (640,360), 'black')
        ImageDraw.Draw(source).rectangle((500,100,599,199), fill='white')
        path = Path(self.temp.name)/'framing.png'
        source.save(path)
        for framing, expected in [({'mode':'fill','x':1,'y':.5}, (1020,300,1320,600)), ({'mode':'fit','x':.5,'y':0}, (1125,225,1350,450))]:
            data = subprocess.run([ffmpeg(),'-v','error','-i',str(path),'-vf',framing_filter(framing,'4:3'),'-frames:v','1','-f','image2pipe','-vcodec','png','-'],capture_output=True,check=True).stdout
            image = Image.open(io.BytesIO(data))
            self.assertEqual(image.size,(1440,1080))
            bounds=image.convert('L').point(lambda p:255 if p>128 else 0).getbbox()
            for a,b in zip(bounds,expected): self.assertLessEqual(abs(a-b),1)

    def test_folders_validation_ownership_moves_and_empty_delete(self):
        folder = self.client.post('/api/studio/folders', json={'name':' Night Drive '})
        self.assertEqual(folder.status_code,201,folder.text)
        fid=folder.json()['id'];url=f'/api/studio/folders/{fid}'
        self.assertEqual(self.client.post('/api/studio/folders',json={'name':'night DRIVE'}).status_code,409)
        self.assertEqual(self.client.post('/api/studio/folders',json={'name':'   '}).status_code,422)
        self.assertEqual(self.other.put(url,json={'name':'Stolen'}).status_code,404)
        self.assertEqual(self.other.delete(url).status_code,404)
        mid,path=self.media(); move=f'/api/studio/media/{mid}/folder'
        self.assertEqual(self.other.put(move,json={'folder_id':fid}).status_code,404)
        other=self.other.post('/api/studio/folders',json={'name':'Private'}).json()['id']
        self.assertEqual(self.client.put(move,json={'folder_id':other}).status_code,404)
        before=self.client.get('/api/studio/media/favorites').json()[0]
        moved=self.client.put(move,json={'folder_id':fid}).json()
        self.assertEqual(moved['id'],mid);self.assertEqual(moved['local_path'],before['local_path'])
        self.assertEqual(self.client.get('/api/studio/folders').json()[0]['count'],1)
        self.assertEqual(self.client.delete(url).status_code,409)
        self.assertEqual(self.client.put(url,json={'name':'Night lights'}).status_code,200)
        self.assertEqual(self.client.put(move,json={'folder_id':None}).status_code,200)
        self.assertEqual(self.client.delete(url).status_code,204)
        self.assertTrue(path.exists())

    def test_multiple_references_preserve_timing_and_conflict_with_stale_edit(self):
        mid,path=self.media()
        self.edit();self.client.put(self.url+'/timings',json={'starts':[.1,1.4]})
        before=self.client.get(self.url).json()
        clips=[dict(media_id=mid,duration=1.5,source_start=0,framing={'mode':'fill','zoom':2,'x':0,'y':1})]*2
        before=self.client.put(self.url+'/timeline',json={'revision':before['revision'],'clips':clips}).json()
        second=self.client.post('/api/studio/projects',json={'song_version_id':self.song['latest_version_id'],'title':'Second','output_format':'4:3'}).json()
        self.client.post(f"/api/studio/projects/{second['id']}/draft",json={'media_ids':[mid]})
        self.assertEqual(self.client.delete(f'/api/studio/media/{mid}').status_code,204)
        self.assertFalse(path.exists())
        after=self.client.get(self.url).json()
        self.assertEqual(after['lines'],before['lines'])
        self.assertEqual([(c['id'],c['start_time'],c['end_time']) for c in after['clips']],[(c['id'],c['start_time'],c['end_time']) for c in before['clips']])
        self.assertTrue(all(c['media']['provider']=='placeholder' and c['source_start']==0 and c['loop_source'] for c in after['clips']))
        placeholder=after['clips'][0]['media_id']
        self.assertEqual(self.client.delete(f'/api/studio/media/{placeholder}').status_code,409)
        self.assertEqual(self.client.get('/api/studio/media/favorites').json(),[])
        self.assertEqual(self.client.put(self.url+'/timeline',json={'revision':before['revision'],'clips':clips}).status_code,409)
        second_after=self.client.get(f"/api/studio/projects/{second['id']}").json()
        self.assertEqual(second_after['clips'][0]['media_id'],placeholder)
        replacement,_=self.media()
        response=self.client.put(self.url+f"/clips/{after['clips'][0]['id']}",json={'media_id':replacement})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['clips'][0]['end_time'],1.5)

    def test_cleanup_retries_and_immutable_pending_snapshots(self):
        mid,path=self.media(real=True)
        self.edit(lyrics_text='')
        self.client.post(self.url+'/draft',json={'media_ids':[mid]})
        job=self.client.post(self.url+'/renders').json()
        with self.sessions() as db:
            original=db.get(ContentRenderJob,job['id']).snapshot
        self.assertEqual(self.client.delete(f'/api/studio/media/{mid}').status_code,204)
        self.assertTrue(path.exists())
        with self.sessions() as db:
            self.assertEqual(db.get(ContentRenderJob,job['id']).snapshot,original)
            db.get(ContentRenderJob,job['id']).status='rendering';db.commit();cleanup_deleted_media(db)
            self.assertTrue(path.exists())
            db.get(ContentRenderJob,job['id']).status='queued';db.commit()
        with patch('app.studio_worker.SessionLocal',self.sessions):
            from app.studio_worker import process_one
            self.assertTrue(process_one())
        self.assertEqual(self.client.get(self.url+f"/renders/{job['id']}").json()['status'],'completed')
        self.assertFalse(path.exists())
        mid,path=self.media()
        with patch('app.services.media_cleanup.shutil.rmtree',side_effect=OSError('busy')):
            self.assertEqual(self.client.delete(f'/api/studio/media/{mid}').status_code,204)
        with self.sessions() as db:
            pending=db.scalar(select(MediaCleanup));self.assertGreater(pending.attempts,0)
            cleanup_deleted_media(db)
            self.assertIsNone(db.scalar(select(MediaCleanup)))
        self.assertFalse(path.exists())

    def test_formats_and_placeholder_export_preview_parity(self):
        mid,_=self.media()
        self.edit(lyrics_text='Visible lyrics')
        self.client.put(self.url+'/timings',json={'starts':[.2]})
        original=self.client.post(self.url+'/draft',json={'media_ids':[mid]}).json()
        self.client.delete(f'/api/studio/media/{mid}')
        for fmt,dimensions in [('9:16',(1080,1920)),('4:3',(1440,1080))]:
            changed=self.edit(lyrics_text='Visible lyrics',output_format=fmt).json()
            self.assertEqual(changed['output_format'],fmt)
            self.assertEqual(changed['lines'],original['lines'])
            self.assertEqual(changed['clips'][0]['end_time'],3)
            style={'font':'anton','font_size':64,'color':'#FFFFFF','align':'justify','text_y':.7}
            saved=self.client.put(self.url+'/text-style',json=style).json()
            preview=self.client.post(self.url+'/lyric-preview',json={'text':'Visible lyrics','style':style,'output_format':fmt})
            self.assertEqual(Image.open(io.BytesIO(preview.content)).size,dimensions)
            job=self.client.post(self.url+'/renders').json()
            with patch('app.studio_worker.SessionLocal',self.sessions):
                from app.studio_worker import process_one
                self.assertTrue(process_one())
            self.assertEqual(self.client.get(self.url+f"/renders/{job['id']}").json()['status'],'completed')
            output=content_path(f"projects/{self.project['id']}/renders/{job['id']}.mp4")
            for sec in (.1,1):
                data=subprocess.run([ffmpeg(),'-v','error','-ss',str(sec),'-i',str(output),'-frames:v','1','-f','image2pipe','-vcodec','png','-'],capture_output=True,check=True).stdout
                image=Image.open(io.BytesIO(data));self.assertEqual(image.size,dimensions)
                bounds=image.convert('L').point(lambda p:255 if p>100 else 0).getbbox()
                if sec==.1:self.assertIsNone(bounds)
                else:
                    expected=Image.open(io.BytesIO(raster('Visible lyrics',saved['text_style'],'minimal',fmt))).convert('L').point(lambda p:255 if p>100 else 0).getbbox()
                    self.assertIsNotNone(bounds)
                    for a,b in zip(bounds,expected):self.assertLessEqual(abs(a-b),2)
            self.assertEqual(job['output_format'],fmt)
        self.assertEqual(self.edit(output_format='1:1').status_code,422)
        upgrade_local_database(self.engine);upgrade_local_database(self.engine)
        self.assertEqual(self.client.get(self.url).json()['output_format'],'4:3')
