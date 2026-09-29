import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
const Database = require("better-sqlite3");

async function main() {
  const root = process.cwd(), temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-remaining-"));
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
    const r = await fetch(base + "/api/" + route, { method, signal: AbortSignal.timeout(3000), ...(method === "GET" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    assert.equal(r.status, status, `${route}: HTTP ${r.status}`); return (await r.json()).data;
  }
  async function check(name: string, fn: () => Promise<void>) { try { await fn(); results.push({ name, pass: true }); } catch (e: any) { results.push({ name, pass: false, reason: e.message }); } }
  const vendor = { id: "audit-settings", name: "隔离测试供应商", author: "test", version: "2.0", inputs: [], inputValues: {}, models: [{ name: "本地测试文本", modelName: "fixture", type: "text", think: false }] };
  const code = (value: any) => `exports.vendor = ${JSON.stringify(value)}; exports.textRequest = () => {}; exports.imageRequest = () => ''; exports.videoRequest = () => '';`;
  try {
    const projectId=99119501,scriptId=99119502;
    await db("o_project").insert({id:projectId,name:"剩余接口隔离项目"});await db("o_script").insert({id:scriptId,projectId,name:"第一集",extractState:"已完成"});
    await check("director-manual-create-read-edit-retain-image-delete",async()=>{
      const name="隔离导演手册",directorManual="audit-director";
      const data=[{label:"README",value:"README",data:name+"\n导演说明"},{label:"导演规划",value:"director_planning_narrative",data:"先确认人物动机"}];
      await call("project/addDirectorManual",{name,directorManual,images:["data:image/png;base64,"+Buffer.from("manual-image").toString("base64")],data});
      const first=(await call("project/queryDirectorManual")).find((r:any)=>r.directorManual===directorManual);assert.ok(first);assert.equal(first.image.length,1);
      await call("project/editDirectorlManual",{name:"更新导演手册",directorManual,images:first.image,data:[{label:"README",value:"README",data:"更新说明"},{label:"导演规划",value:"director_planning_narrative",data:"先安排动作"}]});
      const after=(await call("project/queryDirectorManual")).find((r:any)=>r.directorManual===directorManual);assert.equal(after.name,"更新导演手册");assert.equal(after.data.find((r:any)=>r.value==="director_planning_narrative").data,"先安排动作");
      const file=path.join(temp,"data",after.image[0].split("?")[0].replace(/^\/skills\//,"skills/"));assert.equal((await fs.readFile(file)).toString(),"manual-image","saving returned image URLs preserves bytes");
      await call("project/deleteDirectorManual",{name:directorManual});assert.ok(!(await call("project/queryDirectorManual")).some((r:any)=>r.directorManual===directorManual));
    });
    await check("visual-manual-edit-retain-image-and-lookup",async()=>{
      const stylePath="audit-visual",name="隔离视觉手册";
      await call("project/addVisualManual",{name,stylePath,images:["data:image/png;base64,"+Buffer.from("visual-image").toString("base64")],data:[{label:"README",value:"README",data:name+"\n说明"},{label:"角色",value:"art_character",data:"柔和侧光"}]});
      const before=(await call("project/getVisualManual")).find((r:any)=>r.stylePath===stylePath);assert.ok(before);
      await call("project/editVisualManual",{name:"更新视觉手册",stylePath,images:before.image,data:[{label:"README",value:"README",data:"新版说明"},{label:"角色",value:"art_character",data:"冷色调"}]});
      const after=(await call("project/getVisualManual")).find((r:any)=>r.stylePath===stylePath);assert.equal(after.name,"更新视觉手册");assert.equal(after.data.find((r:any)=>r.value==="art_character").data,"冷色调");
      assert.equal((await fs.readFile(path.join(temp,"data",after.image[0].replace(/^\/skills\//,"skills/")))).toString(),"visual-image");
      assert.equal(await call("project/visualManual",{type:"art_character",stylePath}),"冷色调");
      await call("project/visualManual",{type:"audit-missing",stylePath},"POST",404);
      await call("project/visualManual",{type:"README",stylePath:"missing-manual"},"POST",404);
    });
    await check("script-regex-poll-and-agent-data-update",async()=>{
      let captured:any;u.Ai.Text=(()=>({invoke:async(input:any)=>{captured=input;return{text:" /第(\\d+)集([^\\n]*)/g "};}})) as any;
      assert.equal(await call("script/getAiRegex",{content:"第1集 开始\n"+"正文".repeat(2000)}),"/第(\\d+)集([^\\n]*)/g");assert.equal(captured.messages[0].content.length,2000);
      assert.equal((await call("script/pollScriptAssets",{ids:[scriptId]}))[0].extractState,"已完成");
      const [id]=await db("o_agentWorkData").insert({projectId,key:"scriptAgent",data:"{}"});const data={storySkeleton:"骨架",adaptationStrategy:"策略",script:[{id:scriptId,content:"测试正文"}]};
      await call("scriptAgent/updateData",{id,data});assert.deepEqual(JSON.parse((await db("o_agentWorkData").where({id}).first()).data),data);
      const [image]=await db("o_image").insert({state:"生成中"});await call("assetsGenerate/cancelGenerate",{id:image});assert.equal((await db("o_image").where({id:image}).first()).state,"生成失败");
    });
    await check("project-model-details-and-unconfigured-state",async()=>{
      await call("setting/vendorConfig/addVendor",{tsCode:code(vendor)});await db("o_agentDeploy").where({key:"scriptAgent"}).update({modelName:vendor.id+":fixture",vendorId:vendor.id,model:"fixture"});
      assert.equal((await call("project/getModelDetails",{key:"scriptAgent"})).modelName,"fixture");
      await db("o_agentDeploy").where({key:"scriptAgent"}).update({modelName:null});await call("project/getModelDetails",{key:"scriptAgent"},"POST",400);
    });
    await check("one-click-model-config-local-fake-key",async()=>{
      u.Ai.Text=(()=>({invoke:async()=>({text:"2"})})) as any;
      await call("setting/agentDeploy/agentSetKey",{key:"audit-not-a-real-key"});assert.equal(JSON.parse((await db("o_vendorConfig").where({id:"toonflow"}).first()).inputValues).apiKey,"audit-not-a-real-key");assert.equal((await db("o_agentDeploy").where({key:"scriptAgent"}).first()).vendorId,"toonflow");
    });
    await check("one-click-empty-result-returns-error-preserves-config",async()=>{
      const previous=(await db("o_vendorConfig").where({id:"toonflow"}).first()).inputValues;
      u.Ai.Text=(()=>({invoke:async()=>({text:""})})) as any;
      await call("setting/agentDeploy/agentSetKey",{key:"audit-invalid-replacement"},"POST",400);
      assert.equal((await db("o_vendorConfig").where({id:"toonflow"}).first()).inputValues,previous);
    });
    await check("batch-audio-binding-and-original-reference-list",async()=>{
      await fs.mkdir(u.getPath("audio-library"),{recursive:true});const filePath="/library/audio/voices/male-deep.wav";await u.oss.writeFile(filePath,Buffer.from("fixture-audio"));
      await fs.writeFile(u.getPath("audio-library/catalog.json"),JSON.stringify({sounds:[{id:"male-deep",name:"测试声线",category:"voice",categoryName:"声线",description:"本地测试",filePath,bytes:13,duration:1}]}));
      // bytes reflects the fixture file, never a remote or shared sound.
      const catalog=JSON.parse(await fs.readFile(u.getPath("audio-library/catalog.json"),"utf8"));catalog.sounds[0].bytes=Buffer.byteLength("fixture-audio");await fs.writeFile(u.getPath("audio-library/catalog.json"),JSON.stringify(catalog));
      const [role]=await db("o_assets").insert({projectId,type:"role",name:"配音测试角色"});
      u.Ai.Text=(()=>({invoke:async(input:any)=>{const mapping=await db("o_soundLibraryAssets").where({projectId,key:"male-deep"}).first();await input.tools.resultTool.execute({audioId:mapping.parentId});return{text:""};}})) as any;
      await call("cornerScape/batchBindAudio",{projectId,assetsIds:[role],concurrentCount:1});
      for(let i=0;i<100;i++){if((await db("o_assets").where({id:role}).first()).audioBindState!=="生成中")break;await new Promise(r=>setTimeout(r,10));}
      assert.equal((await db("o_assets").where({id:role}).first()).audioBindState,"已完成");assert.equal((await db("o_assets").where({id:role}).first()).defaultVoice,"male-deep");
      const list=await call("production/workbench/getAudioBindAssetsList",{assetsIds:[role]});assert.equal(list.length,1);assert.equal(list[0].fileType,"audio");assert.ok(list[0].src.endsWith("male-deep.wav"));
    });
    await check("batch-audio-no-tool-result-settles-failure",async()=>{
      const [role]=await db("o_assets").insert({projectId,type:"role",name:"未提交匹配结果"});u.Ai.Text=(()=>({invoke:async()=>({text:"没有调用工具"})})) as any;
      await call("cornerScape/batchBindAudio",{projectId,assetsIds:[role]});
      for(let i=0;i<50;i++){if((await db("o_assets").where({id:role}).first()).audioBindState!=="生成中")break;await new Promise(r=>setTimeout(r,10));}
      assert.equal((await db("o_assets").where({id:role}).first()).audioBindState,"生成失败");
    });
    const report={results,endpoints:[...endpoints].sort(),inference:"local mocks; no external requests; fake key only"};await fs.writeFile(path.join(root,"local/full-regression-20260924/original-remaining-results.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.ok(results.every(r=>r.pass));
  } finally {global.fetch=realFetch;await new Promise<void>(r=>server.close(()=>r()));await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
