import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import express from "express";
const Database = require("better-sqlite3");
async function main() {
 const root=process.cwd(), temp=await fs.mkdtemp(path.join(os.tmpdir(),"toonflow-media-events-"));
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
 await db("o_project").insert({id:projectId,name:"媒体事件隔离项目"}); await db("o_script").insert({id:scriptId,projectId,name:"测试集"});
 await check("image-flow-async-route-recovery",async()=>{
 const originalImage=u.Ai.Image,originalUrl=u.oss.getSmallImageUrl;let calls=0,complete!:()=>void;
 u.Ai.Image=(()=>({run:async()=>{calls++;await new Promise<void>(r=>complete=r);return {save:async()=>{}}}})) as any;
 u.oss.getSmallImageUrl=(async(p:string)=>"/oss/"+p) as any;
 try{
 const operationId="6d7bd111-2462-4e90-a9a3-f1a7ce12e473",input={projectId,operationId,async:true,model:"fixture:image",references:[],quality:"2K",ratio:"9:16",prompt:"隔离模拟图片任务"};
 const started=await call("production/editImage/generateFlowImage",input);assert.equal(started.state,"pending");
 assert.equal((await call("production/editImage/generateFlowImage",input)).operationId,operationId);assert.equal(calls,1);
 await call("production/editImage/generateFlowImage",{statusOnly:true,projectId:projectId+1,operationId},404);
 complete();let status;
 for(let i=0;i<30;i++){status=await call("production/editImage/generateFlowImage",{statusOnly:true,projectId,operationId});if(status.state==="completed")break;await new Promise(r=>setTimeout(r,5))}
 assert.equal(status.state,"completed");assert.match(status.url,/workFlow/);assert.equal((await call("production/editImage/generateFlowImage",input)).url,status.url);assert.equal(calls,1);
 }finally{u.Ai.Image=originalImage;u.oss.getSmallImageUrl=originalUrl}
 });
 await check("editor-draft-route-roundtrip",async()=>{
 const empty=await call("production/editVideo/draft",{projectId,scriptId});assert.equal(empty.revision,0);assert.equal(empty.tracks,null);
 const tracks=[{id:"main",type:"video",clips:[{id:"clip",startTime:0,endTime:6.5,sourceUrl:"/oss/test.mp4",volume:.7}]}];
 const saved=await call("production/editVideo/draft",{projectId,scriptId,save:{revision:0,tracks}});assert.equal(saved.revision,1);
 assert.deepEqual((await call("production/editVideo/draft",{projectId,scriptId})).tracks,tracks);
 await call("production/editVideo/draft",{projectId,scriptId,save:{revision:0,tracks:[]}},409);
 await call("production/editVideo/draft",{projectId:projectId+1,scriptId},404);
 });
 await check("audio-upload-update-byte-roundtrip",async()=>{
 const item={name:"测试音色",describe:"测试",prompt:"台词",base64:"data:audio/wav;base64,"+Buffer.from("audio-fixture").toString("base64")};
 await call("assets/addAudioAssets",{projectId,name:"测试音频组",describe:"测试",assetsItem:[item]});
 const parent=await db("o_assets").where({projectId,name:"测试音频组"}).first(), child=await db("o_assets").where({assetsId:parent.id}).first();
 const im=await db("o_image").where({id:child.imageId}).first(); assert.equal((await u.oss.getFile(im.filePath)).toString(),"audio-fixture");
 await call("assets/updateAudioAssets",{id:parent.id,projectId,name:"更新音频组",describe:"更新",assetsItem:[{...item,base64:undefined,id:child.id,src:await u.oss.getFileUrl(im.filePath)},{...item,name:"新增音色"}]});
 assert.equal((await db("o_assets").where({assetsId:parent.id})).length,2);
 await call("assets/updateAudioAssets",{id:parent.id,projectId,name:"更新音频组",describe:"更新",assetsItem:[{...item,base64:undefined,id:child.id,src:im.filePath}]});
 assert.equal((await db("o_assets").where({assetsId:parent.id})).length,1);
 const images=await call("assets/getImage",{assetsId:child.id});assert.equal(images.imageId,child.imageId);assert.equal(images.tempAssets[0].selected,true);
 });
 await check("clip-material-with-optional-script",async()=>{
 await call("assets/uploadClip",{projectId,name:"测试片段",base64Data:"data:video/mp4;base64,"+Buffer.from("clip-fixture").toString("base64")});
 const a=await db("o_assets").where({projectId,type:"clip"}).first();
 const [otherScript]=await db("o_script").insert({projectId,name:"素材查询第二集"});
 const [emptyTrack]=await db("o_videoTrack").insert({projectId,scriptId});
 const [track1]=await db("o_videoTrack").insert({projectId,scriptId});
 const [track2]=await db("o_videoTrack").insert({projectId,scriptId:otherScript});
 const [v1]=await db("o_video").insert({projectId,scriptId,videoTrackId:track1,state:"生成成功"});
 const [v2]=await db("o_video").insert({projectId,scriptId:otherScript,videoTrackId:track2,state:"生成成功"});
 const im=await db("o_image").where({id:a.imageId}).first();assert.equal((await u.oss.getFile(im.filePath)).toString(),"clip-fixture");
 const scoped=await call("assets/getMaterialData",{projectId,scriptId});assert.ok(scoped.data.some((r:any)=>r.name==="测试片段"));assert.ok(scoped.data.some((r:any)=>r.type==="audio"&&r.name==="测试音色"&&r.filePath));assert.ok(!scoped.data.some((r:any)=>r.name==="更新音频组"));assert.deepEqual(scoped.video.map((r:any)=>r.id),[track1]);assert.equal(scoped.video[0].trackNumber,2,"empty preceding track must not renumber generated videos");
 const all=await call("assets/getMaterialData",{projectId});assert.ok(all.data.some((r:any)=>r.name==="测试片段"));assert.deepEqual(all.video.map((r:any)=>r.id).sort(),[track1,track2].sort());
 await db("o_video").whereIn("id",[v1,v2]).delete();await db("o_videoTrack").whereIn("id",[emptyTrack,track1,track2]).delete();await db("o_script").where({id:otherScript}).delete();
 });
 await check("asset-list-and-completion-polling",async()=>{
 const [id]=await db("o_assets").insert({projectId,type:"role",name:"主角",promptState:"已完成",audioBindState:"已完成"});
 const [imageId]=await db("o_image").insert({assetsId:id,state:"已完成",type:"role"});await db("o_assets").where({id}).update({imageId});
 assert.equal((await call("assets/batchGenerationData",{projectId,type:"role",page:1,limit:10,name:"主角"})).total,1);
 assert.equal((await call("assets/pollingImageAssets",{ids:[id]}))[0].id,id);
 assert.equal((await call("assets/pollingPromptAssets",{ids:[id]}))[0].id,id);
 assert.equal((await call("cornerScape/pollingAudio",{ids:[id]}))[0].id,id);
 assert.equal((await call("cornerScape/getAllAssets",{projectId,type:["role"]}))[0].id,id);
 await call("assets/batchDelete",{id:[id]});assert.equal(await db("o_assets").where({id}).first(),undefined);
 });
 await check("image-delete-removes-file-and-selection",async()=>{
 const [id]=await db("o_assets").insert({projectId,type:"scene",name:"删图测试"}); const filePath=`/${projectId}/assets/delete.png`;
 await u.oss.writeFile(filePath,Buffer.from("fixture"));const [imageId]=await db("o_image").insert({assetsId:id,filePath,state:"已完成"});await db("o_assets").where({id}).update({imageId});
 assert.equal(await call("common/getBigImage",{url:await u.oss.getFileUrl(filePath)}),await u.oss.getFileUrl(filePath));
 await call("assets/delImage",{id:imageId});assert.equal((await db("o_assets").where({id}).first()).imageId,null);await assert.rejects(u.oss.getFile(filePath),{code:"ENOENT"});
 await call("assets/delImage",{id:imageId});
 await u.oss.writeFile(filePath,Buffer.from("shared-fixture"));
 const [shared1]=await db("o_image").insert({assetsId:id,filePath});const [shared2]=await db("o_image").insert({assetsId:id,filePath});
 await call("assets/delImage",{id:shared1});assert.equal((await u.oss.getFile(filePath)).toString(),"shared-fixture");
 await call("assets/delImage",{id:shared2});await assert.rejects(u.oss.getFile(filePath),{code:"ENOENT"});
 });
 await check("overview-counts-real-tables",async()=>{
 await db("o_assets").insert({projectId,type:"role",name:"统计主角"});await db("o_storyboard").insert({projectId,scriptId});await db("o_video").insert({projectId,scriptId,state:"生成成功"});
 assert.deepEqual(await call("general/generalStatistics",{projectId}),{roleCount:1,scriptCount:1,videoCount:1,storyboardCount:1});
 });
 await check("event-analysis-polling-success-failure-and-isolation",async()=>{
 await db("o_novel").insert([{id:99119711,projectId,chapterIndex:1,chapter:"第一章"},{id:99119712,projectId,chapterIndex:2,chapter:"第二章"}]);
 await call("novel/event/generateEvents",{projectId,novelIds:[99119711,99119712]});
 let rows:any[]=[];for(let i=0;i<30;i++){rows=await call("novel/getNovelEventState",{ids:[99119711,99119712]});if(rows.length===2)break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(rows.find(r=>r.id===99119711).eventState,1);assert.equal(rows.find(r=>r.id===99119712).eventState,-1);
 assert.equal((await call("novel/getNovelIndex",{projectId}))[0].index,1);
 await call("novel/event/generateEvents",{projectId,novelIds:[-1]},400);
 });
 await check("event-search-pagination-and-delete",async()=>{
 const [e]=await db("o_event").insert({name:"关键事件",detail:"测试"});const [e2]=await db("o_event").insert({name:"另一个事件",detail:"测试"});
 await db("o_eventChapter").insert([{eventId:e,novelId:99119711},{eventId:e,novelId:99119712},{eventId:e2,novelId:99119712}]);
 const found=await call("novel/event/getEvent",{projectId,page:1,limit:10,search:"关键"});assert.equal(found.total,1);assert.deepEqual(found.list[0].chapters.sort(),[1,2]);
 await call("novel/event/deletEvent",{id:e});assert.equal((await db("o_eventChapter").where({eventId:e})).length,0);
 await call("novel/event/batchDeleteEvent",{ids:[e2]});assert.equal((await call("novel/event/getEvent",{projectId,page:1,limit:10})).total,0);
 });
 const report={results,endpoints:[...endpoints].sort(),inference:"disabled"};await fs.writeFile(path.join(root,"local/full-regression-20260924/original-media-events-results.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.ok(results.every(r=>r.pass));
 }finally{global.fetch=realFetch;await new Promise<void>(r=>server.close(()=>r()));await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
