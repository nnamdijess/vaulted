"""Run separately: python -m app.studio_worker. One worker per content directory."""
import logging
import time
from contextlib import contextmanager
from sqlalchemy import select, update
from app.db.session import Base, engine, SessionLocal
from app.db.migrations import upgrade_local_database
from app.models.auth import User  # noqa: F401 register related tables
from app.models.studio import ContentProject, ContentRenderJob
from app.services.studio_storage import content_path
from app.services.studio_renderer import render


@contextmanager
def worker_lock():
    """OS-released exclusive lock makes restart recovery safe, including after a crash."""
    import os
    path = content_path('worker.lock')
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+b') as handle:
        handle.seek(0)
        if os.name == 'nt':
            import msvcrt
            if path.stat().st_size == 0:
                handle.write(b'0')
                handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == 'nt':
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def process_one():
    with SessionLocal() as db:
        job = db.scalar(select(ContentRenderJob).where(ContentRenderJob.status == 'queued').order_by(ContentRenderJob.id).limit(1))
        if not job:
            return False
        identifier, snapshot = job.id, job.snapshot
        claimed = db.execute(update(ContentRenderJob).where(ContentRenderJob.id == identifier, ContentRenderJob.status == 'queued').values(status='rendering', progress=0))
        db.commit()
        if not claimed.rowcount:
            return True
    def progress(value):
        with SessionLocal() as db:
            db.execute(update(ContentRenderJob).where(ContentRenderJob.id == identifier).values(progress=value))
            db.commit()
    try:
        key = render(identifier, snapshot, progress)
        status, error = 'completed', None
    except Exception:
        # No API keys/provider URLs appear in user-visible errors or logs.
        logging.error('Studio render %s failed', identifier)
        key, status = None, 'failed'
        error = 'Render failed. Check FFmpeg (H.264/AAC/libass), available disk space and stock-video access, then retry.'
    with SessionLocal() as db:
        job = db.get(ContentRenderJob, identifier)
        job.status, job.error, job.output_path = status, error, key
        if status == 'completed':
            job.progress = 100
        project = db.get(ContentProject, job.content_project_id)
        if project.revision == snapshot['revision']:
            project.status = status
        db.commit()
    return True


def main():
    Base.metadata.create_all(engine)
    upgrade_local_database(engine)
    with worker_lock():
        with SessionLocal() as db:
            db.execute(update(ContentRenderJob).where(ContentRenderJob.status == 'rendering').values(status='queued', progress=0))
            db.commit()
        print('Studio worker ready. Keep this process running for exports.', flush=True)
        while True:
            if not process_one():
                time.sleep(2)


if __name__ == '__main__':
    main()
