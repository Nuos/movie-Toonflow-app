"""H3 parameters: presets are suggestions; validation comes from installed nodes."""
import math
import re

PRESETS = {'768p': [1344, 768], 'preview': [608, 352], '720p': [1280, 720], '1080p': [1920, 1080]}
FPS = 24

def capabilities(info, model):
    if model == 'h3-astral-reference':
        from h3_optimized_workflows import capabilities as optimized_capabilities
        return optimized_capabilities(info, info['MiniMaxH3Easy']['input']['required']['aspect_ratio'][0])
    node = 'MiniMaxH3Easy' if model == 'h3-reference-trt' else ('MiniMaxH3ReferenceToVideo' if 'reference' in model else 'MiniMaxH3ImageToVideo')
    if node not in info:
        raise ValueError(f'当前 ComfyUI 未安装节点 {node}')
    fields = info[node]['input']['required']
    duration = fields.get('seconds', fields.get('length'))[1]
    max_frames = math.floor(duration['max'] * FPS) if 'seconds' in fields else duration['max']
    max_frames -= (max_frames - 5) % 17
    return dict(source=f'ComfyUI /object_info/{node}', node=node, fps=FPS,
                frameStep=17, frameOffset=5, duration=dict(min=5/FPS, max=duration['max'] if 'seconds' in fields else duration['max']/FPS, step='any'), maxFrames=max_frames,
                width=fields['width'][1], height=fields['height'][1],
                aspectRatios=info['MiniMaxH3Easy']['input']['required']['aspect_ratio'][0],
                presets=PRESETS, customDuration=True, customResolution=True,
                durationSuggestions=[3, 4, 5, 8, 10, 12, 15, 20, 30])

def resolve(body, caps):
    duration = body.get('duration', 5)
    if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
        raise ValueError('时长必须是大于零的有限数值')
    frames = max(5, math.floor(duration * caps['fps'] + .5) if caps.get('frameRounding') == 'round' else math.ceil(duration * caps['fps']))
    frames += (5-frames) % 17
    if duration < caps['duration']['min'] or duration > caps['duration']['max'] + 1e-9:
        raise ValueError(f"时长超出实际节点 {caps['node']} 的范围，上限 {caps['duration']['max']:.3f} 秒（按帧对齐）")
    if frames > caps['maxFrames']:
        raise ValueError('帧数对齐后超出工作流范围，请缩短时长')
    ratio = body.get('aspectRatio', '16:9')
    if ratio not in caps['aspectRatios']:
        raise ValueError('请选择工作流节点支持的画幅')
    resolution = body.get('resolution', '768p')
    match = re.fullmatch(r'(\d+)\s*[x×]\s*(\d+)', resolution)
    if match:
        width, height = map(int, match.groups())
        a,b = map(int,ratio.split(':'))
        if abs(width/height-a/b) > max(caps['width']['step']/height, caps['height']['step']*width/(height*height)):
            raise ValueError('自定义宽高与选定画幅不一致，请同步修改画幅或尺寸')
    elif resolution in caps['presets']:
        w,h = caps['presets'][resolution]
        a,b = map(int,ratio.split(':'))
        width,height = (w,h) if a>=b else (h,w)
        # Preserve existing preset pixels; adapt other ratios by their short edge.
        if ratio not in ('16:9','9:16'):
            width,height = (h*a/b,h) if a>=b else (h,h*b/a)
        width = max(32, round(width/caps['width']['step'])*caps['width']['step'])
        height = max(32, round(height/caps['height']['step'])*caps['height']['step'])
    else:
        raise ValueError('分辨率请使用预设名称或 宽x高，例如 1920x1088')
    for key,value in [('width',width),('height',height)]:
        spec=caps[key]
        if value < spec['min'] or value > spec['max'] or value % spec['step']:
            raise ValueError(f"{key} 必须符合 {caps['node']}：{spec['min']}..{spec['max']}，{spec['step']} 的倍数")
    return dict(width=width,height=height,frames=frames,fps=FPS,actualDuration=frames/FPS,aspectRatio=ratio,duration=duration,resolution=resolution)
