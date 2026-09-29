"""Download the curated music sources and build full local WAVs plus short previews.
Existing verified source files are reused; never downloads model weights.
"""
from pathlib import Path
import requests,json,hashlib,concurrent.futures,subprocess,urllib.parse
root=Path(__file__).resolve().parents[1];audio=root/'data/oss/library/audio'
orig=audio/'originals/music';orig.mkdir(parents=True,exist_ok=True)
lic=audio/'licenses/music';lic.mkdir(parents=True,exist_ok=True)
items=json.loads((root/'data/audio-library/music-sources.json').read_text())
def f(s):
 id=s['id'];url=s['downloadUrl'];ext=Path(urllib.parse.unquote(url)).suffix;p=orig/(id+ext)
 if not p.exists():
  r=requests.get(url,headers={'User-Agent':'ToonflowLocalSoundLibrary/1.0'},timeout=90);r.raise_for_status();tmp=p.with_suffix(ext+'.partial');tmp.write_bytes(r.content)
  if hashlib.sha256(tmp.read_bytes()).hexdigest()!=s['originalSha256']:raise ValueError('Source checksum changed: '+id)
  tmp.replace(p)
 if hashlib.sha256(p.read_bytes()).hexdigest()!=s['originalSha256']:raise ValueError('Local source checksum mismatch: '+id)
 (lic/(id+'.json')).write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n')
 out=audio/'music'/(id+'.wav');out.parent.mkdir(exist_ok=True);preview=audio/'previews'/(id+'.mp3');preview.parent.mkdir(exist_ok=True)
 if not out.exists():subprocess.run(['ffmpeg','-v','error','-y','-i',str(p),'-vn','-ar',str(s.get('sampleRate',24000)),'-ac','2','-c:a','pcm_s16le',str(out)],check=True)
 if not preview.exists():subprocess.run(['ffmpeg','-v','error','-y','-i',str(p),'-t','30','-vn','-ar','44100','-ac','2','-b:a','128k',str(preview)],check=True)
 duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(out)]))
 provenance=s.get('provenance','下载器乐音乐，保留下载源文件；全长转为双声道24kHz WAV，另提供前30秒MP3试听。乐器标签为主奏或编配，非单轨分离。')
 if 'freesound' in url:provenance+=' 下载的是来源公开提供的高品质MP3预览版本，非原始无损录音。'

 result={k:s[k] for k in ['id','name','instrument','traits','description','author','license','sourceUrl']};result.update({k:s[k] for k in ['collection','operaGenre','materialType'] if k in s});result.update(category='music',categoryName='影视配乐',filePath='/library/audio/music/'+out.name,previewSrc='/oss/library/audio/previews/'+preview.name,originalSrc='/oss/library/audio/originals/music/'+p.name,provenance=provenance,duration=round(duration,3),bytes=out.stat().st_size,sha256=hashlib.sha256(out.read_bytes()).hexdigest(),originalSha256=hashlib.sha256(p.read_bytes()).hexdigest())
 print('MUSIC',id,round(duration,1),flush=True);return result
selected=items;out=list(concurrent.futures.ThreadPoolExecutor(max_workers=2).map(f,selected));(audio/'music-catalog.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print('MUSIC_READY',len(out))
