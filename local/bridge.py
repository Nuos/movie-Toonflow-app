#!/usr/bin/env python3
"""Loopback-only Toonflow adapter for the existing llmspace H3 router."""
import base64
import fcntl
import hashlib
import importlib.util
import json
import math
import mimetypes
import re
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from video_parameters import capabilities, resolve
from h3_workflow_contract import snapshot as workflow_snapshot
from media_profiles import image_dimensions, build_qwen, build_trt_reference
from reproduction import archive_graph, replay_graph
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RUNS = ROOT / "runs"
ROUTER_PATH = Path('/home/ubuntu/llmspace/avspace/codex/workflows/h3_router.py')
spec = importlib.util.spec_from_file_location('llmspace_h3_router', ROUTER_PATH)
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)
COMFY = 'http://127.0.0.1:8188'
PORT = 10589
LOCK = threading.Lock()
MODELS = {'z-image-turbo': 'image', 'h3-turbo': 'fast', 'h3-standard': 'standard',
          'h3-reference-turbo': 'reference_fast', 'h3-reference': 'reference',
          'qwen-image-2.1-quality': 'image', 'h3-quality': 'quality',
          'h3-reference-quality': 'reference_fidelity', 'h3-fast-sol': 'fast_sol',
          'h3-reference-trt': 'reference_trt'}
MODELS['h3-astral-reference'] = 'reference_astral'


