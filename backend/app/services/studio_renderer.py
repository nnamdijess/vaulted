"""Bounded FFmpeg pipeline. All paths and arguments originate on the server."""
import shutil
import subprocess
from app.services.studio_storage import content_path, ffmpeg
from app.services.storage import audio_path
from app.services.visual_provider import download_video


def ass_time(seconds):
    ticks = round(seconds * 100)
    return f'{ticks // 360000}:{ticks // 6000 % 60:02}:{ticks // 100 % 60:02}.{ticks % 100:02}'


def subtitles(snapshot):
    style = snapshot['lyric_style']
    size = 72 if style == 'large' else 48
    alignment = 2 if style == 'lower' else 5
    primary = '&H0080FFFF' if style == 'highlight' else '&H00FFFFFF'
    header = f'''[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,{size},{primary},&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,0,0,1,2,2,{alignment},100,100,350,1
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
            if not stock.is_file():
                download_video(media['video_url'], stock)
            filename = f'clip-{index}.mp4'
            treatment = ',hue=s=0' if snapshot['aesthetic'] == 'black-white' else ''
            command(['-protocol_whitelist', 'file,pipe', '-ss', str(clip['source_start']), '-f', 'mov', '-i', str(stock),
                     '-t', str(clip['end_time'] - clip['start_time']), '-an',
                     '-vf', f'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30{treatment}',
                     '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-threads', '2', filename], work)
            files.append(f"file '{filename}'")
            update_progress(int(70 * (index + 1) / len(snapshot['clips'])))
        (work / 'clips.txt').write_text('\n'.join(files), encoding='utf-8')
        (work / 'lyrics.ass').write_text(subtitles(snapshot), encoding='utf-8')
        args = ['-protocol_whitelist', 'file,pipe', '-f', 'concat', '-safe', '1', '-i', 'clips.txt',
                '-ss', str(snapshot['start_time']), '-protocol_whitelist', 'file,pipe', '-i', str(audio_path(snapshot['audio_path'])),
                '-map', '0:v:0', '-map', '1:a:0', '-t', str(snapshot['end_time'] - snapshot['start_time'])]
        if snapshot['lines']:
            args += ['-vf', 'subtitles=lyrics.ass']
        args += ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-threads', '2',
                 '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'export.mp4']
        command(args, work, timeout=900)
        update_progress(95)
        (work / 'export.mp4').replace(output)
        return output_key
    finally:
        shutil.rmtree(work, ignore_errors=True)
