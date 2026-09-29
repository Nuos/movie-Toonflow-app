import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixture,text } from './h3-pipeline.test';
const Database=require('better-sqlite3');
async function main(){
 const root=process.cwd(),temp=await fs.mkdtemp(path.join(os.tmpdir(),'toonflow-h3-v1-'));
 await fs.mkdir(path.join(temp,'data'),{recursive:true});const source=new Database(path.join(root,'data/db2.sqlite'),{readonly:true});await source.backup(path.join(temp,'data/db2.sqlite'));source.close();await fs.copyFile(path.join(root,'package.json'),path.join(temp,'package.json'));
 process.chdir(temp);process.env.NODE_ENV='prod';
 const {default:u}=await import('../src/utils');const {db,databaseReady}=await import('../src/utils/db');await databaseReady;const sql:any=db;
 const api=await import('../src/utils/h3/store');
 const pid=997601,sid=997602,tid=997603,bid=997604;
 const w:any={id:'h3-standard',family:'FL2VA',modes:['T2VA','I2VA','FL2VA','L2VA'],fingerprint:'test-fingerprint',limits:{fps:24,frameStep:17,frameOffset:5,maxFrames:3592,duration:{min:.2,max:150},aspectRatios:['9:16']}};
 const originalFetch=globalThis.fetch,originalText=u.Ai.Text;
 globalThis.fetch=(async(url:any)=>{assert.ok(String(url).endsWith('/workflows'));return new Response(JSON.stringify([w]),{headers:{'Content-Type':'application/json'}});}) as any;
 let semanticIssue=false,patched=false;
 u.Ai.Text=((key:string)=>{assert.equal(key,'universalAi');return{invoke:async(req:any)=>{
  if(req.system.startsWith('你是结构化分镜检查器')){return {text:JSON.stringify({issues:semanticIssue&&!patched?[{path:'/shots/0/camera/framing',quote:'Medium shot.',message:'为清楚显示手部，修正景别描述。'}]:[]})};}
  if(req.system.startsWith('仅输出 JSON 数组')){const input=JSON.parse(req.messages[0].content);patched=true;return {text:JSON.stringify([{path:'/shots/0/camera/framing',before:input.plan.shots[0].camera.framing,value:text('中全景','Medium wide shot.'),reason:'显示手部接触'}])};}
  const p=fixture();const input=JSON.parse(req.messages[0].content);p.duration=input.envelope.duration;p.shots[0].end=p.duration;p.shots[0].phases[1].end=p.duration;p.shots[0].storyboardId=bid;return{text:JSON.stringify(p)};
 }}}) as any;
 try{
 await sql('o_project').insert({id:pid,userId:1,name:'H3集成测试',videoRatio:'9:16'});await sql('o_script').insert({id:sid,projectId:pid,name:'第一集',content:'画幅：9:16\n女子：请收好。'});await sql('o_videoTrack').insert({id:tid,projectId:pid,scriptId:sid,duration:8,prompt:'旧提示词'});await sql('o_storyboard').insert({id:bid,projectId:pid,scriptId:sid,trackId:tid,index:0,duration:'8',prompt:'旧首帧',videoDesc:'【原剧情与台词】女子：请收好。'});
 await sql('o_agentWorkData').insert({projectId:pid,episodesId:sid,key:'productionAgent',data:'{}'});
 await assert.rejects(()=>api.generatePlan(pid,tid,2,[],'comfyui-h3:h3-standard','text'),/无权/);
 const v=await api.generatePlan(pid,tid,1,[],'comfyui-h3:h3-standard','text');assert.equal(v.state,'ready');assert.equal((await sql('o_videoTrack').where({id:tid}).first()).prompt,'旧提示词','预览不覆盖正式数据');
 await sql('o_storyboard').where({id:bid}).update({prompt:'异步编辑'});await assert.rejects(()=>api.applyPlan(v.id,1),/已变化/);await sql('o_storyboard').where({id:bid}).update({prompt:'旧首帧'});
 const applied=await api.applyPlan(v.id,1);assert.equal(applied.state,'applied');assert.equal((await api.applyPlan(v.id,1)).id,v.id);
 const board=await sql('o_storyboard').where({id:bid}).first(),track=await sql('o_videoTrack').where({id:tid}).first(),work=JSON.parse((await sql('o_agentWorkData').where({projectId:pid,episodesId:sid}).first()).data);
 assert.ok(board.videoDesc.includes('【原剧情与台词】女子：请收好。'));assert.ok(work.storyboardTable.includes('中景'));assert.equal(track.prompt,applied.data.compiled.prompt);assert.equal(work.storyboard[0].videoDesc,board.videoDesc);assert.equal(applied.data.before.track.prompt,'旧提示词');
 const input=await api.compiledInput(pid,tid,1,'comfyui-h3:h3-standard',8,'9:16');assert.equal(input.compiled.prompt,track.prompt);
 await assert.rejects(()=>api.compiledInput(pid,tid,1,'comfyui-h3:h3-standard',30,'9:16'),/不一致/);
 semanticIssue=true;const next=await api.generatePlan(pid,tid,1,[],'comfyui-h3:h3-standard','text');assert.equal(next.state,'needs-repair');const repaired=await api.repairPlan(next.id,1);assert.equal(repaired.state,'ready');assert.equal(repaired.parentId,next.id);assert.deepEqual(repaired.data.plan.sound,next.data.plan.sound);assert.equal(repaired.data.patches.length,1);await api.applyPlan(repaired.id,1);
 await sql('o_storyboard').where({id:bid}).update({videoDesc:'外部改动'});await assert.rejects(()=>api.compiledInput(pid,tid,1,'comfyui-h3:h3-standard',8,'9:16'),/过期/);
 const longer=await api.generatePlan(pid,tid,1,[],'comfyui-h3:h3-standard','text',30);assert.equal(longer.state,'ready');await api.applyPlan(longer.id,1);assert.equal((await sql('o_videoTrack').where({id:tid}).first()).duration,30);assert.equal(Number((await sql('o_storyboard').where({id:bid}).first()).duration),30);
 await assert.rejects(()=>api.applyPlan(v.id,1),/已经被替换/);
 await assert.rejects(()=>api.submitCompiledVideo({projectId:pid,trackId:tid,ownerId:1,model:'comfyui-h3:h3-standard',duration:30,aspectRatio:'9:16',resolution:'preview',revisionId:v.id}),/版本已变化/);
 const projected=await api.projectNativeBoards(await sql('o_storyboard').where({id:bid}));assert.equal(projected[0].h3RevisionId,longer.id);await assert.rejects(()=>api.assertLegacyEditAllowed(tid),/结构化计划/);
 const runId='c1111111-1111-4111-a111-111111111111';const [videoId]=await sql('o_video').insert({projectId:pid,scriptId:sid,videoTrackId:tid,state:'生成中',filePath:`/${pid}/video/${runId}.mp4`});
 const run={id:runId,videoId,status:'submitted'};await sql('o_h3Run').insert({id:runId,projectId:pid,trackId:tid,data:JSON.stringify(run)});
 let outputReads=0;globalThis.fetch=(async(url:any,options:any)=>{assert.notEqual(options?.method,'POST','恢复不得重复提交');if(String(url).endsWith('/output')){outputReads++;return new Response('test-video-bytes');}return new Response(JSON.stringify({id:runId,state:'success',execution_seconds:12,queue_seconds:30}));}) as any;
 const recovered=await api.listRuns(pid,tid,1);assert.equal(recovered[0].status,'completed');assert.equal(recovered[0].execution.execution_seconds,12);assert.equal((await sql('o_video').where({id:videoId}).first()).state,'生成成功');await api.listRuns(pid,tid,1);assert.equal(outputReads,1,'恢复和后续读取幂等');
 console.log('H3 integration passed: isolated DB, ownership, preview, stale source, atomic adoption, projections, versioned repair, submission guard');
 }finally{u.Ai.Text=originalText;globalThis.fetch=originalFetch;await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
