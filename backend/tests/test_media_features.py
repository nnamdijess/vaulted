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
