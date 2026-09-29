"""Inspectable workflow contracts. Node limits are capability, never a quality claim."""
import hashlib
import json
from pathlib import Path

def snapshot(model, scene, router, caps, root):
    if scene == 'reference_astral':
        from h3_optimized_workflows import TEMPLATE
        graph = json.loads(TEMPLATE.read_text())
        config = {'steps':6,'refineSteps':4,'backend':'astral-tiled','model':'ref2va',
            'turbo':graph['1299']['inputs']['lora_name'],'ref_size':'match',
            'source':'Astral-MiniMax-H3-V4','adapterSha256':hashlib.sha256((Path(root)/'h3_optimized_workflows.py').read_bytes()).hexdigest(),'templateSha256':hashlib.sha256(TEMPLATE.read_bytes()).hexdigest()}
    elif scene == 'reference_trt':
        from media_profiles import TRT
        graph = json.loads(TRT.read_text())
        config = {'steps': graph['5']['inputs']['steps'], 'backend': 'tensorrt', 'model': 'ref2va', 'turbo': graph['24']['inputs']['lora_name'], 'ref_size': 'match'}
    else:
        config = router.SCENES[scene]
        graph = router.BASE
    family = 'Ref2VA' if scene.startswith('reference') else 'FL2VA'
    models = []
    if graph:
        models = [{'node': k, 'type': v['class_type'], 'inputs': v['inputs']} for k, v in graph.items()
                  if v['class_type'] in ('UNETLoader', 'CLIPLoader', 'VAELoader', 'KSamplerSelect', 'BasicScheduler')]
    return {
        'id': model, 'family': family,
        'modes': ['Ref2VA'] if family == 'Ref2VA' else ['T2VA', 'I2VA', 'FL2VA', 'L2VA'],
        'config': config, 'baseNodes': models,
        'checkpoint': graph['127']['inputs']['unet_name'] if scene == 'reference_astral' else router.MODELS.get(config.get('model')),
        'lora': config.get('turbo'), 'steps': config.get('steps'),
        'sampler': next((n['inputs']['sampler_name'] for n in graph.values() if n['class_type']=='KSamplerSelect'),None) if graph else None,
        'scheduler': graph['124']['inputs']['scheduler'] if scene == 'reference_astral' else next((n['inputs']['scheduler'] for n in graph.values() if n['class_type']=='BasicScheduler'),None) if graph else None,
        'nativeAudio': True, 'referenceVideoAudio': 'explicit-only',
        'structuredVideoReferences': scene != 'reference_trt',
        'limits': caps, 'evidence': {'level': 'installed-configuration', 'qualityVerified': False},
        'fingerprint': hashlib.sha256(json.dumps({'config': config, 'base': graph, 'caps': caps,
            'router': hashlib.sha256(Path(router.__file__).read_bytes()).hexdigest()}, sort_keys=True).encode()).hexdigest(),
    }
