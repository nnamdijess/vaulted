import unittest
from io import BytesIO
from PIL import Image
from app.models.music import Song, SongVersion, Project, ListenEvent
from unittest.mock import patch
from sqlalchemy import select
from app.models.studio import ContentProject
from app.services.studio_layout import layout, raster
import test_studio


class StudioNavigationTest(unittest.TestCase):
    setUp = test_studio.StudioTest.setUp
    tearDown = test_studio.StudioTest.tearDown
    register = test_studio.StudioTest.register

    def test_move_preserves_records_and_compacts_both_projects(self):
        destination = self.client.post('/api/projects', json={'name':'Destination'}).json()
        trailing = self.client.post(f"/api/projects/{self.music['id']}/songs", json={'title':'Trailing'}).json()
        target = self.client.post(f"/api/projects/{destination['id']}/songs", json={'title':'First'}).json()
        version_id = self.song['latest_version_id']
        original_audio = self.client.get(f'/api/versions/{version_id}/audio').content
        cover = BytesIO()
        Image.new('RGB',(8,8),'blue').save(cover,format='PNG')
        cover_response=self.client.post(f"/api/projects/{self.music['id']}/cover",files={'file':('cover.png',cover.getvalue(),'image/png')})
        self.assertEqual(cover_response.status_code,200)
        cover_path=cover_response.json()['cover_path']
        with self.sessions() as db:
            song = db.get(Song, self.song['id'])
            song.notes = 'Keep these notes'
            db.add(ListenEvent(project_id=self.music['id'],song_id=song.id,source='private',session_id='test-session',playback_id='test-playback'))
            db.commit()
        response = self.client.post(f"/api/songs/{self.song['id']}/move", json={'project_id':destination['id']})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['id'], self.song['id'])
        self.assertEqual(response.json()['notes'], 'Keep these notes')
        self.assertEqual(response.json()['cover_path'], cover_path)
        self.assertEqual(self.client.get(f"/api/songs/{self.song['id']}/cover").content,cover.getvalue())
        self.assertEqual(response.json()['latest_version_id'], version_id)
        self.assertEqual(self.client.get(f'/api/versions/{version_id}/audio').content, original_audio)
        source = self.client.get(f"/api/projects/{self.music['id']}/songs").json()
        dest = self.client.get(f"/api/projects/{destination['id']}/songs").json()
        self.assertEqual([(x['id'],x['position']) for x in source], [(trailing['id'],1)])
        self.assertEqual([(x['id'],x['position']) for x in dest], [(target['id'],1),(self.song['id'],2)])
        with self.sessions() as db:
            event=db.scalar(select(ListenEvent).where(ListenEvent.song_id==self.song['id']))
            self.assertEqual(event.playback_id,'test-playback')
            self.assertEqual(event.project_id,destination['id'])
            self.assertEqual(db.get(SongVersion, version_id).song_id, self.song['id'])
            self.assertEqual(db.get(ContentProject,self.project['id']).song_version_id, version_id)
        self.assertEqual(self.client.get(self.url).json()['project_id'], destination['id'])
        self.assertEqual(self.client.post(f"/api/songs/{self.song['id']}/move", json={'project_id':destination['id']}).status_code,409)
        private = self.other.post('/api/projects',json={'name':'Private'}).json()
        self.assertEqual(self.client.post(f"/api/songs/{self.song['id']}/move",json={'project_id':private['id']}).status_code,404)
        self.assertEqual(self.other.post(f"/api/songs/{self.song['id']}/move",json={'project_id':private['id']}).status_code,404)
        self.assertEqual(self.client.get(f"/api/songs/{self.song['id']}").json()['project_id'],destination['id'])

    def test_position_preserves_legacy_and_persists(self):
        for position, y in [('top',0),('middle',.5),('bottom',1)]:
            style={'position':position, 'font_size':70, 'text_width_px':300}
            original,_=layout('one two three four five',style)
            moved,_=layout('one two three four five',{**style,'text_y':y})
            self.assertEqual(original,moved)
        style={'color':'#FFFFFF','font':'default','align':'center','text_y':.735,'font_size':100,'text_width_px':300}
        response=self.client.put(self.url+'/text-style',json=style)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(self.client.get(self.url).json()['text_style']['text_y'],.735)
        for y in [0,.2,.735,1]:
            image=Image.open(BytesIO(raster('one two three four five six', {**style,'text_y':y})))
            bounds=image.getbbox()
            self.assertGreaterEqual(bounds[1],0)
            self.assertLessEqual(bounds[3],1920)
        self.assertEqual(self.client.put(self.url+'/text-style',json={'text_y':1.1}).status_code,422)

    def test_failed_move_rolls_back(self):
        destination=self.client.post('/api/projects',json={'name':'Destination'}).json()
        with patch('sqlalchemy.orm.Session.commit',side_effect=RuntimeError('Simulated commit failure')):
            with self.assertRaises(RuntimeError):
                self.client.post(f"/api/songs/{self.song['id']}/move",json={'project_id':destination['id']})
        self.assertEqual(self.client.get(f"/api/songs/{self.song['id']}").json()['project_id'],self.music['id'])
        self.assertEqual(self.client.get(f"/api/projects/{destination['id']}/songs").json(),[])

    def test_additive_migration_is_repeatable(self):
        from app.db.migrations import upgrade_local_database
        from sqlalchemy import inspect
        # Only this fixture's temporary database simulates the previous schema.
        with self.engine.begin() as connection:
            connection.exec_driver_sql('ALTER TABLE songs DROP COLUMN cover_path')
        upgrade_local_database(self.engine)
        upgrade_local_database(self.engine)
        self.assertIn('cover_path',{column['name'] for column in inspect(self.engine).get_columns('songs')})
        self.assertEqual(self.client.get(f"/api/songs/{self.song['id']}").json()['title'],self.song['title'])
