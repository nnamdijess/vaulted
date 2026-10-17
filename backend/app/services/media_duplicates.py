"""Exact-content matching within the user's accessible footage library."""
import hashlib
import re
from pathlib import Path
from fastapi import HTTPException
from sqlalchemy import select
from app.core.config import settings
from app.models.studio import ContentMedia
from app.services.studio_storage import content_path
from app.services.video_vault import visible_scope, media_view


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def uploaded_path(media):
    expected = f'library/{media.provider_id}/video.mp4'
    if not re.fullmatch(r'[0-9a-f]{32}', media.provider_id) or media.metadata_json.get('local_path') != expected:
        return None
    path = content_path(expected)
    return path if path.is_file() else None


def uploads(db):
    return db.scalars(select(ContentMedia).where(visible_scope(db, ContentMedia), ContentMedia.provider == 'upload').order_by(ContentMedia.id)).all()


def upload_digest(upload):
    if Path(upload.filename or '').suffix.lower() not in {'.mp4', '.mov', '.m4v', '.webm', '.gif'}:
        raise HTTPException(422, 'Choose an MP4, MOV, M4V, WebM or animated GIF.')
    value, size = hashlib.sha256(), 0
    try:
        while chunk := upload.file.read(65536):
            size += len(chunk)
            if size > settings.max_upload_bytes:
                raise HTTPException(413, 'Video exceeds the upload size limit (250 MiB by default).')
            value.update(chunk)
        return value.hexdigest()
    finally:
        upload.file.seek(0)


def source_match(db, value):
    return next((media for media in uploads(db) if media.metadata_json.get('source_sha256') == value and uploaded_path(media) is not None), None)


def stored_digest(media, path):
    stat = path.stat()
    metadata = media.metadata_json
    if metadata.get('sha256') and metadata.get('hash_size') == stat.st_size and metadata.get('hash_mtime_ns') == stat.st_mtime_ns:
        return metadata['sha256']
    value = digest(path)
    media.metadata_json = {**metadata, 'sha256': value, 'hash_size': stat.st_size, 'hash_mtime_ns': stat.st_mtime_ns}
    return value


def find_match(db, metadata):
    """Backfill old clips lazily; size rules out most candidates without reading them."""
    new_path = content_path(metadata['local_path'])
    size = new_path.stat().st_size
    value = digest(new_path)
    for media in uploads(db):
        path = uploaded_path(media)
        if path is None:
            continue
        if metadata.get('source_sha256') == media.metadata_json.get('source_sha256') and metadata.get('source_sha256'):
            return media
        if path.stat().st_size == size and stored_digest(media, path) == value:
            if not media.metadata_json.get('source_sha256'):
                media.metadata_json = {**media.metadata_json, 'source_sha256': metadata.get('source_sha256')}
            return media
    metadata.update(sha256=value, hash_size=size, hash_mtime_ns=new_path.stat().st_mtime_ns)
    return None


def duplicate_copies(db):
    """Keep the oldest existing copy. Never remove records or rewrite references."""
    seen, copies = {}, []
    for media in uploads(db):
        path = uploaded_path(media)
        if path is None:
            continue
        value = stored_digest(media, path)
        if value in seen:
            copies.append({**media_view(db, media), 'duplicate_of': seen[value]})
        else:
            seen[value] = media.id
    return copies
