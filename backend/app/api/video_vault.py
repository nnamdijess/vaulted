import hashlib
import secrets
from datetime import timedelta
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func
from app.api.music import Database, lock_track_order
from app.core.config import settings
from app.models.auth import User
from app.models.music import utc_now
from app.models.studio import VideoVault, VaultMember, VaultInvite, ContentMedia, MediaFolder
from app.services.video_vault import current_vault

router = APIRouter(prefix='/studio/vault', tags=['video-vault'])


def admin(db):
    vault = current_vault(db)
    if not vault or vault.owner_id != db.info['owner_id']:
        raise HTTPException(403, 'Only the vault owner can do this.')
    return vault


@router.get('')
def status(db: Database):
    user = db.get(User, db.info['owner_id'])
    vault = current_vault(db)
    result = {'can_create':user.email.casefold() == settings.video_vault_admin_email.casefold(), 'vault':None}
    if vault:
        owner = vault.owner_id == user.id
        result['vault'] = {'id':vault.id, 'name':vault.name, 'is_owner':owner,
            'clip_count':db.scalar(select(func.count()).select_from(ContentMedia).where(ContentMedia.vault_id == vault.id)),
            'members':[], 'invites':[]}
        if owner:
            result['vault']['members'] = [{'id':u.id,'name':u.display_name,'email':u.email} for u in db.scalars(
                select(User).join(VaultMember, VaultMember.user_id == User.id).where(VaultMember.vault_id == vault.id))]
            result['vault']['invites'] = [{'id':i.id,'email':i.email,'expires_at':i.expires_at} for i in db.scalars(
                select(VaultInvite).where(VaultInvite.vault_id == vault.id, VaultInvite.used.is_(False), VaultInvite.revoked.is_(False), VaultInvite.expires_at > utc_now()))]
    return result


@router.post('', status_code=201)
def create(db: Database):
    lock_track_order(db)
    user = db.get(User, db.info['owner_id'])
    if user.email.casefold() != settings.video_vault_admin_email.casefold():
        raise HTTPException(403, 'Only the configured admin can create the Video Vault.')
    if current_vault(db):
        raise HTTPException(409, 'You already belong to a vault.')
    vault = VideoVault(owner_id=user.id, name='Video Vault')
    db.add(vault)
    db.flush()
    for media in db.scalars(select(ContentMedia).where(ContentMedia.owner_id == user.id, ContentMedia.provider == 'upload', ContentMedia.vault_id.is_(None))):
        media.vault_id = vault.id
    for folder in db.scalars(select(MediaFolder).where(MediaFolder.owner_id == user.id, MediaFolder.vault_id.is_(None))):
        folder.vault_id = vault.id
    db.commit()
    return status(db)


class Invitation(BaseModel):
    email: EmailStr


@router.post('/invites', status_code=201)
def invite(data: Invitation, db: Database):
    lock_track_order(db)
    vault = admin(db)
    email = str(data.email).strip().casefold()
    if email == db.get(User,vault.owner_id).email.casefold():
        raise HTTPException(422, 'You already own this vault.')
    for old in db.scalars(select(VaultInvite).where(VaultInvite.vault_id == vault.id, VaultInvite.email == email, VaultInvite.used.is_(False))):
        old.revoked = True
    token = secrets.token_urlsafe(32)
    entry = VaultInvite(vault_id=vault.id, email=email, token_hash=hashlib.sha256(token.encode()).hexdigest(), expires_at=utc_now()+timedelta(days=7))
    db.add(entry)
    db.commit()
    return {'token':token,'expires_at':entry.expires_at}


class Acceptance(BaseModel):
    token: str = Field(min_length=43,max_length=43)


@router.post('/accept')
def accept(data: Acceptance, db: Database):
    lock_track_order(db)
    invitation = db.scalar(select(VaultInvite).where(VaultInvite.token_hash == hashlib.sha256(data.token.encode()).hexdigest(),
        VaultInvite.used.is_(False), VaultInvite.revoked.is_(False), VaultInvite.expires_at > utc_now()))
    user = db.get(User,db.info['owner_id'])
    if not invitation or invitation.email != user.email.casefold():
        raise HTTPException(403, 'This invite is expired, already used, or for a different email address.')
    if current_vault(db):
        raise HTTPException(409, 'You already belong to a vault.')
    db.add(VaultMember(vault_id=invitation.vault_id,user_id=user.id))
    invitation.used = True
    db.commit()
    return status(db)


@router.delete('/invites/{identifier}', status_code=204)
def revoke(identifier: int, db: Database):
    lock_track_order(db)
    vault = admin(db)
    item = db.get(VaultInvite, identifier)
    if not item or item.vault_id != vault.id:
        raise HTTPException(404, 'Invite not found')
    item.revoked = True
    db.commit()
    return Response(status_code=204)


@router.delete('/members/{identifier}', status_code=204)
def remove_member(identifier: int, db: Database):
    lock_track_order(db)
    vault = admin(db)
    member = db.scalar(select(VaultMember).where(VaultMember.vault_id == vault.id,VaultMember.user_id == identifier))
    if not member:
        raise HTTPException(404, 'Member not found')
    # Any unaccepted invitation must not immediately restore removed access.
    email = db.get(User, identifier).email.casefold()
    for invitation in db.scalars(select(VaultInvite).where(VaultInvite.vault_id == vault.id,VaultInvite.email == email)):
        invitation.revoked = True
    db.delete(member)
    db.commit()
    return Response(status_code=204)
