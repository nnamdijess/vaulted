import unittest
import subprocess
from app.services.studio_renderer import ffmpeg_time
from app.services.studio_storage import ffmpeg

class RenderTimestampTest(unittest.TestCase):
    def test_rounding_residue_is_accepted_by_real_ffmpeg(self):
        for value in (3.3306690738754696e-16, -3.3306690738754696e-16, 0.00001, 0.05):
            result = subprocess.run([ffmpeg(), '-hide_banner', '-loglevel', 'error',
                '-f', 'lavfi', '-i', 'color=size=16x16:rate=30:duration=0.2',
                '-ss', ffmpeg_time(value), '-t', ffmpeg_time(0.1), '-f', 'null', '-'],
                capture_output=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
    def test_invalid_timestamps_are_rejected_and_precision_retained(self):
        self.assertEqual(ffmpeg_time(12.3456784), '12.345678')
        for value in (float('nan'), float('inf'), -1):
            with self.assertRaises(ValueError): ffmpeg_time(value)
