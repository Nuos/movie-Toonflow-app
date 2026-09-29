import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {execFileSync} from 'node:child_process';
const Database = require('better-sqlite3');
async function main(){
 const root=process.cwd(),temp=await fs.mkdtemp(path.join(os.tmpdir(),'toonflow-preview-'));
 await fs.mkdir(path.join(temp,'data'));const original=new Database(path.join(root,'data/db2.sqlite'),{readonly:true});await original.backup(path.join(temp,'data/db2.sqlite'));original.close();
 await fs.copyFile(path.join(root,'package.json'),path.join(temp,'package.json'));process.chdir(temp);process.env.NODE_ENV='prod';
 await import('../src/utils');const {db}=await import('../src/utils/db');const {default:router}=await import('../src/routes/production/getStoryboardData');
 const app=express();app.use(express.json());app.use((req,_res,next)=>{(req as any).user={id:99441099};next();});app.use('/preview',router);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as any).port}/preview`, projectId=99441001,scriptId=99441002;
 const call=async(p=projectId,s=scriptId)=>{const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:p,scriptId:s})});assert.equal(response.status,200);return (await response.json()).data;};
 try{
  const [track]=await db('o_videoTrack').insert({projectId,scriptId,state:'已完成'});
  const ids:number[]=[];for(const [index,duration] of [[2,'4.5'],[1,'3'],[3,'0']] as const){const [id]=await db('o_storyboard').insert({projectId,scriptId,trackId:track,index,duration,filePath:index===2?'/test/board.png':null});ids.push(id);}
  const [asset]=await db('o_assets').insert({projectId,name:'参考角色',type:'role'});const [img]=await db('o_image').insert({assetsId:asset,filePath:'/test/ref.png'});await db('o_assets').where({id:asset}).update({imageId:img});
  const [clip]=await db('o_assets').insert({projectId,name:'参考视频',type:'clip'});const [clipFile]=await db('o_image').insert({assetsId:clip,filePath:'/test/ref.mp4'});await db('o_assets').where({id:clip}).update({imageId:clipFile});
  const [foreign]=await db('o_assets').insert({projectId:projectId+1,name:'不得泄露',type:'role'});
  await db('o_assets2Storyboard').insert([{storyboardId:ids[0],assetId:asset},{storyboardId:ids[1],assetId:asset},{storyboardId:ids[1],assetId:clip},{storyboardId:ids[1],assetId:foreign}]);
  const vids:number[]=[];for(const state of ['生成成功','已完成','生成失败']){const [id]=await db('o_video').insert({projectId,scriptId,videoTrackId:track,state,filePath:`/test/${state}.mp4`});vids.push(id);}await db('o_videoTrack').where({id:track}).update({videoId:vids[0]});
  await db('o_cameraClip').insert({id:'preview-camera-test',ownerId:99441099,projectId,storyboardId:ids[2],status:'completed',filePath:'/test/camera.mp4',prepareToken:'preview-test',data:JSON.stringify({motionName:'缓慢推进'}),createdAt:1,updatedAt:1});
  await db('o_cameraClip').insert({id:'preview-camera-other',ownerId:99441100,projectId,storyboardId:ids[2],status:'completed',filePath:'/test/secret.mp4',prepareToken:'preview-other',data:'{}',createdAt:2,updatedAt:2});
  const before=JSON.stringify(await db('o_storyboard').where({projectId}));const rows=await call();
  assert.deepEqual(rows.map((r:any)=>Number(r.id)),[ids[1],ids[0],ids[2]]);assert.equal(rows[0].filePath,undefined);assert.equal(rows[0].images[0].source,'asset');assert.equal(rows[1].images[0].source,'storyboard');assert.ok(!rows[1].filePath.includes('?size='));
  assert.equal(rows[0].videos[0].id,`video-${vids[0]}`);assert.equal(rows[0].videos[0].selected,true);assert.equal(rows[0].videos.length,3);assert.equal(rows[0].videos[2].source,'asset');assert.equal(rows[0].videos[2].end,null);
  assert.equal(rows[1].videos[0].start,3);assert.equal(rows[1].videos[0].end,7.5);assert.equal(rows[2].duration,3);assert.equal(rows[2].videos.filter((v:any)=>v.source==='camera').length,1);assert.equal(rows[2].videos.find((v:any)=>v.source==='camera').name,'运镜切片 · 缓慢推进');assert.ok(!JSON.stringify(rows).includes('不得泄露'));assert.equal(JSON.stringify(await db('o_storyboard').where({projectId})),before,'preview must not mutate boards');
  await db('o_videoTrack').where({id:track}).update({videoId:vids[2]});assert.equal((await call())[0].videos[0].id,`video-${vids[1]}`);
  assert.deepEqual(await call(projectId+1),[]);assert.deepEqual(await call(projectId,scriptId+1),[]);
  await fs.mkdir(path.join(temp,'data/oss/test'),{recursive:true});
  execFileSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=12','-t','8','-c:v','libx264','-threads','1','-y',path.join(temp,'data/oss/test/生成成功.mp4')]);
  const response=await fetch(base+'/slice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,scriptId,storyboardId:ids[0],videoId:vids[0]})});
  assert.equal(response.status,200);assert.equal(response.headers.get('x-slice-start'),'3');assert.equal(response.headers.get('x-slice-duration'),'4.5');
  const output=path.join(temp,'export.mp4');await fs.writeFile(output,Buffer.from(await response.arrayBuffer()));
  const actual=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',output],{encoding:'utf8'}).trim());assert.ok(Math.abs(actual-4.5)<.2);
  const denied=await fetch(base+'/slice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:projectId+1,scriptId,storyboardId:ids[0],videoId:vids[0]})});assert.equal(denied.status,400);
  console.log('PASS: real MP4 slice export, exact duration, foreign-project rejection, camera clip owner isolation; asset image fallback, original images, video media types, successful versions, selected/latest order, slice offsets, invalid duration, project isolation, empty episode, read-only preview');
 }finally{await new Promise<void>(r=>server.close(()=>r()));await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
