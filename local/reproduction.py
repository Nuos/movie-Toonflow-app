"""Archive and replay the actual image graph without sampling or inference in validation."""
import copy
import hashlib
import json
import shutil
import uuid
from pathlib import Path

INPUT = Path('/home/ubuntu/llmspace/avspace/shared/input')
MODELS = Path('/home/ubuntu/llmspace/comfyui/ComfyUI/models')

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def model_fingerprints(graph):
    result = []
    for node in graph.values():
        for field in ('unet_name', 'clip_name', 'vae_name', 'lora_name'):
            value = node.get('inputs', {}).get(field)
            if not isinstance(value, str):
                continue
            files = list(MODELS.glob('**/' + value))
            if not files:
                raise ValueError('Model file missing: ' + value)
            file = files[0].resolve()
            stat = file.stat()
            result.append(dict(name=value, path=str(file), size=stat.st_size, mtime_ns=stat.st_mtime_ns))
    return result

def archive_graph(folder, graph):
    """Freeze exact LoadImage bytes and record the already serialized execution graph."""
    references = []
    for node_id, node in graph.items():
        if node['class_type'] != 'LoadImage':
            continue
        filename = node['inputs']['image']
        source = (INPUT / filename).resolve()
        if not source.is_relative_to(INPUT.resolve()):
            raise ValueError('Input path escapes ComfyUI input directory')
        target = folder / ('frozen-' + str(len(references)) + source.suffix)
        shutil.copy2(source, target)
        references.append(dict(node=node_id, file=target.name, sha256=sha(target)))
    record = dict(version=1, workflow_sha256=sha(folder/'workflow-api.json'),
                  references=references, models=model_fingerprints(graph),
                  policy='Same graph, seeds, dimensions, sampler, model files and reference bytes. Minor numerical variation across runtimes is possible.')
    (folder/'replay.json').write_text(json.dumps(record, ensure_ascii=False, indent=2))
    return record

def replay_graph(runs, identifier, folder, import_asset, dry_run=False):
    source = runs / str(uuid.UUID(identifier))
    job = json.loads((source/'job.json').read_text())
    if job.get('state') != 'success' or job.get('output_name') != 'output.png':
        raise ValueError('Only completed image jobs can be replayed')
    metadata = json.loads((source/'replay.json').read_text())
    if sha(source/'workflow-api.json') != metadata['workflow_sha256']:
        raise ValueError('Archived workflow checksum mismatch')
    graph = json.loads((source/'workflow-api.json').read_text())
    if model_fingerprints(graph) != metadata['models']:
        raise ValueError('Model files changed; restore the recorded model version before replay')
    for ref in metadata['references']:
        file = source / ref['file']
        if sha(file) != ref['sha256']:
            raise ValueError('Archived reference checksum mismatch')
        if not dry_run:
            graph[ref['node']]['inputs']['image'] = import_asset(file)
    if not dry_run:
        for node in graph.values():
            if node['class_type'] in ('SaveImage', 'SaveImageAdvanced'):
                node['inputs']['filename_prefix'] = f'toonflow/{folder.name}/replay'
    return graph
