"""Preview uses the same canonical raster pixels as the MP4 overlay."""
import json
from functools import lru_cache
from threading import BoundedSemaphore
from app.services.studio_layout import raster
_slots = BoundedSemaphore(2)

def lyric_png(text, style, preset, output_format='9:16'):
    with _slots:
        return _cached_png(text, json.dumps(style, sort_keys=True), preset, output_format)

@lru_cache(maxsize=64)
def _cached_png(text, serialized, preset, output_format):
    return raster(text, json.loads(serialized), preset, output_format)
