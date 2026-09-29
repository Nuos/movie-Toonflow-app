import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import sharp from "sharp";
const Database=require("better-sqlite3");
async function main(){
 const root=process.cwd(),temp=await fs.mkdtemp(path.join(os.tmpdir(),"toonflow-storyboard-lifecycle-"));await fs.chmod(temp,0o700);await fs.mkdir(path.join(temp,"data/vendor"),{recursive:true});
 const original=new Database(path.join(root,"data/db2.sqlite"),{readonly:true});await original.backup(path.join(temp,"data/db2.sqlite"));original.close();await fs.copyFile(path.join(root,"package.json"),path.join(temp,"package.json"));process.chdir(temp);process.env.NODE_ENV="prod";
 const {default:u}=await import("../src/utils"),{db}=await import("../src/utils/db");const {mediaPath}=await import("../src/utils/promptLibrary");await(await import("../src/utils/databaseBackup")).ensureBackupSchema();
 const png=await sharp({create:{width:32,height:32,channels:3,background:"#bca123"}}).png().toBuffer();
 const projectId=99119980,scriptId=99119981;
 await db("o_project").insert({id:projectId,name:"分镜并发测试",imageQuality:"1K",videoRatio:"16:9",artStyle:"2D_flat_design"});await db("o_script").insert({id:scriptId,projectId,name:"隔离剧本",content:"### 平台：竖屏9:16\n1-1 门口 日/外\n△青年站在门口。"});
 for(const [vendor,model] of [["audit-board","fixture"],["comfyui-h3","qwen-image-2.1-quality"]]){
  await db("o_vendorConfig").where({id:vendor}).delete();await db("o_vendorConfig").insert({id:vendor,enable:1,inputValues:"{}",models:"[]"});await fs.writeFile(path.join(temp,"data/vendor",vendor+".ts"),`exports.vendor={version:'2.0',inputValues:{},models:[{modelName:'${model}',type:'image'}]};exports.imageRequest=async()=> '${png.toString("base64")}';`);
 }
 const calls:any[]=[],jobs:any[]=[],nativeVm=u.vm,nativeImage=u.Ai.Image,savedPaths:string[]=[];
 u.Ai.Image=((...args:Parameters<typeof u.Ai.Image>)=>{const ai=nativeImage(...args),save=ai.save.bind(ai);ai.save=(async(...params:Parameters<typeof ai.save>)=>{savedPaths.push(params[0]);return save(...params);}) as any;return ai;}) as any;
 u.vm=((...args:Parameters<typeof u.vm>)=>{const result=nativeVm(...args);if(result.imageRequest){const fn=result.imageRequest;result.imageRequest=(input:any,model:any)=>new Promise((resolve,reject)=>{calls.push({requestId:input.request_id,aspectRatio:input.aspectRatio,release:()=>resolve(fn(input,model)),fail:()=>reject(Error("受控供应商失败"))});});}return result;}) as any;
 const app=express();app.use(express.json());const route=(await import("../src/routes/production/storyboard/batchGenerateImage")).default;
 const handler=(route as any).stack[0].route.stack.at(-1),originalHandler=handler.handle;
 handler.handle=(...args:any[])=>{const job={finished:false};jobs.push(job);return Promise.resolve(originalHandler(...args)).finally(()=>{job.finished=true;});};
 app.use("/generate",route);app.use("/manual",(await import("../src/routes/production/storyboard/updateStoryboardUrl")).default);app.use("/delete",(await import("../src/routes/production/storyboard/removeFrame")).default);
 app.use((err:any,_q:any,r:any,_n:any)=>{if(!r.headersSent)r.status(500).json({message:err.name});});
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));const base=`http://127.0.0.1:${(server.address() as any).port}`,nativeFetch=global.fetch;
 global.fetch=((url:any,...a:any[])=>{if(String(url)==="http://127.0.0.1:10589/capabilities")return Promise.resolve(Response.json({}));assert.ok(String(url).startsWith(base+"/"));return(nativeFetch as any)(url,...a);}) as any;
 async function post(url:string,data:any){const r=await fetch(base+url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});assert.equal(r.status,200);return r.json();}
 async function until(fn:()=>boolean){for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error("等待后台协程超时");}
 async function start(id:number){const ci=calls.length,ji=jobs.length;await post("/generate",{projectId,scriptId,storyboardIds:[id],concurrentCount:1});await until(()=>calls.length>ci||jobs[ji]?.finished);if(calls.length===ci)throw Error((await db("o_storyboard").where({id}).first()).reason||"供应商尚未调用，协程已结束");return{call:calls[ci],job:jobs[ji]};}
 async function discarded(requestId:string){assert.equal(await db("o_generationRecipe").where({id:requestId}).first(),undefined);await assert.rejects(fs.access(path.join(temp,"data/reproduction",requestId)),{code:"ENOENT"});}
 const results:any[]=[];
 try{
  for(const model of ["audit-board:fixture","comfyui-h3:qwen-image-2.1-quality"])for(const mode of ["success","failure","delete","manual","overlap-success","overlap-failure","older-first","newer-fails"]){
   const started=calls.length,pathsStart=savedPaths.length;
   try{
    await db("o_project").where({id:projectId}).update({imageModel:model});
    const [id]=await db("o_storyboard").insert({projectId,scriptId,prompt:"青年在门口",shouldGenerateImage:1,state:"已完成"});
    const previous=`/${projectId}/previous-${id}.png`,manual=`/${projectId}/manual-${id}.png`;await u.oss.writeFile(previous,png);await u.oss.writeFile(manual,png);await db("o_storyboard").where({id}).update({filePath:previous});
    const first=await start(id);assert.equal(first.call.aspectRatio,"9:16","分镜图使用剧集画幅，覆盖项目16:9默认");let expected=previous;
    if(mode==="delete")await post("/delete",{id});
    if(mode==="manual"){await post("/manual",{id,url:manual,flowId:0});expected=u.replaceUrl(manual);}
    if(mode.startsWith("overlap")||mode==="older-first"||mode==="newer-fails"){
      const second=await start(id);
      if(mode==="older-first"){first.call.release();await until(()=>first.job.finished);assert.equal((await db("o_storyboard").where({id}).first()).state,"生成中");await discarded(first.call.requestId);}
      if(mode==="newer-fails")second.call.fail();else second.call.release();await until(()=>second.job.finished);
      const newer=await db("o_storyboard").where({id}).first();expected=newer.filePath;
      if(mode==="overlap-failure")first.call.fail();else first.call.release();await until(()=>first.job.finished);
      assert.deepEqual(await db("o_storyboard").where({id}).first(),newer,"旧任务不得覆盖新任务结果或错误");await discarded(first.call.requestId);
    }else{
      if(mode==="failure")first.call.fail();else first.call.release();await until(()=>first.job.finished);
      const row=await db("o_storyboard").where({id}).first();
      if(mode==="delete"){assert.equal(row,undefined);await discarded(first.call.requestId);}
      else if(mode==="manual"){assert.equal(row.filePath,expected);assert.equal(row.state,"已完成");await discarded(first.call.requestId);}
      else if(mode==="failure"){assert.equal(row.state,"生成失败");assert.equal(row.filePath,previous,"失败保留上次可用图片");}
      else {assert.equal(row.state,"已完成");assert.deepEqual(await u.oss.getFile(row.filePath),png);assert.ok(await db("o_generationRecipe").where({id:first.call.requestId,state:"已完成"}).first());}
    }
    // 清理后的复现记录不应通过路径重新出现。
    if(mode==="delete")assert.equal(await db("o_promptStandard").where({projectId,kind:"storyboard",targetId:id}).first(),undefined);
    for(const filePath of savedPaths.slice(pathsStart)){
      const kept=await db("o_generationRecipe").where({filePath,state:"已完成"}).first();
      if(kept)assert.deepEqual(await u.oss.getFile(filePath),png);
      else {await assert.rejects(u.oss.getFile(filePath),{code:"ENOENT"});await assert.rejects(fs.access(mediaPath(filePath)),{code:"ENOENT"});}
    }
    results.push({model,mode,pass:true});
   }catch(e:any){results.push({model,mode,pass:false,reason:e.message});}
   finally{for(const call of calls.slice(started))call.release();await until(()=>jobs.every(j=>j.finished));}
  }
  console.log(JSON.stringify({results,boundary:"real routes/AI/storage, gated local providers; no external generation"}));assert.ok(results.every(r=>r.pass));
 }finally{for(const call of calls)call.release();global.fetch=nativeFetch;u.vm=nativeVm;u.Ai.Image=nativeImage;await new Promise<void>(r=>server.close(()=>r()));await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
