"""Normalize downloaded sounds, retain originals and licensing, build the local asset catalog."""
from pathlib import Path
import json,subprocess,hashlib,zipfile,sys
root=Path(__file__).resolve().parents[1];audio=root/'data/oss/library/audio';sys.path.insert(0,str(root/'local/audio-tools'))
import py7zr
sources=json.loads((audio/'sources.json').read_text());byid={s['id']:s for s in sources};byid['crickets']['author']='Ted Kerr (Wolfgang_)'
extract=audio/'originals/extracted';extract.mkdir(exist_ok=True)
with zipfile.ZipFile(audio/'originals/grasshopper.zip') as z:
 for f in ['grasshopper.flac','README.txt']:
  p=extract/f
  if not p.exists():p.write_bytes(z.read(f))
if not (extract/'Nature Sounds Pack').exists():
 with py7zr.SevenZipFile(audio/'originals/nature.7z') as z:
  if any(Path(n).is_absolute() or '..' in Path(n).parts for n in z.getnames()):raise ValueError('unsafe archive path')
  z.extractall(extract)
fx=[
 ('amb-city','城市车流','environment','环境声','traffic',None,'道路车辆驶过的城市环境声。'),
 ('amb-fire','炉火噼啪','environment','环境声','fire',None,'炉火燃烧与木柴噼啪声。'),
 ('nature-rain','夜间雨声','nature','自然声','nature','Ambient/AmbientNatureNightRainy.wav','夜间持续落雨的自然声。'),
 ('nature-storm','暴雨雷鸣','nature','自然声','nature','Ambient/AmbientNatureStormRainThunder.wav','风暴中的雨声与雷鸣。'),
 ('nature-outdoor','户外自然氛围','nature','自然声','nature','Ambient/AmbientNatureOutside.wav','户外自然环境氛围。'),
 ('nature-stream','清浅溪流','nature','自然声','nature','Stream/Stream01.wav','溪水连续流淌，适合林间水边场景。'),
 ('nature-stream-birds','溪流与鸟鸣','nature','自然声','nature','Stream/StreamAndBirds02.wav','流水与林间鸟鸣相伴。'),
 ('nature-leaves','树叶沙沙','nature','自然声','leaves',None,'树叶移动的沙沙声，可用于风吹枝叶的细节。'),
 ('insect-crickets','夜间蟋蟀','insect','虫鸣','crickets',None,'夜间蟋蟀持续鸣叫。原录音为可循环环境声。'),
 ('insect-grasshopper','蚱蜢鸣叫','insect','虫鸣','grasshopper','grasshopper.flac','蚱蜢鸣叫的短音效。'),
 ('animal-dog','犬吠','mammal','走兽','dog',None,'犬吠录音，适合犬类角色或街巷院落。'),
 ('animal-cat','猫叫','mammal','走兽','cat',None,'短促猫叫音效。'),
 ('animal-sheep','羊咩声','mammal','走兽','sheep',None,'绵羊咩叫，短促单次音效。'),
 ('bird-crow','乌鸦叫','bird','鸟鸣飞禽','crow',None,'乌鸦鸣叫实地录音。'),
 ('bird-seagull','海鸥鸣叫','bird','鸟鸣飞禽','gull',None,'单只海鸥的鸣叫片段。'),
 ('bird-forest','林鸟与水声','bird','鸟鸣飞禽','nature','Ambient/AmbientNatureBirdsWater01.wav','林鸟鸣叫与附近水声混合的自然环境。')]
entries=[]
def record(file):
 j=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',str(file)]))
 return dict(duration=round(float(j['format']['duration']),3),bytes=file.stat().st_size,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),audioFormat=j['streams'][0])
for id,name,category,categoryName,sid,part,desc in fx:
 s=byid[sid];inp=audio/s['original']
 if part:inp=extract/('Nature Sounds Pack/'+part if sid=='nature' else part)
 out=audio/'effects'/(id+'.wav');out.parent.mkdir(exist_ok=True)
 if not out.exists():subprocess.run(['ffmpeg','-v','error','-y','-i',str(inp),'-t','30','-vn','-ar','24000','-ac','1','-c:a','pcm_s16le',str(out)],check=True)
 entries.append(dict(id=id,name=name,category=category,categoryName=categoryName,description=desc,filePath='/library/audio/effects/'+out.name,author=s['author'],license=s['license'],sourceUrl=s['sourceUrl'],provenance='下载素材，转为单声道 24kHz WAV；超过30秒保留前30秒，原始文件另存。',sourceFile=str(inp.relative_to(audio)),**record(out)))
for v in json.loads((root/'data/audio-library/voice-designs.json').read_text()):
 out=audio/'voices'/(v['id']+'.wav');meta=out.with_suffix('.json')
 if not out.exists() or not meta.exists():continue
 m=json.loads(meta.read_text());entries.append({k:v[k] for k in ['id','name','gender','age','traits','description']} | dict(category='voice',categoryName='人物声线',language='中文',filePath='/library/audio/voices/'+out.name,author='Toonflow 本地虚构音色',license='本地生成 · 模型 Apache-2.0',sourceUrl=m['sourceUrl'],provenance=m['provenance'],**record(out)))
musicFile=audio/'music-catalog.json'
if musicFile.exists():entries+=json.loads(musicFile.read_text())
extraFile=audio/'expansion-catalog.json'
if extraFile.exists():entries+=json.loads(extraFile.read_text())
if len({e['id'] for e in entries}) != len(entries):raise ValueError('duplicate sound id')
entries.sort(key=lambda e:(['voice','dubbing','environment','nature','effect','insect','mammal','bird','music'].index(e['category']),0))
(root/'data/audio-library/catalog.json').write_text(json.dumps(dict(version=1,sounds=entries),ensure_ascii=False,indent=2)+'\n')
credits=['# Toonflow 本地声音素材来源与使用说明','', '人物声线为 Qwen3-TTS 在本机生成的虚构中文音色，不是真实演员或名人的身份。年龄、气质、性格为设计标签，模型 Apache-2.0 许可证不等于对生成结果的版权承诺。试听句仅用于音色比较。','', '外部声音逐项保留作者和来源。CC0 可自由使用；CC BY 使用时署名并注明改动；CC BY-SA 还要求相应改编遵循相同许可。涉及配乐与画面同步等用法，应遵守各素材链接中的许可条件。','', '基础音效为单声道24kHz、最长30秒；新增音效和经典素材保留全长、48kHz双声道WAV并提供30秒试听，转换不提升源文件实际音质。原始文件与来源元数据保留在 originals、licenses 目录。','']
for e in entries:
 if e.get('usageNotice'):credits += [f"使用条件（{e['name']}）：{e['usageNotice']}",'']
 credits += [f"## {e['name']} ({e['id']})",f"作者：{e['author']}。许可：{e['license']}。",f"来源：{e['sourceUrl']}",f"处理与说明：{e['provenance']}",f"文件：{e['filePath']}；时长 {e['duration']} 秒；SHA-256 {e['sha256']}",'']
(audio/'CREDITS.md').write_text('\n'.join(credits)+'\n');(audio/'sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n');print('CATALOG',len(entries),'voices',sum(e['category']=='voice' for e in entries),'music',sum(e['category']=='music' for e in entries))
