import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import express from "express";
const Database = require("better-sqlite3");
async function main() {
 const root=process.cwd(), temp=await fs.mkdtemp(path.join(os.tmpdir(),"toonflow-storyboards-"));
 await fs.chmod(temp,0o700); await fs.mkdir(path.join(temp,"data"));
 const original=new Database(path.join(root,"data/db2.sqlite"),{readonly:true}); await original.backup(path.join(temp,"data/db2.sqlite")); original.close();
 await fs.copyFile(path.join(root,"package.json"),path.join(temp,"package.json"));
 for(const f of ["vendor","skills","modelPrompt"]) await fs.cp(path.join(root,"data",f),path.join(temp,"data",f),{recursive:true});
 process.chdir(temp); process.env.NODE_ENV="prod";
 const {default:u}=await import("../src/utils"); const {db}=await import("../src/utils/db");

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
 const sharp=(await import("sharp")).default;
 const png=await sharp({create:{width:128,height:96,channels:3,background:"#ff0000"}}).png().toBuffer();
 const blue=await sharp({create:{width:128,height:96,channels:3,background:"#0000ff"}}).png().toBuffer();
 const model="audit-storyboard:fixture", captures:any[]=[];
 const nativeVm=u.vm;u.vm=((...args:Parameters<typeof u.vm>)=>{const r=nativeVm(...args);if(r.imageRequest){const fn=r.imageRequest;r.imageRequest=(input:any,...rest:any[])=>{captures.push(input);return fn(input,...rest);};}return r;}) as any;
 await db("o_vendorConfig").insert({id:"audit-storyboard",enable:1,inputValues:"{}",models:"[]"});
 await fs.writeFile(u.getPath(["vendor","audit-storyboard.ts"]),`exports.vendor={version:'2.0',inputValues:{},models:[{modelName:'fixture',type:'image',name:'模拟供应商'}]};exports.imageRequest=async(input)=>{if(input.prompt==='模拟失败')throw Error('模拟生成失败');return '${png.toString("base64")}';};`);
 await db("o_project").insert({id:projectId,name:"分镜测试",imageModel:model,imageQuality:"1K",videoRatio:"16:9"});await db("o_script").insert({id:scriptId,projectId,name:"测试集"});
 const refs:any[]=[];
 for(const [name,bytes] of [["角色甲",png],["场景乙",blue]] as const){const [id]=await db("o_assets").insert({projectId,name,type:"role"});const file=`/${projectId}/role/${id}.png`;await u.oss.writeFile(file,bytes);const [imageId]=await db("o_image").insert({assetsId:id,filePath:file,state:"已完成"});await db("o_assets").where({id}).update({imageId});refs.push({id,imageId,file});}
 const item=(track:string,extra:any={})=>({prompt:"镜头描述",duration:5,track,state:"未生成",src:null,videoDesc:"角色抬头",shouldGenerateImage:1,associateAssetsIds:[refs[1].id,refs[0].id],...extra});
 await check("batch-add-returns-saved-track-and-image",async()=>{
   const rows=await call("production/storyboard/batchAddStoryboardInfo",{projectId,scriptId,data:[item("镜头一",{src:await u.oss.getFileUrl(refs[0].file)})]});
   const row=rows.find((r:any)=>r.prompt==="镜头描述"),saved=await db("o_storyboard").where({id:row.id}).first();
   assert.ok(row.trackId,"response must include newly assigned track id");assert.equal(row.trackId,saved.trackId);assert.ok(row.src,"provided image retained");assert.deepEqual(row.associateAssetsIds,[refs[1].id,refs[0].id]);
 });
 await check("batch-add-unique-tracks-at-same-millisecond",async()=>{
   const [episode]=await db("o_script").insert({projectId,name:"批量轨道集"});const now=Date.now;Date.now=()=>1900000000000;
   try{const rows=await call("production/storyboard/batchAddStoryboardInfo",{projectId,scriptId:episode,data:[item("A"),item("B")]});assert.equal(new Set(rows.map((r:any)=>r.trackId)).size,2);}finally{Date.now=now;}
 });
 await check("append-reuses-named-track-preserves-independent-tracks",async()=>{
   const [episode]=await db("o_script").insert({projectId,name:"续加分镜"});
   const [independentA]=await db("o_videoTrack").insert({projectId,scriptId:episode,duration:3});
   const [independentB]=await db("o_videoTrack").insert({projectId,scriptId:episode,duration:4});
   const [boardA]=await db("o_storyboard").insert({projectId,scriptId:episode,trackId:independentA,duration:"3"});
   const [boardB]=await db("o_storyboard").insert({projectId,scriptId:episode,trackId:independentB,duration:"4"});
   const first=await call("production/storyboard/batchAddStoryboardInfo",{projectId,scriptId:episode,data:[item("连续镜头")]});const track=first.find((r:any)=>![boardA,boardB].includes(r.id)).trackId;
   await call("production/storyboard/batchAddStoryboardInfo",{projectId,scriptId:episode,data:[item("连续镜头",{duration:2,prompt:"新分镜"})]});
   assert.equal((await db("o_videoTrack").where({id:track}).first()).duration,7);assert.equal((await db("o_storyboard").where({id:boardA}).first()).trackId,independentA);assert.equal((await db("o_storyboard").where({id:boardB}).first()).trackId,independentB);
   assert.equal((await db("o_videoTrack").where({scriptId:episode})).length,3);
   assert.ok(await db("o_promptStandard").where({projectId,kind:"track",targetId:track}).first(),"prompt enrichment remains available");
 });
 await check("batch-add-rollback-on-second-row-error",async()=>{
   const [episode]=await db("o_script").insert({projectId,name:"失败回滚集"});await db.raw("CREATE TRIGGER audit_board_insert BEFORE INSERT ON o_storyboard WHEN NEW.prompt = '触发失败' BEGIN SELECT RAISE(ABORT, 'fixture'); END");
   try{await call("production/storyboard/batchAddStoryboardInfo",{projectId,scriptId:episode,data:[item("A"),item("B",{prompt:"触发失败"})]},500);assert.equal((await db("o_storyboard").where({scriptId:episode})).length,0,"failed import must not leave partial boards");}finally{await db.raw("DROP TRIGGER audit_board_insert");}
 });
 await check("preview-and-download-follow-user-order",async()=>{
   const ids:number[]=[];for(const ref of refs){const [id]=await db("o_storyboard").insert({projectId,scriptId,filePath:ref.file});ids.push(id);}
   const data=await call("production/storyboard/previewImage",{storyboardIds:ids.slice().reverse()});assert.ok(data.startsWith("data:image/jpeg;base64,"));
   const preview=await sharp(Buffer.from(data.split(",")[1],"base64")).raw().toBuffer({resolveWithObject:true});assert.equal(preview.info.width,256);assert.equal(preview.info.height,96);assert.ok(preview.data[(70*256+80)*preview.info.channels+2]>200,"first image is blue");
   const route="production/storyboard/downPreviewImage";endpoints.add("POST "+route);const r=await fetch(base+"/api/"+route,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({storyboardIds:ids})});assert.equal(r.status,200);assert.equal(r.headers.get("content-type"),"image/png");assert.equal((await sharp(Buffer.from(await r.arrayBuffer())).metadata()).width,256);
   assert.equal(await call("production/storyboard/previewImage",{storyboardIds:[]}),null);
   const empty=await fetch(base+"/api/"+route,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({storyboardIds:[]})});assert.equal(empty.status,204);
 });
 await check("batch-generation-success-skip-failure-reference-order",async()=>{
   const ids:number[]=[];for(const [prompt,shouldGenerateImage] of [["模拟成功",1],["模拟失败",1],["跳过分镜",0]] as const){const [id]=await db("o_storyboard").insert({projectId,scriptId,prompt,shouldGenerateImage});ids.push(id);}
   await db("o_assets2Storyboard").insert([{storyboardId:ids[0],assetId:refs[1].id},{storyboardId:ids[0],assetId:refs[0].id}]);
   const response=await call("production/storyboard/batchGenerateImage",{projectId,scriptId,storyboardIds:ids,concurrentCount:1});assert.deepEqual(response.find((r:any)=>r.id===ids[0]).associateAssetsIds,[refs[1].id,refs[0].id],"response uses asset ids, not image ids");
   let rows:any[]=[];for(let i=0;i<100;i++){rows=await db("o_storyboard").whereIn("id",ids);if(rows.every(r=>r.state!=="生成中"))break;await new Promise(r=>setTimeout(r,10));}
   assert.equal(rows.find(r=>r.id===ids[0]).state,"已完成");assert.equal(rows.find(r=>r.id===ids[1]).state,"生成失败");assert.equal(rows.find(r=>r.id===ids[2]).state,"未生成");
   const recipe=await db("o_generationRecipe").where({projectId,filePath:rows.find(r=>r.id===ids[0]).filePath,state:"已完成"}).first();assert.ok(recipe,"original generation still records reproduction recipe");assert.equal(recipe.filePath,rows.find(r=>r.id===ids[0]).filePath);
   const captured=captures.find(r=>r.prompt==="模拟成功");assert.deepEqual(captured.referenceList.map((r:any)=>r.base64),[await u.oss.getImageBase64(refs[1].file),await u.oss.getImageBase64(refs[0].file)]);
   const polled=await call("production/storyboard/pollingImage",{ids});assert.equal(polled.length,3);assert.ok(polled.find((r:any)=>r.id===ids[1]).reason.includes("模拟生成失败"));
   await call("production/storyboard/batchGenerateImage",{projectId,scriptId,storyboardIds:[ids[2]],compulsory:true});
   for(let i=0;i<100;i++){if((await db("o_storyboard").where({id:ids[2]}).first()).state==="已完成")break;await new Promise(r=>setTimeout(r,10));}
   assert.equal((await db("o_storyboard").where({id:ids[2]}).first()).state,"已完成");
 });
 await check("h3-batch-storyboard-keeps-reproduction-target",async()=>{
   await fs.writeFile(u.getPath(["vendor","comfyui-h3.ts"]),`exports.vendor={version:'2.0',inputValues:{},models:[{modelName:'qwen-image-2.1-quality',type:'image',name:'本地模拟 H3'}]};exports.imageRequest=async()=> '${png.toString("base64")}';`);
   await db("o_vendorConfig").insert({id:"comfyui-h3",enable:1,inputValues:"{}",models:"[]"}).onConflict("id").merge({inputValues:"{}",models:"[]"});
   await db("o_project").where({id:projectId}).update({imageModel:"comfyui-h3:qwen-image-2.1-quality"});
   try{
     const [id]=await db("o_storyboard").insert({projectId,scriptId,prompt:"固定镜头，青年站在村口。",videoDesc:"青年抬头。",duration:"5",shouldGenerateImage:1});
     await call("production/storyboard/batchGenerateImage",{projectId,scriptId,storyboardIds:[id]});let board:any;
     for(let i=0;i<100;i++){board=await db("o_storyboard").where({id}).first();if(board.state!=="生成中")break;await new Promise(r=>setTimeout(r,10));}
     assert.equal(board.state,"已完成");assert.ok(await db("o_generationRecipe").where({projectId,kind:"storyboard",targetId:id,state:"已完成",filePath:board.filePath}).first());
     const standard=await db("o_promptStandard").where({projectId,kind:"storyboard",targetId:id}).orderBy("revision","desc").first();assert.equal(JSON.parse(standard.data).references[0].path,board.filePath);
   }finally{await db("o_project").where({id:projectId}).update({imageModel:model});}
 });
 await check("editor-generate-save-and-original-readers",async()=>{
   const result=await call("production/editImage/generateFlowImage",{projectId,model,references:[await u.oss.getSmallImageUrl(refs[0].file)],quality:"1K",ratio:"16:9",prompt:"工作流图片"});assert.ok(result.url.startsWith("/oss/"));assert.ok((await u.oss.getFile(u.replaceUrl(result.url))).length);
   assert.deepEqual(await call("production/editImage/getImageDefaultModle",{projectId}),{imageModel:model,imageQuality:"1K"});
   assert.equal((await call("production/assets/pollingImage",{ids:refs.map(r=>r.id)})).length,2);
   const [board]=await db("o_storyboard").insert({projectId,scriptId,filePath:refs[0].file});await db("o_assets2Storyboard").insert({storyboardId:board,assetId:refs[0].id});
   assert.equal((await call("production/getStoryboardData",{projectId,scriptId})).find((r:any)=>r.id===String(board)).characters[0].name,"角色甲");
   const urls=await call("production/workbench/getFileUrl",{items:[{id:board,sources:"storyboard"},{id:refs[0].id,sources:"assets"}]});assert.equal(urls.data[board+":storyboard"],await u.oss.getSmallImageUrl(refs[0].file));
   const [track]=await db("o_videoTrack").insert({projectId,scriptId,state:"已完成",prompt:"视频提示词"});assert.equal((await call("production/workbench/checkVideoPrompt",{projectId,scriptId,trackIds:[track]}))[0].prompt,"视频提示词");
   const [video]=await db("o_video").insert({projectId,scriptId,videoTrackId:track,state:"生成失败",errorReason:"模拟错误"});assert.equal((await call("production/workbench/checkVideoStateList",{projectId,scriptId,videoIds:[video]}))[0].errorReason,"模拟错误");
 });
 const report={results,endpoints:[...endpoints].sort(),inference:"local deterministic image provider"};await fs.writeFile(path.join(root,"local/full-regression-20260924/original-storyboards-results.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.ok(results.every(r=>r.pass));
 }finally{global.fetch=realFetch;await new Promise<void>(r=>server.close(()=>r()));await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
