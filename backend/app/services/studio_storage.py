import json
import math
import subprocess
from pathlib import Path
import imageio_ffmpeg
from fastapi import HTTPException
from app.core.config import settings
from app.services.storage import audio_path


def content_path(key: str) -> Path:
    root = settings.content_dir.resolve()
    path = (root / key).resolve()
    if not path.is_relative_to(root) or path == root:
        raise ValueError('Invalid content path')
    return path


def ffmpeg() -> str:
    return settings.ffmpeg_binary or imageio_ffmpeg.get_ffmpeg_exe()


def duration(version) -> float:
    """Probe once per immutable upload. Never decode the full song into memory."""
    cache = content_path(f'metadata/{version.file_path}.json')
    try:
        value = json.loads(cache.read_text())['duration']
        if math.isfinite(value) and value > 0:
            return value
    except (OSError, ValueError, KeyError, TypeError):
        pass
    try:
        result = subprocess.run([settings.ffprobe_binary, '-v', 'error', '-protocol_whitelist', 'file,pipe',
                                 '-show_entries', 'format=duration', '-of', 'json', str(audio_path(version.file_path))],
                                capture_output=True, timeout=20, check=True)
        value = float(json.loads(result.stdout)['format']['duration'])
        if not math.isfinite(value) or value <= 0:
            raise ValueError()
    except (OSError, subprocess.SubprocessError, ValueError, KeyError):
        # Bundled FFmpeg can inspect common audio even if ffprobe isn't installed.
        import re
        try:
            result = subprocess.run([ffmpeg(), '-hide_banner', '-protocol_whitelist', 'file,pipe', '-i', str(audio_path(version.file_path))],
                                    capture_output=True, timeout=20)
            match = re.search(rb'Duration: (\d+):(\d+):(\d+\.\d+)', result.stderr)
            if not match:
                raise ValueError()
            h, m, s = map(float, match.groups())
            value = h * 3600 + m * 60 + s
            if value <= 0:
                raise ValueError()
        except (OSError, subprocess.SubprocessError, ValueError):
            raise HTTPException(422, 'Cannot read audio duration. Check FFmpeg/FFprobe and this audio file.') from None
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({'duration': value}))
    return value
