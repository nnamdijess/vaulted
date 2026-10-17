"""Shared footage authorization. Music and draft ownership never change."""
from fastapi import HTTPException
from sqlalchemy import select, or_, and_
from app.models.auth import User
from app.models.studio import VideoVault, VaultMember, ContentMedia, ContentClip, ContentProject


def current_vault(db):
    uid = db.info['owner_id']
    return db.scalar(select(VideoVault).where(or_(VideoVault.owner_id == uid,
        VideoVault.id.in_(select(VaultMember.vault_id).where(VaultMember.user_id == uid)))))


def visible_scope(db, model):
    vault = current_vault(db)
    private = and_(model.owner_id == db.info['owner_id'], model.vault_id.is_(None))
    return or_(private, model.vault_id == vault.id) if vault else private


def can_manage(db, item, delete=False):
    uid = db.info['owner_id']
    if item.vault_id is None:
        return item.owner_id == uid
    vault = current_vault(db)
    return bool(vault and vault.id == item.vault_id and
                (vault.owner_id == uid or (not delete and item.owner_id == uid)))


def media_access(db, identifier, retained_project=None, stream=False):
    media = db.get(ContentMedia, identifier)
    if media is None:
        raise HTTPException(404, 'Footage not found')
    if db.scalar(select(ContentMedia.id).where(ContentMedia.id == identifier, visible_scope(db, ContentMedia))):
        return media
    # Removed members may preview/render/edit references already in their own draft,
    # but cannot browse, select the source for a new draft, or mutate the library.
    if retained_project is not None or stream:
        query = select(ContentClip.id).join(ContentProject).where(
            ContentClip.media_id == identifier, ContentProject.owner_id == db.info['owner_id'])
        if retained_project is not None:
            query = query.where(ContentProject.id == retained_project)
        if db.scalar(query.limit(1)):
            return media
    raise HTTPException(404, 'Footage not found')


def media_view(db, media):
    uploader = db.get(User, media.owner_id)
    return {**media.metadata_json, 'id':media.id, 'folder_id':media.folder_id,
            'favorite':media.favorite, 'vault_id':media.vault_id,
            'uploaded_by':uploader.display_name if uploader else 'Member',
            'can_manage':can_manage(db, media), 'can_delete':can_manage(db, media, delete=True)}
