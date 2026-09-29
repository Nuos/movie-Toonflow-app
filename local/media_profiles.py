"""Toonflow bindings to the locally registered Qwen Image 2.1 and H3 workflows."""
import json
from pathlib import Path

CATALOG = Path('/home/ubuntu/llmspace/ComfyUI工作流/projects')
QWEN = CATALOG / 'Qwen-Image-2.1/workspace/workflows'
TRT = CATALOG / 'ComfyUI-MiniMaxH3-Easy/workspace/workflows/unified-generation/workspace/specifications/tensorrt-vae-1344-4sec/workflow.api.json'

def image_dimensions(size, ratio):
    if size in ('portrait-2k', 'portrait-1080p'):
        if ratio != '16:9':
            raise ValueError('人物四视图必须为16:9')
        return (2048, 1152) if size == 'portrait-2k' else (1920, 1080)
    sizes = {
        '1K': {'1:1':(1024,1024),'16:9':(1344,768),'9:16':(768,1344),'4:3':(1152,864),'3:4':(864,1152),'3:2':(1248,832),'2:3':(832,1248)},
        '2K': {'1:1':(2048,2048),'16:9':(2560,1440),'9:16':(1440,2560),'4:3':(2304,1728),'3:4':(1728,2304),'3:2':(2496,1664),'2:3':(1664,2496)},
    }
    if size not in sizes:
        raise ValueError('Qwen Image 2.1 使用已验证的原生 1K / 2K 档；4K 未配置，请选择 2K')
    if ratio not in sizes[size]:
        raise ValueError('Unsupported Qwen image aspect ratio')
    return sizes[size][ratio]

def build_qwen(body, folder, width, height, seed, save_reference, import_asset):
    refs = body.get('referenceList') or []
    # Qwen's VAE needs 16/32-aligned latents. Deliver 1080p with an explicit,
    # deterministic 4px top/bottom crop, never resize or upscale the result.
    latent_height = 1088 if body.get('size') == 'portrait-1080p' else height
    spec = ('image-edit/workspace/specifications/edit-896x1152-euler25' if refs else
            'text-to-image/workspace/specifications/t2i-2048x2048-euler50')
    template = QWEN / spec / 'workflow.api.json'
    graph = json.loads(template.read_text())
    graph.pop('13', None)
    for key in list(graph):
        node = graph[key]
        if node['class_type'] == 'LoadImage':
            del graph[key]
        elif node['class_type'] == 'EmptyLatentImage':
            node['inputs'].update(width=width, height=latent_height)
        elif node['class_type'] == 'ComfySwitchNode' and refs:
            # References condition identity/content. The editable target size
            # belongs to the output latent, not the first reference image.
            node['inputs']['switch'] = True
        elif node['class_type'] == 'KSampler':
            node['inputs'].update(seed=seed, steps=50, cfg=1, sampler_name='euler', scheduler='simple')
        elif node['class_type'] == 'SaveImageAdvanced':
            node['inputs']['filename_prefix'] = f'toonflow/{folder.name}/qwen-image-2.1'
        elif node['class_type'] == 'TextEncodeQwenImage21':
            encode = node['inputs']
            for name in list(encode):
                if name.startswith('images.image_'): del encode[name]
            encode.update(prompt=body['prompt'], negative_prompt='', resolution=0 if refs else 1024)
    if body.get('size') == 'portrait-1080p':
        for node in list(graph.values()):
            if node['class_type'] == 'SaveImageAdvanced':
                graph['portrait-delivery-crop'] = {'class_type':'ImageCrop','inputs':{'image':node['inputs']['images'],'width':width,'height':height,'x':0,'y':4}}
                node['inputs']['images'] = ['portrait-delivery-crop',0]
    for i, ref in enumerate(refs):
        path = save_reference(ref, folder, i)
        # Retain reference detail and aspect ratio; cap very large inputs at the chosen pixel budget.
        from PIL import Image
        with Image.open(path) as im:
            if im.width * im.height > width * height:
                scale = (width * height / (im.width * im.height)) ** .5
                target = folder / f'reference-{i}-sized.png'
                im.convert('RGB').resize((max(32,round(im.width*scale/32)*32),max(32,round(im.height*scale/32)*32)),Image.Resampling.LANCZOS).save(target)
                path = str(target)
        key = f'qwen-reference-{i}'
        graph[key] = {'class_type':'LoadImage','inputs':{'image':import_asset(path)}}
        encode[f'images.image_{i+1}'] = [key,0]
    (folder/'profile.json').write_text(json.dumps({'template':str(template),'model':'qwen_image_2.1_int8_convrot.safetensors','steps':50,'width':width,'height':height,'latent_height':latent_height,'delivery_crop':{'top':4,'bottom':4} if latent_height != height else None,'reference_policy':'preserve reference aspect and detail, cap input pixel area; output latent uses selected size and aspect'},ensure_ascii=False,indent=2))
    return graph

def build_trt_reference(body, folder, paths, width, height, frames, seed, prompt, router):
    graph = json.loads(TRT.read_text())
    graph.pop('25', None) # disconnected source housekeeping node
    media = {'images':[{'filename':router.import_asset(p)} for p in paths['image']],
             'audios':[{'filename':router.import_asset(p)} for p in paths['audio']],
             'videos':[{'filename':router.import_video(p)[0]} for p in paths['video']]}
    graph['45']['inputs']['media_state'] = json.dumps(media)
    # Easy rounds frames to the nearest 17k+5; request the already aligned frame count.
    graph['2']['inputs'].update(prompt=prompt,resolution='custom',width=width,height=height,seconds=frames/24,aspect_ratio=body.get('aspectRatio','16:9'))
    graph['6']['inputs']['noise_seed'] = seed
    graph['12']['inputs']['filename_prefix'] = f'toonflow/{folder.name}/h3-trt-reference'
    if body.get('audio',True) is False: graph['11']['inputs'].pop('audio',None)
    (folder/'profile.json').write_text(json.dumps({'template':str(TRT),'steps':4,'purpose':'accelerated reference option'},indent=2))
    return graph
