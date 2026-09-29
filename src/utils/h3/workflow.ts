import { H3Plan } from './plan';
export type Workflow = {
  id:string; family:string; modes:string[]; fingerprint:string; checkpoint:string|null;lora:string|null;steps:number;sampler:string|null;scheduler:string|null;
  nativeAudio:boolean;referenceVideoAudio:string;structuredVideoReferences?:boolean;limits:any;evidence:{level:string;qualityVerified:boolean};config:any;baseNodes:any[];
};
export async function workflows():Promise<Workflow[]>{
  const response=await fetch('http://127.0.0.1:10589/workflows',{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('工作流能力服务不可用，请先更新本地桥接');
  return response.json() as Promise<Workflow[]>;
}
export function validateWorkflow(p:H3Plan,w:Workflow){
  if(!w.modes.includes(p.mode))throw Error(`工作流 ${w.id} 不支持 ${p.mode}`);
  if(w.structuredVideoReferences===false&&p.references?.some(r=>r.enabled&&r.kind==='video'))throw Error('该工作流尚未实现显式视频音轨职责绑定，请选择支持此能力的工作流');
  const c=w.limits;
  if(p.duration<c.duration.min||p.duration>c.duration.max)throw Error(`目标时长超出工作流 ${w.id} 的实际节点范围 ${c.duration.min}–${c.duration.max} 秒`);
  if(!c.aspectRatios.includes(p.aspectRatio))throw Error('画幅不受当前工作流支持');
  // Frame alignment is owned by the selected workflow, not a fixed official duration range.
  let frames=Math.max(c.frameOffset,c.frameRounding==='round'?Math.round(p.duration*c.fps):Math.ceil(p.duration*c.fps));frames+=(c.frameOffset-frames%c.frameStep+c.frameStep)%c.frameStep;
  if(frames>c.maxFrames)throw Error('目标时长按工作流帧网格对齐后超出范围，请缩短时长');
  if(frames/c.fps<p.duration)throw Error('所选工作流按帧舍入后短于计划，请将时长调整到完整视频帧');
  return {frames,fps:c.fps,effectiveDuration:frames/c.fps};
}
