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
        style = {'color': '#12ABEF', 'font': 'anton', 'align': 'right', 'letter_spacing': 0.1, 'text_width': 60}
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
        self.assertIn(',6,216,216,350,1', exported)
        for align, expected in [('left', 4), ('center', 5), ('right', 6)]:
            saved['text_style']['align'] = align
            self.assertIn(f',{expected},216,216,350,1', subtitles(saved))
        old = {**saved, 'text_style': {}, 'lyric_style': 'highlight'}
        self.assertIn('&H0080FFFF', subtitles(old))
        job = self.client.post(self.url + '/renders', json={}).json()
        self.client.put(url, json={**style, 'font': 'lobster'})
        with self.sessions() as db:
            self.assertEqual(db.get(ContentRenderJob, job['id']).snapshot['text_style'], style)
        for font in ('abel', 'anton', 'lobster', 'blackletter', 'mono'):
            response = self.client.get(f'/api/studio/fonts/{font}')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.content[:4], b'\x00\x01\x00\x00')
        for font, family in [('blackletter', 'UnifrakturCook'), ('mono', 'Space Mono')]:
            custom = self.client.put(url, json={**style, 'font': font}).json()
            self.assertIn(f'Default,{family},48', subtitles(custom))
        self.assertEqual(self.client.get('/api/studio/fonts/unknown').status_code, 404)

    def test_pexels_contract_cache_limits_and_hosts(self):
        import httpx
        from fastapi import HTTPException
        from app.services.visual_provider import PexelsProvider
        with patch.object(settings, 'pexels_api_key', ''):
            response = self.client.post('/api/studio/visuals/search', json={'provider': 'pexels', 'query': 'rain'})
            self.assertEqual(response.status_code, 503)
            self.assertIn('PEXELS_API_KEY', response.text)
        hit = {'id': 12, 'duration': 8, 'image': 'https://images.pexels.com/videos/12.jpg', 'user': {'name': 'Creator'},
               'video_files': [
                   {'file_type': 'video/mp4', 'width': 1080, 'height': 1920, 'link': 'https://videos.pexels.com/video-files/12/hd.mp4'},
                   {'file_type': 'video/mp4', 'width': 360, 'height': 640, 'link': 'https://videos.pexels.com/video-files/12/sd.mp4'},
                   {'file_type': 'video/mp4', 'width': 1080, 'height': 1920, 'link': 'http://localhost/private'}]}
        req = httpx.Request('GET', 'https://api.pexels.com/v1/videos/search')
        with patch.object(settings, 'pexels_api_key', 'test-only-key'), patch('httpx.Client.get', return_value=httpx.Response(200, json={'videos': [hit]}, request=req)) as get:
            result = PexelsProvider().search('rain', 2)
            self.assertEqual(result[0]['author'], 'Creator')
            self.assertTrue(result[0]['video_url'].endswith('hd.mp4'))
            self.assertTrue(result[0]['preview_url'].endswith('sd.mp4'))
            self.assertNotIn('test-only-key', str(result))
            self.assertEqual(PexelsProvider().search('rain', 2), result)
            self.assertEqual(get.call_count, 1)
            self.assertEqual(get.call_args.kwargs['headers'], {'Authorization': 'test-only-key'})
            self.assertEqual(get.call_args.kwargs['params']['page'], 2)
            get.return_value = httpx.Response(429, request=req)
            with self.assertRaises(HTTPException) as error:
                PexelsProvider().search('uncached')
            self.assertEqual(error.exception.status_code, 429)
        self.assertTrue(safe_media_url('https://videos.pexels.com/video-files/a.mp4'))
        for url in ('https://videos.pexels.com.evil.test/a', 'http://videos.pexels.com/a', 'https://videos.pexels.com:8080/a', 'https://user@videos.pexels.com/a'):
            self.assertFalse(safe_media_url(url))
        self.assertFalse(safe_media_url('https://videos.pexels.com/a', 'pixabay'))

    def test_pexels_identity_generation_and_mixed_replacement(self):
        original = self.draft()
        footage = [{**item, 'provider': 'pexels', 'preview_url': 'https://videos.pexels.com/video-files/a.mp4',
                    'video_url': 'https://videos.pexels.com/video-files/a.mp4', 'source_url': 'https://www.pexels.com/video/12/'} for item in self.footage()]
        with patch('app.api.studio.PexelsProvider.search', return_value=footage) as search:
            response = self.client.post('/api/studio/visuals/search', json={'provider': 'pexels', 'query': 'rain'}).json()
            search.assert_called_once_with('rain', 1)
            # Same external ID is a different record when the provider differs.
            self.assertNotEqual(response[0]['id'], original['clips'][0]['media_id'])
            updated = self.client.put(self.url + f"/clips/{original['clips'][0]['id']}", json={'media_id': response[0]['id']}).json()
            self.assertEqual(updated['clips'][0]['media']['provider'], 'pexels')
            generated = self.client.post(self.url + '/draft', json={'mode': 'automatic', 'provider': 'pexels'})
            self.assertEqual(generated.status_code, 200, generated.text)
            self.assertEqual(generated.json()['clips'][0]['media']['provider'], 'pexels')
            saved = self.client.patch(f"/api/studio/media/{response[0]['id']}", json={'favorite': True})
            self.assertEqual(saved.status_code, 200)
            self.assertEqual(self.client.get('/api/studio/media/favorites').json()[0]['provider'], 'pexels')
            self.assertEqual(self.other.patch(f"/api/studio/media/{response[0]['id']}", json={'favorite': True}).status_code, 404)

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

    def test_uploaded_library_private_preview_tags_and_render(self):
        import subprocess
        from app.services.studio_storage import ffmpeg
        fixture = Path(self.temp.name) / 'input.mp4'
        subprocess.run([ffmpeg(), '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x240:r=10',
                        '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(fixture)], check=True)
        response = self.client.post('/api/studio/media/upload', files={'file': ('Night.mp4', fixture.read_bytes(), 'video/mp4')})
        self.assertEqual(response.status_code, 201, response.text)
        item = response.json()
        self.assertTrue(item['favorite'])
        self.assertEqual(item['provider'], 'upload')
        self.assertEqual(self.client.get(item['preview_url']).status_code, 200)
        self.assertEqual(self.client.get(item['thumbnail']).status_code, 200)
        self.assertEqual(self.public.get(item['preview_url']).status_code, 401)
        self.assertEqual(self.other.get(item['preview_url']).status_code, 404)
        self.assertEqual(self.other.get(item['thumbnail']).status_code, 404)
        details = f"/api/studio/media/{item['id']}/details"
        self.assertEqual(self.other.put(details, json={'title': 'Steal', 'tags': ''}).status_code, 404)
        self.assertEqual(self.client.put(details, json={'title': 'Night drive', 'tags': 'blue, neon'}).status_code, 200)
        self.assertEqual(len(self.client.get('/api/studio/media/favorites?q=NEON').json()), 1)
        self.assertEqual(self.other.get('/api/studio/media/favorites?q=NEON').json(), [])
        self.assertEqual(self.client.get('/api/studio/media/favorites?q=forest').json(), [])
        self.edit(lyrics_text='')
        self.assertEqual(self.client.post(self.url + '/draft', json={'media_ids': [item['id']]}).status_code, 200)
        job = self.client.post(self.url + '/renders').json()
        with patch('app.studio_worker.SessionLocal', self.sessions):
            from app.studio_worker import process_one
            self.assertTrue(process_one())
        self.assertEqual(self.client.get(self.url + f"/renders/{job['id']}").json()['status'], 'completed')
        self.assertEqual(self.client.get(self.url + f"/renders/{job['id']}/video").status_code, 200)

    def test_upload_rejects_invalid_and_oversize_without_orphans(self):
        for name, data, expected in [('bad.txt', b'bad', 422), ('bad.mp4', b'not video', 422)]:
            response = self.client.post('/api/studio/media/upload', files={'file': (name, data, 'video/mp4')})
            self.assertEqual(response.status_code, expected, response.text)
        with patch.object(settings, 'max_upload_bytes', 2):
            self.assertEqual(self.client.post('/api/studio/media/upload', files={'file': ('large.mp4', b'123', 'video/mp4')}).status_code, 413)
        self.assertEqual(self.client.get('/api/studio/media/favorites').json(), [])
        self.assertEqual(list((settings.content_dir / 'library').glob('*')), [])

    def test_animated_gif_upload_ignores_infinite_loop_and_exports(self):
        from PIL import Image
        output = io.BytesIO()
        frames = [Image.new('RGB', (80, 120), color) for color in ('red', 'blue', 'green', 'yellow')]
        frames[0].save(output, format='GIF', save_all=True, append_images=frames[1:], duration=1000, loop=0)
        response = self.client.post('/api/studio/media/upload', files={'file': ('Animation.GIF', output.getvalue(), 'image/gif')})
        self.assertEqual(response.status_code, 201, response.text)
        item = response.json()
        self.assertAlmostEqual(item['duration'], 4, delta=0.1)
        self.assertEqual(self.client.get(item['preview_url']).headers['content-type'], 'video/mp4')
        self.assertEqual(self.client.get(item['thumbnail']).status_code, 200)
        self.assertEqual(self.other.get(item['preview_url']).status_code, 404)
        self.edit(lyrics_text='')
        self.assertEqual(self.client.post(self.url + '/draft', json={'media_ids': [item['id']]}).status_code, 200)
        job = self.client.post(self.url + '/renders').json()
        with patch('app.studio_worker.SessionLocal', self.sessions):
            from app.studio_worker import process_one
            self.assertTrue(process_one())
        self.assertEqual(self.client.get(self.url + f"/renders/{job['id']}").json()['status'], 'completed')
        self.assertEqual(self.client.post('/api/studio/media/upload', files={'file': ('fake.gif', b'not a GIF', 'image/gif')}).status_code, 422)

    def test_large_draft_selection_and_limit(self):
        from app.models.studio import ContentMedia, ContentProject
        with self.sessions() as db:
            owner = db.get(ContentProject, self.project['id']).owner_id
            media = [ContentMedia(owner_id=owner, provider='pixabay', provider_id=str(i), metadata_json=self.footage()[0]) for i in range(51)]
            db.add_all(media); db.commit()
            ids = [item.id for item in media]
        response = self.client.post(self.url + '/draft', json={'media_ids': ids})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn(response.json()['clips'][0]['media_id'], ids)
        self.assertEqual(self.other.post(self.url + '/draft', json={'media_ids': ids}).status_code, 404)
        self.assertEqual(self.client.post(self.url + '/draft', json={'media_ids': ids * 20}).status_code, 422)

    def test_selected_pool_rerolls_without_provider_and_clear_preserves_pool(self):
        from app.models.studio import ContentMedia, ContentProject
        with self.sessions() as db:
            owner = db.get(ContentProject, self.project['id']).owner_id
            items = [ContentMedia(owner_id=owner, provider='upload', provider_id=str(i), metadata_json=self.footage()[0]) for i in range(8)]
            db.add_all(items); db.commit()
            ids = [item.id for item in items]
        with patch('app.api.studio.PixabayProvider.search', side_effect=AssertionError('No stock search')):
            first = self.client.post(self.url + '/draft', json={'media_ids': ids}).json()
            self.assertEqual(first['media_pool'], ids)
            second = self.client.post(self.url + '/draft', json={'mode': 'reroll'}).json()
            self.assertNotEqual(first['clips'][0]['media_id'], second['clips'][0]['media_id'])
            self.assertEqual(self.client.get(self.url).json()['media_pool'], ids)
            self.assertEqual(self.other.delete(self.url + '/clips').status_code, 404)
            cleared = self.client.delete(self.url + '/clips').json()
            self.assertEqual(cleared['clips'], [])
            self.assertEqual(cleared['media_pool'], ids)
            self.assertEqual(self.client.post(self.url + '/draft', json={'mode': 'reroll'}).status_code, 200)

    def test_media_pool_migration_is_additive_and_repeatable(self):
        from app.db.migrations import upgrade_local_database
        with self.engine.begin() as connection:
            connection.exec_driver_sql('ALTER TABLE content_projects DROP COLUMN media_pool')
        upgrade_local_database(self.engine)
        upgrade_local_database(self.engine)
        restored = self.client.get(self.url).json()
        self.assertEqual(restored['media_pool'], [])
        self.assertEqual(restored['title'], self.project['title'])
