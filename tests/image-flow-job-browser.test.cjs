const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync('data/web/workflow-image-job.js','utf8');
const storage=new Map(),localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
function page(){const ctx={crypto:webcrypto,TextEncoder,Uint8Array,Map,localStorage,setTimeout:f=>setTimeout(f,0)};vm.runInNewContext(source,ctx);return ctx.ToonflowImageJob}
(async()=>{
 const input={projectId:1,prompt:'原画布测试',references:[]};let jobs=new Map(),starts=0,failAck=true;
 async function request(b){let job=jobs.get(b.operationId);if(!job){starts++;job={operationId:b.operationId,state:'completed',url:'/oss/result-'+starts+'.jpg'};jobs.set(b.operationId,job)}if(failAck){failAck=false;throw Error('网络中断')}return {data:job}}
 await assert.rejects(page().generate(request,input,''),/网络中断/);assert.equal(starts,1);
 let result=await page().generate(request,input,'');assert.equal(result.data.url,'/oss/result-1.jpg');assert.equal(starts,1);
 // Leaving a page before its response must not launch another job while the old image remains.
 result=await page().generate(request,input,'/oss/old.jpg');assert.equal(result.data.url,'/oss/result-1.jpg');assert.equal(starts,1);
 result=await page().generate(request,input,'/oss/result-1.jpg');assert.equal(result.data.url,'/oss/result-2.jpg');assert.equal(starts,2);
 storage.clear();let polls=0,submits=0;const samePage=page();async function pending(b){if(!b.statusOnly){submits++;return {data:{operationId:b.operationId,state:'pending'}}}polls++;return {data:{operationId:b.operationId,state:'completed',url:'/oss/final.jpg'}}}
 const values=await Promise.all([samePage.generate(pending,input,''),samePage.generate(pending,input,'')]);assert.equal(submits,1);assert.equal(polls,1);assert.equal(values[1].data.url,'/oss/final.jpg');
 storage.clear();await assert.rejects(page().generate(async()=>({data:{state:'unknown'}}),input,''),/未重复提交/);assert.equal(storage.size,1);
 storage.clear();await assert.rejects(page().generate(async()=>({data:{state:'failed',error:'失败'}}),input,''),/失败/);assert.equal(storage.size,0);
 console.log('PASS: reload after lost acknowledgement resumes same job, completed result recovery, intentional regeneration, concurrent-click dedupe and conservative unknown-state handling');
})().catch(e=>{console.error(e);process.exitCode=1});
