import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.main import app, _auth_attempts
from app.api.auth import COOKIE, token_hash
from app.core.config import settings
from app.db.session import Base, get_session
from app.models.auth import User, Session
from app.models.music import Project, Song, SongVersion, utc_now
from app.claim_legacy import claim


class AuthenticationTest(unittest.TestCase):
    def setUp(self):
        _auth_attempts.clear()
        self.temp = tempfile.TemporaryDirectory()
        self.engine = create_engine(f"sqlite:///{Path(self.temp.name, 'test.db').as_posix()}", connect_args={'check_same_thread': False})
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)
        self.auth_patch = patch('app.api.auth.SessionLocal', self.sessions)
        self.auth_patch.start()
        def database():
            with self.sessions() as db:
                yield db
        app.dependency_overrides[get_session] = database
        self.upload_patch = patch.object(settings, 'uploads_dir', Path(self.temp.name))
        self.upload_patch.start()
        self.client = TestClient(app)
        self.other = TestClient(app)
        self.public = TestClient(app)
        self.data = {'email': 'Owner@EXAMPLE.com', 'password': 'A long test password!', 'display_name': 'Owner'}

    def tearDown(self):
        for client in (self.client, self.other, self.public):
            client.close()
        app.dependency_overrides.clear()
        self.upload_patch.stop()
        self.auth_patch.stop()
        self.engine.dispose()
        self.temp.cleanup()

    def register(self, client, email='owner@example.com'):
        response = client.post('/api/auth/register', json={**self.data, 'email': email})
        self.assertEqual(response.status_code, 201, response.text)
        return response

    def test_sessions_validation_csrf_and_expiration(self):
        result = self.register(self.client, ' Owner@EXAMPLE.com ')
        self.assertEqual(result.json()['email'], 'owner@example.com')
        self.assertNotIn('password', result.text)
        cookie = result.headers['set-cookie'].lower()
        self.assertIn('httponly', cookie)
        self.assertIn('samesite=lax', cookie)
        self.assertIn('max-age=', cookie)
        old_token = self.client.cookies.get(COOKIE)
        with self.sessions() as db:
            user = db.scalar(select(User))
            self.assertTrue(user.password_hash.startswith('$argon2id$'))
            session = db.scalar(select(Session))
            self.assertEqual(session.token_hash, token_hash(old_token))
            self.assertNotEqual(session.token_hash, old_token)
        self.assertEqual(self.client.post('/api/auth/register', json=self.data).status_code, 409)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 200)
        bad = self.client.post('/api/auth/login', json={'email': self.data['email'], 'password': 'wrong password long'})
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(self.client.post('/api/auth/register', json={**self.data, 'email':'invalid', 'password':'secret'}).status_code, 422)
        self.assertNotIn('secret', self.client.post('/api/auth/login', json={'email':'bad', 'password':'secret'}).text)
        response = self.client.post('/api/auth/login', json={k:v for k,v in self.data.items() if k != 'display_name'})
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(old_token, self.client.cookies.get(COOKIE))
        self.assertEqual(self.public.get('/api/auth/me', headers={'Cookie':f'{COOKIE}={old_token}'}).status_code, 401)
        self.assertEqual(self.client.post('/api/auth/logout', headers={'Origin':'https://evil.example'}).status_code, 403)
        self.assertEqual(self.client.post('/api/projects', json={'name':'CSRF'}, headers={'Sec-Fetch-Site':'cross-site'}).status_code, 403)
        token = self.client.cookies.get(COOKIE)
        self.assertEqual(self.client.post('/api/auth/logout').status_code, 204)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)
        self.assertEqual(self.public.get('/api/auth/me', headers={'Cookie':f'{COOKIE}={token}'}).status_code, 401)
        with patch.object(settings, 'cookie_secure', True):
            self.assertIn('Secure', self.register(self.other, 'https@example.com').headers['set-cookie'])
        self.register(self.client, 'expired@example.com')
        with self.sessions() as db:
            for row in db.scalars(select(Session)):
                row.expires_at = utc_now() - timedelta(seconds=1)
            db.commit()
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)

    def test_ownership_every_resource_and_public_capability(self):
        a = self.register(self.client).json()
        self.register(self.other, 'other@example.com')
        project = self.client.post('/api/projects', json={'name':'Private album'}).json()
        pid = project['id']
        song = self.client.post(f'/api/projects/{pid}/songs', json={'title':'Track', 'notes':'SONG SECRET'}).json()
        sid = song['id']
        version = self.client.post(f'/api/songs/{sid}/versions', data={'version_name':'Original', 'notes':'VERSION SECRET'}, files={'file':('track.wav', b'RIFF-test-data', 'audio/wav')}).json()
        vid = version['id']
        self.client.patch(f'/api/projects/{pid}/notes', json={'notes':'PROJECT SECRET'})
        paths = [f'/projects/{pid}', f'/projects/{pid}/songs', f'/projects/{pid}/cover', f'/projects/{pid}/share', f'/projects/{pid}/insights', f'/songs/{sid}', f'/songs/{sid}/versions', f'/versions/{vid}/audio', f'/versions/{vid}/audio?download=true']
        for path in paths:
            self.assertEqual(self.other.get('/api'+path).status_code, 404, path)
            self.assertEqual(self.public.get('/api'+path).status_code, 401, path)
        mutations = [('patch',f'/projects/{pid}',{'name':'stolen'}), ('patch',f'/projects/{pid}/notes',{'notes':'stolen'}), ('patch',f'/projects/{pid}/order',{'song_ids':[sid]}), ('put',f'/projects/{pid}/share',{'enabled':True}), ('post',f'/projects/{pid}/songs',{'title':'stolen'}), ('patch',f'/songs/{sid}',{'notes':'stolen'}), ('post',f'/songs/{sid}/listens',{'playback_id':'00000000-0000-4000-8000-000000000001','session_id':'00000000-0000-4000-8000-000000000002','duration':3,'listened_seconds':2})]
        for method,path,body in mutations:
            self.assertEqual(self.other.request(method, '/api'+path, json=body).status_code, 404, path)
        for path in [f'/projects/{pid}',f'/projects/{pid}/cover',f'/songs/{sid}']:
            self.assertEqual(self.other.delete('/api'+path).status_code, 404)
        for path, fields in [(f'/projects/{pid}/cover',{}),(f'/songs/{sid}/versions',{'version_name':'hack'})]:
            self.assertEqual(self.other.post('/api'+path, data=fields, files={'file':('test.wav',b'data','audio/wav')}).status_code, 404)
        self.assertEqual(self.other.post(f'/api/projects/{pid}/tracks', files={'files':('test.wav',b'data','audio/wav')}).status_code, 404)
        self.assertEqual(self.other.get('/api/projects').json(), [])
        self.assertEqual(self.public.get('/api/projects').status_code, 401)
        self.assertEqual(self.public.post('/api/projects', json={'name':'bad'}).status_code, 401)
        self.assertEqual(self.client.post('/api/projects', json={'name':'bad','owner_id':a['id']}).status_code, 422)
        token = self.client.put(f'/api/projects/{pid}/share', json={'enabled':True}).json()['token']
        base = '/api/public/'+token
        response = self.public.get(base)
        self.assertEqual(response.status_code, 200)
        for secret in ['SECRET','notes','owner_id','password','session','file_path']:
            self.assertNotIn(secret,response.text)
        self.assertEqual(self.public.get(f'{base}/songs/{sid}/audio').status_code, 200)
        self.assertEqual(self.public.get(f'{base}/songs/{sid}/audio?download=true').status_code,403)
        self.client.put(f'/api/projects/{pid}/share',json={'enabled':True,'regenerate':True})
        self.assertEqual(self.public.get(base).status_code,404)
        self.assertEqual(self.public.get(f'{base}/songs/{sid}/audio').status_code,404)

    def test_registration_control_rate_limit_and_cors(self):
        with patch.object(settings, 'registration_enabled', False):
            self.assertEqual(self.client.post('/api/auth/register', json=self.data).status_code,403)
        response = self.client.options('/api/projects', headers={'Origin':'http://localhost:3000','Access-Control-Request-Method':'POST'})
        self.assertEqual(response.headers['access-control-allow-credentials'],'true')
        self.assertEqual(response.headers['access-control-allow-origin'],'http://localhost:3000')
        self.assertNotIn('access-control-allow-origin',self.client.options('/api/projects', headers={'Origin':'https://evil.example','Access-Control-Request-Method':'POST'}).headers)
        for _ in range(60):
            result = self.client.post('/api/auth/login', json={})
        self.assertEqual(result.status_code,429)

    def test_legacy_claim_is_explicit_and_never_transfers_owned_projects(self):
        with self.sessions() as db:
            db.add(Project(name='Legacy', notes='Keep', share_token='legacy-secret', sharing_enabled=True))
            db.commit()
        self.register(self.client)
        self.assertEqual(self.client.get('/api/projects').json(), [])
        self.assertEqual(self.public.get('/api/public/legacy-secret').status_code,200)
        with self.sessions() as db:
            self.assertEqual(claim(db,'owner@example.com'),1)
        self.register(self.other,'other@example.com')
        with self.sessions() as db:
            self.assertEqual(claim(db,'other@example.com'),0)
        self.assertEqual(self.client.get('/api/projects').json()[0]['notes'],'Keep')
        self.assertEqual(self.other.get('/api/projects').json(),[])
        self.assertEqual(self.public.get('/api/public/legacy-secret').status_code,200)


if __name__ == '__main__':
    unittest.main()
