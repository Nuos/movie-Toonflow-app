"""Read installed node metadata and build graphs only; never submit inference."""
import sys, json, urllib.request, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'local'))
from video_parameters import capabilities, resolve
INFO=json.load(urllib.request.urlopen('http://127.0.0.1:8188/object_info'))
class Parameters(unittest.TestCase):
 def test_all_profiles(self):
  for model in ['h3-quality','h3-reference-quality','h3-reference-trt']:
   c=capabilities(INFO,model)
   for sec in [3,4.5,12,20,30]:
    p=resolve(dict(duration=sec,resolution='768p',aspectRatio='16:9'),c)
    self.assertEqual((p['width'],p['height']),(1344,768));self.assertEqual((p['frames']-5)%17,0)
   p=resolve(dict(duration=12,resolution='768p',aspectRatio='9:16'),c)
   self.assertEqual((p['width'],p['height']),(768,1344))
   p=resolve(dict(duration=12,resolution='1920x1088',aspectRatio='16:9'),c)
   self.assertEqual((p['width'],p['height']),(1920,1088))
   with self.assertRaises(ValueError):resolve(dict(duration=float('nan')),c)
   with self.assertRaises(ValueError):resolve(dict(duration=c['duration']['max']+1),c)
   with self.assertRaises(ValueError):resolve(dict(duration=12,resolution='1920x1080'),c)
 def test_native_graph_custom_size_duration(self):
  import bridge
  p=resolve(dict(duration=40,resolution='1920x1088',aspectRatio='16:9'),capabilities(INFO,'h3-quality'))
  g=bridge.router.build('quality','静止风景',width=p['width'],height=p['height'],length=p['frames'],enforce_profile_limits=False)
  self.assertEqual(g['5']['inputs']['width'],1920);self.assertEqual(g['5']['inputs']['length'],p['frames'])
 def test_tensor_rt_graph_uses_custom(self):
  import bridge,tempfile
  p=resolve(dict(duration=12,resolution='768p',aspectRatio='16:9'),capabilities(INFO,'h3-reference-trt'))
  with tempfile.TemporaryDirectory() as temp:
   g=bridge.build_trt_reference({'aspectRatio':'16:9'},Path(temp),{'image':[],'video':[],'audio':[]},p['width'],p['height'],p['frames'],7,'测试',bridge.router)
  self.assertEqual(g['2']['inputs']['resolution'],'custom')
  self.assertEqual(g['2']['inputs']['seconds'],p['actualDuration'])
unittest.main()
