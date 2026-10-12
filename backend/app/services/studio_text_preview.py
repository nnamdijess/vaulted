"""Preview lyrics with the exact libass pipeline used by exports."""
import tempfile
import json
from functools import lru_cache
from threading import BoundedSemaphore
_slots = BoundedSemaphore(2)
from pathlib import Path
import subprocess
from app.services.studio_renderer import subtitles
from app.services.studio_storage import ffmpeg
from app.services.studio_fonts import FONT_DIR


def lyric_png(text, style, preset):
    with _slots:
        return _cached_png(text, json.dumps(style, sort_keys=True), preset)


@lru_cache(maxsize=64)
def _cached_png(text, serialized, preset):
    style = json.loads(serialized)
    import shutil
    with tempfile.TemporaryDirectory(prefix='vaulted-text-') as folder:
        root = Path(folder)
        # One font is sufficient; named fallback matches the export's default.
        from app.services.studio_fonts import FONT_FILES
        fonts = root / 'fonts'
        fonts.mkdir()
        name = FONT_FILES.get(style.get('font'), 'Montserrat-Variable.ttf')
        if name:
            shutil.copy2(FONT_DIR / name, fonts / name)
        snapshot = {'lyric_style': preset, 'text_style': style,
                    'lines': [{'text': text, 'start_time': 0, 'end_time': 1}]}
        (root / 'lyrics.ass').write_text(subtitles(snapshot), encoding='utf-8')
        result = subprocess.run([ffmpeg(), '-v', 'error', '-nostdin', '-f', 'lavfi', '-i',
            'color=c=black@0.0:s=1080x1920:r=1,format=rgba', '-vf',
            'subtitles=lyrics.ass:fontsdir=fonts:alpha=1', '-frames:v', '1', '-threads', '1',
            '-f', 'image2pipe', '-vcodec', 'png', '-'], cwd=root, capture_output=True, timeout=15)
        if result.returncode:
            raise RuntimeError('Text preview could not render')
        return result.stdout
