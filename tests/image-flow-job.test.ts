import assert from 'node:assert/strict';
import knex from 'knex';
import {startImageFlowJob,readImageFlowJob} from '../src/utils/imageFlowJob';
(async()=>{
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 try{
  let calls=0,finish!:(url:string)=>void;const input={prompt:'测试'},run=()=>{calls++;return new Promise<string>(r=>finish=r)};
  const results=await Promise.all([startImageFlowJob(db,'one',1,input,run),startImageFlowJob(db,'one',1,input,run)]);
  assert.equal(calls,1);assert.ok(results.every(r=>r.state==='pending'));
  assert.equal(await readImageFlowJob(db,'one',2),null);
  await assert.rejects(startImageFlowJob(db,'one',2,input,run),/不一致/);
  await assert.rejects(startImageFlowJob(db,'one',1,{prompt:'changed'},run),/不一致/);
  finish('/oss/image.jpg');
  for(let i=0;i<30&&(await readImageFlowJob(db,'one',1))?.state==='pending';i++)await new Promise(r=>setTimeout(r,5));
  const done=await startImageFlowJob(db,'one',1,input,run);assert.equal(done.state,'completed');assert.equal(done.url,'/oss/image.jpg');assert.equal(calls,1);
  await db('o_imageFlowJob').insert({id:'interrupted',projectId:1,request:'{}',state:'pending',updatedAt:0});
  assert.equal((await readImageFlowJob(db,'interrupted',1))?.state,'unknown');
  await startImageFlowJob(db,'failed',1,{},async()=>{throw Error('模型错误')});
  for(let i=0;i<30&&(await readImageFlowJob(db,'failed',1))?.state==='pending';i++)await new Promise(r=>setTimeout(r,5));
  assert.equal((await readImageFlowJob(db,'failed',1))?.error,'模型错误');
  console.log('PASS: asynchronous result persistence, concurrent deduplication, project/request isolation, completed-job reuse, interrupted worker detection and failure reporting');
 }finally{await db.destroy()}
})().catch(e=>{console.error(e);process.exitCode=1});
