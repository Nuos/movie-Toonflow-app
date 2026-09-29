"""Pinned complete Astral V4 recipe; references bypass the UI media splitter.

Keeps the installed recipe's W4A8 model, sigma shift, attention, LoRA, 6-step
first pass and 4-step tiled refinement. It does not imply measured superiority.
"""
import json, math
from pathlib import Path
TEMPLATE=Path(__file__).parent/'workflows/astral-v4-reference.json'
MODEL='h3-astral-reference'

def capabilities(info, ratios):
    node='MiniMaxH3UnifiedToVideo';fields=info[node]['input']['required'];d=fields['duration'][1]
    max_frames=max(5,math.floor(d['max']*24+.5));max_frames+=(5-max_frames)%17
    return dict(source=f'ComfyUI /object_info/{node}',node=node,fps=24,frameStep=17,frameOffset=5,
      frameRounding='round',maxFrames=max_frames,duration=dict(min=d['min'],max=d['max'],step=d['step']),
      width=fields['width'][1],height=fields['height'][1],aspectRatios=ratios,
      presets={'preview':[864,480],'768p':[1344,768],'1080p':[1920,1088]},
      customDuration=True,customResolution=True,durationSuggestions=[4,8,12,15],
      stages=[{'kind':'first-pass','steps':6,'scale':.72},{'kind':'tiled-refine','steps':4,'output':'requested resolution'}])

def graph(body, folder, paths, w,h,frames,seed,prompt,router):
    g=json.loads(TEMPLATE.read_text())
    for key in ('220','221','1384','1210'):g.pop(key,None)
    first_w=max(32,round(w*.72/32)*32);first_h=max(32,round(h*.72/32)*32)
    g['201']['inputs'].update(prompt=prompt,mode='ref2va',width=first_w,height=first_h,duration=body['duration'],fps=24)
    for key in list(g['201']['inputs']):
        if key.startswith(('ref_images.','ref_videos.','ref_audios.','ref_video_audios.')):g['201']['inputs'].pop(key)
    g['129']['inputs']['noise_seed']=seed;g['1381']['inputs']['values.a']=body['duration']
    g['1317']['inputs'].update({'mode.width':w,'mode.height':h})
    for kind,files in paths.items():
        for i,path in enumerate(files):
            key=f'h3-ref-{kind}-{i}';name=router.import_asset(path)
            if kind=='image':g[key]={'class_type':'LoadImage','inputs':{'image':name}};link=[key,0];target=f'ref_images.ref_image_{i}'
            elif kind=='audio':g[key]={'class_type':'LoadAudio','inputs':{'audio':name}};link=[key,0];target=f'ref_audios.ref_audio_{i}'
            else:
                # Unified node checks input frame cadence; normalize explicitly without sound.
                import subprocess
                silent=folder/f'video-{i}-silent-24fps.mp4'
                subprocess.run(['/home/ubuntu/.local/bin/ffmpeg','-hide_banner','-v','error','-y','-i',path,'-map','0:v:0','-an','-vf','fps=24','-c:v','libx264','-crf','18',str(silent)],check=True)
                g[key]={'class_type':'LoadVideo','inputs':{'file':router.import_asset(str(silent))}}
                g[key+'-components']={'class_type':'GetVideoComponents','inputs':{'video':[key,0]}}
                link=[key+'-components',0];target=f'ref_videos.ref_video_{i}'
            g['201']['inputs'][target]=link
    for key,name in [('227','first-pass'),('245','refined')]:
        g[key]['inputs']['filename_prefix']=f'toonflow/{folder.name}/{name}'
        if body.get('audio',True):g[key]['inputs']['audio']=['253',0]
        else:g[key]['inputs'].pop('audio',None)
    return g
