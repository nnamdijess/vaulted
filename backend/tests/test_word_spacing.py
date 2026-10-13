import unittest
from io import BytesIO
from PIL import Image
from pydantic import ValidationError
from app.schemas.studio import TextStyle
from app.services.studio_text_layout import wrap_words
from app.services.studio_text_preview import lyric_png
from app.services.studio_renderer import subtitles


class WordSpacingTest(unittest.TestCase):
    def test_justified_render_edges_stay_aligned_across_different_words(self):
        style = dict(font='montserrat', font_size=64, align='justify', color='#FFFF00',
                     text_width_px=600, line_spacing=1.8, last_line_align='justify')
        data = lyric_png('baby girl i\nlove it\nwhen you\nbend it like\na gymnast', style, 'default')
        alpha = Image.open(BytesIO(data)).convert('RGBA').getchannel('A')
        rows, start = [], None
        for y in range(alpha.height):
            visible = alpha.crop((0, y, alpha.width, y + 1)).getbbox()
            if visible and start is None:
                start = y
            if not visible and start is not None:
                rows.append(alpha.crop((0, start, alpha.width, y)).getbbox())
                start = None
        self.assertEqual(len(rows), 5)
        # Glyph side bearings and subtitle shadows vary by a few pixels.
        self.assertLessEqual(max(row[0] for row in rows) - min(row[0] for row in rows), 8)
        self.assertLessEqual(max(row[2] for row in rows) - min(row[2] for row in rows), 8)
        for left, _, right, _ in rows:
            self.assertLess(abs(left - 240), 8)
            self.assertLess(abs(right - 840), 8)

    def test_width_and_word_spacing_wrap_whole_words(self):
        text = "but you won't let me go"
        wide = wrap_words(text, 'abel', 64, 900, 0)
        narrow = wrap_words(text, 'abel', 64, 500, 100)
        self.assertEqual(len(wide), 1)
        self.assertEqual(narrow, ['but you', "won't let", 'me go'])
        self.assertEqual(wrap_words('but\nyou', 'abel', 64, 900, 0), ['but', 'you'])

    def test_line_spacing_and_safe_text(self):
        style = dict(font='abel', font_size=64, align='center', word_spacing=100,
                     text_width_px=500, line_spacing=1.8)
        snapshot = dict(lyric_style='default', text_style=style,
                        lines=[dict(text='but you\nlet me', start_time=0, end_time=1)])
        text = subtitles(snapshot)
        self.assertIn(r'\an5\pos(540,902.400)', text)
        self.assertIn(r'\pos(540,1017.600)', text)
        self.assertIn(r'but{\fsp100}\h{\fsp0}you', text)
        snapshot['lines'][0]['text'] = r'{\pos(0,0)}'
        self.assertNotIn(r'{\pos(0,0)}', subtitles(snapshot))
        for bad in ({'word_spacing': -1}, {'text_width_px': 100}, {'line_spacing': 0.5}):
            with self.assertRaises(ValidationError):
                TextStyle(**{**style, 'color': '#FFFFFF', **bad})

    def test_new_fonts_render_visible_pixels(self):
        for font in ('roboto_mono', 'space_grotesk', 'atkinson_next', 'abel'):
            data = lyric_png('but you\nlet me', dict(font=font, font_size=64, align='center',
                color='#FFFFFF', word_spacing=80, text_width_px=500, line_spacing=1.6), 'default')
            image = Image.open(BytesIO(data)).convert('RGBA')
            self.assertEqual(image.size, (1080, 1920))
            self.assertIsNotNone(image.getchannel('A').getbbox())

    def test_justify_fills_last_line_and_centers_single_word(self):
        from app.services.studio_text_layout import justified_gap
        from app.services.studio_fonts import FONT_DIR, FONT_FILES
        from PIL import ImageFont
        font = ImageFont.truetype(str(FONT_DIR / FONT_FILES['abel']), 64)
        gap = justified_gap('you said that', 'abel', 64, 600)
        width = sum(font.getlength(w) for w in ['you', 'said', 'that']) + 2 * (font.getlength(' ') + gap)
        self.assertAlmostEqual(width, 600)
        self.assertEqual(justified_gap('alone', 'abel', 64, 600), 0)
        style = dict(font='abel', font_size=64, align='justify', color='#FFFF80', text_width_px=600)
        TextStyle(**style)
        data = lyric_png('you said that\nour signs\nalone', style, 'default')
        self.assertIsNotNone(Image.open(BytesIO(data)).getchannel('A').getbbox())
        ass = subtitles(dict(lyric_style='default', text_style=style, lines=[dict(text='alone', start_time=0, end_time=1)]))
        self.assertIn(r'\an5\pos(540,', ass)
