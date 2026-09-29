import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
const Database=require('better-sqlite3');
async function main(){
 const root=process.cwd(), temp=await fs.mkdtemp(path.join(os.tmpdir(),'toonflow-action-duration-'));
 await fs.mkdir(path.join(temp,'data'));
 const original=new Database(path.join(root,'data/db2.sqlite'),{readonly:true});
 await original.backup(path.join(temp,'data/db2.sqlite'));original.close();
 await fs.copyFile(path.join(root,'package.json'),path.join(temp,'package.json'));
 process.chdir(temp);process.env.NODE_ENV='prod';
 await import('../src/utils');
 const {db}=await import('../src/utils/db');
 const {default:single}=await import('../src/routes/production/storyboard/addStoryboard');
 const {default:batch}=await import('../src/routes/production/storyboard/batchAddStoryboardInfo');
 const {default:duration}=await import('../src/routes/production/workbench/updateVideoDuration');
 const app=express();app.use(express.json());app.use('/single',single);app.use('/batch',batch);app.use('/duration',duration);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as any).port}`,projectId=99152001,scriptId=99152002;
 const post=async(url:string,body:any,status:number)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const json:any=await r.json();assert.equal(r.status,status,JSON.stringify(json));return json.data;};
 try{
  await db('o_project').insert({id:projectId,name:'完整动作时长隔离测试'});
  await db('o_script').insert({id:scriptId,projectId,name:'两镜测试'});
  const item={prompt:'女子双脚站在桌前，右手持信。',videoDesc:'【本镜主题】交出信封。女子把信平放在桌上再收手，目光停在信封上，维持站位与呼吸。',duration:12,state:'未生成',src:null,shouldGenerateImage:0,associateAssetsIds:[],track:'1'};
  for(const n of [3,7,8.5,16])await post('/single',{...item,duration:n,projectId,scriptId},400);
  assert.equal((await db('o_storyboard').where({projectId})).length,0);
  await post('/batch',{projectId,scriptId,data:[item,{...item,duration:15}]},400);
  assert.equal((await db('o_storyboard').where({projectId})).length,0);
  await post('/batch',{projectId,scriptId,data:[item,{...item,track:'2',duration:15}]},200);
  const boards=await db('o_storyboard').where({projectId}).orderBy('id');
  assert.equal(boards.length,2);assert.notEqual(boards[0].trackId,boards[1].trackId);
  assert.deepEqual(boards.map(b=>Number(b.duration)),[12,15]);
  await post('/batch',{projectId,scriptId,data:[item]},400);
  assert.equal((await db('o_storyboard').where({projectId})).length,2);
  const tracks=await db('o_videoTrack').where({projectId}).orderBy('id');assert.deepEqual(tracks.map(t=>t.duration),[12,15]);
  await post('/duration',{id:tracks[0].id,duration:4.5},400);
  assert.equal((await db('o_videoTrack').where({id:tracks[0].id}).first()).duration,12);
  console.log('PASS: short/fractional/oversized shots and duplicate track groups rejected before writes; independent 12/15-second shot tracks persisted; invalid updates preserve state; no AI/media calls');
 }finally{await new Promise<void>(r=>server.close(()=>r()));await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
