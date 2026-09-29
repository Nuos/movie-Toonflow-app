import { z } from 'zod';
import { createHash } from 'node:crypto';

export const H3_PROTOCOL = 'minimax-h3:d21241f0a4b3acbb34c97dae47fa417b7065e438';
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Authored content is kept apart from syntax emitted by the compiler.
const prose = z.string().min(1).max(6000).refine(s => !/<\/?(?:d|Subject|Picture|Video|Audio)\b|\[Shot\s|\(S\d+\)|(?:integrated_multimodal_description|subject_definitions|retention_analysis|detailed_description)\s*:/i.test(s), '内容字段不能嵌入 H3 协议标记');
export const textSchema = z.object({ zh: prose, en: prose }).strict();
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const time = z.number().finite().min(0);
const interval = { start: time, end: time };
export const referenceSchema = z.object({
  id, source: z.enum(['assets','storyboard']), sourceId: z.number().int().positive(),
  mediaId: z.number().int().positive().nullable(), path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(['image','video','audio']), name: z.string(),
  // Four-view design sheets remain independent assets, never silently cropped or reused as a frame.
  layout: z.enum(['single','environment','prop','four-view','unknown']),
  duration: z.number().positive().nullable(),
  enabled: z.boolean(),
}).strict();
export const bindingSchema = z.object({
  referenceId: id,
  role: z.enum(['identity','environment','prop','action','camera','first-frame','last-frame','voice','sound','music']),
  subjectId: id.nullable(), shotIds: z.array(id).min(1),
  retention: z.enum(['fully_preserved','partially_preserved','attribute_transfer','weak_reference','reference','fully_copy','partially_copy']),
  instruction: textSchema,
}).strict();
export const planSchema = z.object({
  version: z.literal(1), mode: z.enum(['T2VA','I2VA','FL2VA','L2VA','Ref2VA']),
  duration: z.number().finite().positive(), aspectRatio: z.string().regex(/^\d+:\d+$/),
  style: textSchema, summary: textSchema,
  subjects: z.array(z.object({id, kind:z.enum(['person','environment','prop','animal']), name:z.string().min(1), identity:textSchema}).strict()),
  references: z.array(referenceSchema).max(12), bindings: z.array(bindingSchema),
  speakers: z.array(z.object({id, subjectId:id.nullable(), name:z.string().min(1), voice:textSchema}).strict()),
  shots: z.array(z.object({
    id, storyboardId:z.number().int().positive(), sourceText:z.string().default(''), ...interval, purpose:textSchema,
    subjectIds:z.array(id).min(1), opening:textSchema, ending:textSchema,
    spatial:z.array(z.object({subjectId:id, relativeTo:id.nullable(), relation:textSchema}).strict()),
    phases:z.array(z.object({id,...interval,subjectIds:z.array(id).min(1),action:textSchema,endState:textSchema}).strict()).min(1),
    camera:z.object({framing:textSchema,position:textSchema,movement:textSchema,focus:textSchema,visibleSubjectIds:z.array(id)}).strict(),
    continuity:textSchema,
  }).strict()).min(1),
  sound:z.array(z.object({id,...interval,kind:z.enum(['dialogue','narration','effect']),speakerId:id.nullable(),language:z.string().min(1),text:z.string().describe('仅 dialogue/narration 填写逐字原台词；effect 必须为空字符串，其声音内容写入 delivery'),delivery:textSchema,referenceId:id.nullable()}).strict()),
  soundscape:textSchema, music:textSchema,
}).strict();
export type H3Plan = z.infer<typeof planSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type Issue = { code:string; path:string; message:string; severity:'error'|'warning'; evidence?:string };
export function inspectPlan(p:H3Plan):Issue[] {
  const issues:Issue[]=[];
  const add=(code:string,path:string,message:string)=>issues.push({code,path,message,severity:'error'});
  const unique=(values:string[],path:string)=>{if(new Set(values).size!==values.length)add('duplicate',path,'编号重复');};
  unique(p.subjects.map(s=>s.id),'/subjects');unique(p.references.map(r=>r.id),'/references');unique(p.shots.map(s=>s.id),'/shots');unique(p.speakers.map(s=>s.id),'/speakers');unique(p.sound.map(s=>s.id),'/sound');
  const subjects=new Set(p.subjects.map(s=>s.id)), shots=new Set(p.shots.map(s=>s.id)), speakers=new Set(p.speakers.map(s=>s.id));
  const refMap=new Map(p.references.filter(r=>r.enabled).map(r=>[r.id,r]));
  const checkSubject=(sid:string|null,path:string)=>{if(sid&&!subjects.has(sid))add('subject',path,'人物或空间实体编号不存在');};
  let last=0;
  p.shots.forEach((s,i)=>{
    const path=`/shots/${i}`;
    if(s.start!==last||s.end<=s.start||s.end>p.duration)add('shot-time',path,'镜头必须连续覆盖目标时长，不能重叠、留空或越界');last=s.end;
    s.subjectIds.forEach(sid=>checkSubject(sid,path+'/subjectIds'));
    s.camera.visibleSubjectIds.forEach(sid=>{checkSubject(sid,path+'/camera/visibleSubjectIds');if(!s.subjectIds.includes(sid))add('visibility',path+'/camera/visibleSubjectIds','摄影可见主体必须属于本镜');});
    s.spatial.forEach((r,j)=>{checkSubject(r.subjectId,`${path}/spatial/${j}`);checkSubject(r.relativeTo,`${path}/spatial/${j}`);});
    let phaseEnd=s.start;unique(s.phases.map(a=>a.id),path+'/phases');
    s.phases.forEach((a,j)=>{if(a.start!==phaseEnd||a.end<=a.start||a.end>s.end)add('phase-time',`${path}/phases/${j}`,'动作阶段需按序连续覆盖本镜');phaseEnd=a.end;a.subjectIds.forEach(sid=>{checkSubject(sid,`${path}/phases/${j}`);if(!s.subjectIds.includes(sid))add('phase-subject',`${path}/phases/${j}`,'动作主体不属于本镜');});});
    if(phaseEnd!==s.end)add('phase-coverage',path+'/phases','动作阶段没有覆盖到镜头结束');
  });
  if(last!==p.duration)add('duration','/shots','镜头总时长不等于目标时长');
  p.speakers.forEach((s,i)=>checkSubject(s.subjectId,`/speakers/${i}/subjectId`));
  const orderedSound=[...p.sound].sort((a,b)=>a.start-b.start);
  p.sound.forEach((s,i)=>{
    const path=`/sound/${i}`;
    if(s.end<=s.start||s.end>p.duration)add('sound-time',path,'声音时间段为空或越界');
    if(s.kind!=='effect'){
      if(!s.speakerId||!speakers.has(s.speakerId))add('speaker',path+'/speakerId','对白和旁白必须绑定独立声音来源');
      if(!s.text.trim()||/[<>]/.test(s.text))add('dialogue',path+'/text','台词不能为空或含协议标签');
      if(s.text.replace(/[\s\p{P}]/gu,'').length/(s.end-s.start)>5.5)add('speech-budget',path,'台词时间明显拥挤，需要局部调整声音时间线');
    }else if(s.text&&s.text!=='N/A')add('effect-text',path,'音效描述放在 delivery 中，不能混入台词');
    if(!p.shots.some(shot=>s.start>=shot.start&&s.end<=shot.end))add('cross-cut-speech',path,'当前编译器不隐式切开跨镜台词，请在分镜计划中明确安排');
    if(s.referenceId&&!refMap.has(s.referenceId))add('audio-reference',path+'/referenceId','声音引用不存在或未启用');
    if(s.referenceId&&refMap.get(s.referenceId)?.kind!=='audio')add('audio-kind',path+'/referenceId','声音必须绑定显式音频素材；视频音轨需单独导入');
  });
  for(let i=1;i<orderedSound.length;i++){const a=orderedSound[i-1],b=orderedSound[i];if(a.kind!=='effect'&&b.kind!=='effect'&&a.end>b.start)add('speech-overlap',`/sound/${p.sound.indexOf(b)}`,'当前版本不允许对白互相覆盖');}
  p.bindings.forEach((b,i)=>{
    const path=`/bindings/${i}`,r=refMap.get(b.referenceId);
    if(!r){add('reference',path,'绑定引用不存在或未启用');return;}
    checkSubject(b.subjectId,path+'/subjectId');
    b.shotIds.forEach(s=>{if(!shots.has(s))add('binding-shot',path+'/shotIds','绑定的镜头不存在');});
    if(r.layout==='four-view')add('design-sheet',path,'四视图定妆照必须独立保留，请选择已准备的单人参考');
    if(r.layout==='unknown')add('unclassified-reference',path,'参考布局尚未确认，不能把未知多人图自动当作身份或首帧');
    if(['first-frame','last-frame'].includes(b.role)&&r.kind!=='image')add('frame-type',path,'首尾帧必须是图片');
    if(['identity','environment','prop','action'].includes(b.role)&&(!b.subjectId||r.kind==='audio'))add('content-binding',path,'可见内容职责必须绑定主体与图像/视频素材');
    if(['voice','sound','music'].includes(b.role)&&r.kind!=='audio')add('audio-binding',path,'声音职责只允许显式音频素材');
    if(b.role==='voice'&&!p.speakers.some(s=>s.subjectId===b.subjectId))add('voice-speaker',path,'声线职责必须绑定计划中的说话者');
    if(r.kind==='audio'&&!['reference','fully_copy','partially_copy','weak_reference'].includes(b.retention))add('retention',path,'声音保留关系不符合协议');
    if(r.kind!=='audio'&&['reference','fully_copy','partially_copy'].includes(b.retention))add('retention',path,'可见内容保留关系不符合协议');
    if(p.mode!=='Ref2VA'&&!['first-frame','last-frame'].includes(b.role))add('base-binding',path,'基础首尾帧模式不支持独立身份、声音或动作参考');
  });
  for(const r of refMap.values())if(!p.bindings.some(b=>b.referenceId===r.id))add('unbound-reference','/bindings',`素材 ${r.name} 缺少职责绑定`);
  const enabled=[...refMap.values()],counts=(kind:string)=>enabled.filter(r=>r.kind===kind).length;
  if(p.mode==='Ref2VA'){
    if(!counts('image')&&!counts('video'))add('ref-empty','/references','当前本地 Ref2VA 需要图像或视频');
    if(counts('image')>9||counts('video')>3||counts('audio')>3)add('ref-limit','/references','引用超出 9 图 / 3 视频 / 3 音频限制');
    for(const kind of ['video','audio']){const refs=enabled.filter(r=>r.kind===kind);if(refs.some(r=>r.duration==null))add('ref-duration','/references',`${kind} 参考素材需要实际测得时长`);}
  }else{
    const count={T2VA:0,I2VA:1,FL2VA:2,L2VA:1}[p.mode];
    if(enabled.length!==count||enabled.some(r=>r.kind!=='image'))add('base-reference','/references','首尾帧模式的引用数量或类型错误');
    const first=p.bindings.filter(b=>b.role==='first-frame'),end=p.bindings.filter(b=>b.role==='last-frame');
    if(first.length!==(['I2VA','FL2VA'].includes(p.mode)?1:0)||end.length!==(['L2VA','FL2VA'].includes(p.mode)?1:0))add('frame-binding','/bindings','首尾帧职责与输入模式不符');
    if(first.length&&first[0].referenceId!==enabled[0]?.id)add('frame-order','/bindings','首帧必须对应实际提交的第一张图');
    if(end.length&&end[0].referenceId!==enabled[p.mode==='FL2VA'?1:0]?.id)add('frame-order','/bindings','尾帧必须对应实际提交顺序');
    if(first.some(b=>b.shotIds.length!==1||b.shotIds[0]!==p.shots[0].id)||end.some(b=>b.shotIds.length!==1||b.shotIds[0]!==p.shots.at(-1)!.id))add('frame-shot','/bindings','首帧必须绑定开镜，尾帧必须绑定末镜');
  }
  return issues;
}
export function requireValidPlan(raw:unknown):H3Plan {
  const p=planSchema.parse(raw),issues=inspectPlan(p).filter(i=>i.severity==='error');
  if(issues.length)throw Error(issues.map(i=>`${i.path}：${i.message}`).join('\n'));
  return p;
}

// Changes are immutable, exact-path replacements with an old-value precondition.
export function patchPlan(plan:H3Plan,raw:unknown,allowedPaths:string[]) {
  const patches=z.array(z.object({path:z.string(),before:z.unknown(),value:z.unknown(),reason:z.string().min(1)}).strict()).min(1).parse(raw);
  const next=structuredClone(plan),seen=new Set<string>();
  for(const p of patches){
    if(!allowedPaths.some(root=>p.path===root||p.path.startsWith(root+'/'))||seen.has(p.path)||!/^\/(shots|sound|speakers|bindings|summary|style|music|soundscape)(\/[^/]+)*$/.test(p.path))throw Error('补丁超出已定位问题的字段范围');
    if(p.path.split('/').some(k=>['__proto__','prototype','constructor'].includes(k)))throw Error('非法字段路径');
    seen.add(p.path);const keys=p.path.slice(1).split('/');let parent:any=next;
    for(const k of keys.slice(0,-1)){if(!Object.hasOwn(parent,k))throw Error('补丁路径不存在');parent=parent[k];}
    const key=keys.at(-1)!;if(!Object.hasOwn(parent,key)||digest(parent[key])!==digest(p.before))throw Error('补丁依据已过期');parent[key]=p.value;
  }
  const parsed=planSchema.parse(next);
  // Technical envelope and source identities cannot be altered by semantic correction.
  if(parsed.duration!==plan.duration||parsed.mode!==plan.mode||parsed.aspectRatio!==plan.aspectRatio||digest(parsed.references)!==digest(plan.references)||digest(parsed.subjects)!==digest(plan.subjects)||digest(parsed.shots.map(s=>[s.id,s.storyboardId,s.sourceText,s.start,s.end]))!==digest(plan.shots.map(s=>[s.id,s.storyboardId,s.sourceText,s.start,s.end]))||digest(parsed.sound.filter(s=>s.kind!=='effect').map(s=>[s.id,s.kind,s.speakerId,s.text]))!==digest(plan.sound.filter(s=>s.kind!=='effect').map(s=>[s.id,s.kind,s.speakerId,s.text])))throw Error('局部修正不能改变剧情台词、身份、镜号或技术配置');
  return {plan:parsed,patches};
}
