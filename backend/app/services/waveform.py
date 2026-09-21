"""Bounded, disk-cached mono peaks. Authorization stays in the HTTP handlers."""
import array
import json
import math
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

from fastapi import HTTPException
from imageio_ffmpeg import get_ffmpeg_exe
from app.services.storage import audio_path, storage_root

_decode_slots = threading.BoundedSemaphore(2)


def waveform(version):
    demuxers = {'.wav': 'wav', '.mp3': 'mp3', '.m4a': 'mov', '.flac': 'flac', '.aac': 'aac', '.ogg': 'ogg', '.opus': 'ogg', '.aif': 'aiff', '.aiff': 'aiff'}
    source = audio_path(version.file_path)
    if not source.is_file():
        raise HTTPException(404, 'Audio file not found')
    root = storage_root() / 'waveforms'
    root.mkdir(parents=True, exist_ok=True)
    cache = root / (source.name + '.json')
    if cache.is_file():
        try:
            return json.loads(cache.read_text())
        except (OSError, ValueError):
            pass
    if not _decode_slots.acquire(blocking=False):
        raise HTTPException(503, 'Waveform generator is busy; playback is still available')
    try:
        # Temporary PCM is capped at ~29 MB and never held entirely in RAM.
        with tempfile.TemporaryFile() as pcm:
            try:
                result = subprocess.run([
                    get_ffmpeg_exe(), '-nostdin', '-threads', '1', '-v', 'error', '-protocol_whitelist', 'file,pipe',
                    '-f', demuxers.get(source.suffix.lower(), 'wav'), '-i', str(source), '-map', '0:a:0', '-vn', '-t', '1801',
                    '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1',
                ], stdout=pcm, stderr=subprocess.DEVNULL, timeout=60,
                   creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0)
            except (OSError, RuntimeError, subprocess.TimeoutExpired):
                raise HTTPException(422, 'Waveform unavailable for this file; playback is still available') from None
            frames = pcm.tell() // 2
            if result.returncode or not frames or frames > 1800 * 8000:
                raise HTTPException(422, 'Waveform unavailable (unsupported audio or longer than 30 minutes)')
            pcm.seek(0)
            width = math.ceil(frames / 240)
            peaks = []
            while chunk := pcm.read(width * 2):
                samples = array.array('h', chunk)
                if sys.byteorder != 'little':
                    samples.byteswap()
                peaks.append(round(max(abs(s) for s in samples) / 32768, 5))
            data = {'peaks': peaks, 'duration': frames / 8000}
        # Atomically publish a complete derived cache file.
        with tempfile.NamedTemporaryFile(mode='w', dir=root, suffix='.tmp', delete=False) as output:
            temporary = Path(output.name)
            json.dump(data, output)
        try:
            if not cache.exists():
                temporary.replace(cache)
        except OSError:
            # Another request may already be publishing/reading this cache on Windows.
            # Caching is optional; the computed peaks are still usable.
            pass
        finally:
            temporary.unlink(missing_ok=True)
        return data
    finally:
        _decode_slots.release()
