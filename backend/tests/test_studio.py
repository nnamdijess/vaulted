import io
import wave
import unittest
from pathlib import Path
from unittest.mock import patch
import test_auth
from app.core.config import settings
from app.services.visual_provider import safe_media_url
from app.models.studio import ContentRenderJob


class StudioTest(unittest.TestCase):
    register = test_auth.AuthenticationTest.register

    def setUp(self):
        test_auth.AuthenticationTest.setUp(self)
        self.content_patch = patch.object(settings, 'content_dir', Path(self.temp.name) / 'content')
        self.content_patch.start()
        self.network = patch('httpx.HTTPTransport.handle_request', side_effect=AssertionError('Tests must not call stock providers'))
        self.network.start()
        self.register(self.client)
        self.register(self.other, 'other@example.com')
        self.music = self.client.post('/api/projects', json={'name': 'Music'}).json()
        output = io.BytesIO()
        with wave.open(output, 'wb') as audio:
            audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(8000)
            audio.writeframes(b'\x00\x10' * 24000)
        # TestClient uses an in-process transport; real network transport is blocked.
        self.song = self.client.post(f"/api/projects/{self.music['id']}/tracks", files={'files': ('demo.wav', output.getvalue(), 'audio/wav')}).json()[0]
        response = self.client.post('/api/studio/projects', json={'song_version_id': self.song['latest_version_id'], 'title': 'Video'})
        self.assertEqual(response.status_code, 201, response.text)
        self.project = response.json()
        self.url = f"/api/studio/projects/{self.project['id']}"

    def tearDown(self):
        self.network.stop()
        self.content_patch.stop()
        test_auth.AuthenticationTest.tearDown(self)

    def edit(self, **values):
        return self.client.patch(self.url, json={'title': 'Video', 'start_time': 0, 'end_time': 3,
            'lyrics_text': '  Hello, world!\n\nNext line  ', 'aesthetic': 'nature', 'lyric_style': 'minimal', **values})

    def footage(self):
        return [{'provider': 'pixabay', 'provider_id': str(index), 'preview_url': f'https://cdn.pixabay.com/video/{index}.mp4',
                 'video_url': f'https://cdn.pixabay.com/video/{index}.mp4', 'source_url': f'https://pixabay.com/videos/id-{index}/',
                 'tags': 'forest', 'width': 1080, 'height': 1920, 'duration': 5} for index in range(3)]

    def draft(self):
        self.edit()
        self.assertEqual(self.client.put(self.url + '/timings', json={'starts': [0, 1.4]}).status_code, 200)
        with patch('app.api.studio.PixabayProvider.search', return_value=self.footage()):
            response = self.client.post(self.url + '/draft', json={'mode': 'automatic'})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_ownership_sections_lyrics_and_presets(self):
        self.assertEqual(self.public.get(self.url).status_code, 401)
        self.assertEqual(self.other.get(self.url).status_code, 404)
        self.assertEqual(self.other.delete(self.url).status_code, 404)
        self.assertEqual(self.other.post('/api/studio/projects', json={'song_version_id': self.song['latest_version_id'], 'title': 'Steal'}).status_code, 404)
        self.assertEqual(self.client.get('/api/studio/songs').json()[0]['id'], self.song['id'])
        self.assertEqual(self.other.get('/api/studio/songs').json(), [])
        self.assertEqual(len(self.client.get('/api/studio/presets').json()['aesthetics']), 11)
        for end in (0, 4, 61):
            self.assertEqual(self.edit(end_time=end).status_code, 422)
        saved = self.edit().json()
        self.assertEqual(saved['lyrics_text'], '  Hello, world!\n\nNext line  ')
        self.assertEqual([line['text'] for line in saved['lines']], ['  Hello, world!', 'Next line  '])
        for starts in ([0], [1, 0], [-1, 1], [0, 3]):
            self.assertEqual(self.client.put(self.url + '/timings', json={'starts': starts}).status_code, 422)
        saved = self.client.put(self.url + '/timings', json={'starts': [0, 1]}).json()
        self.assertEqual(saved['lines'][-1]['end_time'], 3)
        self.assertEqual(self.client.delete(f"/api/songs/{self.song['id']}").status_code, 409)
        self.assertEqual(self.client.delete(f"/api/projects/{self.music['id']}").status_code, 409)
        self.assertEqual(self.client.delete(self.url).status_code, 204)
        self.assertEqual(self.client.get(f"/api/songs/{self.song['id']}").status_code, 200)

    def test_media_selection_snapshot_jobs_and_failure(self):
        draft = self.draft()
        clip = draft['clips'][0]
        media_id = clip['media_id']
        self.assertEqual(self.other.patch(f'/api/studio/media/{media_id}', json={'favorite': True}).status_code, 404)
        self.assertEqual(self.client.patch(f'/api/studio/media/{media_id}', json={'favorite': True}).status_code, 200)
        self.assertEqual(len(self.client.get('/api/studio/media/favorites').json()), 1)
        self.assertEqual(self.other.post(self.url + '/renders', json={}).status_code, 404)
        response = self.client.post(self.url + '/renders', json={})
        self.assertEqual(response.status_code, 202, response.text)
        job = response.json()
        self.assertEqual(self.client.post(self.url + '/renders', json={}).status_code, 409)
        self.assertEqual(self.client.delete(self.url).status_code, 409)
        self.edit(title='Edited after enqueue')
        with self.sessions() as db:
            self.assertEqual(db.get(ContentRenderJob, job['id']).snapshot['title'], 'Video')
        with patch('app.studio_worker.SessionLocal', self.sessions), patch('app.studio_worker.render', side_effect=RuntimeError('test')):
            from app.studio_worker import process_one
            self.assertTrue(process_one())
            self.assertFalse(process_one())
        self.assertEqual(self.client.get(self.url + f"/renders/{job['id']}").json()['status'], 'failed')
        self.assertEqual(self.other.get(self.url + f"/renders/{job['id']}/video").status_code, 404)
        self.assertEqual(self.client.get(self.url + f"/renders/{job['id']}/video").status_code, 404)

    def test_real_local_render_without_network(self):
        from app.services.studio_renderer import command
        from app.services.studio_storage import content_path
        draft = self.draft()
        self.assertEqual(self.client.put(self.url + '/text-style', json={'color': '#FF6BAE', 'font': 'lobster', 'align': 'left'}).status_code, 200)
        stock = content_path(f"projects/{draft['id']}/stock/{draft['clips'][0]['media_id']}.mp4")
        stock.parent.mkdir(parents=True, exist_ok=True)
        command(['-f', 'lavfi', '-i', 'color=c=blue:s=90x160:r=30:d=3', '-c:v', 'libx264', str(stock)], stock.parent)
        response = self.client.post(self.url + '/renders', json={}).json()
        with patch('app.studio_worker.SessionLocal', self.sessions):
            from app.studio_worker import process_one
            self.assertTrue(process_one())
        status = self.client.get(self.url + f"/renders/{response['id']}").json()
        self.assertEqual(status['status'], 'completed', status)
        self.assertEqual(status['progress'], 100)
        video = self.client.get(self.url + f"/renders/{response['id']}/video", headers={'Range': 'bytes=0-43'})
        self.assertEqual(video.status_code, 206)
        self.assertEqual(len(video.content), 44)
        self.assertEqual(self.public.get(self.url + f"/renders/{response['id']}/video").status_code, 401)
        self.assertEqual(self.other.get(self.url + f"/renders/{response['id']}/video").status_code, 404)
        self.assertFalse(content_path(f"projects/{draft['id']}/temp/{response['id']}").exists())

    def test_provider_url_validation(self):
        self.assertTrue(safe_media_url('https://cdn.pixabay.com/video/a.mp4'))
        for url in ('http://cdn.pixabay.com/a', 'https://localhost/a', 'https://cdn.pixabay.com.evil.test/a', 'file:///tmp/a', 'https://user@cdn.pixabay.com/a'):
            self.assertFalse(safe_media_url(url))

    def test_text_style_validation_ownership_snapshot_and_export(self):
        from app.services.studio_renderer import subtitles
        draft = self.draft()
        style = {'color': '#12ABEF', 'font': 'anton', 'align': 'right'}
        url = self.url + '/text-style'
        self.assertEqual(self.public.put(url, json=style).status_code, 401)
        self.assertEqual(self.other.put(url, json=style).status_code, 404)
        for bad in ({'color': 'red'}, {'color': '#fff'}, {'font': '../secret'}, {'align': 'top'}, {'extra': True}):
            self.assertEqual(self.client.put(url, json={**style, **bad}).status_code, 422)
        saved = self.client.put(url, json=style).json()
        self.assertEqual(saved['text_style'], style)
        self.assertEqual(saved['clips'], draft['clips'])
        self.assertEqual(saved['lines'], draft['lines'])
        self.assertEqual(self.client.get(self.url).json()['text_style'], style)
        exported = subtitles(saved)
        self.assertIn('Default,Anton,48,&H00EFAB12', exported)
        self.assertIn(',6,100,100,350,1', exported)
        for align, expected in [('left', 4), ('center', 5), ('right', 6)]:
            saved['text_style']['align'] = align
            self.assertIn(f',{expected},100,100,350,1', subtitles(saved))
        old = {**saved, 'text_style': {}, 'lyric_style': 'highlight'}
        self.assertIn('&H0080FFFF', subtitles(old))
        job = self.client.post(self.url + '/renders', json={}).json()
        self.client.put(url, json={**style, 'font': 'lobster'})
        with self.sessions() as db:
            self.assertEqual(db.get(ContentRenderJob, job['id']).snapshot['text_style'], style)
        for font in ('abel', 'anton', 'lobster'):
            response = self.client.get(f'/api/studio/fonts/{font}')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.content[:4], b'\x00\x01\x00\x00')
        self.assertEqual(self.client.get('/api/studio/fonts/unknown').status_code, 404)

    def test_reusable_aesthetics_ownership_keywords_and_curated_generation(self):
        draft = self.draft()
        media_id = draft['clips'][0]['media_id']
        payload = {'name': 'My night collection', 'base_aesthetic': 'night-drive', 'keywords': ['rain', 'city'], 'media_ids': [media_id]}
        created = self.client.post('/api/studio/aesthetics', json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        collection = created.json()
        key = f"custom:{collection['id']}"
        self.assertEqual(self.other.get('/api/studio/aesthetics').json(), [])
        self.assertEqual(self.other.put(f"/api/studio/aesthetics/{collection['id']}", json=payload).status_code, 404)
        self.assertEqual(self.other.post('/api/studio/aesthetics', json=payload).status_code, 404)
        self.assertEqual(self.edit(aesthetic=key).status_code, 200)
        # Curated generation must not call Pixabay, even when no key is configured.
        with patch('app.api.studio.PixabayProvider.search', side_effect=AssertionError('Curated pool should be used')):
            response = self.client.post(self.url + '/draft', json={'mode': 'automatic'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['clips'][0]['media_id'], media_id)
        self.assertEqual(self.client.put(f"/api/studio/aesthetics/{collection['id']}", json={**payload, 'name': 'Renamed', 'keywords': ['moon']}).status_code, 200)
        presets = self.client.get('/api/studio/presets').json()['aesthetics']
        self.assertEqual(next(item['name'] for item in presets if item['id'] == key), 'Renamed')
        with patch('app.api.studio.PixabayProvider.search', return_value=self.footage()) as search:
            self.client.post('/api/studio/visuals/search', json={'aesthetic': key})
            search.assert_called_once_with('moon', 1)

    def test_reroll_replace_and_section_reset_preserve_source(self):
        draft = self.draft()
        with patch('app.api.studio.PixabayProvider.search', return_value=self.footage()):
            rerolled = self.client.post(self.url + '/draft', json={'mode': 'reroll'}).json()
        for field in ('song_id', 'song_version_id', 'lyrics_text', 'lines', 'aesthetic', 'start_time', 'end_time'):
            self.assertEqual(draft[field], rerolled[field])
        clip = rerolled['clips'][0]
        replacement = draft['clips'][0]['media_id']
        response = self.client.put(self.url + f"/clips/{clip['id']}", json={'media_id': replacement})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['clips'][0]['media_id'], replacement)
        changed = self.edit(end_time=2).json()
        self.assertEqual(changed['clips'], [])
        self.assertIsNone(changed['lines'][0]['start_time'])

    def test_pixabay_contract_cache_and_host_validation(self):
        import httpx
        from app.services.visual_provider import PixabayProvider
        hit = {'id': 123, 'duration': 5, 'tags': 'forest', 'videos': {
            'medium': {'url': 'https://cdn.pixabay.com/video/test.mp4', 'width': 1080, 'height': 1920},
            'tiny': {'url': 'https://cdn.pixabay.com/video/tiny.mp4', 'width': 90, 'height': 160}}}
        reply = httpx.Response(200, json={'hits': [hit]}, request=httpx.Request('GET', 'https://pixabay.com/api/videos/'))
        with patch.object(settings, 'pixabay_api_key', 'test-only-key'), patch('httpx.Client.get', return_value=reply) as get:
            result = PixabayProvider().search('forest')
            self.assertEqual(result[0]['provider_id'], '123')
            self.assertNotIn('test-only-key', str(result))
            self.assertEqual(PixabayProvider().search('forest'), result)
            self.assertEqual(get.call_count, 1)
            hit['videos']['medium']['url'] = 'http://127.0.0.1/private'
            get.return_value = httpx.Response(200, json={'hits': [hit]}, request=reply.request)
            self.assertEqual(PixabayProvider().search('other'), [])
