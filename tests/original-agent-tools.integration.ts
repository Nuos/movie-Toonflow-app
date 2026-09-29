import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import express from "express";
const Database = require("better-sqlite3");
async function main() {
 const root=process.cwd(), temp=await fs.mkdtemp(path.join(os.tmpdir(),"toonflow-agent-tools-"));
 await fs.chmod(temp,0o700); await fs.mkdir(path.join(temp,"data"));
 const original=new Database(path.join(root,"data/db2.sqlite"),{readonly:true}); await original.backup(path.join(temp,"data/db2.sqlite")); original.close();
 await fs.copyFile(path.join(root,"package.json"),path.join(temp,"package.json"));
 for(const f of ["vendor","skills","modelPrompt"]) await fs.cp(path.join(root,"data",f),path.join(temp,"data",f),{recursive:true});
 process.chdir(temp); process.env.NODE_ENV="prod";
 const {default:u}=await import("../src/utils"); const {db}=await import("../src/utils/db");
 u.Ai.Image=class {constructor(){throw Error("real inference forbidden");}} as any;
 u.Ai.Video=class {constructor(){throw Error("real inference forbidden");}} as any;
 u.Ai.Text=(()=>{throw Error("real inference forbidden");}) as any;
 u.cleanNovel=class {emitter=new EventEmitter(); start(rows:any[]){for(const r of rows)this.emitter.emit("item",{id:r.id,event:r.chapterIndex===1?"隔离事件":null,errorReason:r.chapterIndex===1?null:"模拟分析失败"});}} as any;
 const app=express(); app.use(express.json()); await(await import("../src/router")).default(app);
 app.use((err:any,_q:any,r:any,_n:any)=>r.status(500).json({message:err.code||err.name}));
 const server=app.listen(0,"127.0.0.1"); await new Promise<void>(r=>server.once("listening",r));
 const base=`http://127.0.0.1:${(server.address() as any).port}`, realFetch=global.fetch;
 global.fetch=((url:any,...a:any[])=>{assert.ok(String(url).startsWith(base+"/"));return(realFetch as any)(url,...a);}) as any;
 const endpoints=new Set<string>(),results:any[]=[]; const projectId=99119701,scriptId=99119702;
 async function call(route:string,body:any={},status=200){endpoints.add("POST "+route);const r=await fetch(base+"/api/"+route,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});assert.equal(r.status,status,route);return(await r.json()).data;}
 async function check(name:string,fn:()=>Promise<void>){try{await fn();results.push({name,pass:true});}catch(e:any){results.push({name,pass:false,reason:e.message});}}
 try {
 await (await import("../src/utils/databaseBackup")).ensureBackupSchema();
 await db("o_project").insert({id:projectId,name:"Agent 工具测试"});await db("o_script").insert({id:scriptId,projectId,name:"测试剧本",content:"角色走进房间。"});
 await db("o_novel").insert({projectId,chapterIndex:1,chapter:"第一章",chapterData:"青年在雨中归来。",event:"青年归来",eventState:1});
 const {default:ResTool}=await import("../src/socket/resTool");const {default:scriptTools}=await import("../src/agents/scriptAgent/tools");const {default:productionTools}=await import("../src/agents/productionAgent/tools");
 const events:any[]=[];let flow:any={script:"测试剧本正文",scriptPlan:"拍摄计划",assets:[],storyboard:[]};
 let hook=(event:string,payload:any,ack?:any)=>{if(ack)ack(event==="getPlanData"?{storySkeleton:"本地骨架"}:event==="getFlowData"?flow:{ok:true,id:payload?.id});};
 const socketEvents=new EventEmitter();
 const socket={connected:true,on:socketEvents.on.bind(socketEvents),off:socketEvents.off.bind(socketEvents),emit:(event:string,payload:any,ack?:any)=>{events.push({event,payload});hook(event,payload,ack);}};
 (socket as any).timeout=()=>({emit:(event:string,payload:any,ack:any)=>socket.emit(event,payload,(result:any)=>ack(null,result))});
 const resTool=new ResTool(socket as any,{projectId,scriptId});const msg=resTool.newMessage("assistant","隔离测试");
 const st=scriptTools({resTool,msg}),pt=productionTools({resTool,msg});
 const invoke=(tools:any,name:string,input:any)=>tools[name].execute(input);
 async function until(fn:()=>boolean){for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}assert.fail("socket action did not finish");}
 await check("script-tool-readers-and-filter",async()=>{
   assert.equal(Object.keys(st).length,7);assert.deepEqual(Object.keys(scriptTools({resTool,msg,toolsNames:["get_novel_text"]})),["get_novel_text"]);
   assert.ok((await invoke(st,"get_novel_events",{chapterIndexs:[1]})).includes("青年归来"));assert.equal(await invoke(st,"get_novel_text",{chapterIndex:"1"}),"青年在雨中归来。");assert.ok((await invoke(st,"get_script_content",{ids:[String(scriptId)]})).includes("角色走进房间。"));assert.equal(await invoke(st,"get_planData",{key:"storySkeleton"}),"本地骨架");
 });
 await check("production-workspace-reader-cache-and-filter",async()=>{
   assert.equal(Object.keys(pt).length,10);assert.deepEqual(Object.keys(productionTools({resTool,msg,toolsNames:["get_flowData"]})),["get_flowData"]);
   assert.equal(await invoke(pt,"get_flowData",{key:"scriptPlan"}),"拍摄计划");assert.match(await invoke(pt,"get_flowData",{key:"scriptPlan"}),/数据未变化/);flow.scriptPlan="更新计划";assert.equal(await invoke(pt,"get_flowData",{key:"scriptPlan"}),"更新计划");
 });
 await check("derive-tool-create-update-delete-cleans-extensions",async()=>{
   const [parent]=await db("o_assets").insert({projectId,type:"role",name:"原角色"});
   await invoke(pt,"add_deriveAsset",{assetsId:parent,id:"null",name:"衍生造型",desc:"灰衣"});const child=await db("o_assets").where({assetsId:parent}).first();assert.ok(await db("o_scriptAssets").where({scriptId,assetId:child.id}).first());
   await invoke(pt,"add_deriveAsset",{assetsId:parent,id:child.id,name:"更新造型",desc:"蓝衣"});assert.equal((await db("o_assets").where({assetsId:parent})).length,1);assert.equal((await db("o_assets").where({id:child.id}).first()).describe,"蓝衣");
   const file=`/${projectId}/assets/derive.png`;await u.oss.writeFile(file,Buffer.from("fixture"));const [image]=await db("o_image").insert({assetsId:child.id,filePath:file});await db("o_assets").where({id:child.id}).update({imageId:image});await db("o_promptStandard").insert({projectId,kind:"asset",targetId:child.id,revision:1,data:"{}",createdAt:1});
   await invoke(pt,"del_deriveAsset",{assetsId:parent,id:child.id});assert.equal(await db("o_assets").where({id:child.id}).first(),undefined);assert.equal(await db("o_image").where({id:image}).first(),undefined);assert.equal((await db("o_promptStandard").where({projectId,kind:"asset",targetId:child.id})).length,0);await assert.rejects(u.oss.getFile(file),{code:"ENOENT"});
 });
 await check("generation-tools-emit-original-client-contract",async()=>{
   await invoke(pt,"generate_deriveAsset",{ids:[11,12]});await until(()=>events.some(e=>e.event==="generateDeriveAsset"));assert.deepEqual(events.find(e=>e.event==="generateDeriveAsset").payload,{ids:[11,12]});
   await invoke(pt,"generate_storyboard",{ids:[21]});await until(()=>events.some(e=>e.event==="generateStoryboard"));assert.deepEqual(events.find(e=>e.event==="generateStoryboard").payload,{ids:[21]});
   await invoke(pt,"add_flowData_storyboard",{videoDesc:"角色抬头",prompt:null,track:"A",duration:5,associateAssetsIds:null,shouldGenerateImage:"false"});await until(()=>events.some(e=>e.event==="addStoryboard"));assert.deepEqual(events.find(e=>e.event==="addStoryboard").payload.associateAssetsIds,[]);
 });
 await check("socket-queue-recovers-after-rejected-action",async()=>{
   let calls=0;const prior=hook;hook=(event,payload,ack)=>{if(event==="generateStoryboard"){calls++;ack(calls===1?{error:"模拟界面生成失败"}:{ok:true});}else prior(event,payload,ack);};
   try{const tools=productionTools({resTool,msg});await invoke(tools,"generate_storyboard",{ids:[31]});await invoke(tools,"generate_storyboard",{ids:[32]});await until(()=>calls===2);}finally{hook=prior;}
 });
 await check("queued-socket-action-does-not-run-after-stop",async()=>{
   const controller=new AbortController(),start=events.length;
   const tools=productionTools({resTool,msg,abortSignal:controller.signal});
   await invoke(tools,"generate_storyboard",{ids:[999]});controller.abort();
   await until(()=>events.slice(start).some(e=>e.event==="content:update"&&e.payload.status==="complete"));
   assert.equal(events.slice(start).filter(e=>e.event==="generateStoryboard").length,0);
   await assert.rejects(invoke(tools,"add_deriveAsset",{assetsId:123,id:null,name:"不应新增",desc:"不应新增"}),{name:"AbortError"});
   assert.equal(await db("o_assets").where({projectId,name:"不应新增"}).first(),undefined);
 });
 const report={results,endpoints:[],tools:[...Object.keys(st),...Object.keys(pt)],mediaGeneration:"only socket events acknowledged by local fixture; no media backend invoked"};await fs.writeFile(path.join(root,"local/full-regression-20260924/original-agent-tools-results.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.ok(results.every(r=>r.pass));
 }finally{global.fetch=realFetch;await new Promise<void>(r=>server.close(()=>r()));await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
