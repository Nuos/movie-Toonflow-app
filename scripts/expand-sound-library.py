"""Download the reviewed additions and build a reproducible supplemental catalog."""
from pathlib import Path
from urllib.parse import urlparse
import concurrent.futures, hashlib, json, subprocess, zipfile
import requests
from collections import defaultdict
from threading import Lock
SOURCE_LOCKS=defaultdict(Lock)
ROOT=Path(__file__).resolve().parents[1]
AUDIO=ROOT/'data/oss/library/audio'
SPECS=ROOT/'data/audio-library/expansion-sources.json'

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def run(args): subprocess.run(['ffmpeg','-v','error','-y',*args],check=True,timeout=180)
def build(s):
    original=AUDIO/'originals/expansion'/s['originalName'];original.parent.mkdir(parents=True,exist_ok=True)
    with SOURCE_LOCKS[str(original)]:
        if s.get('localSource'):
            original=AUDIO/s['localSource']
        elif not original.exists():
            tmp=original.with_name(original.stem+'.partial'+original.suffix)
            if s.get('hls'):
                # Only ordinary, unencrypted public audio playlists selected from the publisher.
                run(['-i',s['downloadUrl'],'-vn','-c:a','copy',str(tmp)])
            else:
                with requests.get(s['downloadUrl'],timeout=90,stream=True) as r:
                    r.raise_for_status()
                    with tmp.open('wb') as f:
                        for chunk in r.iter_content(1024*1024): f.write(chunk)
            tmp.replace(original)
    original_hash=sha(original)
    if s.get('originalSha256') and original_hash!=s['originalSha256']: raise ValueError('Source hash mismatch: '+s['id'])
    inp=original
    if s.get('archiveMember'):
        inp=AUDIO/'originals/expansion/extracted'/s['id']/Path(s['archiveMember']).name
        inp.parent.mkdir(parents=True,exist_ok=True)
        with zipfile.ZipFile(original) as z:
            if not inp.exists(): inp.write_bytes(z.read(s['archiveMember']))
    folder='music' if s['category']=='music' else 'effects'
    wav=AUDIO/folder/(s['id']+'.wav');preview=AUDIO/'previews'/(s['id']+'.mp3')
    wav.parent.mkdir(exist_ok=True);preview.parent.mkdir(exist_ok=True)
    if not wav.exists(): run(['-i',str(inp),'-vn','-ar','48000','-ac','2','-c:a','pcm_s16le',str(wav)])
    if not preview.exists(): run(['-i',str(wav),'-t','30','-c:a','libmp3lame','-b:a','128k',str(preview)])
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',str(wav)]))
    entry={k:s[k] for k in ['id','name','category','categoryName','description','traits','author','license','sourceUrl','provenance']}
    for key in ['collection','materialType','usageNotice','instrument','loopable','recordingType']:
        if key in s: entry[key]=s[key]
    entry.update(filePath='/library/audio/'+folder+'/'+wav.name,previewSrc='/oss/library/audio/previews/'+preview.name,originalSrc='/oss/library/audio/'+str(original.relative_to(AUDIO)),duration=round(float(probe['format']['duration']),3),bytes=wav.stat().st_size,sha256=sha(wav),audioFormat=probe['streams'][0])
    license_dir=AUDIO/'licenses/expansion';license_dir.mkdir(parents=True,exist_ok=True)
    (license_dir/(s['id']+'.json')).write_text(json.dumps(s|{'originalSha256':original_hash,'sourceFile':str(original.relative_to(AUDIO)),'outputSha256':entry['sha256']},ensure_ascii=False,indent=2)+'\n')
    print(s['id'],entry['duration'],flush=True)
    return entry,original_hash

def main():
    specs=json.loads(SPECS.read_text())
    # A shared archive is downloaded once even when several entries use it.
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: results=list(pool.map(build,specs))
    for s,(_,digest) in zip(specs,results): s['originalSha256']=digest
    SPECS.write_text(json.dumps(specs,ensure_ascii=False,indent=2)+'\n')
    catalog=AUDIO/'expansion-catalog.json';tmp=catalog.with_suffix('.tmp')
    tmp.write_text(json.dumps([e for e,_ in results],ensure_ascii=False,indent=2)+'\n');tmp.replace(catalog)
    print('EXPANSION_READY',len(results))
if __name__=='__main__': main()
