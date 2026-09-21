import unittest
from sqlalchemy import select
import test_auth
from app.models.music import Favorite
from app.db.session import Base
import io
import wave


class PlayerPreferencesTest(unittest.TestCase):
    setUp = test_auth.AuthenticationTest.setUp
    tearDown = test_auth.AuthenticationTest.tearDown
    register = test_auth.AuthenticationTest.register

    def test_display_name_validation_isolation_and_public_fallback(self):
        self.register(self.client)
        self.register(self.other, 'other@example.com')
        project = self.client.post('/api/projects', json={'name': 'Album'}).json()
        token = self.client.put(f"/api/projects/{project['id']}/share", json={'enabled': True}).json()['token']
        self.assertEqual(self.public.patch('/api/auth/profile', json={'display_name': 'No'}).status_code, 401)
        for data in [{'display_name': '   '}, {'display_name': 'a'*201}, {'display_name': 'Name', 'email': 'changed@example.com'}, {'display_name': 'Name', 'id': 2}]:
            self.assertEqual(self.client.patch('/api/auth/profile', json=data).status_code, 422)
        updated = self.client.patch('/api/auth/profile', json={'display_name': '  New artist  '}).json()
        self.assertEqual(updated['display_name'], 'New artist')
        self.assertEqual(updated['email'], 'owner@example.com')
        self.assertEqual(self.other.get('/api/auth/me').json()['display_name'], 'Owner')
        shared = self.public.get(f'/api/public/{token}').json()
        self.assertEqual(shared['owner_name'], 'New artist')
        self.assertEqual(shared['artist'], '')
        self.client.patch(f"/api/projects/{project['id']}", json={'name': 'Album', 'artist': 'Explicit artist'})
        self.assertEqual(self.public.get(f'/api/public/{token}').json()['artist'], 'Explicit artist')

    def test_favorite_private_idempotent_persistent_and_cascade(self):
        self.register(self.client)
        self.register(self.other, 'other@example.com')
        project = self.client.post('/api/projects', json={'name': 'Album'}).json()
        song = self.client.post(f"/api/projects/{project['id']}/songs", json={'title': 'Song'}).json()
        endpoint = f"/api/songs/{song['id']}/favorite"
        for client, status in [(self.public, 401), (self.other, 404)]:
            self.assertEqual(client.get(endpoint).status_code, status)
            self.assertEqual(client.put(endpoint, json={'favorite': True}).status_code, status)
        self.assertEqual(self.client.get(endpoint).json(), {'favorite': False})
        for _ in range(2):
            self.assertEqual(self.client.put(endpoint, json={'favorite': True}).json(), {'favorite': True})
        with self.sessions() as db:
            self.assertEqual(len(db.scalars(select(Favorite)).all()), 1)
        # Additive table creation can run repeatedly without resetting existing data.
        Base.metadata.create_all(self.engine)
        self.assertTrue(self.client.get(endpoint).json()['favorite'])
        token = self.client.put(f"/api/projects/{project['id']}/share", json={'enabled': True}).json()['token']
        shared = self.public.get(f'/api/public/{token}').json()
        self.assertNotIn('favorite', str(shared))
        self.assertEqual(self.client.put(endpoint, json={'favorite': 'yes'}).status_code, 422)
        self.assertFalse(self.client.put(endpoint, json={'favorite': False}).json()['favorite'])
        self.client.put(endpoint, json={'favorite': True})
        self.assertEqual(self.client.delete(f"/api/projects/{project['id']}").status_code, 204)
        with self.sessions() as db:
            self.assertEqual(db.scalars(select(Favorite)).all(), [])

    def test_shared_version_selector_never_exposes_historical_versions(self):
        self.register(self.client)
        project = self.client.post('/api/projects', json={'name': 'Versions'}).json()
        song = self.client.post(f"/api/projects/{project['id']}/songs", json={'title': 'Song'}).json()
        output = io.BytesIO()
        with wave.open(output, 'wb') as audio:
            audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(8000)
            audio.writeframes(b'\x00\x00'*8000)
        versions = []
        for name in ['Private old take', 'Latest']:
            response = self.client.post(f"/api/songs/{song['id']}/versions", data={'version_name': name}, files={'file': ('take.wav', output.getvalue(), 'audio/wav')})
            self.assertEqual(response.status_code, 201, response.text)
            versions.append(response.json()['id'])
        token = self.client.put(f"/api/projects/{project['id']}/share", json={'enabled': True}).json()['token']
        for resource in ['audio', 'waveform']:
            endpoint = f"/api/public/{token}/songs/{song['id']}/{resource}"
            self.assertEqual(self.public.get(endpoint, params={'version_id': versions[0]}).status_code, 404)
            self.assertEqual(self.public.get(endpoint, params={'version_id': versions[1]}).status_code, 200)
        shared = self.public.get(f'/api/public/{token}').json()['tracks'][0]
        self.assertEqual(shared['version_id'], versions[1])
        self.assertEqual(shared['version_name'], 'Latest')
