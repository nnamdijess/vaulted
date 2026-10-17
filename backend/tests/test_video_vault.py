import io
import wave
import unittest
from datetime import timedelta
from unittest.mock import patch
from sqlalchemy import select
from app.core.config import settings
from app.models.studio import ContentMedia, VaultInvite, VaultMember, MediaCleanup, ContentRenderJob
from app.models.music import utc_now
from app.services.media_cleanup import cleanup_deleted_media
import test_studio_improvements as existing


class VideoVaultTest(unittest.TestCase):
    media = existing.ImprovementsTest.media
    edit = existing.ImprovementsTest.edit
    register = existing.ImprovementsTest.register

    def setUp(self):
        existing.ImprovementsTest.setUp(self)
        self.admin_setting = patch.object(settings,'video_vault_admin_email','owner@example.com')
        self.admin_setting.start()

    def tearDown(self):
        self.admin_setting.stop()
        existing.ImprovementsTest.tearDown(self)

    def activate(self):
        response=self.client.post('/api/studio/vault')
        self.assertEqual(response.status_code,201,response.text)
        return response.json()['vault']['id']

    def invite(self,email='other@example.com'):
        response=self.client.post('/api/studio/vault/invites',json={'email':email})
        self.assertEqual(response.status_code,201,response.text)
        return response.json()['token']

    def join(self):
        token=self.invite()
        response=self.other.post('/api/studio/vault/accept',json={'token':token})
        self.assertEqual(response.status_code,200,response.text)
        return self.other.get('/api/auth/me').json()['id']

    def other_draft(self):
        music=self.other.post('/api/projects',json={'name':'Private music'}).json()
        data=io.BytesIO()
        with wave.open(data,'wb') as audio:
            audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(8000);audio.writeframes(b'\0\1'*24000)
        song=self.other.post(f"/api/projects/{music['id']}/tracks",files={'files':('song.wav',data.getvalue(),'audio/wav')}).json()[0]
        response=self.other.post('/api/studio/projects',json={'song_version_id':song['latest_version_id'],'title':'Member draft'})
        return f"/api/studio/projects/{response.json()['id']}"

    def test_activation_and_membership_never_share_music_or_drafts(self):
        mid,path=self.media()
        folder=self.client.post('/api/studio/folders',json={'name':'Night'}).json()['id']
        self.client.put(f'/api/studio/media/{mid}/folder',json={'folder_id':folder})
        self.assertEqual(self.other.post('/api/studio/vault').status_code,403)
        vault=self.activate()
        self.assertEqual(self.other.get('/api/studio/media/favorites').json(),[])
        self.join()
        clips=self.other.get('/api/studio/media/favorites').json()
        self.assertEqual([c['id'] for c in clips],[mid])
        self.assertEqual(clips[0]['vault_id'],vault)
        self.assertFalse(clips[0]['can_manage']);self.assertFalse(clips[0]['can_delete'])
        self.assertEqual(self.other.get(f'/api/studio/media/{mid}/video').status_code,200)
        self.assertEqual(self.other.get('/api/studio/folders').json()[0]['id'],folder)
        self.assertEqual(self.other.get(self.url).status_code,404)
        self.assertEqual(self.other.get('/api/studio/songs').json(),[])
        self.assertEqual(self.other.post('/api/studio/projects',json={'song_version_id':self.song['latest_version_id'],'title':'Steal'}).status_code,404)
        member_draft=self.other_draft()
        self.assertEqual(self.other.post(member_draft+'/draft',json={'media_ids':[mid]}).status_code,200)
        self.assertEqual(self.client.get(member_draft).status_code,404)
        self.assertTrue(path.exists())

    def test_contributions_folder_rules_and_deletion_permissions(self):
        mid,_=self.media(real=True)
        self.activate();self.join()
        folder=self.other.post('/api/studio/folders',json={'name':'Member folder'}).json()['id']
        self.assertEqual(self.client.post('/api/studio/folders',json={'name':'MEMBER FOLDER'}).status_code,409)
        self.assertEqual(self.other.put(f'/api/studio/folders/{folder}',json={'name':'Changed'}).status_code,403)
        self.assertEqual(self.other.delete(f'/api/studio/folders/{folder}').status_code,403)
        self.assertEqual(self.other.put(f'/api/studio/media/{mid}/folder',json={'folder_id':folder}).status_code,403)
        self.assertEqual(self.other.put(f'/api/studio/media/{mid}/details',json={'title':'bad','tags':''}).status_code,403)
        self.assertEqual(self.other.delete(f'/api/studio/media/{mid}').status_code,403)
        self.assertEqual(self.client.put(f'/api/studio/media/{mid}/folder',json={'folder_id':folder}).status_code,200)
        # Fresh bytes from member ingestion become shared and retain uploader ownership.
        from app.services.studio_storage import content_path,ffmpeg
        import subprocess
        p=content_path('member-fixture.mp4');p.parent.mkdir(parents=True,exist_ok=True)
        subprocess.run([ffmpeg(),'-v','error','-f','lavfi','-i','color=blue:s=108x192:r=30:d=1','-c:v','libx264',str(p)],check=True)
        payload={'file':('member.mp4',p.read_bytes(),'video/mp4')}
        response=self.other.post('/api/studio/media/upload',files=payload)
        self.assertEqual(response.status_code,201,response.text)
        contributed=response.json()
        self.assertTrue(contributed['vault_id']);self.assertTrue(contributed['can_manage']);self.assertFalse(contributed['can_delete'])
        self.assertEqual(self.other.put(f"/api/studio/media/{contributed['id']}/folder",json={'folder_id':folder}).status_code,200)
        self.assertEqual(self.other.delete(f"/api/studio/media/{contributed['id']}").status_code,403)
        duplicate=self.client.post('/api/studio/media/upload',files=payload).json()
        self.assertEqual(duplicate['id'],contributed['id']);self.assertTrue(duplicate['duplicate'])
        self.assertTrue(duplicate['can_delete'])

    def test_member_legacy_private_folders_remain_separate(self):
        private=self.other.post('/api/studio/folders',json={'name':'Private'}).json()['id']
        second=self.other.post('/api/studio/folders',json={'name':'Second private'}).json()['id']
        self.activate();self.join()
        shared=self.client.post('/api/studio/folders',json={'name':'Shared'}).json()['id']
        self.assertEqual(self.other.put(f'/api/studio/folders/{private}',json={'name':'Shared'}).status_code,200)
        self.assertEqual(self.other.put(f'/api/studio/folders/{second}',json={'name':'Shared'}).status_code,409)
        listed=self.other.get('/api/studio/folders').json()
        self.assertTrue(next(f for f in listed if f['id']==private)['can_manage'])
        self.assertFalse(next(f for f in listed if f['id']==shared)['can_manage'])
        self.assertNotIn(private,[f['id'] for f in self.client.get('/api/studio/folders').json()])

    def test_removal_retains_drafts_but_admin_deletion_replaces_every_reference(self):
        mid,path=self.media(real=True)
        self.activate();uid=self.join()
        other_url=self.other_draft()
        for client,url in ((self.client,self.url),(self.other,other_url)):
            client.patch(url,json={'title':'Draft','start_time':0,'end_time':3,'lyrics_text':'Keep lyrics','aesthetic':'nature','lyric_style':'minimal'})
            client.put(url+'/timings',json={'starts':[0]})
            client.post(url+'/draft',json={'media_ids':[mid]})
        before=self.other.get(other_url).json()
        self.assertEqual(self.client.delete(f'/api/studio/vault/members/{uid}').status_code,204)
        self.assertEqual(self.other.get('/api/studio/media/favorites').json(),[])
        self.assertEqual(self.other.get('/api/studio/folders').json(),[])
        self.assertEqual(self.other.get(f'/api/studio/media/{mid}/video').status_code,200)
        self.assertEqual(self.other.post(other_url+'/draft',json={'media_ids':[mid]}).status_code,404)
        self.assertEqual(self.other.put(f"{other_url}/clips/{before['clips'][0]['id']}",json={'media_id':mid}).status_code,404)
        # Existing timeline references can still be saved and rendered.
        saved=self.other.put(other_url+'/timeline',json={'revision':before['revision'],'clips':[{'media_id':mid,'duration':3,'source_start':0}]}).json()
        job=self.other.post(other_url+'/renders').json()
        with self.sessions() as db:
            snapshot=db.get(ContentRenderJob,job['id']).snapshot
        self.assertEqual(self.client.delete(f'/api/studio/media/{mid}').status_code,204)
        self.assertTrue(path.exists())
        after=self.other.get(other_url).json()
        self.assertEqual(after['lines'],before['lines'])
        self.assertEqual(after['clips'][0]['end_time'],3)
        self.assertEqual(after['clips'][0]['media']['provider'],'placeholder')
        self.assertEqual(self.client.get(self.url).json()['clips'][0]['media']['provider'],'placeholder')
        self.assertEqual(self.other.get(f'/api/studio/media/{mid}/video').status_code,404)
        with self.sessions() as db:
            self.assertEqual(db.get(ContentRenderJob,job['id']).snapshot,snapshot)
        with patch('app.studio_worker.SessionLocal',self.sessions):
            from app.studio_worker import process_one
            self.assertTrue(process_one())
        self.assertEqual(self.other.get(other_url+f"/renders/{job['id']}").json()['status'],'completed')
        self.assertFalse(path.exists())
        self.assertEqual(self.other.put(other_url+'/timeline',json={'revision':saved['revision'],'clips':[{'media_id':mid,'duration':3}]}).status_code,409)
        self.assertEqual(self.other.post(other_url+'/renders').status_code,202)

    def test_invites_email_expiry_revocation_replay_and_owner_only(self):
        self.activate()
        self.assertEqual(self.other.post('/api/studio/vault/invites',json={'email':'someone@example.com'}).status_code,403)
        wrong=self.invite('different@example.com')
        self.assertEqual(self.other.post('/api/studio/vault/accept',json={'token':wrong}).status_code,403)
        old=self.invite();new=self.invite()
        self.assertEqual(self.other.post('/api/studio/vault/accept',json={'token':old}).status_code,403)
        with self.sessions() as db:
            for item in db.scalars(select(VaultInvite)):item.expires_at=utc_now()-timedelta(days=1)
            db.commit()
        self.assertEqual(self.other.post('/api/studio/vault/accept',json={'token':new}).status_code,403)
        token=self.invite()
        item=self.client.get('/api/studio/vault').json()['vault']['invites'][0]
        self.client.delete(f"/api/studio/vault/invites/{item['id']}")
        self.assertEqual(self.other.post('/api/studio/vault/accept',json={'token':token}).status_code,403)
        token=self.invite()
        self.assertEqual(self.other.post('/api/studio/vault/accept',json={'token':token}).status_code,200)
        self.assertEqual(self.other.post('/api/studio/vault/accept',json={'token':token}).status_code,403)
        self.assertEqual(self.other.get('/api/studio/vault').json()['vault']['members'],[])
        self.assertEqual(self.other.delete('/api/studio/vault/members/1').status_code,403)
        self.assertEqual(self.public.get('/api/studio/vault').status_code,401)
