import unittest
import subprocess
import shutil
from unittest.mock import patch
from app.models.studio import ContentMedia
from app.services.studio_storage import ffmpeg, content_path
import test_studio


class DuplicateUploadTest(unittest.TestCase):
    setUp = test_studio.StudioTest.setUp
    tearDown = test_studio.StudioTest.tearDown
    register = test_studio.StudioTest.register

    def video(self, color='blue'):
        path = content_path(f'{color}.mp4')
        path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([ffmpeg(), '-v','error','-y','-f','lavfi','-i',f'color={color}:s=64x96:r=10:d=1','-c:v','libx264','-pix_fmt','yuv420p',str(path)], check=True)
        return path.read_bytes()

    def upload(self, data, name='clip.mp4', client=None):
        response = (client or self.client).post('/api/studio/media/upload', files={'file': (name, data, 'video/mp4')})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_renamed_copy_reuses_original_and_different_bytes_do_not(self):
        data = self.video()
        original = self.upload(data)
        with patch('app.api.studio.ingest_video', side_effect=AssertionError('Known duplicates must skip conversion')):
            duplicate = self.upload(data, 'renamed.mp4')
        self.assertEqual(original['id'], duplicate['id'])
        self.assertTrue(duplicate['duplicate'])
        self.assertEqual(len(list(content_path('library').iterdir())), 1)
        different = self.upload(self.video('red'))
        self.assertNotEqual(original['id'], different['id'])
        private = self.upload(data, client=self.other)
        self.assertNotEqual(private['id'], original['id'])
        self.assertFalse(private.get('duplicate', False))

    def test_legacy_upload_backfill_duplicate_review_and_reference_protection(self):
        data = self.video()
        original = self.upload(data)
        with self.sessions() as db:
            row = db.get(ContentMedia, original['id'])
            row.metadata_json = {k:v for k,v in row.metadata_json.items() if k not in ('source_sha256','sha256','hash_size','hash_mtime_ns')}
            db.commit()
        self.assertTrue(self.upload(data)['duplicate'])
        import uuid
        key = uuid.uuid4().hex
        copied = content_path(f'library/{key}')
        shutil.copytree(content_path(original['local_path']).parent, copied)
        with self.sessions() as db:
            row = db.get(ContentMedia, original['id'])
            duplicate = ContentMedia(owner_id=row.owner_id, provider='upload', provider_id=key, favorite=True,
                metadata_json={**row.metadata_json, 'local_path':f'library/{key}/video.mp4'})
            db.add(duplicate); db.commit(); identifier = duplicate.id
        found = self.client.get('/api/studio/media/duplicates').json()
        self.assertEqual([item['id'] for item in found], [identifier])
        self.assertEqual(found[0]['duplicate_of'], original['id'])
        self.assertEqual(self.other.get('/api/studio/media/duplicates').json(), [])
        self.assertEqual(self.public.get('/api/studio/media/duplicates').status_code, 401)
        self.client.post(self.url+'/draft', json={'media_ids':[identifier]})
        self.assertEqual(self.client.delete(f'/api/studio/media/{identifier}').status_code, 409)
        self.assertTrue(copied.exists())
        self.client.delete(self.url)
        self.assertEqual(self.client.delete(f'/api/studio/media/{identifier}').status_code, 204)
        self.assertFalse(copied.exists())
        self.assertTrue(content_path(original['local_path']).is_file())

    def test_missing_original_is_not_treated_as_saved_duplicate(self):
        data = self.video()
        original = self.upload(data)
        content_path(original['local_path']).unlink()
        replacement = self.upload(data)
        self.assertNotEqual(original['id'], replacement['id'])
        self.assertTrue(content_path(replacement['local_path']).is_file())
