"""Small on-demand thumbnails for existing and newly completed exports."""
import subprocess
import tempfile
from pathlib import Path
from threading import BoundedSemaphore
from app.services.studio_storage import ffmpeg
_slots = BoundedSemaphore(1)

def render_poster(video: Path) -> Path:
    poster = video.with_suffix('.jpg')
    with _slots:
        if poster.is_file():
            return poster
        with tempfile.NamedTemporaryFile(dir=video.parent, suffix='.jpg', delete=False) as handle:
            temporary = Path(handle.name)
        try:
            result = subprocess.run([ffmpeg(), '-v', 'error', '-nostdin', '-y', '-i', str(video),
                '-frames:v', '1', '-vf', 'scale=240:-2', '-threads', '1', '-filter_threads', '1',
                str(temporary)], capture_output=True, timeout=20)
            if result.returncode or not temporary.stat().st_size:
                raise RuntimeError('Thumbnail unavailable')
            temporary.replace(poster)
            return poster
        finally:
            temporary.unlink(missing_ok=True)
