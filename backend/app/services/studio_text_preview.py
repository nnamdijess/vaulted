"""Preview uses the same canonical raster pixels as the MP4 overlay."""
import json
from functools import lru_cache
from threading import BoundedSemaphore
from app.services.studio_layout import raster
_slots = BoundedSemaphore(2)

def lyric_png(text, style, preset):
    with _slots:
        return _cached_png(text, json.dumps(style, sort_keys=True), preset)

@lru_cache(maxsize=64)
def _cached_png(text, serialized, preset):
    return raster(text, json.loads(serialized), preset)
