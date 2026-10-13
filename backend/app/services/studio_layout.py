"""Canonical pixel layout and rasterization for previews and MP4 overlays."""
from dataclasses import dataclass, asdict
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from app.services.studio_fonts import FONT_DIR, FONT_FILES

CANVAS = (1080, 1920)


def load_font(key, size, weight=400):
    name = FONT_FILES.get(key, 'Montserrat-Variable.ttf')
    if name.startswith(('BarlowCondensed-', 'SairaCondensed-')):
        labels = {100:'Thin',200:'ExtraLight',300:'Light',400:'Regular',500:'Medium',600:'SemiBold',700:'Bold',800:'ExtraBold',900:'Black'}
        name = name.split('-')[0] + '-' + labels[min(labels, key=lambda w: abs(w-weight))] + '.ttf'
    path = FONT_DIR / name
    if not path.is_file():
        path = FONT_DIR / 'Montserrat-Variable.ttf'
    font = ImageFont.truetype(str(path), max(8, round(size)))
    try:
        axes = font.get_variation_axes()
        font.set_variation_by_axes([min(axis['maximum'], max(axis['minimum'], weight)) if axis['name'] == b'Weight' else axis['default'] for axis in axes])
    except OSError:
        pass  # Static font: use its real, available weight.
    return font, path.name


def measure(word, font, tracking):
    if not word:
        return 0
    if tracking:
        return sum(font.getlength(c) for c in word) + tracking * (len(word)-1)
    return font.getlength(word)


@dataclass
class Word:
    text: str
    x: float
    y: float
    width: float


def layout(text, style, preset='minimal'):
    text = style.get('line_breaks', {}).get(text, text).replace('\r', '')
    size = style.get('font_size') or (72 if preset == 'large' else 48)
    width = style.get('text_width_px') or 1080 * style.get('text_width', 82) / 100
    margin = 88 if style.get('italic') else 24
    width = min(width, 1080-2*margin)
    left = margin + (1080-width-2*margin) * style.get('text_x', .5)
    tracking = style.get('tracking', 0)
    weight = style.get('font_weight') or (700 if style.get('bold') else 400)
    # Fit unusually tall blocks inside the canvas without clipping user text.
    for _ in range(12):
        font, filename = load_font(style.get('font'), size, weight)
        rows = []
        gap = font.getlength(' ') + style.get('word_spacing', 0)
        for paragraph in text.split('\n'):
            current = []
            used = 0
            for word in paragraph.split():
                chunks = ['']
                for c in word:
                    if chunks[-1] and measure(chunks[-1]+c, font, tracking) > width:
                        chunks.append('')
                    chunks[-1] += c
                for chunk in chunks:
                    length = measure(chunk, font, tracking)
                    if current and used + gap + length > width:
                        rows.append(current)
                        current, used = [], 0
                    used += (gap if current else 0) + length
                    current.append((chunk, length))
            rows.append(current)
        ascent, descent = font.getmetrics()
        line_height = max(ascent + descent, size * style.get('line_spacing', 1.2))
        height = len(rows) * line_height
        if height <= 1600 or size <= 8:
            break
        size = max(8, size * min(.9, 1600 / height))
    position = style.get('position') or ('bottom' if preset == 'lower' else 'middle')
    top = {'top': 160, 'middle': (1920-height)/2, 'bottom': 1760-height}[position]
    result = []
    last_text_row = max((index for index, row in enumerate(rows) if row), default=0)
    for index, row in enumerate(rows):
        align = style.get('align', 'center')
        if align == 'justify' and index == last_text_row:
            align = style.get('last_line_align', 'center')
        widths = sum(length for _, length in row)
        actual_gap = (width-widths)/(len(row)-1) if align == 'justify' and len(row)>1 else gap
        total = widths + actual_gap * max(0, len(row)-1)
        x = left if align == 'left' or (align=='justify' and len(row)>1) else left+width-total if align=='right' else left+(width-total)/2
        words = []
        for word, length in row:
            words.append(Word(word, x, top+index*line_height+ascent, length))
            x += length+actual_gap
        result.append(words)
    return {'canvas':CANVAS, 'font_file':filename, 'font_size':size, 'font_weight':weight,
            'tracking':tracking, 'region':{'x':left,'width':width}, 'line_height':line_height,
            'lines':[[asdict(word) for word in row] for row in result]}, font


def raster(text, style, preset='minimal'):
    model, font = layout(text, style, preset)
    image = Image.new('RGBA', CANVAS)
    draw = ImageDraw.Draw(image)
    color = style.get('color', '#FFFF80' if preset=='highlight' else '#FFFFFF')
    for row in model['lines']:
        for word in row:
            x, y = word['x'], word['y']
            pieces = word['text'] if model['tracking'] else [word['text']]
            for piece in pieces:
                draw.text((x, y), piece, font=font, anchor='ls', fill=color, stroke_width=1, stroke_fill='#101010')
                x += font.getlength(piece) + model['tracking']
            if style.get('underline'):
                draw.line((word['x'], y+3, word['x']+word['width'], y+3), fill=color, width=2)
    if style.get('italic'):
        # Shear the completed block around its center; all glyphs share one transform.
        image = image.transform(CANVAS, Image.Transform.AFFINE, (1,.08,-.08*960,0,1,0), Image.Resampling.BICUBIC)
    buffer = BytesIO()
    image.save(buffer, format='PNG')
    return buffer.getvalue()


def overlay_sequence(snapshot, directory):
    """VFR PNG concat stream: one image per cue/gap, no per-frame rasterization."""
    style = snapshot.get('text_style') or {}
    total = snapshot['end_time'] - snapshot['start_time']
    blank = Image.new('RGBA', CANVAS)
    blank.save(directory / 'blank.png')
    entries, cursor = [], 0.0
    for index, cue in enumerate(snapshot['lines']):
        start = max(cursor, min(total, cue.get('start_time') or 0))
        end = max(start, min(total, cue.get('end_time') or total))
        if start > cursor:
            entries.append(('blank.png', start-cursor))
        if end > start:
            name = f'lyric-{index}.png'
            (directory / name).write_bytes(raster(cue['text'], style, snapshot['lyric_style']))
            entries.append((name, end-start))
        cursor = end
    if cursor < total:
        entries.append(('blank.png', total-cursor))
    if not entries:
        entries.append(('blank.png', total))
    manifest = ''.join(f"file '{name}'\noption framerate 30\nduration {duration:.6f}\n" for name, duration in entries)
    manifest += f"file '{entries[-1][0]}'\noption framerate 30\n"
    (directory / 'lyrics.txt').write_text(manifest, encoding='utf-8')
