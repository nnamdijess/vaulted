"""Retryable cleanup after library deletion; immutable active snapshots keep bytes alive."""
import re
import shutil
from sqlalchemy import select, text
from app.models.studio import MediaCleanup, ContentRenderJob, ContentMedia
from app.services.studio_storage import content_path


def cleanup_deleted_media(db):
    # A write lock serializes cleanup with render creation and media mutation.
    db.rollback()
    db.execute(text('BEGIN IMMEDIATE'))
    try:
        jobs = db.scalars(select(ContentRenderJob).where(ContentRenderJob.status.in_(['queued', 'rendering']))).all()
        pending_ids = {clip.get('media_id') for job in jobs for clip in job.snapshot.get('clips', [])}
        pending = {clip.get('media', {}).get('local_path') for job in jobs for clip in job.snapshot.get('clips', [])}
        for task in db.scalars(select(MediaCleanup)).all():
            path = task.directory + '/video.mp4'
            if path in pending or task.media_id in pending_ids:
                continue
            if any(m.metadata_json.get('local_path') == path for m in db.scalars(select(ContentMedia).where(ContentMedia.provider == 'upload'))):
                continue
            try:
                if not re.fullmatch(r'library/[0-9a-f]{32}', task.directory):
                    raise ValueError('Unexpected cleanup location')
                directory = content_path(task.directory)
                if directory.exists():
                    shutil.rmtree(directory)
                db.delete(task)
            except (OSError, ValueError):
                task.attempts += 1
                task.error = 'File cleanup pending; the worker will retry.'
        db.commit()
    except Exception:
        db.rollback()
        raise
