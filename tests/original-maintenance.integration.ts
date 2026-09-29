import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
const Database = require("better-sqlite3");

async function main() {
  const root = process.cwd(), temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-maintenance-"));
  await fs.chmod(temp, 0o700); await fs.mkdir(path.join(temp, "data"));
  const original = new Database(path.join(root, "data/db2.sqlite"), { readonly: true });
  await original.backup(path.join(temp, "data/db2.sqlite")); original.close();
  for (const folder of ["vendor", "skills", "modelPrompt"]) await fs.cp(path.join(root, "data", folder), path.join(temp, "data", folder), { recursive: true });
  await fs.copyFile(path.join(root, "package.json"), path.join(temp, "package.json"));
  process.chdir(temp); process.env.NODE_ENV = "prod";
  const { default: u } = await import("../src/utils"); const { db } = await import("../src/utils/db");
  u.Ai.Text = (() => ({ invoke: async () => ({ text: "2" }) })) as any;
  const app = express(); app.use(express.json({ limit: "10mb" }));
  await (await import("../src/router")).default(app);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ message: err.code || err.name }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const realFetch = global.fetch, loginEnv = process.env.TOONFLOW_PASSWORDLESS;
  global.fetch = ((url: any, ...args: any[]) => { assert.ok(String(url).startsWith(base + "/"), "external network forbidden"); return (realFetch as any)(url, ...args); }) as any;
  const endpoints = new Set<string>(), results: any[] = [];
  async function call(route: string, body: any = {}, method = "POST", status = 200) {
    endpoints.add(`${method} ${route}`);
    const r = await fetch(base + "/api/" + route, { method, ...(method === "GET" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    assert.equal(r.status, status, `${route}: HTTP ${r.status}`); return (await r.json()).data;
  }
  async function check(name: string, fn: () => Promise<void>) { try { await fn(); results.push({ name, pass: true }); } catch (e: any) { results.push({ name, pass: false, reason: e.message }); } }
  const vendor = { id: "audit-settings", name: "隔离测试供应商", author: "test", version: "2.0", inputs: [], inputValues: {}, models: [{ name: "本地测试文本", modelName: "fixture", type: "text", think: false }] };
  const code = (value: any) => `exports.vendor = ${JSON.stringify(value)}; exports.textRequest = () => {}; exports.imageRequest = () => ''; exports.videoRequest = () => '';`;
  try {
    await call("setting/vendorConfig/addVendor", { tsCode: code({ ...vendor, models: [...vendor.models,
      {name:"模拟图片",modelName:"image",type:"image",mode:["text","singleImage"]},
      {name:"模拟视频",modelName:"video",type:"video",mode:["text"],audio:false,durationResolutionMap:[{duration:[5],resolution:["720p"]}]}] }) });
    await check("model-text-test-and-tool-stream",async()=>{
      const seen:any[]=[];
      u.Ai.Text=((model:string)=>({invoke:async(input:any)=>{seen.push({model,input});return{text:"模拟文本正常",reasoningText:"模拟思考"};},stream:async(input:any)=>{seen.push({model,input});return{textStream:(async function*(){yield "模拟";yield "流式正常";})()};}})) as any;
      const answer=await call("setting/vendorConfig/modelTest/textTest",{id:vendor.id,modelName:"fixture",messages:[{role:"user",content:"你好"}]});
      assert.deepEqual(answer,{thinking:"模拟思考",content:"模拟文本正常"});assert.equal(seen[0].model,vendor.id+":fixture");assert.equal(seen[0].input.messages[0].content,"你好");assert.ok(seen[0].input.tools.getWeatherTool);
      assert.equal(await call("setting/vendorConfig/modelTest",{id:vendor.id,modelName:"fixture",type:"text"}),"模拟流式正常");
    });
    await check("model-image-video-test-parameters-and-save",async()=>{
      const seen:any[]=[];
      const fake=(kind:string)=>(model:string)=>({run:async(input:any)=>{seen.push({kind,model,input});return{save:async(file:string)=>u.oss.writeFile(file,Buffer.from(kind+"-fixture"))};}});
      u.Ai.Image=fake("image") as any;u.Ai.Video=fake("video") as any;
      const ref="data:image/png;base64,YQ==";
      assert.equal(await call("setting/vendorConfig/modelTest/imageTest",{id:vendor.id,modelName:"image",prompt:"模拟参考图",imageBase64:ref}),await u.oss.getFileUrl("testImage.jpg"));
      assert.deepEqual(seen[0].input.referenceList,[{type:"image",base64:ref}]);assert.equal(seen[0].input.prompt,"模拟参考图");assert.equal((await u.oss.getFile("testImage.jpg")).toString(),"image-fixture");
      const images=[{type:"image",base64:ref}],videos=[{type:"video",base64:"data:video/mp4;base64,Yg=="}],audios=[{type:"audio",base64:"data:audio/wav;base64,Yw=="}];
      await call("setting/vendorConfig/modelTest/videoTest",{id:vendor.id,modelName:"video",mode:'["image","video","audio"]',prompt:"模拟视频",images,videos,audios});
      assert.deepEqual(seen[1].input.referenceList,[...images,...videos,...audios]);assert.deepEqual(seen[1].input.mode,["image","video","audio"]);assert.equal(seen[1].input.audio,false);assert.equal(seen[1].input.duration,5);assert.equal(seen[1].input.resolution,"720p");assert.equal((await u.oss.getFile("test.mp4")).toString(),"video-fixture");
      await call("setting/vendorConfig/modelTest",{id:vendor.id,modelName:"image",type:"image",mode:["text","singleImage"]});
      await call("setting/vendorConfig/modelTest",{id:vendor.id,modelName:"video",type:"video"});
      assert.equal(seen.length,4);
    });
    await check("database-overview-clear-table-and-memory",async()=>{
      const info=await call("setting/dbConfig/dbInfo",{},"GET");assert.ok(info.some((r:any)=>r.name==="o_cameraPlan"));assert.ok(info.some((r:any)=>r.name==="o_promptStandard"));
      await db("o_tasks").insert({taskClass:"维护隔离测试",state:"已完成"});await call("setting/dbConfig/clearTable",{tableName:"o_tasks"});assert.equal((await db("o_tasks")).length,0);
      await call("setting/dbConfig/clearTable",{tableName:"missing_table"},"POST",400);
      await call("setting/memoryConfig/delAllMemory");assert.equal((await db("memories")).length,0);
    });
    await check("version-source-download-code-and-web-folder-boundary",async()=>{
      assert.equal(await call("other/getVersion",{},"GET"),JSON.parse(await fs.readFile("package.json","utf8")).version);
      await call("setting/fileManagement/openFolder",{path:"oss"},"POST",400);
      app.get("/fixture/vendor",(_req,res)=>res.type("text/plain").send(code(vendor)));
      assert.equal(await call("setting/vendorConfig/getCodeByLink",{link:base+"/fixture/vendor"}),code(vendor));
      app.get("/fixture/update",(_req,res)=>res.json({version:"99.0.0",time:"fixture",data:{github:[{type:"linux",url:base+"/fixture/installer"},{type:"zip",url:base+"/fixture/archive"}]}}));
      const update=await call("setting/about/checkUpdate",{source:"github",url:base+"/fixture/update"});assert.equal(update.needUpdate,true);assert.equal(update.reinstall,true);
      assert.equal(await call("setting/about/downloadApp",{url:update.url,version:update.version,reinstall:true}),"请在浏览器中手动下载并安装最新版本");
      const compressing = await import("compressing");
      await fs.writeFile(path.join(temp,"update-marker.txt"),"isolated-update");
      await compressing.zip.compressFile(path.join(temp,"update-marker.txt"),path.join(temp,"update.zip"));
      app.get("/fixture/archive",(_req,res)=>res.sendFile(path.join(temp,"update.zip")));
      await fs.writeFile(path.join(temp,"data/addon-sentinel.txt"),"preserved-addon");
      await call("setting/about/downloadApp",{url:base+"/fixture/archive",version:"fixture",reinstall:false});
      assert.equal(await fs.readFile(path.join(temp,"data/update-marker.txt"),"utf8"),"isolated-update");
      assert.equal(await fs.readFile(path.join(temp,"data/addon-sentinel.txt"),"utf8"),"preserved-addon");
      await assert.rejects(fs.stat(path.join(temp,"data/temp")),{code:"ENOENT"});
      const r=await fetch(base+"/api/test/test");endpoints.add("GET test/test");assert.equal(r.status,200);assert.equal(await r.text(),"ok");
    });
    const report={results,endpoints:[...endpoints].sort(),inference:"local fake AI responses only",boundaries:["Electron folder launch not run in web deployment","Incremental update used a local fixture ZIP, not an upstream release"]};
    await fs.writeFile(path.join(root,"local/full-regression-20260924/original-maintenance-results.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.ok(results.every(r=>r.pass));
  } finally {
    global.fetch=realFetch;await new Promise<void>(r=>server.close(()=>r()));await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
