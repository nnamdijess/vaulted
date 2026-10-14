import io
import unittest
from unittest.mock import patch
from PIL import Image
import test_studio
from app.services.studio_layout import raster, load_font
from app.services.studio_fonts import FONT_FILES


class TextEffectsTest(unittest.TestCase):
    setUp = test_studio.StudioTest.setUp
    tearDown = test_studio.StudioTest.tearDown
    register = test_studio.StudioTest.register

    def test_effects_persist_and_validate(self):
        style = dict(font='anton', color='#FFFFFF', align='center', outline_enabled=True,
                     outline_color='#FF0000', outline_thickness=5, shadow_enabled=True,
                     shadow_color='#0088FF', shadow_blur=8, shadow_x=-15, shadow_y=20, shadow_opacity=.4)
        result = self.client.put(self.url+'/text-style', json=style)
        self.assertEqual(result.status_code, 200, result.text)
        saved = self.client.get(self.url).json()['text_style']
        for key,value in style.items(): self.assertEqual(saved[key],value)
        response = self.client.post(self.url+'/lyric-preview', json={'text':'Outline and shadow','style':saved})
        self.assertEqual(response.content, raster('Outline and shadow',saved))
        for key,value in [('outline_thickness',13),('shadow_blur',31),('shadow_opacity',1.1),('shadow_x',41),('outline_color','red')]:
            self.assertEqual(self.client.put(self.url+'/text-style',json={**style,key:value}).status_code,422)

    def test_legacy_defaults_and_effect_pixels(self):
        base=dict(font='anton',color='#FFFFFF',align='center')
        self.assertEqual(raster('Words',base),raster('Words',{**base,'outline_enabled':True,'outline_color':'#101010','outline_thickness':1,'shadow_enabled':False}))
        plain=raster('Words',{**base,'outline_enabled':False})
        self.assertNotEqual(plain,raster('Words',base))
        self.assertEqual(plain,raster('Words',{**base,'outline_enabled':False,'shadow_enabled':True,'shadow_opacity':0}))
        outlined=Image.open(io.BytesIO(raster('Words',{**base,'outline_thickness':8,'outline_color':'#FF0000'})))
        self.assertTrue(any(r>200 and g<30 and b<30 and a>0 for r,g,b,a in outlined.getdata()))
        shadowed=Image.open(io.BytesIO(raster('Words',{**base,'shadow_enabled':True,'shadow_color':'#0000FF','shadow_x':30,'shadow_y':30,'shadow_blur':0,'shadow_opacity':.5})))
        self.assertTrue(any(b>200 and r<30 and a in (127,128) for r,g,b,a in shadowed.getdata()))

    def test_optional_fonts_require_real_files(self):
        for key in ('helvetica_neue','arial_nova','helvetica_neue_cyr_light'):
            with patch.dict(FONT_FILES,{key:'private/missing.ttf'}):
                self.assertFalse(self.client.get('/api/studio/font-options').json()[key])
                self.assertEqual(self.client.get('/api/studio/fonts/'+key).status_code,404)
                with self.assertRaises(OSError): load_font(key,48)
                self.assertEqual(self.client.put(self.url+'/text-style',json={'font':key,'color':'#FFFFFF','align':'center'}).status_code,422)
            # Exercise the installation path with a fixture font, not a substitute shipped under a new name.
            with patch.dict(FONT_FILES,{key:'Anton-Regular.ttf'}):
                self.assertTrue(self.client.get('/api/studio/font-options').json()[key])
                self.assertEqual(self.client.get('/api/studio/fonts/'+key).status_code,200)
                self.assertEqual(self.client.put(self.url+'/text-style',json={'font':key,'color':'#FFFFFF','align':'center'}).status_code,200)
