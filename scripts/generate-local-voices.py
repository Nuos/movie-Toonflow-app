"""One-time local sample production; keeps model weights in the shared model root."""
from pathlib import Path
import os,json,time,argparse,hashlib
os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false';os.environ['TORCH_COMPILE_DISABLE']='1'
import torch,soundfile as sf
from qwen_tts import Qwen3TTSModel
p=argparse.ArgumentParser();p.add_argument('--only');args=p.parse_args()
root=Path(__file__).resolve().parents[1]
model_path=Path('/home/ubuntu/llmspace/LLM-Model/Playtime-AI/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign')
out=root/'data/oss/library/audio/voices';out.mkdir(parents=True,exist_ok=True)
specs=json.loads((root/'data/audio-library/voice-designs.json').read_text())
text='你好，今天就从这里出发吧。无论前面遇到什么，我们都把这段故事，好好说完。'
model=Qwen3TTSModel.from_pretrained(str(model_path),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
for i,spec in enumerate(specs):
 if args.only and spec['id']!=args.only: continue
 file=out/(spec['id']+'.wav');meta=out/(spec['id']+'.json')
 if file.exists() and meta.exists():continue
 seed=260922+i;torch.manual_seed(seed);t=time.monotonic()
 with torch.inference_mode():wavs,sr=model.generate_voice_design(text=text,language='Chinese',instruct=spec['prompt'],max_new_tokens=400)
 sf.write(file,wavs[0],sr,subtype='PCM_16')
 info=dict(id=spec['id'],model='Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign',revision='5ecdb67327fd37bb2e042aab12ff7391903235d3',sourceUrl='https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign',modelLicense='Apache-2.0',provenance='本机生成的虚构中文音色；年龄与性格为设计标签',text=text,prompt=spec['prompt'],seed=seed,sampleRate=sr,duration=len(wavs[0])/sr,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),generationSeconds=round(time.monotonic()-t,2))
 meta.write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:info[k] for k in ['id','duration','generationSeconds']},ensure_ascii=False),flush=True)
print('LOCAL_VOICES_READY',flush=True)
