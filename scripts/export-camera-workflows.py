"""导出现有本机路由的节点模板；不提交任务、不加载模型。"""
import importlib.util,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ROUTER=Path('/home/ubuntu/llmspace/avspace/codex/workflows/h3_router.py')
TRT=Path('/home/ubuntu/llmspace/ComfyUI工作流/projects/ComfyUI-MiniMaxH3-Easy/workspace/workflows/unified-generation/workspace/specifications/tensorrt-vae-1344-4sec/workflow.api.json')
EXPORT=Path('/home/ubuntu/llmspace/avspace/manual/comfyui/default/workflows/Toonflow')
SPEC=importlib.util.spec_from_file_location('toonflow_preview_router',ROUTER)
router=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(router)
profiles={'h3-quality':'quality','h3-reference-quality':'reference_fidelity','h3-fast-sol':'fast_sol','h3-reference-trt':'reference_trt','h3-turbo':'fast','h3-standard':'standard','h3-reference-turbo':'reference_fast','h3-reference':'reference'}
placeholder='/home/ubuntu/llmspace/avspace/shared/input/toonflow/工作流预览占位.png'
manifest={}
for model,scene in profiles.items():
 for mode in (['Ref2VA'] if 'reference' in model else ['T2VA','I2VA','FL2VA']):
  prompt='integrated_multimodal_description: 固定中景，灰色参考板位于画面中央。此内容仅供节点模板预览，正式生成前请替换为分镜提示词。\n\noverall_soundscape: 安静的室内环境。\n\nnon_diegetic_music: 无配乐。'
  if mode=='Ref2VA':prompt='subject_definitions: <Picture 1> 为参考图片占位。\n\nsummary: 节点模板预览。\n\nretention_analysis: 正式生成前替换素材与提示词。\n\ndetailed_description: 固定中景，保持参考图片的主体身份。\n\noverall_soundscape: 安静的室内环境。\n\nnon_diegetic_music: 无配乐。'
  if scene=='reference_trt':
   graph=json.loads(TRT.read_text());graph.pop('25',None)
   graph['45']['inputs']['media_state']=json.dumps({'images':[{'filename':'toonflow/工作流预览占位.png'}],'videos':[],'audios':[]},ensure_ascii=False)
   graph['2']['inputs'].update(prompt=prompt,resolution='custom',width=1344,height=768,seconds=124/24,aspect_ratio='16:9')
   graph['6']['inputs']['noise_seed']=12345
   graph['12']['inputs']['filename_prefix']='toonflow/模板预览'
   sources=[TRT]
  else:
   kwargs={'first':placeholder} if mode=='I2VA' else {'first':placeholder,'last':placeholder} if mode=='FL2VA' else {'images':[placeholder]} if mode=='Ref2VA' else {}
   graph=router.build(scene,prompt,seed=12345,length=124,**kwargs)
   graph['14']['inputs']['filename_prefix']='toonflow/模板预览'
   sources=[ROUTER,ROUTER.parent/'native_768p_api.json']
  folder=EXPORT/model;folder.mkdir(parents=True,exist_ok=True)
  api=folder/f'{mode}.api.json';ui=folder/f'{model}-{mode}.json';api.write_text(json.dumps(graph,ensure_ascii=False,indent=2))
  key=f'{model}-{mode}'
  manifest[key]={'model':model,'mode':mode,'directory':str(folder),'apiFile':str(api),'uiFile':str(ui),'image':f'/workflow-previews/{key}.png','sources':[{'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sources]}
(ROOT/'data/web/workflow-previews/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(f'已导出 {len(manifest)} 份节点模板，未提交生成任务。')
