import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const Database=require('better-sqlite3');
async function main(){
 const root=process.cwd(),temp=await fs.mkdtemp(path.join(os.tmpdir(),'toonflow-action-plan-'));
 await fs.mkdir(path.join(temp,'data/skills'),{recursive:true});
 const source=new Database(path.join(root,'data/db2.sqlite'),{readonly:true});await source.backup(path.join(temp,'data/db2.sqlite'));source.close();
 await fs.copyFile(path.join(root,'package.json'),path.join(temp,'package.json'));
 await fs.copyFile(path.join(root,'data/skills/production_execution_storyboard_table.md'),path.join(temp,'data/skills/production_execution_storyboard_table.md'));
 process.chdir(temp);process.env.NODE_ENV='prod';
 const {default:u}=await import('../src/utils');const {db}=await import('../src/utils/db');
 const api=await import('../src/utils/actionStoryboard');const format=await import('../src/utils/actionStoryboardFormat');
 const pid=99162001,sid=99162002,bid=99162003,tid=99162004,aid=99162005;
 const script='# 画幅：4:3\n1-1 室内 日\n人物：女子\n△女子把信交到桌上。\n女子：请收好。9:16只是信上的编号。';
 const description={sourceBeatIds:['B1','B2'],duration:12,purpose:'女子把信完整交还给原主。',openingFrame:'女子双脚踩实站在桌左侧，右手持信，左手轻扶桌沿。',subjectAction:'第0至3秒，女子右手将信平放在桌面中央，手指压住信封。第3至8秒，女子把信推向桌子另一端，目光跟随信封，双脚保持原位。第8至12秒，女子收回右手放在身侧，目光停在信封上，双脚站稳，保持自然呼吸。',endingFrame:'女子双脚踩实，右手垂在身侧，目光看向桌上信封，最后两秒保持这个姿态与自然呼吸。',camera:'摄影机固定中景，人物双手和桌面都清楚可见。',continuity:'同一人物、衣着、信纸与桌面，朝向保持连续。',assetIds:[aid]};
 let calls=0,generated=description,lastRequest:any,reviewOnce=false,patchCalls=0;const originalText=u.Ai.Text,originalImage=u.Ai.Image,originalVideo=u.Ai.Video;
 u.Ai.Text=((name:string)=>({invoke:async(req:any)=>{assert.equal(name,'universalAi');if(req.system.includes('分镜文字一致性检查器')){if(reviewOnce){reviewOnce=false;return{text:JSON.stringify({issues:[{shot:1,quote:generated.camera,problem:'摄影描述需要明确手部接触点的取景范围。'}]})};}return{text:'{"issues":[]}'};}if(req.system.includes('本轮只输出局部字段修正')){patchCalls++;return{text:JSON.stringify({corrections:[{shot:1,patch:{camera:generated.camera+'桌面手部接触点清晰可见。'}}]})};}assert.ok(req.system.includes('完整动作镜头规则'));assert.ok(req.messages[0].content.includes('请收好。'));assert.equal(JSON.parse(req.messages[0].content).aspectRatio,'4:3');lastRequest=req;calls++;return{text:JSON.stringify({shots:[generated]})};}})) as any;
 u.Ai.Image=u.Ai.Video=(()=>{throw Error('不允许生成媒体');}) as any;
 try{
  await db('o_project').insert({id:pid,name:'编排一致性测试',userId:1});await db('o_script').insert({id:sid,projectId:pid,name:'第一集',content:script});
  await db('o_assets').insert({id:aid,projectId:pid,name:'女子',type:'role'});await db('o_scriptAssets').insert({scriptId:sid,assetId:aid});
  await db('o_videoTrack').insert({id:tid,projectId:pid,scriptId:sid,duration:3});await db('o_storyboard').insert({id:bid,projectId:pid,scriptId:sid,trackId:tid,index:0,duration:'3',videoDesc:'旧动作'});
  await db('o_agentWorkData').insert({projectId:pid,episodesId:sid,key:'productionAgent',data:JSON.stringify({storyboardTable:'旧表',storyboard:[{id:bid}],scriptPlan:'保留导演计划。本集 22 镜 / 84.0 秒。'})});
  const id=randomUUID();await api.startActionStoryboard(pid,sid,1,id);
  let result:any;for(let i=0;i<200;i++){result=await api.getActionStoryboard(id,1);if(!['queued','generating'].includes(result.state))break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(result.state,'ready',result.error);assert.equal(calls,1);
  const current=await api.currentActionStoryboard(pid,sid,1);assert.ok(current);assert.equal(current.id,id);
  await assert.rejects(()=>api.currentActionStoryboard(pid,sid,2));
  assert.equal((await db('o_storyboard').where({id:bid}).first()).scriptId,sid,'生成预览不改原面板');
  assert.equal((await api.startActionStoryboard(pid,sid,1,id)).id,id);assert.equal(calls,1);
  await assert.rejects(()=>api.getActionStoryboard(id,2));await assert.rejects(()=>api.applyActionStoryboard(id,2));
  await db('o_script').where({id:sid}).update({content:script+'\n△女子离开。'});await assert.rejects(()=>api.applyActionStoryboard(id,1),/已修改/);
  await db('o_script').where({id:sid}).update({content:script});
  const applied=await api.applyActionStoryboard(id,1);assert.equal(applied.shotCount,1);assert.ok(applied.archiveScriptId);
  const currentApplied=await api.currentActionStoryboard(pid,sid,1);assert.ok(currentApplied);assert.equal(currentApplied.state,'applied');
  assert.equal((await db('o_storyboard').where({id:bid}).first()).scriptId,applied.archiveScriptId);
  assert.equal((await db('o_videoTrack').where({id:tid}).first()).scriptId,applied.archiveScriptId);
  const board=await db('o_storyboard').where({id:applied.storyboardIds[0]}).first();assert.equal(Number(board.duration),12);assert.ok(board.videoDesc?.includes('女子：请收好。'));
  const work:any=JSON.parse((await db('o_agentWorkData').where({projectId:pid,episodesId:sid}).first()).data!);assert.equal(work.scriptPlan,'保留导演计划。本集 1 镜 / 12 秒。');assert.ok(work.storyboardTable.includes('0–12秒'));assert.ok(work.storyboardTable.includes(description.subjectAction));
  await db('o_storyboard').where({id:board.id}).update({videoDesc:board.videoDesc!.replace(description.purpose,'女子确认来人收好信封。')});
  const synced=await api.synchronizeActionTable(pid,sid,{storyboardTable:'旧浏览器缓存',scriptPlan:'新导演计划'});
  assert.ok(synced.storyboardTable.includes('女子确认来人收好信封'));assert.ok(!synced.storyboardTable.includes('旧浏览器缓存'));assert.equal(synced.scriptPlan,'新导演计划');
  assert.deepEqual(await api.applyActionStoryboard(id,1),applied);assert.equal((await db('o_storyboard').where({projectId:pid,scriptId:sid})).length,1);
  assert.throws(()=>format.validateActionPlan({shots:[{...description,sourceBeatIds:['B1']}]},format.scriptBeats(script),[aid]),/全部剧本/);
  assert.throws(()=>format.validateActionPlan({shots:[{...description,assetIds:[aid+1]}]},format.scriptBeats(script),[aid]),/不存在的资产/);
  assert.doesNotThrow(()=>format.validateActionPlan({shots:[{...description,endingFrame:'女子双脚站稳，右手垂在身侧，目光锁定桌上信封，肩膀随自然呼吸轻微起伏。'}]},format.scriptBeats(script),[aid]));
  assert.throws(()=>format.validateActionPlan({shots:[{...description,endingFrame:'女子的动作结束了，整个画面看起来非常好看，故事进行到了新的阶段。'}]},format.scriptBeats(script),[aid]),/结束姿态/);
  // Refine is a native model preview, then an atomic in-place adoption. Previous
  // media and review evidence survive, but a changed source cannot keep its pass.
  const {ensureCameraClips}=await import('../src/utils/cameraClips');await ensureCameraClips();
  const clipId=randomUUID(),oldReview={status:'accepted',checks:{action:true},mediaSha256:'saved-old-hash',notes:'旧版本已验收的记录'};
  await db('o_cameraClip').insert({id:clipId,ownerId:1,projectId:pid,storyboardId:board.id,prepareToken:randomUUID(),createdAt:Date.now(),updatedAt:Date.now(),status:'completed',filePath:'retained.mp4',data:'{}',review:JSON.stringify(oldReview)} as any);
  await db('o_videoTrack').where({id:board.trackId!}).update({state:'已完成',prompt:'原生旧提示词保持可查'});
  generated={...description,openingFrame:'女子双脚站稳于桌左，右手持着信封停在腰间，左手垂在身侧，信尚未落桌。',camera:'固定中全景，完整收入女子全身、双脚和桌面，信封与双手清晰可见。'};
  const refineId=randomUUID();await api.startActionStoryboard(pid,sid,1,refineId,'refine');
  for(let i=0;i<200;i++){result=await api.getActionStoryboard(refineId,1);if(!['queued','generating'].includes(result.state))break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(result.state,'ready',result.error);assert.equal(result.mode,'refine');
  assert.equal((await db('o_storyboard').where({id:board.id}).first()).prompt,board.prompt,'校正预览不修改面板');
  const originalPlan=format.currentActionPlan([{...board,assetIds:[aid]}],format.scriptBeats(script));
  assert.throws(()=>format.validateActionRefinement({shots:[{...generated,duration:13}]},originalPlan),/时长/);
  assert.throws(()=>format.validateActionRefinement({shots:[{...generated,camera:'固定中近景，要求人物全身和双脚可见。'}]},originalPlan),/冲突/);
  await db('o_videoTrack').where({id:board.trackId!}).update({state:'生成中'});
  await assert.rejects(()=>api.applyActionStoryboard(refineId,1),/正在生成提示词/);
  assert.equal(JSON.parse((await db('o_cameraClip').where({id:clipId}).first()).review!).status,'accepted');
  await db('o_videoTrack').where({id:board.trackId!}).update({state:'已完成'});
  const refined=await api.applyActionStoryboard(refineId,1);
  assert.deepEqual(refined.storyboardIds,[board.id]);assert.deepEqual(refined.trackIds,[board.trackId]);assert.equal(refined.archiveScriptId,null);
  const refinedBoard=await db('o_storyboard').where({id:board.id}).first();assert.equal(refinedBoard.prompt,format.actionOpeningPrompt(generated));assert.ok(refinedBoard.prompt!.includes(generated.camera));assert.equal(refinedBoard.duration,board.duration);
  const refinedTrack=await db('o_videoTrack').where({id:board.trackId!}).first();assert.equal(refinedTrack.prompt,'原生旧提示词保持可查');assert.equal(refinedTrack.state,'待重新生成');
  const retained=await db('o_cameraClip').where({id:clipId}).first();assert.equal(retained.filePath,'retained.mp4');assert.deepEqual(JSON.parse(retained.review!).previousReview,oldReview);assert.equal(JSON.parse(retained.review!).status,'stale');
  const refinedWork=JSON.parse((await db('o_agentWorkData').where({projectId:pid,episodesId:sid}).first()).data!);assert.ok(refinedWork.storyboardTable.includes(generated.openingFrame));assert.equal(refinedWork.storyboard[0].videoDesc,refinedBoard.videoDesc);assert.equal(refined.before.tracks[0].prompt,'原生旧提示词保持可查');
  assert.deepEqual(await api.applyActionStoryboard(refineId,1),refined);
  // Retrying an unchanged source resumes the failed native draft and its feedback.
  const validGenerated=generated;
  generated={...generated,camera:'固定中近景，要求人物全身和双脚可见。'};
  const failedId=randomUUID();await api.startActionStoryboard(pid,sid,1,failedId,'refine');
  for(let i=0;i<200;i++){result=await api.getActionStoryboard(failedId,1);if(!['queued','generating'].includes(result.state))break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(result.state,'failed');
  generated=validGenerated;
  const retryId=randomUUID();await api.startActionStoryboard(pid,sid,1,retryId,'refine');
  for(let i=0;i<200;i++){result=await api.getActionStoryboard(retryId,1);if(!['queued','generating'].includes(result.state))break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(result.state,'ready',result.error);
  assert.equal(lastRequest.messages[1].role,'assistant');
  assert.ok(lastRequest.messages[1].content.includes('固定中近景'));
  assert.ok(lastRequest.messages[2].content.includes('继续修正同一原分镜'));
  const patched=format.applyActionCorrections([generated,generated],{corrections:[{shot:1,patch:{camera:'固定中全景，明确收入双脚和桌面。'}}]},[1]);
  assert.deepEqual(patched.shots[1],generated,'未复核镜头必须原样保留');
  assert.equal(patched.shots[0].subjectAction,generated.subjectAction);
  assert.throws(()=>format.applyActionCorrections([generated],{corrections:[{shot:1,patch:{duration:15}}]},[1]));
  assert.throws(()=>format.applyActionCorrections([generated,generated],{corrections:[{shot:2,patch:{camera:generated.camera}}]},[1]));
  reviewOnce=true;const patchId=randomUUID();await api.startActionStoryboard(pid,sid,1,patchId,'refine');
  for(let i=0;i<200;i++){result=await api.getActionStoryboard(patchId,1);if(!['queued','generating'].includes(result.state))break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(result.state,'ready',result.error);assert.equal(patchCalls,1);
  assert.equal(result.plan!.shots[0].subjectAction,generated.subjectAction);
  assert.equal(result.plan!.shots[0].camera,generated.camera+'桌面手部接触点清晰可见。');
  console.log('PASS: product-native model planning, complete source coverage, original script speech, preview isolation, project scope, stale-source rejection, atomic table/panel/track adoption, archival preservation, idempotency and stale table synchronization; no inference/media');
 }finally{u.Ai.Text=originalText;u.Ai.Image=originalImage;u.Ai.Video=originalVideo;await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
