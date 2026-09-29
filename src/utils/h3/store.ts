import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { safeMediaPath } from '../productionStorage';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import u from '@/utils';
import { db } from '../db';
import { scriptVideoRatio } from '../videoAspectRatio';
import { characterVoiceContext } from '../characterVoices';
import { storyboardSections, renderActionTable } from '../actionStoryboardFormat';
import { planSchema, H3Plan, Reference, Issue, inspectPlan, patchPlan, digest } from './plan';
import { COMPILER_VERSION, compileH3, projectPlan } from './compiler';
import { workflows, Workflow, validateWorkflow } from './workflow';
const sql:any=db;
const liveRuns=new Set<string>();
const recoveringRuns=new Set<string>();
let ready:Promise<void>|undefined;
export function ensureH3(){return ready||=(async()=>{
  if(!await sql.schema.hasTable('o_h3Revision'))await sql.schema.createTable('o_h3Revision',(t:any)=>{
    t.string('id').primary();t.bigInteger('projectId');t.bigInteger('scriptId');t.bigInteger('trackId');t.integer('ownerId');t.integer('revision');t.string('parentId');t.string('state');t.string('sourceHash');t.text('data');t.text('error');t.bigInteger('createdAt');t.unique(['trackId','revision']);
  });
  if(!await sql.schema.hasTable('o_h3Active'))await sql.schema.createTable('o_h3Active',(t:any)=>{t.bigInteger('trackId').primary();t.string('revisionId');t.string('projectionHash');});
  if(!await sql.schema.hasTable('o_h3Run'))await sql.schema.createTable('o_h3Run',(t:any)=>{t.string('id').primary();t.bigInteger('projectId');t.bigInteger('trackId');t.text('data');});
  if(!await sql.schema.hasTable('o_h3Reference'))await sql.schema.createTable('o_h3Reference',(t:any)=>{t.bigInteger('projectId');t.string('sha256');t.text('data');t.unique(['projectId','sha256']);});
})().catch(e=>{ready=undefined;throw e;});}
const parse=(s:string)=>JSON.parse(s.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
export const selectionSchema=z.array(z.object({id:z.number().int().positive(),sources:z.enum(['assets','storyboard']),mediaId:z.number().int().positive().optional()}).strict());
export type Selection=z.infer<typeof selectionSchema>;
export const modeFor=(m:string)=>m==='text'?'T2VA':m==='singleImage'?'I2VA':m==='startEndRequired'?'FL2VA':m==='lastImage'?'L2VA':m.startsWith('[')?'Ref2VA':m;
const runFile=promisify(execFile);
const mediaHash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function owned(projectId:number,ownerId:number,connection=sql){const p=await connection('o_project').where({id:projectId,userId:ownerId}).first();if(!p)throw Error('项目不存在或无权访问');return p;}
export async function collectContext(projectId:number,trackId:number,ownerId:number,selection:Selection,connection=sql){
  await ensureH3();const project=await owned(projectId,ownerId,connection);
  const track=await connection('o_videoTrack').where({id:trackId,projectId}).first();if(!track)throw Error('轨道不存在');
  const script=await connection('o_script').where({id:track.scriptId,projectId}).first();if(!script)throw Error('剧集不存在');
  const boards=await connection('o_storyboard').where({trackId,projectId,scriptId:track.scriptId}).orderBy('index').orderBy('id');if(!boards.length)throw Error('轨道没有分镜');
  const assets=await connection('o_assets2Storyboard').join('o_assets','o_assets.id','o_assets2Storyboard.assetId').whereIn('storyboardId',boards.map((b:any)=>b.id)).where('o_assets.projectId',projectId).select('o_assets.*');
  const refs:Reference[]=[],referenceEvidence:{referenceId:string;observations:string;evidence:string}[]=[];
  for(const item of selection){
    const row=item.sources==='assets'?await connection('o_assets').leftJoin('o_image','o_image.id','o_assets.imageId').where({'o_assets.id':item.id,'o_assets.projectId':projectId}).select('o_assets.name','o_assets.type','o_assets.imageId','o_image.filePath','o_image.type as mediaType').first():await connection('o_storyboard').where({id:item.id,projectId,scriptId:script.id}).first();
    if(item.mediaId){
      if(item.sources!=='assets')throw Error('分镜参考不能指定资产历史图片');
      const media=await connection('o_image').where({id:item.mediaId,assetsId:item.id}).first();
      if(!row||!media?.filePath)throw Error('历史素材不属于所选资产');
      row.imageId=media.id;row.filePath=media.filePath;row.mediaType=media.type;
    }
    if(!row?.filePath)throw Error(`参考 ${item.id} 没有已保存文件`);
    const sha256=mediaHash(await u.oss.getFile(row.filePath));
    const metadata=await connection('o_h3Reference').where({projectId,sha256}).first(),meta=metadata?JSON.parse(metadata.data):{};
    const kind=['audio','video'].includes(row.mediaType||row.type)?row.mediaType||row.type:'image';
    let duration:number|null=null;
    if(kind!=='image'){
      const probe=await runFile('/home/ubuntu/.local/bin/ffprobe',['-v','error','-show_entries','format=duration','-of','json',safeMediaPath(u.getPath('oss'),row.filePath)],{timeout:15000});
      duration=Number(JSON.parse(probe.stdout).format?.duration);if(!Number.isFinite(duration)||duration<=0)throw Error('无法测得音视频参考时长');
    }
    refs.push({id:`r${refs.length+1}`,source:item.sources,sourceId:item.id,mediaId:row.imageId||null,path:row.filePath,sha256,kind,name:row.name||`分镜 ${item.id}`,layout:meta.layout||(kind==='image'?'unknown':'single'),duration,enabled:true});
    if(meta.observations)referenceEvidence.push({referenceId:refs.at(-1)!.id,observations:meta.observations,evidence:meta.evidence});
  }
  const aspectRatio=scriptVideoRatio(script.content||'',project.videoRatio||'16:9');
  const characterVoices=await characterVoiceContext(connection,projectId,trackId,selection);
  const source={script:script.content,boards:boards.map((b:any)=>({id:b.id,trackId:b.trackId,index:b.index,duration:b.duration,prompt:b.prompt,videoDesc:b.videoDesc,filePath:b.filePath})),assets:assets.map((a:any)=>({id:a.id,name:a.name,type:a.type,describe:a.describe,imageId:a.imageId})),track:{id:track.id,duration:track.duration},references:refs,aspectRatio,...(referenceEvidence.length?{referenceEvidence}:{}),...(characterVoices?{characterVoices}:{})};
  return {project,track,script,boards,assets,references:refs,source,sourceHash:digest(source)};
}
export async function classifyReference(projectId:number,ownerId:number,trackId:number,selection:Selection,referenceId:string,metadata:unknown){
  const meta=z.object({layout:z.enum(['single','environment','prop','four-view','unknown']),duration:z.number().positive().nullable(),evidence:z.string().min(3),observations:z.string().max(4000).optional()}).strict().parse(metadata);
  const ctx=await collectContext(projectId,trackId,ownerId,selection),r=ctx.references.find(r=>r.id===referenceId);if(!r)throw Error('素材不存在');
  await sql('o_h3Reference').insert({projectId,sha256:r.sha256,data:JSON.stringify({...meta,ownerId,at:Date.now()})}).onConflict(['projectId','sha256']).merge();return r.sha256;
}
function sourceSpeech(ctx:Awaited<ReturnType<typeof collectContext>>){
  return ctx.boards.flatMap((b:any)=>{
    const section=storyboardSections(b.videoDesc||''),source=section['原剧情与台词']||'';
    return source.split(/\r?\n/).flatMap((line:string)=>{const m=line.trim().match(/^(?![△▲#])([^：:]{1,60})[：:]\s*(.+)$/);return m?[{storyboardId:b.id,speaker:m[1],text:m[2]}]:[];});
  });
}
function sourceIssues(plan:H3Plan,ctx:Awaited<ReturnType<typeof collectContext>>,targetDuration=Number(ctx.track.duration)):Issue[]{
  const issues:Issue[]=[];
  if(digest(plan.references)!==digest(ctx.references)||plan.duration!==targetDuration||plan.aspectRatio!==ctx.source.aspectRatio||digest(plan.shots.map(s=>s.storyboardId))!==digest(ctx.boards.map((b:any)=>b.id)))issues.push({code:'source',path:'/shots',message:'计划改变了真实素材、分镜顺序、画幅或轨道时长',severity:'error'});
  const expected=sourceSpeech(ctx).map((s:{text:string})=>s.text),actual=[...plan.sound].sort((a,b)=>a.start-b.start).filter(s=>s.kind!=='effect').map(s=>s.text);
  if(expected.length&&digest(expected)!==digest(actual))issues.push({code:'source-dialogue',path:'/sound',message:'台词须逐句保留原文、顺序和重复次数',severity:'error'});
  return issues;
}
const reviewSchema=z.object({issues:z.array(z.object({fieldId:z.string().optional(),path:z.string().optional(),quote:z.string().min(2),message:z.string().min(4)}).strict()).max(20)}).strict();
function atPath(plan:H3Plan,path:string):unknown {if(!/^\/(shots|sound|speakers|bindings|summary|style|music|soundscape)(\/[^/]+)*$/.test(path))throw Error('检查字段不允许修正');let v:any=plan;for(const k of path.slice(1).split('/')){if(['__proto__','constructor','prototype'].includes(k)||v==null||!Object.hasOwn(v,k))throw Error('检查字段不存在');v=v[k];}return v;}
export function reviewTargets(plan:H3Plan){
 const targets:{fieldId:string;path:string;value:any}[]=[];
 const visit=(value:any,path:string)=>{if(value&&typeof value==='object'&&typeof value.zh==='string'&&typeof value.en==='string'){targets.push({fieldId:`F${targets.length+1}`,path,value});return;}if(Array.isArray(value))value.forEach((v,i)=>visit(v,`${path}/${i}`));else if(value&&typeof value==='object')for(const [k,v] of Object.entries(value))visit(v,`${path}/${k}`);};
 for(const key of ['shots','sound','speakers','bindings','summary','style','music','soundscape'] as const)visit(plan[key],'/'+key);
 return targets;
}
async function semanticReview(plan:H3Plan,source?:unknown){
 const targets=reviewTargets(plan);
 const response=await u.Ai.Text('universalAi',true,2).invoke({system:'你是结构化分镜检查器。只检查明确的身份、空间、动作支撑、摄影可见范围、声音时间和中英文语义冲突，不臆测未知空间或修改剧情。source.referenceEvidence 是对实际素材的观察：检查绑定是否误把背景的空间距离或构图带入目标场景，不把资产旧描述当作所选历史图片的事实。只输出 {"issues":[{"fieldId":"F1","quote":"该字段中确实存在的连续原文","message":"具体矛盾和原因"}]}，无问题返回空数组。fieldId 必须从给定 targets 选择，程序负责定位字段，禁止自己编写字段路径或编号。不要报告审美偏好，不写新计划。',messages:[{role:'user',content:JSON.stringify({plan,targets,source})}]});
 try{return reviewSchema.parse(parse(response.text)).issues.map(i=>{
   const path=i.fieldId?targets.find(t=>t.fieldId===i.fieldId)?.path:i.path;if(!path)throw Error('检查器返回了不存在的字段编号');
   const value=atPath(plan,path);if(!(typeof value==='string'?value:JSON.stringify(value)).includes(i.quote))throw Error('检查器未提供可定位的真实引用');return {path,message:i.message,code:'semantic',severity:'error' as const,evidence:i.quote};
 });}catch(e:any){e.reviewOutput=response.text;throw e;}
}
async function insertRevision(ctx:Awaited<ReturnType<typeof collectContext>>,ownerId:number,data:any,parentId:string|null,state:string){
  return sql.transaction(async(trx:any)=>{const old=await trx('o_h3Revision').where({trackId:ctx.track.id}).max('revision as value').first();const id=randomUUID();await trx('o_h3Revision').insert({id,projectId:ctx.project.id,scriptId:ctx.script.id,trackId:ctx.track.id,ownerId,revision:Number(old?.value||0)+1,parentId,state,sourceHash:ctx.sourceHash,data:JSON.stringify(data),createdAt:Date.now()});return id;});
}
export async function getRevision(id:string,ownerId:number){await ensureH3();const r=await sql('o_h3Revision').where({id,ownerId}).first();if(!r)throw Error('版本不存在或无权访问');await owned(r.projectId,ownerId);return {...r,data:JSON.parse(r.data)};}
export async function listRevisions(projectId:number,trackId:number,ownerId:number){await ensureH3();await owned(projectId,ownerId);return sql('o_h3Revision').where({projectId,trackId,ownerId}).orderBy('revision','desc').select('id','revision','state','parentId','error','createdAt');}
export async function generatePlan(projectId:number,trackId:number,ownerId:number,selection:Selection,model:string,mode:string,requestedDuration?:number){
  const ctx=await collectContext(projectId,trackId,ownerId,selection),workflow=(await workflows()).find(w=>w.id===model.split(':').at(-1));if(!workflow)throw Error('所选工作流不在实际安装清单内');
  const inputMode=planSchema.shape.mode.parse(modeFor(mode));
  const envelope={version:1,mode:inputMode,duration:requestedDuration??Number(ctx.track.duration),aspectRatio:ctx.source.aspectRatio,references:ctx.references};
  validateWorkflow({...envelope} as H3Plan,workflow);
  if(ctx.references.some(r=>r.layout==='four-view'||r.layout==='unknown'))throw Error('请在 H3 计划中确认参考素材职责与布局；四视图保留为定妆资产，请选择独立单人图');
  const authoredSchema=planSchema.omit({version:true,mode:true,duration:true,aspectRatio:true,references:true});
  const id=await insertRevision(ctx,ownerId,{source:ctx.source,selection,workflow,envelope},null,'planning');
  try{
    const result=await u.Ai.Text('universalAi',true,3).invoke({
      system:`你负责 Toonflow 的结构化视听内容规划，不写最终 H3 提示词。只输出符合以下 JSON Schema 的 JSON。所有 text 对象 zh 用简体中文，en 用准确英文，两者含义一致；中文台词原文逐字保留。引用真实主体ID与素材ID，编号和协议标签全部由程序生成，文本字段禁止手写 H3 标记。分离人物身份、空间、动作阶段、摄影、声音；开场为单一静态姿态，动作阶段连续覆盖本镜。人物数量和动作因果来自剧本；不凭声线推断年龄外观；不可把角色四视图构图带入场景。保持原分镜ID和顺序，目标总时长以 envelope.duration 为准，安排连续动作与声音时间线；逐句保留原剧情台词的重复次数。不要为了保留旧描述而保留其矛盾，应按原剧本与主体身份修正空间、支撑和取景。只采用真实提供的参考并逐个绑定其职责；source.referenceEvidence 是所选具体文件的观察，优先于资产旧描述；环境参考不得自动锁定与目标空间冲突的距离或地形构图。保持同一个人物身份一般使用 fully_preserved，attribute_transfer 仅用于特征转移给另一可识别对象。语音参考仅限制声线；单图模式只能绑定 first-frame，首尾帧模式按顺序绑定首尾帧。无音乐的 en 写 N/A。当前时间范围以给定工作流为准。\n${JSON.stringify(z.toJSONSchema(authoredSchema))}`,
      messages:[{role:'user',content:JSON.stringify({source:ctx.source,envelope,workflow,originalSpeech:sourceSpeech(ctx)})}],
    });
    await sql('o_h3Revision').where({id}).update({data:JSON.stringify({source:ctx.source,selection,workflow,envelope,modelOutput:result.text})});
    const candidate=parse(result.text);
    const plan=planSchema.parse({...candidate,...envelope,shots:candidate.shots.map((s:any)=>({...s,sourceText:storyboardSections(ctx.boards.find((b:any)=>b.id===s.storyboardId)?.videoDesc||'')['原剧情与台词']||''}))});
    const issues=[...inspectPlan(plan),...sourceIssues(plan,ctx,envelope.duration)];
    if(!issues.length)issues.push(...await semanticReview(plan,ctx.source));
    const timing=validateWorkflow(plan,workflow),compiled=issues.length?null:compileH3(plan,timing.effectiveDuration);
    await sql('o_h3Revision').where({id}).update({state:issues.length?'needs-repair':'ready',data:JSON.stringify({source:ctx.source,selection,workflow,plan,issues,compiled,timing,compilerVersion:COMPILER_VERSION,modelOutput:result.text})});
  }catch(e:any){await sql('o_h3Revision').where({id}).update({state:'failed',error:e.message});throw Error(`H3 计划版本 ${id} 未通过：${e.message}`);}
  return getRevision(id,ownerId);
}
export async function repairPlan(id:string,ownerId:number){
  const parent=await getRevision(id,ownerId),d=parent.data;if(!d.plan||!d.issues?.length)throw Error('当前版本没有待修正的问题');
  const ctx=await collectContext(parent.projectId,parent.trackId,ownerId,d.selection);if(ctx.sourceHash!==parent.sourceHash)throw Error('源分镜或素材已变化，请重新规划');
  const issuesBefore=[...inspectPlan(d.plan),...sourceIssues(d.plan,ctx,d.plan.duration),...d.issues.filter((i:Issue)=>i.code==='semantic')];
  const allowed=[...new Set<string>(issuesBefore.map((i:Issue)=>i.path))];
  const nextId=await insertRevision(ctx,ownerId,{...d,issues:issuesBefore},id,'repairing');
  try{
    if(!issuesBefore.length){
      const issues=await semanticReview(d.plan,ctx.source),timing=validateWorkflow(d.plan,d.workflow);
      await sql('o_h3Revision').where({id:nextId}).update({state:issues.length?'needs-repair':'ready',data:JSON.stringify({...d,issues,timing,compiled:issues.length?null:compileH3(d.plan,timing.effectiveDuration,d.compilerVersion||d.compiled?.compiler||'h3-compiler/1'),patches:[],changeReason:'按当前结构化契约重新检查'})});
      return getRevision(nextId,ownerId);
    }
    const result=await u.Ai.Text('universalAi',true,3).invoke({system:'仅输出 JSON 数组，每项 {"path":"精确问题路径或其子字段","before":原字段完整值,"value":修改后完整值,"reason":"修改依据"}。只修改已指出问题的字段，不改变其他内容、身份、原台词、镜号或技术配置。中英文字段一起保持语义一致。音效文本可移入 delivery，但对白原文不得改动。禁止全量重写。',messages:[{role:'user',content:JSON.stringify({plan:d.plan,issues:issuesBefore,allowedPaths:allowed})}]});
    await sql('o_h3Revision').where({id:nextId}).update({data:JSON.stringify({...d,issues:issuesBefore,patchOutput:result.text})});
    const fixed=patchPlan(d.plan,parse(result.text),allowed),issues=[...inspectPlan(fixed.plan),...sourceIssues(fixed.plan,ctx,d.plan.duration)];
    if(!issues.length)issues.push(...await semanticReview(fixed.plan,ctx.source));
    const timing=validateWorkflow(fixed.plan,d.workflow),compiled=issues.length?null:compileH3(fixed.plan,timing.effectiveDuration,d.compilerVersion||d.compiled?.compiler||'h3-compiler/1');
    await sql('o_h3Revision').where({id:nextId}).update({state:issues.length?'needs-repair':'ready',data:JSON.stringify({...d,plan:fixed.plan,issues,compiled,timing,patches:fixed.patches,patchOutput:result.text})});
  }catch(e:any){await sql('o_h3Revision').where({id:nextId}).update({state:'failed',error:e.message,...(e.reviewOutput?{data:JSON.stringify({...d,reviewOutput:e.reviewOutput})}:{})});throw Error(`局部修正版本 ${nextId} 未采用：${e.message}`);}
  return getRevision(nextId,ownerId);
}
export async function applyPlan(id:string,ownerId:number){
  const revision=await getRevision(id,ownerId),d=revision.data;if(revision.state==='applied'){if((await activePlan(revision.trackId))?.id!==id)throw Error('此版本已经被替换，请从当前版本建立修正');return revision;}
  if(revision.state!=='ready'||!d.compiled)throw Error('计划尚未通过检查');
  const live=(await workflows()).find(w=>w.id===d.workflow.id);if(!live||live.fingerprint!==d.workflow.fingerprint)throw Error('工作流配置已变化，请重新编译验证');
  const projection=projectPlan(d.plan),ctx=await collectContext(revision.projectId,revision.trackId,ownerId,d.selection);
  if(ctx.sourceHash!==revision.sourceHash)throw Error('源分镜或素材已变化，旧版本不能覆盖');
  await sql.transaction(async(trx:any)=>{
    const current=await collectContext(revision.projectId,revision.trackId,ownerId,d.selection,trx);
    if(current.sourceHash!==revision.sourceHash)throw Error('采用期间源数据已变化');
    if(current.track.state==='生成中'||current.boards.some((b:any)=>b.state==='生成中'))throw Error('当前轨道或分镜正在生成，不能采用新计划');
    const before={boards:current.boards,track:current.track,active:await trx('o_h3Active').where({trackId:revision.trackId}).first()};
    for(const p of projection)await trx('o_storyboard').where({id:p.id,projectId:revision.projectId,trackId:revision.trackId}).update({videoDesc:p.videoDesc,prompt:p.prompt,duration:String(p.duration)});
    await trx('o_videoTrack').where({id:revision.trackId,projectId:revision.projectId}).update({prompt:d.compiled.prompt,duration:d.plan.duration,state:'已完成',reason:''});
    await trx('o_h3Active').insert({trackId:revision.trackId,revisionId:id,projectionHash:digest(projection)}).onConflict('trackId').merge();
    const boards=await trx('o_storyboard').where({projectId:revision.projectId,scriptId:revision.scriptId}).orderBy('index').orderBy('id');
    const work=await trx('o_agentWorkData').where({projectId:revision.projectId,episodesId:revision.scriptId,key:'productionAgent'}).first();
    if(work){const saved=JSON.parse(work.data||'{}');await trx('o_agentWorkData').where({id:work.id}).update({data:JSON.stringify({...saved,storyboard:boards,storyboardTable:renderActionTable(boards),h3Pipeline:1})});}
    if(await trx.schema.hasTable('o_cameraClip'))for(const clip of await trx('o_cameraClip').whereIn('storyboardId',projection.map(p=>p.id))){const old=clip.review?JSON.parse(clip.review):null;if(old)await trx('o_cameraClip').where({id:clip.id}).update({review:JSON.stringify({status:'stale',reason:'H3结构化计划已更新',revisionId:id,previousReview:old})});}
    await trx('o_h3Revision').where({id}).update({state:'applied',data:JSON.stringify({...d,before})});
  });return getRevision(id,ownerId);
}
export async function activePlan(trackId:number,connection=sql){
  await ensureH3();const active=await connection('o_h3Active').where({trackId}).first();if(!active)return null;
  const row=await connection('o_h3Revision').where({id:active.revisionId}).first();if(!row)return null;return {...row,data:JSON.parse(row.data)};
}
export async function nativeGenerate(projectId:number,trackId:number,ownerId:number,selection:Selection,model:string,mode:string){
  const previous=await activePlan(trackId);
  if(previous?.projectId===projectId)selection=selection.map(r=>previous.data.selection.find((saved:any)=>saved.id===r.id&&saved.sources===r.sources)||r);
  const revision=await generatePlan(projectId,trackId,ownerId,selection,model,mode);
  if(revision.state!=='ready')throw Error(`H3 计划需要局部修正：${revision.data.issues.map((i:Issue)=>`${i.path} ${i.message}`).join('；')}。版本 ${revision.id} 已保存。`);
  await applyPlan(revision.id,ownerId);return revision.data.compiled.prompt as string;
}

/** Verify projections before generation, including edits made by legacy clients. */
export async function compiledInput(projectId:number,trackId:number,ownerId:number,model:string,duration:number,aspectRatio:string){
  await owned(projectId,ownerId);const active=await activePlan(trackId);if(!active||active.projectId!==projectId)throw Error('请先通过 H3 结构化计划生成并采用提示词');
  const d=active.data,p=d.plan as H3Plan;
  if(model.split(':').at(-1)!==d.workflow.id||duration!==p.duration||aspectRatio!==p.aspectRatio)throw Error('生成配置与已采用计划不一致，请在计划中重新选择工作流或时长');
  const current=(await workflows()).find(w=>w.id===d.workflow.id);if(!current||current.fingerprint!==d.workflow.fingerprint)throw Error('工作流已变化，请重新验证计划');
  const boards=await sql('o_storyboard').where({projectId,trackId}).orderBy('index').orderBy('id'),projection=projectPlan(p);
  if(digest(boards.map((b:any)=>({id:b.id,duration:Number(b.duration),prompt:b.prompt,videoDesc:b.videoDesc})))!==digest(projection.map(({id,duration,prompt,videoDesc})=>({id,duration,prompt,videoDesc}))))throw Error('分镜已修改，结构化计划过期，请重新规划');
  const compiled=compileH3(p,validateWorkflow(p,current).effectiveDuration,d.compiled.compiler);
  if(compiled.promptHash!==d.compiled.promptHash)throw Error('编译实现与版本存档不一致，请建立新版编译对照，不能静默替换提示词');
  const referenceList=[];
  for(const r of compiled.manifest){const bytes=await u.oss.getFile(r.path);if(mediaHash(bytes)!==r.sha256)throw Error(`参考素材 ${r.name} 已改变，请重新绑定`);referenceList.push({type:r.kind,base64:await u.oss.getImageBase64(r.path)});}
  return {active,compiled,referenceList,mode:p.mode==='Ref2VA'?['imageReference:9','videoReference:3','audioReference:3']:({T2VA:'text',I2VA:'singleImage',FL2VA:'startEndRequired',L2VA:'lastImage'} as const)[p.mode]};
}
export async function submitCompiledVideo(input:{projectId:number;trackId:number;ownerId:number;model:string;duration:number;aspectRatio:string;resolution:string;audio?:boolean;seed?:number;prompt?:string;revisionId?:string}){
  const result=await compiledInput(input.projectId,input.trackId,input.ownerId,input.model,input.duration,input.aspectRatio);
  if(input.revisionId&&input.revisionId!==result.active.id)throw Error('当前采用的版本已变化，请刷新后再生成');
  if(input.prompt!==undefined&&input.prompt!==result.compiled.prompt)throw Error('编译提示词已被独立编辑，请回到结构化计划修改相应字段');
  const id=randomUUID(),filePath=`/${input.projectId}/video/${id}.mp4`,scriptId=result.active.scriptId;
  const [videoId]=await sql('o_video').insert({filePath,time:Date.now(),state:'生成中',scriptId,projectId:input.projectId,videoTrackId:input.trackId});
  const generator=u.Ai.Video(input.model as `${string}:${string}`);
  const config={duration:input.duration,resolution:input.resolution,aspectRatio:input.aspectRatio,audio:input.audio??true,seed:input.seed??Number.parseInt(id.replace(/-/g,'').slice(0,12),16),request_id:id,compiler:result.compiled.compiler,revisionId:result.active.id,workflowFingerprint:result.active.data.workflow.fingerprint,prompt:result.compiled.prompt,mode:result.mode,referenceList:result.referenceList};
  // Persist the exact recipe before dispatch; no credentials or reference bytes in the record.
  const run={id,videoId,revisionId:result.active.id,workflow:result.active.data.workflow,config:{...config,referenceList:result.compiled.manifest},compiled:result.compiled,startedAt:Date.now(),status:'submitted'};
  await sql('o_h3Run').insert({id,projectId:input.projectId,trackId:input.trackId,data:JSON.stringify(run)});
  liveRuns.add(id);
  void generator.run(config as any,{projectId:input.projectId,taskClass:'视频生成',describe:'H3结构化计划视频验证',relatedObjects:JSON.stringify({videoId,scriptId,revisionId:result.active.id})})
    .then(async()=>{const saved=await generator.save(filePath,{videoId,projectId:input.projectId,scriptId,trackId:input.trackId});if(!saved)throw Error('目标视频或轨道已删除，成片未覆盖其他记录');const execution=await readRunExecution(id).catch(()=>null);await sql('o_h3Run').where({id}).update({data:JSON.stringify({...run,status:'completed',completedAt:Date.now(),filePath,execution})});})
    .catch(async(e:any)=>{await sql('o_video').where({id:videoId,state:'生成中'}).update({state:'生成失败',errorReason:e.message});await sql('o_h3Run').where({id}).update({data:JSON.stringify({...run,status:'failed',error:e.message})});})
    .finally(()=>liveRuns.delete(id));
  return {videoId,runId:id,revisionId:result.active.id};
}

export async function episodeOverview(projectId:number,scriptId:number,ownerId:number){
  await ensureH3();const project=await owned(projectId,ownerId);const boards=await sql('o_storyboard').where({projectId,scriptId}).orderBy('index').orderBy('id');
  const tracks=[];for(const trackId of [...new Set(boards.map((b:any)=>b.trackId))]){const track=await sql('o_videoTrack').where({id:trackId,projectId,scriptId}).first();if(!track)continue;
    const members=boards.filter((b:any)=>b.trackId===trackId),ids=members.map((b:any)=>b.id);
    const assets=await sql('o_assets2Storyboard').join('o_assets','o_assets.id','o_assets2Storyboard.assetId').whereIn('storyboardId',ids).where('o_assets.projectId',projectId).distinct('o_assets.id','o_assets.name','o_assets.imageId','o_assets.type');
    const options:any[]=[];
    for(const a of assets){const images=await sql('o_image').where({assetsId:a.id}).whereNotNull('filePath').whereIn('state',['已完成','生成成功']).orderBy('id','desc');for(const image of images)options.push({id:a.id,sources:'assets',mediaId:image.id,name:`${a.name} · 图片 ${image.id}`,assetType:a.type,current:image.id===a.imageId,url:await u.oss.getFileUrl(image.filePath)});}
    for(const b of members)if(b.filePath)options.push({id:b.id,sources:'storyboard',name:`分镜首帧 ${b.id}`,assetType:'frame',url:await u.oss.getFileUrl(b.filePath)});
    const active=await activePlan(trackId as number);tracks.push({id:trackId,duration:track.duration,name:members.map((b:any)=>`第 ${Number(b.index)+1} 镜`).join('、'),boards:members.map((b:any)=>({id:b.id,description:b.videoDesc})),options,active:active?{id:active.id,revision:active.revision,plan:active.data.plan}:null});
  }
  return {projectId,scriptId,model:project.videoModel,mode:project.mode,tracks};
}
async function readRunExecution(id:string){const r=await fetch(`http://127.0.0.1:10589/jobs/${id}`,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('工作流任务状态暂不可读，保留原任务编号，不重复提交');return await r.json() as any;}
/** Restart recovery reads the durable bridge task; it never resubmits generation. */
export async function reconcileRun(row:any){
 const run=JSON.parse(row.data),id=run.id;if(run.status!=='submitted'||liveRuns.has(id)||recoveringRuns.has(id))return run;
 recoveringRuns.add(id);
 try{
  const execution=await readRunExecution(id);
  if(execution.state==='success'){
   const output=await fetch(`http://127.0.0.1:10589/jobs/${id}/output`,{signal:AbortSignal.timeout(120000)});if(!output.ok)throw Error('成片文件暂不可读');
   const bytes=Buffer.from(await output.arrayBuffer()),filePath=`/${row.projectId}/video/${id}.mp4`;
   await sql.transaction(async(trx:any)=>{
    const video=await trx('o_video').where({id:run.videoId,projectId:row.projectId,videoTrackId:row.trackId}).first(),track=await trx('o_videoTrack').where({id:row.trackId,projectId:row.projectId}).first();
    if(!video||!track)throw Error('目标视频或轨道已删除，保留桥接成片');
    if(video.state!=='生成成功'){await u.oss.writeFile(filePath,bytes);await trx('o_video').where({id:video.id}).update({state:'生成成功',filePath,errorReason:null});}
    Object.assign(run,{status:'completed',completedAt:Date.now(),filePath,execution,recovered:true});await trx('o_h3Run').where({id}).update({data:JSON.stringify(run)});
   });
  }else if(['error','submission_uncertain'].includes(execution.state)){
   Object.assign(run,{status:'failed',error:execution.error,execution});await sql('o_video').where({id:run.videoId,state:'生成中'}).update({state:'生成失败',errorReason:execution.error});await sql('o_h3Run').where({id}).update({data:JSON.stringify(run)});
  }
  return run;
 }catch(e:any){return {...run,recoveryNotice:e.message};}finally{recoveringRuns.delete(id);}
}
export async function listRuns(projectId:number,trackId:number,ownerId:number){await ensureH3();await owned(projectId,ownerId);return Promise.all((await sql('o_h3Run').where({projectId,trackId})).map(reconcileRun));}

/** A workflow experiment reuses every content field, rather than asking the model to rewrite it. */
export async function deriveWorkflow(id:string,ownerId:number,model:string){
 const parent=await getRevision(id,ownerId),d=parent.data;if(!['ready','applied'].includes(parent.state))throw Error('只有已检查计划可建立工作流对照');
 const ctx=await collectContext(parent.projectId,parent.trackId,ownerId,d.selection);
 if(parent.state==='applied'){const active=await activePlan(parent.trackId);if(active?.id!==id)throw Error('旧计划已被替换');await compiledInput(parent.projectId,parent.trackId,ownerId,'comfyui-h3:'+d.workflow.id,d.plan.duration,d.plan.aspectRatio);}
 else if(ctx.sourceHash!==parent.sourceHash)throw Error('源分镜已变化');
 const workflow=(await workflows()).find(w=>w.id===model.split(':').at(-1));if(!workflow)throw Error('工作流不存在');
 const timing=validateWorkflow(d.plan,workflow),compiled=compileH3(d.plan,timing.effectiveDuration,d.compilerVersion||d.compiled?.compiler||'h3-compiler/1');
 const child=await insertRevision(ctx,ownerId,{...d,source:ctx.source,workflow,timing,compiled,changeType:'workflow',changeReason:`保持计划和素材，工作流从 ${d.workflow.id} 改为 ${workflow.id}`,comparisonParent:id},id,'ready');return getRevision(child,ownerId);
}

/** A compiler experiment changes serialization only; plan and workflow remain pinned. */
export async function deriveCompiler(id:string,ownerId:number){
 const parent=await getRevision(id,ownerId),d=parent.data;if(!['ready','applied'].includes(parent.state))throw Error('只有已检查计划可建立编译对照');
 const ctx=await collectContext(parent.projectId,parent.trackId,ownerId,d.selection);
 if(parent.state==='applied'){if((await activePlan(parent.trackId))?.id!==id)throw Error('旧计划已被替换');await compiledInput(parent.projectId,parent.trackId,ownerId,'comfyui-h3:'+d.workflow.id,d.plan.duration,d.plan.aspectRatio);}
 else if(ctx.sourceHash!==parent.sourceHash)throw Error('源分镜已变化');
 if(d.compiled.compiler===COMPILER_VERSION)throw Error('当前已是最新编译器');
 const compiled=compileH3(d.plan,d.timing.effectiveDuration,COMPILER_VERSION);
 const child=await insertRevision(ctx,ownerId,{...d,source:ctx.source,compiled,compilerVersion:COMPILER_VERSION,changeType:'compiler',comparisonParent:id,changeReason:`计划和工作流不变，编译器从 ${d.compiled.compiler} 更新为 ${COMPILER_VERSION}`},id,'ready');return getRevision(child,ownerId);
}

/** All native readers derive the plan fields from the same immutable active revision. */
export async function projectNativeBoards<T extends {id?:number;trackId?:number|null}>(boards:T[],connection=sql):Promise<(T & {h3RevisionId?:string})[]>{
 const byTrack=new Map<number,any>();for(const b of boards)if(b.trackId&&!byTrack.has(b.trackId))byTrack.set(b.trackId,await activePlan(b.trackId,connection));
 return boards.map(b=>{const active=b.trackId?byTrack.get(b.trackId):null,p=active?projectPlan(active.data.plan).find(p=>p.id===b.id):null;return p?{...b,prompt:p.prompt,videoDesc:p.videoDesc,duration:String(p.duration),h3Plan:p.h3Plan,h3RevisionId:active.id}:b;});
}
export async function assertLegacyEditAllowed(trackId:number|null|undefined){if(trackId&&await activePlan(trackId))throw Error('本镜已使用 H3 结构化计划，请在 H3 计划窗口定位字段并局部修正；旧文本编辑不能覆盖计划。');}

export async function flagIssue(id:string,ownerId:number,path:string,reason:string){
 const parent=await getRevision(id,ownerId),d=parent.data;if(!d.plan)throw Error('版本没有结构化计划');
 const value=atPath(d.plan,path);const ctx=await collectContext(parent.projectId,parent.trackId,ownerId,d.selection);
 if(parent.state==='applied'){const current=await activePlan(parent.trackId);if(current?.id!==id)throw Error('此版本已被替换');}
 else if(ctx.sourceHash!==parent.sourceHash)throw Error('源分镜已变化');
 const issue:Issue={code:'semantic',path,message:reason,severity:'error',evidence:typeof value==='string'?value:JSON.stringify(value)};
 const child=await insertRevision(ctx,ownerId,{...d,source:ctx.source,issues:[...(d.issues||[]),issue],compilerVersion:d.compilerVersion||d.compiled?.compiler||'h3-compiler/1',compiled:null,changeReason:'用户或成片观察定位的字段问题'},id,'needs-repair');return getRevision(child,ownerId);
}
