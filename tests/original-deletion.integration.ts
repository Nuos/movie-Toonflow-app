import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import express from "express";
const Database = require("better-sqlite3");
async function main() {
 const root=process.cwd(), temp=await fs.mkdtemp(path.join(os.tmpdir(),"toonflow-deletion-"));
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
 await db("o_project").insert([{id:projectId,name:"删除测试项目"},{id:projectId+100,name:"保留项目"}]);
 await db("o_script").insert([{id:scriptId,projectId,name:"测试集"},{id:scriptId+100,projectId:projectId+100,name:"其他项目测试集"}]);
 const {randomUUID}=await import("node:crypto");
 async function fixture() {
   const [parent]=await db("o_assets").insert({projectId,type:"audio",name:"测试音频组"});
   const [child]=await db("o_assets").insert({projectId,assetsId:parent,type:"audio",name:"待删除音色"});
   const file=`/${projectId}/assets/audio/${randomUUID()}.wav`;await u.oss.writeFile(file,Buffer.from("owned-audio"));
   const [image]=await db("o_image").insert({assetsId:child,filePath:file,type:"audio"});await db("o_assets").where({id:child}).update({imageId:image});
   const [history]=await db("o_image").insert({assetsId:child,filePath:"/library/audio/voices/shared.wav",type:"audio"});
   await u.oss.writeFile("/library/audio/voices/shared.wav",Buffer.from("shared-audio"));
   const [role]=await db("o_assets").insert({projectId,type:"role",name:"保留角色",defaultVoice:"test-voice"});
   await db("o_assetsRole2Audio").insert({assetsRoleId:role,assetsAudioId:parent});
   await db("o_scriptAssets").insert({scriptId,assetId:child});
   const [board]=await db("o_storyboard").insert({projectId,scriptId});await db("o_assets2Storyboard").insert({storyboardId:board,assetId:child});
   await db("o_soundLibraryAssets").insert({projectId,key:"test-"+parent,parentId:parent,childId:child,imageId:image});
   await db("o_promptStandard").insert({projectId,kind:"asset",targetId:child,revision:1,data:"{}",createdAt:1});
   const recipe=randomUUID();await db("o_generationRecipe").insert({id:recipe,projectId,kind:"asset",targetId:child,state:"已完成",data:"{}",createdAt:1});
   await fs.mkdir(u.getPath(["reproduction",recipe]),{recursive:true});await fs.writeFile(u.getPath(["reproduction",recipe,"request.json"]),"{}");
   return {parent,child,image,history,file,role,board,recipe};
 }
 async function gone(f:any,parentGone=true){
   assert.equal(await db("o_assets").where({id:f.child}).first(),undefined,"child removed");
   assert.equal((await db("o_image").where({assetsId:f.child})).length,0,"history removed");
   assert.equal((await db("o_scriptAssets").where({assetId:f.child})).length,0,"script association removed");
   assert.equal((await db("o_assets2Storyboard").where({assetId:f.child})).length,0,"storyboard association removed");
   assert.equal((await db("o_soundLibraryAssets").where({childId:f.child})).length,0,"sound mapping removed");
   assert.equal((await db("o_promptStandard").where({kind:"asset",targetId:f.child})).length,0,"prompt standards removed");
   assert.equal(await db("o_generationRecipe").where({id:f.recipe}).first(),undefined,"recipe removed");
   if(parentGone){assert.equal(await db("o_assets").where({id:f.parent}).first(),undefined);assert.equal((await db("o_assetsRole2Audio").where({assetsAudioId:f.parent})).length,0);assert.equal((await db("o_assets").where({id:f.role}).first()).defaultVoice,null);}
   assert.ok(await db("o_storyboard").where({id:f.board}).first());
   await assert.rejects(u.oss.getFile(f.file),{code:"ENOENT"});assert.equal((await u.oss.getFile("/library/audio/voices/shared.wav")).toString(),"shared-audio");
   await assert.rejects(fs.stat(u.getPath(["reproduction",f.recipe])),{code:"ENOENT"});
 }
 for(const route of ["assets/delAssets","assets/batchDelete","production/assets/deleteAssetsDireve"]){
   await check(route+"-cleans-descendants-and-extensions",async()=>{const f=await fixture();await call(route,{id:route.endsWith("batchDelete")?[f.parent]:f.parent,projectId});await gone(f);});
 }
 await check("audio-update-removes-child-associations",async()=>{const f=await fixture();await call("assets/updateAudioAssets",{id:f.parent,projectId,name:"保留音频组",describe:"已移除音色",assetsItem:[]});await gone(f,false);assert.equal((await db("o_assetsRole2Audio").where({assetsAudioId:f.parent})).length,0);assert.equal((await db("o_assets").where({id:f.role}).first()).defaultVoice,null);assert.ok(await db("o_assets").where({id:f.parent}).first());});
 await check("production-delete-respects-project",async()=>{
   const [id]=await db("o_assets").insert({projectId:projectId+100,type:"role",name:"其他项目角色"});
   await call("production/assets/deleteAssetsDireve",{id,projectId},404);assert.ok(await db("o_assets").where({id}).first());
 });
 await check("shared-selection-and-flow-remain-usable",async()=>{
   const f=await fixture();const [flowId]=await db("o_imageFlow").insert({flowData:"{}"});
   await db("o_assets").where({id:f.parent}).update({flowId});
   const [other]=await db("o_assets").insert({projectId:projectId+100,type:"audio",name:"共享图片记录",imageId:f.image,flowId});
   await call("assets/batchDelete",{id:[f.parent,f.child]});
   assert.ok(await db("o_imageFlow").where({id:flowId}).first());
   assert.equal((await db("o_assets").where({id:other}).first()).imageId,f.image);
   assert.equal((await db("o_image").where({id:f.image}).first()).assetsId,null);
   assert.equal((await u.oss.getFile(f.file)).toString(),"owned-audio");
   await call("assets/delAssets",{id:other});assert.equal(await db("o_image").where({id:f.image}).first(),undefined);await assert.rejects(u.oss.getFile(f.file),{code:"ENOENT"});assert.equal(await db("o_imageFlow").where({id:flowId}).first(),undefined);
 });
 await check("delete-rollback-retains-records-and-files",async()=>{
   const f=await fixture();await db.raw(`CREATE TRIGGER audit_delete_failure BEFORE DELETE ON o_assets WHEN OLD.id = ${f.child} BEGIN SELECT RAISE(ABORT, 'audit rollback'); END`);
   try{await call("assets/delAssets",{id:f.parent},500);assert.ok(await db("o_assets").where({id:f.parent}).first());assert.ok(await db("o_assets").where({id:f.child}).first());assert.ok(await db("o_image").where({id:f.image}).first());assert.ok(await db("o_generationRecipe").where({id:f.recipe}).first());assert.equal((await u.oss.getFile(f.file)).toString(),"owned-audio");}finally{await db.raw("DROP TRIGGER audit_delete_failure");}
 });
 let fixtureId=Date.now()+100000;
 async function boardFixture(owner=projectId, episode=owner===projectId?scriptId:scriptId+100) {
   const [track]=await db("o_videoTrack").insert({id:++fixtureId,projectId:owner,scriptId:episode,duration:5});
   const [flow]=await db("o_imageFlow").insert({flowData:"{}"});
   const file=`/${owner}/assets/${randomUUID()}.png`;await u.oss.writeFile(file,Buffer.from("board-image"));
   const [board]=await db("o_storyboard").insert({projectId:owner,scriptId:episode,trackId:track,track:"同名镜头",duration:"5",filePath:file,flowId:flow});
   await db("o_cameraPlan").insert({projectId:owner,storyboardId:board,revision:1,data:"{}",createdAt:1});
   const clip=randomUUID(),draft=randomUUID(),recipe=randomUUID();
   const clipFile=`/${owner}/camera-clips/${clip}.mp4`;await u.oss.writeFile(clipFile,Buffer.from("camera-clip"));
   await db("o_cameraClipDraft").insert({id:draft,ownerId:1,projectId:owner,storyboardId:board,data:"{}",createdAt:1,expiresAt:2});
   await db("o_cameraClip").insert({id:clip,ownerId:1,projectId:owner,storyboardId:board,prepareToken:draft,status:"completed",filePath:clipFile,data:"{}",createdAt:1,updatedAt:1});
   await db("o_promptStandard").insert([{projectId:owner,kind:"storyboard",targetId:board,revision:1,data:"{}",createdAt:1},{projectId:owner,kind:"track",targetId:track,revision:1,data:"{}",createdAt:1}]);
   await db("o_generationRecipe").insert({id:recipe,projectId:owner,kind:"storyboard",targetId:board,state:"已完成",data:"{}",createdAt:1});
   const videoFile=`/${owner}/video/${randomUUID()}.mp4`;await u.oss.writeFile(videoFile,Buffer.from("track-video"));
   const [video]=await db("o_video").insert({projectId:owner,scriptId:episode,videoTrackId:track,filePath:videoFile});await db("o_videoTrack").where({id:track}).update({videoId:video});
   for(const parts of [["reproduction",recipe],["reproduction","camera-clips",clip]]){await fs.mkdir(u.getPath(parts),{recursive:true});await fs.writeFile(u.getPath([...parts,"request.json"]),"{}");}
   return {track,board,flow,file,clip,clipFile,draft,recipe,video,videoFile};
 }
 async function boardGone(f:any){
   assert.equal(await db("o_storyboard").where({id:f.board}).first(),undefined);
   assert.equal((await db("o_cameraPlan").where({storyboardId:f.board})).length,0,"camera plan removed");
   assert.equal(await db("o_cameraClip").where({id:f.clip}).first(),undefined);assert.equal(await db("o_cameraClipDraft").where({id:f.draft}).first(),undefined);
   assert.equal((await db("o_promptStandard").where({kind:"storyboard",targetId:f.board})).length,0);
   assert.equal(await db("o_generationRecipe").where({id:f.recipe}).first(),undefined);
   assert.equal(await db("o_videoTrack").where({id:f.track}).first(),undefined,"empty track removed");
   assert.equal(await db("o_video").where({id:f.video}).first(),undefined);
   assert.equal(await db("o_imageFlow").where({id:f.flow}).first(),undefined);
   for(const file of [f.file,f.clipFile,f.videoFile])await assert.rejects(u.oss.getFile(file),{code:"ENOENT"});
   for(const parts of [["reproduction",f.recipe],["reproduction","camera-clips",f.clip]])await assert.rejects(fs.stat(u.getPath(parts)),{code:"ENOENT"});
 }
 for(const route of ["production/storyboard/removeFrame","production/storyboard/batchDelete"]){
   await check(route+"-cleans-extensions-isolates-same-track-name",async()=>{
     const f=await boardFixture(),other=await boardFixture(projectId+100);
     await call(route,route.endsWith("batchDelete")?{ids:[f.board,other.board],projectId}:{id:f.board});await boardGone(f);
     assert.ok(await db("o_storyboard").where({id:other.board}).first());assert.ok(await db("o_videoTrack").where({id:other.track}).first());assert.ok(await db("o_cameraClip").where({id:other.clip}).first());assert.equal((await u.oss.getFile(other.file)).toString(),"board-image");
   });
 }
 await check("track-delete-preserves-boards-cleans-track-history",async()=>{
   const f=await boardFixture();await call("production/workbench/deleteTrack",{id:f.track});
   assert.equal((await db("o_storyboard").where({id:f.board}).first()).trackId,null);assert.ok(await db("o_cameraPlan").where({storyboardId:f.board}).first());
   assert.equal(await db("o_video").where({id:f.video}).first(),undefined);assert.equal((await db("o_promptStandard").where({kind:"track",targetId:f.track})).length,0);await assert.rejects(u.oss.getFile(f.videoFile),{code:"ENOENT"});
   assert.equal((await u.oss.getFile(f.file)).toString(),"board-image");
 });
 await check("script-delete-cleans-production-keeps-project-assets",async()=>{
   const [episode]=await db("o_script").insert({projectId,name:"待删除整集"});const f=await boardFixture(projectId,episode);
   const [asset]=await db("o_assets").insert({projectId,type:"role",name:"剧集共享角色"});await db("o_scriptAssets").insert({scriptId:episode,assetId:asset});
   const [emptyTrack]=await db("o_videoTrack").insert({projectId,scriptId:episode});
   await call("script/delScript",{ids:[episode]});await boardGone(f);assert.equal(await db("o_videoTrack").where({id:emptyTrack}).first(),undefined);assert.equal(await db("o_script").where({id:episode}).first(),undefined);assert.ok(await db("o_assets").where({id:asset}).first());
 });
 await check("replace-audio-child-keeps-group-binding",async()=>{
   const f=await fixture();await call("assets/updateAudioAssets",{id:f.parent,projectId,name:"替换音色组",describe:"替换",assetsItem:[{name:"新音色",prompt:"新台词",describe:"新声音",base64:"data:audio/wav;base64,"+Buffer.from("replacement").toString("base64")}]});
   await gone(f,false);assert.equal((await db("o_assetsRole2Audio").where({assetsAudioId:f.parent})).length,1);assert.equal((await db("o_assets").where({id:f.role}).first()).defaultVoice,null);
   const child=await db("o_assets").where({assetsId:f.parent}).first();assert.ok(child);const im=await db("o_image").where({id:child.imageId}).first();assert.equal((await u.oss.getFile(im.filePath)).toString(),"replacement");
 });
 await check("audio-metadata-only-and-library-replacement",async()=>{
   const f=await fixture();const item={id:f.child,name:"编辑音色",prompt:"编辑台词",describe:"编辑"};
   await call("assets/updateAudioAssets",{id:f.parent,projectId,name:"编辑音频组",describe:"编辑",assetsItem:[item]});
   assert.equal((await u.oss.getFile(f.file)).toString(),"owned-audio");
   await call("assets/updateAudioAssets",{id:f.parent,projectId,name:"编辑音频组",describe:"编辑",assetsItem:[{...item,src:await u.oss.getFileUrl(f.file)}]});
   assert.equal((await db("o_soundLibraryAssets").where({childId:f.child})).length,1,"canonical URL keeps built-in mapping");
   await call("assets/updateAudioAssets",{id:f.parent,projectId,name:"编辑音频组",describe:"编辑",assetsItem:[{...item,base64:"data:audio/wav;base64,"+Buffer.from("custom-audio").toString("base64")}]});
   assert.equal((await db("o_soundLibraryAssets").where({childId:f.child})).length,0);assert.equal((await db("o_assets").where({id:f.role}).first()).defaultVoice,null);assert.equal((await db("o_assetsRole2Audio").where({assetsAudioId:f.parent})).length,1);
 });
 await check("remove-one-frame-keeps-shared-track-and-flow",async()=>{
   const f=await boardFixture();const [second]=await db("o_storyboard").insert({projectId,scriptId,trackId:f.track,flowId:f.flow,track:"同名镜头",filePath:f.file});
   await call("production/storyboard/removeFrame",{id:f.board});assert.ok(await db("o_videoTrack").where({id:f.track}).first());assert.ok(await db("o_video").where({id:f.video}).first());assert.ok(await db("o_imageFlow").where({id:f.flow}).first());assert.equal((await u.oss.getFile(f.file)).toString(),"board-image");assert.ok(await db("o_storyboard").where({id:second}).first());
 });
 await check("storyboard-delete-rollback-restores-addon-history",async()=>{
   const f=await boardFixture();await db.raw(`CREATE TRIGGER audit_board_failure BEFORE DELETE ON o_storyboard WHEN OLD.id = ${f.board} BEGIN SELECT RAISE(ABORT, 'audit rollback'); END`);
   try {await call("production/storyboard/batchDelete",{ids:[f.board],projectId},500);assert.ok(await db("o_cameraClip").where({id:f.clip}).first());assert.ok(await db("o_generationRecipe").where({id:f.recipe}).first());assert.ok(await db("o_storyboard").where({id:f.board}).first());assert.equal((await u.oss.getFile(f.clipFile)).toString(),"camera-clip");}finally{await db.raw("DROP TRIGGER audit_board_failure");}
 });
 const report={results,endpoints:[...endpoints].sort(),inference:"disabled"};await fs.writeFile(path.join(root,"local/full-regression-20260924/original-deletion-results.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.ok(results.every(r=>r.pass));
 }finally{global.fetch=realFetch;await new Promise<void>(r=>server.close(()=>r()));await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
