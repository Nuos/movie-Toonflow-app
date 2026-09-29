import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { tool } from 'ai';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { z } from 'zod';
const Database = require('better-sqlite3');
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
async function main() {
 const root=process.cwd(), temp=await fs.mkdtemp(path.join(os.tmpdir(),'toonflow-no-limits-'));
 await fs.chmod(temp,0o700); await fs.mkdir(path.join(temp,'data'));
 const original=new Database(path.join(root,'data/db2.sqlite'),{readonly:true}); await original.backup(path.join(temp,'data/db2.sqlite')); original.close();
 for (const dir of ['vendor','skills','modelPrompt']) await fs.cp(path.join(root,'data',dir),path.join(temp,'data',dir),{recursive:true});
 await fs.copyFile(path.join(root,'package.json'),path.join(temp,'package.json'));process.chdir(temp);process.env.NODE_ENV='prod';
 const {default:u}=await import('../src/utils');const {db,databaseReady}=await import('../src/utils/db'); await databaseReady;
 const report:string[]=[];
 try {
  assert.equal(await db.schema.hasColumn('o_agentDeploy','maxOutputTokens'),false);
  assert.equal(await db('o_setting').where('key','summaryMaxLength').first(),undefined);
  // Migration must remain safe on repeated startup.
  await (await import('../src/lib/fixDB')).default(db);
  report.push('obsolete settings removed; migration repeatable');
  for (const modelName of ['mock:fixture','local-text:fixture'] as const) for(const mode of ['invoke','stream'] as const) {
   let calls=0;
   const model=new MockLanguageModelV3({
    doGenerate:async options=>{
     assert.equal(options.maxOutputTokens,undefined);
     calls++;
     return {content:calls<=65?[{type:'tool-call',toolCallId:String(calls),toolName:'advance',input:JSON.stringify({n:calls})}]:[{type:'text',text:'完整分镜'}],finishReason:{unified:calls<=65?'tool-calls':'stop',raw:undefined},usage,warnings:[]};
    },
    doStream:async options=>{
     assert.equal(options.maxOutputTokens,undefined);
     calls++;
     return {stream:simulateReadableStream({initialDelayInMs:0,chunkDelayInMs:0,chunks:[{type:'stream-start',warnings:[]},...(calls<=65?[{type:'tool-call' as const,toolCallId:String(calls),toolName:'advance',input:JSON.stringify({n:calls})}]:[{type:'text-start' as const,id:'t'},{type:'text-delta' as const,id:'t',delta:'完整分镜'},{type:'text-end' as const,id:'t'}]),{type:'finish',finishReason:{unified:calls<=65?'tool-calls':'stop',raw:undefined},usage}]})};
    }
   });
   const ai=u.Ai.Text(modelName) as any; ai.resolveModel=async()=>model;
   const result=await ai[mode]({prompt:'progress',maxOutputTokens:1,timeout:1,tools:{advance:tool({inputSchema:z.object({n:z.number()}),execute:async({n})=>({completed:n})})}});
   if(mode==='stream')await result.consumeStream({onError:(e: unknown)=>{throw e;}});
   assert.equal(await result.text,'完整分镜');assert.equal(calls,66);
   report.push(`${modelName}/${mode}: 65 tools + complete text; obsolete caps ignored`);
  }
  for(const mode of ['invoke','stream'] as const) {
   const controller=new AbortController();let calls=0;
   const check=(options:any)=>{calls++;assert.equal(options.abortSignal.aborted,false);controller.abort();options.abortSignal.throwIfAborted();};
   const ai=u.Ai.Text('mock:cancel') as any;
   ai.resolveModel=async()=>new MockLanguageModelV3({doGenerate:async (options: any)=>check(options),doStream:async (options: any)=>check(options)} as any);
   let aborted=false;
   try {const result=await ai[mode]({prompt:'cancel',abortSignal:controller.signal,maxRetries:0});if(mode==='stream')await result.consumeStream({onError:()=>{aborted=true;}});} catch {aborted=true;}
   assert.ok(aborted||controller.signal.aborted);assert.equal(calls,1);
   report.push(`${mode}: caller cancellation preserved`);
  }
  const {default:Memory}=await import('../src/utils/agent/memory');
  const originalText=u.Ai.Text; const long='完整关键情节。'.repeat(300);
  try {u.Ai.Text=(()=>({invoke:async()=>({text:long})})) as any;assert.equal(await (new Memory('productionAgent','fixture') as any).generateSummary(['text']),long);}finally{u.Ai.Text=originalText;}
  report.push('memory summary preserves full model output beyond 500 characters');
  console.log(JSON.stringify({passed:true,checks:report},null,2));
 }finally{await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
