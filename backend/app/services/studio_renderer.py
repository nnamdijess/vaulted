"""Bounded FFmpeg pipeline. All paths and arguments originate on the server."""
import math
import shutil
import subprocess
from app.services.studio_storage import content_path, ffmpeg
from app.services.storage import audio_path
from app.services.visual_provider import download_video
from app.services.studio_fonts import FONT_DIR, FONTS


def ffmpeg_time(seconds):
    """FFmpeg duration arguments require decimal notation, not float exponents."""
    value = float(seconds)
    if not math.isfinite(value) or value < -0.000001:
        raise ValueError('Invalid render timestamp')
    return f'{max(0.0, value):.6f}'


def ass_time(seconds):
    ticks = round(seconds * 100)
    return f'{ticks // 360000}:{ticks // 6000 % 60:02}:{ticks // 100 % 60:02}.{ticks % 100:02}'


def subtitles(snapshot):
    style = snapshot['lyric_style']
    custom = snapshot.get('text_style') or {}
    size = custom.get('font_size') or (72 if style == 'large' else 48)
    position = custom.get('position') or ('bottom' if style == 'lower' else 'middle')
    alignment = {'top': 7, 'middle': 4, 'bottom': 1}[position] + {'left': 0, 'center': 1, 'right': 2}.get(custom.get('align'), 1)
    color = custom.get('color', '#FFFF80' if style == 'highlight' else '#FFFFFF').lstrip('#')
    primary = f'&H00{color[4:6]}{color[2:4]}{color[0:2]}'.upper()
    font = FONTS.get(custom.get('font'), 'DejaVu Sans')
    bold, italic, underline = (-1 if custom.get(key, False) else 0 for key in ('bold', 'italic', 'underline'))
    spacing = custom.get('letter_spacing', 0) * size
    margin = round(1080 * (100 - custom.get('text_width', 82)) / 200)
    header = f'''[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font},{size},{primary},&H00FFFFFF,&H00101010,&H80000000,{bold},{italic},{underline},0,100,100,{spacing},0,1,2,2,{alignment},{margin},{margin},350,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
    for line in snapshot['lines']:
        # Prevent ASS override tags/escapes; lyrics are plain text, not markup.
        text = line['text'].replace('\\', '＼').replace('{', '｛').replace('}', '｝').replace('\r', '').replace('\n', ' ')
        header += f"Dialogue: 0,{ass_time(line['start_time'])},{ass_time(line['end_time'])},Default,,0,0,0,,{text}\n"
    return header


def command(arguments, cwd, timeout=600):
    result = subprocess.run([ffmpeg(), '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', *arguments],
                            cwd=cwd, capture_output=True, timeout=timeout)
    if result.returncode:
        # Deliberately exclude stderr: source URLs and local paths are private.
        raise RuntimeError('FFmpeg could not render this media. Check codec and libass support.')


def render(job_id, snapshot, update_progress):
    project_id = snapshot['id']
    work = content_path(f'projects/{project_id}/temp/{job_id}')
    work.mkdir(parents=True, exist_ok=True)
    output_key = f'projects/{project_id}/renders/{job_id}.mp4'
    output = content_path(output_key)
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        files = []
        for index, clip in enumerate(snapshot['clips']):
            media = clip['media']
            stock = content_path(f"projects/{project_id}/stock/{clip['media_id']}.mp4")
            if media.get('provider') == 'upload':
                stock = content_path(media['local_path'])
            elif not stock.is_file():
                download_video(media['video_url'], stock)
            filename = f'clip-{index}.mp4'
            treatment = ',hue=s=0' if snapshot.get('render_aesthetic', snapshot['aesthetic']) == 'black-white' else ''
            command(['-protocol_whitelist', 'file,pipe', *(['-stream_loop', '-1'] if clip.get('loop_source', True) else []), '-ss', ffmpeg_time(clip['source_start']), '-f', 'mov', '-i', str(stock),
                     '-t', ffmpeg_time(clip['end_time'] - clip['start_time']), '-an',
                     '-vf', framing_filter(clip.get('framing') or {}) + f',setsar=1,fps=30{treatment}',
                     '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-threads', '2', filename], work)
            files.append(f"file '{filename}'")
            update_progress(int(70 * (index + 1) / len(snapshot['clips'])))
        (work / 'clips.txt').write_text('\n'.join(files), encoding='utf-8')
        (work / 'lyrics.ass').write_text(subtitles(snapshot), encoding='utf-8')
        args = ['-protocol_whitelist', 'file,pipe', '-f', 'concat', '-safe', '1', '-i', 'clips.txt',
                '-ss', ffmpeg_time(snapshot['start_time']), '-protocol_whitelist', 'file,pipe', '-i', str(audio_path(snapshot['audio_path'])),
                '-map', '0:v:0', '-map', '1:a:0', '-t', ffmpeg_time(snapshot['end_time'] - snapshot['start_time'])]
        if snapshot['lines']:
            shutil.copytree(FONT_DIR, work / 'fonts', dirs_exist_ok=True)
            args += ['-vf', 'subtitles=lyrics.ass:fontsdir=fonts']
        args += ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-threads', '2',
                 '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'export.mp4']
        command(args, work, timeout=900)
        update_progress(95)
        (work / 'export.mp4').replace(output)
        return output_key
    finally:
        shutil.rmtree(work, ignore_errors=True)


def framing_filter(frame):
    # Same normalized free-space coordinates as the browser's object-position.
    zoom = frame.get('zoom', 1)
    x, y = frame.get('x', 0.5), frame.get('y', 0.5)
    fit = frame.get('mode', 'fill') == 'fit'
    mode = 'decrease' if fit else 'increase'
    width, height = round(1080 * zoom / 2) * 2, round(1920 * zoom / 2) * 2
    return (f'scale={width}:{height}:force_original_aspect_ratio={mode}:force_divisible_by=2,'
            f"crop=w='min(iw,1080)':h='min(ih,1920)':x='(iw-ow)*{x}':y='(ih-oh)*{y}',"
            f"pad=1080:1920:x='(ow-iw)*{x}':y='(oh-ih)*{y}':color=black")
