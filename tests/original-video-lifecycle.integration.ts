import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
const Database=require("better-sqlite3");
async function main(){
 const root=process.cwd(),temp=await fs.mkdtemp(path.join(os.tmpdir(),"toonflow-video-lifecycle-"));await fs.chmod(temp,0o700);await fs.mkdir(path.join(temp,"data/vendor"),{recursive:true});
 const source=new Database(path.join(root,"data/db2.sqlite"),{readonly:true});await source.backup(path.join(temp,"data/db2.sqlite"));source.close();await fs.copyFile(path.join(root,"package.json"),path.join(temp,"package.json"));process.chdir(temp);process.env.NODE_ENV="prod";
 const {default:u}=await import("../src/utils"),{db}=await import("../src/utils/db");
 const {mediaPath}=await import("../src/utils/promptLibrary");await(await import("../src/utils/databaseBackup")).ensureBackupSchema();
 const bytes=Buffer.from("isolated-video-storage-fixture"),projectId=99119900,scriptId=99119901;
 await db("o_project").insert({id:projectId,name:"视频并发隔离测试",videoRatio:"16:9"});await db("o_script").insert({id:scriptId,projectId,name:"测试集"});
 await db("o_vendorConfig").insert({id:"audit-video",enable:1,inputValues:"{}",models:"[]"});await fs.writeFile(path.join(temp,"data/vendor/audit-video.ts"),`exports.vendor={version:'2.0',inputValues:{},models:[{modelName:'fixture',type:'video'}]};exports.videoRequest=async()=> '${bytes.toString("base64")}';`);
 let gate=Promise.resolve(),entered=false,saveFinished=false,runFinished=false,fail=false;
 const nativeVm=u.vm,nativeVideo=u.Ai.Video;
 u.vm=((...args:Parameters<typeof u.vm>)=>{const result=nativeVm(...args);if(result.videoRequest){const fn=result.videoRequest;result.videoRequest=async(...params:any[])=>{entered=true;await gate;if(fail)throw Error("模拟视频供应商失败");return fn(...params);};}return result;}) as any;
 u.Ai.Video=((...args:Parameters<typeof u.Ai.Video>)=>{const ai=nativeVideo(...args),save=ai.save.bind(ai),run=ai.run.bind(ai);ai.save=(async(...p:Parameters<typeof ai.save>)=>{try{return await save(...p);}finally{saveFinished=true;}}) as any;ai.run=(async(...p:Parameters<typeof ai.run>)=>{try{return await run(...p);}finally{runFinished=true;}}) as any;return ai;}) as any;
 const app=express();app.use(express.json());
 app.use("/single",(await import("../src/routes/production/workbench/generateVideo")).default);app.use("/batch",(await import("../src/routes/production/workbench/batchGenerateVideo")).default);app.use("/deleteVideo",(await import("../src/routes/production/workbench/delVideo")).default);app.use("/deleteTrack",(await import("../src/routes/production/workbench/deleteTrack")).default);
 app.use((err:any,_q:any,res:any,_n:any)=>{if(!res.headersSent)res.status(500).json({message:err.name});});
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));const base=`http://127.0.0.1:${(server.address() as any).port}`,nativeFetch=global.fetch;
 global.fetch=((url:any,...args:any[])=>{assert.ok(String(url).startsWith(base+"/"));return(nativeFetch as any)(url,...args);}) as any;
 async function post(route:string,body:any){const r=await fetch(base+route,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});assert.equal(r.status,200);return(await r.json()).data;}
 async function until(fn:()=>any,label:string){for(let i=0;i<200;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10));}throw Error("等待超时:"+label);}
 const results:any[]=[];async function check(name:string,fn:()=>Promise<void>){try{await fn();results.push({name,pass:true});}catch(e:any){results.push({name,pass:false,reason:e.message});}}
 try{
  for(const route of ["/single","/batch"])for(const mode of ["success","deleteVideo","deleteTrack","providerError"]){await check(route+":"+mode,async()=>{
   const [trackId]=await db("o_videoTrack").insert({projectId,scriptId,duration:5});entered=false;runFinished=false;saveFinished=false;fail=mode==="providerError";let release!:()=>void;gate=new Promise<void>(r=>release=r);
   const track={trackId,prompt:"青年走过街道",duration:5,uploadData:[]};const request={projectId,scriptId,model:"audit-video:fixture",mode:"text",resolution:"720p",audio:false,...(route==="/single"?track:{trackData:[track]})};
   try{const response=await post(route,request);const id=route==="/single"?response:response[0].videoId;await until(()=>entered,"视频供应商开始");const row=await db("o_video").where({id}).first();assert.ok(row);
    if(mode==="deleteVideo")await post("/deleteVideo",{id});if(mode==="deleteTrack")await post("/deleteTrack",{id:trackId});release();
    if(mode==="providerError"){await until(async()=>(await db("o_video").where({id}).first())?.state==="生成失败","失败收尾");assert.ok(runFinished);}
    else{await until(()=>saveFinished,"保存结束");if(mode==="success"){await until(async()=>(await db("o_video").where({id}).first())?.state==="生成成功","成功状态");assert.deepEqual(await u.oss.getFile(row.filePath),bytes);
      const [shared]=await db("o_video").insert({projectId,scriptId,videoTrackId:trackId,filePath:row.filePath,state:"生成成功"});
      await post("/deleteVideo",{id});assert.deepEqual(await u.oss.getFile(row.filePath),bytes,"仍有其他视频引用时保留文件");
      await post("/deleteVideo",{id:shared});await assert.rejects(fs.access(mediaPath(row.filePath)),{code:"ENOENT"});}
     else{assert.equal(await db("o_video").where({id}).first(),undefined);await assert.rejects(u.oss.getFile(row.filePath),{code:"ENOENT"});await assert.rejects(fs.access(mediaPath(row.filePath)),{code:"ENOENT"});}}
   }finally{release();}
  });}
  await check("batch:missing-reference-does-not-block-next",async()=>{
   gate=Promise.resolve();fail=false;const ids:number[]=[];for(let i=0;i<2;i++){const [id]=await db("o_videoTrack").insert({projectId,scriptId,duration:5});ids.push(id);}
   const [board]=await db("o_storyboard").insert({projectId,scriptId,trackId:ids[0],filePath:`/${projectId}/missing.jpg`});
   const response=await post("/batch",{projectId,scriptId,model:"audit-video:fixture",mode:"text",resolution:"720p",audio:false,trackData:ids.map((trackId,index)=>({trackId,prompt:"测试",duration:5,uploadData:index===0?[{id:board,sources:"storyboard"}]:[]}))});
   await until(async()=>{const rows=await db("o_video").whereIn("id",response.map((r:any)=>r.videoId));return rows.every(r=>r.state!=="生成中");},"缺参考同批收尾");
   assert.equal((await db("o_video").where({id:response[0].videoId}).first()).state,"生成失败");assert.equal((await db("o_video").where({id:response[1].videoId}).first()).state,"生成成功");
  });
  console.log(JSON.stringify({results,boundary:"isolated DB, deterministic byte fixture; no remote video generation"}));assert.ok(results.every(r=>r.pass));
 }finally{global.fetch=nativeFetch;u.vm=nativeVm;u.Ai.Video=nativeVideo;await new Promise<void>(r=>server.close(()=>r()));await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
