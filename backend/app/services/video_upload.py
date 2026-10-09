"""Private, bounded video ingestion; normalize phone codecs for browser playback."""
import re
import shutil
import subprocess
import uuid
import threading
from pathlib import Path
from fastapi import HTTPException
from app.core.config import settings
from app.services.studio_storage import content_path, ffmpeg

_processing = threading.BoundedSemaphore(1)


def ingest_video(upload):
    if not _processing.acquire(blocking=False):
        raise HTTPException(503, 'Another video is being prepared. Please try again shortly.')
    try:
        return _ingest_video(upload)
    finally:
        _processing.release()


def _ingest_video(upload):
    suffix = Path(upload.filename or '').suffix.lower()
    if suffix not in {'.mp4', '.mov', '.m4v', '.webm', '.gif'}:
        raise HTTPException(422, 'Choose an MP4, MOV, M4V, WebM or animated GIF.')
    identifier = uuid.uuid4().hex
    directory = content_path(f'library/{identifier}')
    directory.mkdir(parents=True)
    source = directory / f'source{suffix}'
    try:
        total = 0
        with source.open('wb') as output:
            while chunk := upload.file.read(65536):
                total += len(chunk)
                if total > settings.max_upload_bytes:
                    raise HTTPException(413, 'Video exceeds the upload size limit (250 MiB by default).')
                output.write(chunk)
        # Force a self-contained container, rather than accepting playlists or URLs.
        container = {'.webm': 'matroska', '.gif': 'gif'}.get(suffix, 'mov')
        # Import one animation cycle, regardless of an infinite GIF loop flag.
        input_options = ['-ignore_loop', '1'] if suffix == '.gif' else []
        probe = subprocess.run([ffmpeg(), '-hide_banner', '-nostdin', '-protocol_whitelist', 'file,pipe',
                                '-f', container, *input_options, '-i', str(source)], capture_output=True, timeout=10)
        match = re.search(rb'Duration: (\d+):(\d+):(\d+\.\d+)', probe.stderr)
        if not match or b'Video:' not in probe.stderr:
            raise HTTPException(422, 'This file does not contain a readable video.')
        h, m, s = map(float, match.groups())
        duration = h * 3600 + m * 60 + s
        if not 0 < duration <= 600:
            raise HTTPException(422, 'Upload clips up to 10 minutes long.')
        result = subprocess.run([ffmpeg(), '-v', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file,pipe',
            '-f', container, *input_options, '-i', str(source), '-map', '0:v:0', '-an', '-sn', '-dn',
            '-vf', "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
            '-threads', '2', '-movflags', '+faststart', str(directory / 'video.mp4')],
            capture_output=True, timeout=90)
        if result.returncode:
            raise HTTPException(422, 'Could not convert this video. Try another file.')
        result = subprocess.run([ffmpeg(), '-v', 'error', '-nostdin', '-y', '-i', str(directory / 'video.mp4'),
            '-frames:v', '1', '-vf', 'scale=320:-2', str(directory / 'poster.jpg')], capture_output=True, timeout=10)
        if result.returncode:
            raise HTTPException(422, 'Could not create the video preview.')
        source.unlink()
        return identifier, {'provider': 'upload', 'provider_id': identifier, 'duration': duration,
            'title': Path(upload.filename).stem[:200], 'tags': '',
            'local_path': f'library/{identifier}/video.mp4', 'source_url': ''}
    except (OSError, subprocess.SubprocessError):
        shutil.rmtree(directory, ignore_errors=True)
        raise HTTPException(422, 'Video processing failed or timed out. Try a shorter clip.') from None
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise
