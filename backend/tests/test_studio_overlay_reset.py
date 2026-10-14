import io
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from app.services import studio_renderer as renderer

class OverlayResetTest(unittest.TestCase):
    def test_lyrics_survive_clip_color_metadata_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            def run(args):
                subprocess.run([renderer.ffmpeg(), '-v', 'error', '-y', *args], check=True, capture_output=True)
            for i in range(3):
                metadata = ['-colorspace', 'bt709', '-color_trc', 'bt709', '-color_primaries', 'bt709'] if i == 1 else []
                run(['-f', 'lavfi', '-i', 'color=black:s=108x192:r=30:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', *metadata, str(root / f'{i}.mp4')])
            run(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '3', str(root / 'audio.wav')])
            snapshot = dict(id=1, start_time=0, end_time=3, audio_path='audio.wav', aesthetic='original', lyric_style='minimal',
                text_style={'color':'#FFFFFF', 'font_size':60},
                lines=[{'text':f'Lyric {i}', 'start_time':i*.5, 'end_time':(i+1)*.5} for i in range(6)],
                clips=[{'media_id':i, 'media':{'provider':'upload', 'local_path':f'{i}.mp4'}, 'start_time':i, 'end_time':i+1, 'source_start':0} for i in range(3)])
            with patch.object(renderer, 'content_path', side_effect=lambda key:root/key), patch.object(renderer, 'audio_path', return_value=root/'audio.wav'):
                output = root / renderer.render(1, snapshot, lambda progress:None)
            for second in (.25, .75, 1.25, 1.75, 2.25, 2.75):
                frame = subprocess.run([renderer.ffmpeg(), '-v', 'error', '-ss', str(second), '-i', str(output), '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True, check=True).stdout
                bounds = Image.open(io.BytesIO(frame)).convert('L').point(lambda value:255 if value>100 else 0).getbbox()
                self.assertIsNotNone(bounds, f'Lyric disappeared at {second}s after clip metadata changed')