@contextmanager
def media_gpu_slot():
    """Share the GPU cooperatively with the local text gateway."""
    base = Path('/home/ubuntu/llmspace/text-models')
    if not (base / 'models-lock.json').exists():
        yield
        return
    with (base / 'gpu.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (base / 'router.key').read_text().strip()}
        try:
            with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:10591/models', headers=headers), timeout=10) as r:
                models = json.load(r).get('data', [])
        except urllib.error.URLError as exc:
            # A stopped router cannot retain GPU models; other errors are actionable.
            if not isinstance(exc.reason, ConnectionRefusedError):
                raise
            models = []
        for model in models:
            if model.get('status', {}).get('value') in ('loaded', 'sleeping', 'loading'):
                req = urllib.request.Request('http://127.0.0.1:10591/models/unload',
                    data=json.dumps({'model': model['id']}).encode(), headers=headers)
                with urllib.request.urlopen(req, timeout=300) as r:
                    if not json.load(r).get('success'):
                        raise RuntimeError('Cannot unload local text model before media generation')
        if models:
            deadline = time.monotonic() + 60
            while True:
                with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:10591/models', headers=headers), timeout=10) as r:
                    remaining = json.load(r).get('data', [])
                if all(m.get('status', {}).get('value') == 'unloaded' for m in remaining):
                    break
                if time.monotonic() > deadline:
                    raise TimeoutError('Text model unload timed out; media was not submitted')
                time.sleep(0.1)
        yield


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temp.replace(path)


def comfy(path, body=None):
    req = urllib.request.Request(COMFY + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise ValueError(f'ComfyUI {e.code}: {e.read().decode()[:2000]}') from e



def plan_request(body):
    model = body.get('model')
    if model not in MODELS:
        raise ValueError('Unknown local H3 model')
    if model == 'qwen-image-2.1-quality':
        if not isinstance(body.get('prompt'), str) or not 1 <= len(body['prompt'].strip()) <= 40000:
            raise ValueError('An image prompt is required')
        refs = body.get('referenceList') or []
        if not isinstance(refs, list) or len(refs) > 16:
            raise ValueError('Qwen supports up to 16 image references')
        if any(not isinstance(r, dict) or r.get('type') != 'image' or not isinstance(r.get('base64'), str) for r in refs):
            raise ValueError('Qwen references must be images')
        w, h = image_dimensions(body.get('size', '2K'), body.get('aspectRatio', '16:9'))
        return 'image', 'reference' if refs else 'text', {}, w, h, 0
    if model == 'z-image-turbo':
        if body.get('referenceList'):
            raise ValueError('Local Z-Image supports text-to-image only; reference edits need a separate image-edit model')
        if not isinstance(body.get('prompt'), str) or not 1 <= len(body['prompt'].strip()) <= 40000:
            raise ValueError('An image prompt is required')
        if body.get('size', '1K') != '1K':
            raise ValueError('The local Z-Image profile currently supports 1K only')
        ratios = {'16:9': (1024,576), '9:16': (576,1024), '1:1': (1024,1024),
                  '4:3': (1024,768), '3:4': (768,1024), '3:2': (960,640), '2:3': (640,960)}
        if body.get('aspectRatio', '16:9') not in ratios:
            raise ValueError('Unsupported image aspect ratio')
        w,h = ratios[body.get('aspectRatio', '16:9')]
        return 'image', 'text', {}, w, h, 0
    parameters = resolve(body, capabilities(comfy('/object_info'), model))
    prompt = body.get('prompt', '')
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 40000:
        raise ValueError('prompt must contain 1..40000 characters')
    refs = body.get('referenceList') or []
    if not isinstance(refs, list) or len(refs) > 12:
        raise ValueError('Too many references')
    grouped = {'image': [], 'video': [], 'audio': []}
    for ref in refs:
        if not isinstance(ref, dict) or ref.get('type') not in grouped or not isinstance(ref.get('base64'), str):
            raise ValueError('Each reference needs type and base64')
        grouped[ref['type']].append(ref)
    mode = body.get('mode', 'text')
    scene = MODELS[model]
    if scene.startswith('reference'):
        if not isinstance(mode, list) or not all(re.fullmatch(r'(image|video|audio)Reference:\d+', x) for x in mode):
            raise ValueError('Reference models require a multi-reference mode')
        if not grouped['image'] and not grouped['video']:
            raise ValueError('Ref2VA needs an image or video; audio alone is insufficient')
        if len(grouped['image']) > 9 or len(grouped['video']) > 3 or len(grouped['audio']) > 3:
            raise ValueError('Reference limits: 9 images / 3 videos / 3 audio files')
    else:
        counts = {'text': 0, 'singleImage': 1, 'startEndRequired': 2, 'lastImage': 1}
        if not isinstance(mode, str) or mode not in counts:
            raise ValueError('Use text, singleImage, or startEndRequired for FL2VA')
        if grouped['video'] or grouped['audio'] or len(grouped['image']) != counts[mode]:
            raise ValueError(f'{mode} requires exactly {counts[mode]} images and no other references')
    w, h, frames = parameters['width'], parameters['height'], parameters['frames']
    return scene, mode, grouped, w, h, frames


def save_reference(ref, folder, index):
    value = ref['base64']
    match = re.fullmatch(r'data:([\w.+/-]+);base64,([A-Za-z0-9+/=\r\n]+)', value)
    if not match:
        raise ValueError('Reference must be a base64 data URI')
    mime, encoded = match.groups()
    if not mime.startswith(ref['type'] + '/'):
        raise ValueError('Reference MIME type does not match its declared type')
    extensions = {'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
                  'video/mp4': '.mp4', 'audio/mpeg': '.mp3', 'audio/wav': '.wav',
                  'audio/x-wav': '.wav', 'audio/flac': '.flac', 'audio/mp4': '.m4a'}
    if mime not in extensions:
        raise ValueError(f'Unsupported reference MIME type: {mime}')
    raw = base64.b64decode(encoded.replace('\n', '').replace('\r', ''), validate=True)
    if not raw or len(raw) > 60 * 1024 * 1024:
        raise ValueError('Reference is empty or larger than 60MB')
    target = folder / f'reference-{index}{extensions[mime]}'
    target.write_bytes(raw)
    return str(target)


def normalize_h3_prompt(prompt, mode, frames, requested_duration=None):
    """Use code for exact frame bindings, independent of a text model's arithmetic."""
    text = prompt.strip()
    if text.startswith('```'):
        lines = text.splitlines()
        if lines[-1].strip() == '```': text = '\n'.join(lines[1:-1]).strip()
    if text.startswith('{'):
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = None
        keys = ('subject_definitions', 'summary', 'retention_analysis', 'detailed_description', 'overall_soundscape', 'non_diegetic_music') if isinstance(data, dict) and 'subject_definitions' in data else ('integrated_multimodal_description', 'overall_soundscape', 'non_diegetic_music')
        if isinstance(data, dict) and all(isinstance(data.get(k), str) for k in keys):
            text = '\n\n'.join(f'{k}: {data[k]}' for k in keys)
    if mode in ('singleImage', 'startEndRequired'):
        if mode == 'singleImage':
            first = 'For the target video, at 0 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.'
        else:
            last_shot = max([int(n) for n in re.findall(r'\[Shot (\d+)\]', text)] or [1])
            first = f'How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0-second mark of the target video; Picture 2 (from Shot {last_shot}) aligns with the {int(requested_duration or round(frames / 24))}-second mark of the target video.'
        lines = text.splitlines()
        if lines and (re.match(r'For the target video, at 0(?:\.00)? seconds', lines[0]) or lines[0].startswith('How the reference pictures align')):
            text = '\n'.join(lines[1:]).strip()
        text = first + '\n\n' + text
    return text


def build_graph(body, folder):
    scene, mode, grouped, w, h, frames = plan_request(body)
    if body.get("replayJobId"):
        if scene != "image": raise ValueError("Replay requires an image model")
        source_job = json.loads((RUNS / str(uuid.UUID(body["replayJobId"])) / "job.json").read_text())
        if source_job["model"] != body["model"]: raise ValueError("Replay model must match the original")
        return replay_graph(RUNS, body["replayJobId"], folder, router.import_asset)
    if body.get('model') == 'qwen-image-2.1-quality':
        seed = body.get('seed', int(uuid.uuid4().hex[:13], 16))
        if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**53:
            raise ValueError('seed must be a non-negative safe integer')
        return build_qwen(body, folder, w, h, seed, save_reference, router.import_asset)
    if scene == 'image':
        graph = json.loads((ROOT/'z-image-api.json').read_text())
        for node in graph.values():
            if node['class_type'] == 'CLIPTextEncode': node['inputs']['text'] = body['prompt']
            if node['class_type'] == 'EmptySD3LatentImage': node['inputs'].update(width=w, height=h)
            if node['class_type'] == 'KSampler': node['inputs']['seed'] = body.get('seed', int(uuid.uuid4().hex[:13], 16))
            if node['class_type'] == 'SaveImage': node['inputs']['filename_prefix'] = f'toonflow/{folder.name}/image'
        return graph
    paths = {kind: [] for kind in grouped}
    for i, ref in enumerate(body.get('referenceList') or []):
        paths[ref['type']].append(save_reference(ref, folder, i))
    seed = body.get('seed', int(uuid.uuid4().hex[:13], 16))
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**53:
        raise ValueError('seed must be a non-negative safe integer')
    kwargs = dict(width=w, height=h, length=frames, seed=seed, enforce_profile_limits=False)
    if scene.startswith('reference'):
        kwargs.update(images=paths['image'], videos=paths['video'], audios=paths['audio'])
    elif mode == 'singleImage':
        kwargs['first'] = paths['image'][0]
    elif mode == 'lastImage':
        kwargs['last'] = paths['image'][0]
    elif mode == 'startEndRequired':
        kwargs.update(first=paths['image'][0], last=paths['image'][1])
    prompt = body['prompt'] if body.get('compiler') in ('h3-compiler/1','h3-compiler/2') else normalize_h3_prompt(body['prompt'], mode, frames, body.get('duration'))
    (folder / 'effective-prompt.txt').write_text(prompt)
    if scene == 'reference_astral':
        from h3_optimized_workflows import graph as optimized_graph
        return optimized_graph(body,folder,paths,w,h,frames,seed,prompt,router)
    if scene == 'reference_trt':
        if body.get('compiler') in ('h3-compiler/1','h3-compiler/2') and paths['video']:
            raise ValueError('This TRT workflow needs explicit video/audio binding support before structured video references can be used')
        return build_trt_reference(body, folder, paths, w, h, frames, seed, prompt, router)
    structured = body.get('compiler') in ('h3-compiler/1','h3-compiler/2')
    if structured and paths['video']:
        # Bind silent visual tracks explicitly. The shared legacy router otherwise
        # implicitly injects video soundtracks and shifts Audio N numbering.
        kwargs['videos'] = ()
        if not paths['image']:
            first = folder / 'video-conditioning-placeholder.png'
            subprocess.run(['/home/ubuntu/.local/bin/ffmpeg','-hide_banner','-v','error','-y','-i',paths['video'][0],'-frames:v','1',str(first)],check=True)
            kwargs['images'] = [str(first)]
    graph = router.build(scene, prompt, **kwargs)
    if structured:
        if paths['video'] and not paths['image']:
            graph['5']['inputs'].pop('ref_images.ref_image_0', None)
        for i, video_path in enumerate(paths['video']):
            visual = folder / f'video-reference-{i}-silent-24fps.mp4'
            subprocess.run(['/home/ubuntu/.local/bin/ffmpeg', '-hide_banner', '-v', 'error', '-y',
                '-i', video_path, '-map', '0:v:0', '-an', '-vf', 'fps=24', '-c:v', 'libx264', '-crf', '18', str(visual)], check=True)
            load, components = f'h3-video-{i}', f'h3-components-{i}'
            graph[load] = {'class_type':'LoadVideo', 'inputs':{'file':router.import_asset(str(visual))}}
            graph[components] = {'class_type':'GetVideoComponents', 'inputs':{'video':[load,0]}}
            graph['5']['inputs'][f'ref_videos.ref_video_{i}'] = [components,0]

    graph['14']['inputs']['filename_prefix'] = f'toonflow/{folder.name}/video'
    # H3 samples audio jointly; this switch controls whether it is included in the MP4.
    if body.get('audio', True) is False:
        graph['13']['inputs'].pop('audio', None)
    return graph


def validate_models(graph):
    info = comfy('/object_info')
    missing = []
    for node in graph.values():
        cls = node['class_type']
        if cls not in info:
            missing.append(cls)
            continue
        required = info[cls].get('input', {}).get('required', {})
        for name in ('unet_name', 'clip_name', 'vae_name', 'lora_name', 'decoder', 'encoder'):
            if name in node['inputs'] and name in required:
                options = required[name][0]
                if isinstance(options, list) and node['inputs'][name] not in options:
                    missing.append(node['inputs'][name])
    if missing:
        raise ValueError('Missing ComfyUI nodes/models: ' + ', '.join(missing))


def create_job(body):
    identifier = str(uuid.UUID(body['request_id']))
    digest = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
    folder = RUNS / identifier
    record_path = folder / 'job.json'
    with LOCK:
        if record_path.exists():
            record = json.loads(record_path.read_text())
            if record['request_hash'] != digest:
                raise ValueError('request_id already belongs to a different request')
            return record
        scene, _, _, width, height, frames = plan_request(body)
        folder.mkdir(parents=True, exist_ok=True)
        graph = build_graph(body, folder)
        validate_models(graph)
        atomic_json(folder / 'workflow-api.json', graph)
        if scene == 'image': archive_graph(folder, graph)
        (folder / 'prompt.txt').write_text(body['prompt'])
        record = dict(id=identifier, state='submitting', request_hash=digest,
                      started_at=time.time(), width=width, height=height, frames=frames,
                      output_name='output.png' if scene=='image' else 'output.mp4',
                      requested_duration=body.get('duration', 5), fps=24, model=body['model'])
        if body['model'] == 'h3-astral-reference': record['output_node'] = '245'
        record['workflow_sha256'] = hashlib.sha256((folder / 'workflow-api.json').read_bytes()).hexdigest()
        record['adapter_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        atomic_json(record_path, record)
        try:
            with media_gpu_slot():
                result = comfy('/prompt', {'prompt': graph, 'client_id': 'toonflow-' + identifier})
            if result.get('node_errors') or not result.get('prompt_id'):
                raise ValueError(str(result))
            record.update(state='queued', prompt_id=result['prompt_id'])
        except Exception as exc:
            record.update(state='submission_uncertain', error=str(exc))
            atomic_json(record_path, record)
            raise
        atomic_json(record_path, record)
        return record


def job_status(identifier):
    identifier = str(uuid.UUID(identifier))
    folder = RUNS / identifier
    record_path = folder / 'job.json'
    with LOCK:
        record = json.loads(record_path.read_text())
        if record['state'] in ('success', 'error', 'submission_uncertain'):
            return record
        history = comfy('/history/' + record['prompt_id']).get(record['prompt_id'])
        if history:
            atomic_json(folder / 'history.json', history)
            events = history.get('status', {}).get('messages', [])
            starts = [v.get('timestamp') for k, v in events if k == 'execution_start' and v.get('timestamp')]
            ends = [v.get('timestamp') for k, v in events if k in ('execution_success', 'execution_error') and v.get('timestamp')]
            if starts and ends:
                record['execution_seconds'] = round((max(ends) - min(starts)) / 1000, 3)
                record['queue_seconds'] = round(max(0, min(starts) / 1000 - record['started_at']), 3)
            if history.get('status', {}).get('status_str') == 'error':
                errors = [x[1] for x in history.get('status', {}).get('messages', []) if x[0] == 'execution_error']
                record.update(state='error', error=str(errors)[:3000])
            else:
                output_name = record.get('output_name', 'output.mp4')
                outputs = history.get('outputs', {})
                selected_outputs = [outputs.get(record['output_node'], {})] if record.get('output_node') else outputs.values()
                output = next((item for node in selected_outputs
                               for group in ('images', 'videos', 'gifs') for item in node.get(group, [])
                               if item.get('filename', '').endswith(Path(output_name).suffix)), None)
                if not output:
                    record.update(state='error', error='ComfyUI completed without the expected media output')
                else:
                    query = urllib.parse.urlencode({k: output.get(k, '') for k in ('filename', 'subfolder', 'type')})
                    with urllib.request.urlopen(COMFY + '/view?' + query, timeout=120) as response:
                        temp = folder / (output_name + '.tmp')
                        with temp.open('wb') as f:
                            while chunk := response.read(1024 * 1024):
                                f.write(chunk)
                        temp.replace(folder / output_name)
                    if output_name.endswith('.png'):
                        from PIL import Image
                        with Image.open(folder / output_name) as im:
                            record.update(width=im.width, height=im.height)
                    record.update(state='success', output_url=f'http://127.0.0.1:{PORT}/jobs/{identifier}/output',
                                  completed_at=time.time(), output_bytes=(folder / output_name).stat().st_size)
                    record['elapsed_seconds'] = round(record['completed_at'] - record['started_at'], 2)
            atomic_json(record_path, record)
        return record


class Handler(BaseHTTPRequestHandler):
    def send_json(self, code, body):
        payload = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        try:
            if self.path == '/workflows':
                info = comfy('/object_info')
                return self.send_json(200, [workflow_snapshot(m, scene, router, capabilities(info, m), ROOT) for m, scene in MODELS.items() if m.startswith('h3-')])
            if self.path == '/capabilities':
                info = comfy('/object_info')
                return self.send_json(200, {m: capabilities(info, m) for m in MODELS if m.startswith('h3-')})
            if self.path == '/health':
                queue = comfy('/queue')
                return self.send_json(200, dict(status='ok', comfyui=COMFY, models=MODELS,
                    running=len(queue.get('queue_running', [])), pending=len(queue.get('queue_pending', []))))
            replay_match = re.fullmatch(r'/replay/([0-9a-f-]{36})', self.path)
            if replay_match:
                replay_graph(RUNS, replay_match[1], RUNS, router.import_asset, dry_run=True)
                return self.send_json(200, {'ready': True, 'workflow': 'verified', 'references': 'verified', 'modelFiles': 'unchanged', 'generatesMedia': False})
            match = re.fullmatch(r'/jobs/([0-9a-f-]{36})(/output)?', self.path)
            if not match:
                return self.send_json(404, {'error': 'Not found'})
            identifier = str(uuid.UUID(match[1]))
            if not match[2]:
                return self.send_json(200, job_status(identifier))
            folder = RUNS / identifier
            record = json.loads((folder/'job.json').read_text())
            output = folder / record.get('output_name', 'output.mp4')
            output_size = output.stat().st_size
            self.send_response(200)
            self.send_header('Content-Type', mimetypes.guess_type(output)[0])
            self.send_header('Content-Length', str(output_size))
            self.end_headers()
            with output.open('rb') as f:
                while chunk := f.read(1024 * 1024):
                    self.wfile.write(chunk)
        except FileNotFoundError:
            self.send_json(404, {'error': 'Unknown job or output not ready'})
        except Exception as exc:
            self.send_json(502, {'error': str(exc)})

    def do_POST(self):
        try:
            if self.path not in ('/jobs', '/parameters'):
                return self.send_json(404, {'error': 'Not found'})
            # Only the local backend submits JSON; cross-origin browser forms are refused.
            if self.headers.get('Origin') or not self.headers.get('Content-Type', '').startswith('application/json'):
                return self.send_json(403, {'error': 'Backend JSON requests only'})
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 95 * 1024 * 1024:
                return self.send_json(413, {'error': 'Invalid request size'})
            body = json.loads(self.rfile.read(length))
            if self.path == '/parameters':
                if body.get('model') not in MODELS or not body['model'].startswith('h3-'):
                    raise ValueError('Unknown H3 video model')
                return self.send_json(200, resolve(body, capabilities(comfy('/object_info'), body['model'])))
            result = create_job(body)
            self.send_json(202, result)
        except (ValueError, KeyError, TypeError) as exc:
            self.send_json(400, {'error': str(exc)})
        except Exception as exc:
            self.send_json(502, {'error': str(exc)})


if __name__ == '__main__':
    RUNS.mkdir(parents=True, exist_ok=True)
    print(f'Toonflow H3 bridge: http://127.0.0.1:{PORT}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
