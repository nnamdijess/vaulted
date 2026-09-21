import io
import wave
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import unittest
import test_auth


class MediaFeaturesTest(unittest.TestCase):
    setUp = test_auth.AuthenticationTest.setUp
    tearDown = test_auth.AuthenticationTest.tearDown
    register = test_auth.AuthenticationTest.register

    def image(self, color='red'):
        output = io.BytesIO()
        Image.new('RGB', (24, 12), color).save(output, format='PNG')
        return output.getvalue()

    def test_avatar_validation_replacement_removal_and_isolation(self):
        self.register(self.client)
        self.register(self.other, 'other@example.com')
        endpoint = '/api/auth/avatar'
        self.assertEqual(self.public.get(endpoint).status_code, 401)
        self.assertEqual(self.public.post(endpoint, files={'file':('pic.png',self.image(),'image/png')}).status_code,401)
        first = self.client.post(endpoint,files={'file':('pic.png',self.image(),'image/png')})
        self.assertEqual(first.status_code,200,first.text)
        key = first.json()['avatar_path']
        self.assertTrue(key.startswith('avatars/'))
        self.assertEqual(self.client.get(endpoint).status_code,200)
        self.assertEqual(self.other.get(endpoint).status_code,404)
        self.assertEqual(self.other.delete(endpoint).status_code,200)
        self.assertEqual(self.client.get(endpoint).status_code,200)
        self.assertEqual(self.client.post(endpoint,files={'file':('bad.png',b'bad','image/png')}).status_code,422)
        self.assertEqual(self.client.post(endpoint,files={'file':('bad.svg',b'<svg/>','image/svg+xml')}).status_code,415)
        self.assertEqual(self.client.post(endpoint,files={'file':('big.png',b'x'*(10*1024*1024+1),'image/png')}).status_code,413)
        second = self.client.post(endpoint,files={'file':('pic.png',self.image('blue'),'image/png')}).json()
        self.assertNotEqual(key,second['avatar_path'])
        self.assertFalse((Path(self.temp.name)/key).exists())
        self.assertEqual(self.client.delete(endpoint).status_code,200)
        self.assertFalse((Path(self.temp.name)/second['avatar_path']).exists())
        self.assertIsNone(self.client.get('/api/auth/me').json()['avatar_path'])

    def test_waveform_real_peaks_cache_version_and_public_authorization(self):
        self.register(self.client)
        self.register(self.other,'other@example.com')
        project = self.client.post('/api/projects',json={'name':'Wave'}).json()
        song = self.client.post(f"/api/projects/{project['id']}/songs",json={'title':'Audio'}).json()
        def upload(samples):
            output = io.BytesIO()
            with wave.open(output,'wb') as audio:
                audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(8000)
                audio.writeframes(samples)
            return self.client.post(f"/api/songs/{song['id']}/versions",data={'version_name':'Take'},files={'file':('test.wav',output.getvalue(),'audio/wav')}).json()
        version = upload(b'\x00\x00'*8000 + b'\x00\x40'*8000)
        endpoint = f"/api/versions/{version['id']}/waveform"
        response = self.client.get(endpoint)
        self.assertEqual(response.status_code,200,response.text)
        data = response.json()
        self.assertAlmostEqual(data['duration'],2,places=2)
        self.assertEqual(data['peaks'][0],0)
        self.assertGreater(max(data['peaks']),0.45)
        with patch('app.services.waveform.subprocess.run',side_effect=AssertionError('Cache should avoid decoding')):
            self.assertEqual(self.client.get(endpoint).json(),data)
        self.assertEqual(self.other.get(endpoint).status_code,404)
        self.assertEqual(self.public.get(endpoint).status_code,401)
        silence = upload(b'\x00\x00'*16000)
        self.assertEqual(max(self.client.get(f"/api/versions/{silence['id']}/waveform").json()['peaks']),0)
        token = self.client.put(f"/api/projects/{project['id']}/share",json={'enabled':True}).json()['token']
        public = f"/api/public/{token}/songs/{song['id']}/waveform"
        self.assertEqual(self.public.get(public).status_code,200)
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}/insights").json()['total'],0)
        self.client.put(f"/api/projects/{project['id']}/share",json={'enabled':False})
        self.assertEqual(self.public.get(public).status_code,404)
        bad = self.client.post(f"/api/songs/{song['id']}/versions",data={'version_name':'Invalid'},files={'file':('bad.wav',b'invalid','audio/wav')}).json()
        self.assertEqual(self.client.get(f"/api/versions/{bad['id']}/waveform").status_code,422)

    def test_avatar_migration_preserves_account_and_projects(self):
        from app.db.migrations import upgrade_local_database
        self.register(self.client)
        project = self.client.post('/api/projects',json={'name':'Preserve'}).json()
        with self.engine.begin() as connection:
            connection.exec_driver_sql('ALTER TABLE users DROP COLUMN avatar_path')
        upgrade_local_database(self.engine)
        upgrade_local_database(self.engine)
        self.assertIsNone(self.client.get('/api/auth/me').json()['avatar_path'])
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}").json()['name'],'Preserve')

    def test_preferences_are_validated_private_and_migrate_additively(self):
        from app.db.migrations import upgrade_local_database
        self.register(self.client)
        self.register(self.other,'other@example.com')
        data = {'library_name':' Night sessions ', 'accent_color':'blue'}
        self.assertEqual(self.public.patch('/api/auth/preferences',json=data).status_code,401)
        response = self.client.patch('/api/auth/preferences',json=data)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['library_name'],'Night sessions')
        self.assertEqual(self.client.get('/api/auth/me').json()['accent_color'],'blue')
        self.assertEqual(self.other.get('/api/auth/me').json()['library_name'],'Vault')
        for bad in [{**data,'library_name':' '},{**data,'library_name':'x'*61},{**data,'accent_color':'invalid'},{**data,'owner_id':1}]:
            self.assertEqual(self.client.patch('/api/auth/preferences',json=bad).status_code,422)
        with self.engine.begin() as connection:
            connection.exec_driver_sql('ALTER TABLE users DROP COLUMN library_name')
            connection.exec_driver_sql('ALTER TABLE users DROP COLUMN accent_color')
        upgrade_local_database(self.engine); upgrade_local_database(self.engine)
        me = self.client.get('/api/auth/me').json()
        self.assertEqual((me['library_name'],me['accent_color']),('Vault','green'))

    def test_artwork_history_and_search_are_private_and_persistent(self):
        from app.db.migrations import upgrade_local_database
        self.register(self.client)
        self.register(self.other, 'friend@example.com')
        project = self.client.post('/api/projects',json={'name':'Album'}).json()
        second = self.client.post('/api/projects',json={'name':'Another'}).json()
        endpoint = f"/api/projects/{project['id']}/cover"
        first = self.client.post(endpoint, files={'file':('a.png',self.image(),'image/png')}).json()
        self.client.post(endpoint, files={'file':('b.png',self.image('blue'),'image/png')})
        history = self.client.get('/api/artworks').json()
        self.assertEqual(len(history),2)
        original = next(a for a in history if a['file_path'] == first['cover_path'])
        image_url = f"/api/artworks/{original['id']}/image"
        self.assertEqual(self.other.get('/api/artworks').json(),[])
        self.assertEqual(self.other.get(image_url).status_code,404)
        self.assertEqual(self.public.get(image_url).status_code,401)
        other_project = self.other.post('/api/projects',json={'name':'Private'}).json()
        self.assertEqual(self.other.put(f"/api/projects/{other_project['id']}/cover",json={'artwork_id':original['id']}).status_code,404)
        for target in (project, second):
            self.assertEqual(self.client.put(f"/api/projects/{target['id']}/cover",json={'artwork_id':original['id']}).status_code,200)
        token = self.client.put(f"/api/projects/{second['id']}/share",json={'enabled':True}).json()['token']
        self.assertEqual(self.public.get(f'/api/public/{token}/cover').content,self.client.get(image_url).content)
        self.client.delete(endpoint)
        self.client.delete(f"/api/projects/{project['id']}")
        self.assertEqual(self.client.get(image_url).status_code,200)
        self.assertEqual(self.public.get(f'/api/public/{token}/cover').status_code,200)
        song = self.client.post(f"/api/projects/{second['id']}/songs",json={'title':'Straße NIGHT', 'notes':'secret note'}).json()
        result = self.client.get('/api/search/songs?q=STRASSE').json()['items']
        self.assertEqual(result[0]['id'],song['id'])
        self.assertEqual(result[0]['artist'],'Owner')
        self.assertNotIn('notes',result[0])
        self.assertEqual(self.other.get('/api/search/songs?q=night').json()['items'],[])
        self.assertEqual(self.public.get('/api/search/songs?q=night').status_code,401)
        self.assertEqual(self.client.get('/api/search/songs?q=%25').json()['items'],[])
        self.assertEqual(self.client.get('/api/search/songs?q=').json()['items'],[])
        shared = self.public.get(f'/api/public/{token}').json()
        self.assertEqual(shared['owner_name'],'Owner')
        self.assertNotIn('email',str(shared))
        # Simulate existing artwork before the history table was introduced.
        with self.engine.begin() as db:
            db.exec_driver_sql('DELETE FROM artworks')
        upgrade_local_database(self.engine); upgrade_local_database(self.engine)
        self.assertEqual(len(self.client.get('/api/artworks').json()),1)
        self.assertEqual(self.client.get(image_url).status_code,200)
