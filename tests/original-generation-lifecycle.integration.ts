import { installPortraitFixture } from "./portrait-fixture";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import sharp from "sharp";
const Database = require("better-sqlite3");

async function main() {
  const root = process.cwd(), temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-lifecycle-"));
  await fs.chmod(temp, 0o700); await fs.mkdir(path.join(temp, "data/vendor"), { recursive: true });
  const original = new Database(path.join(root, "data/db2.sqlite"), { readonly: true });
  await original.backup(path.join(temp, "data/db2.sqlite")); original.close();
  await fs.copyFile(path.join(root, "package.json"), path.join(temp, "package.json"));
  process.chdir(temp); process.env.NODE_ENV = "prod";
  const { default: u } = await import("../src/utils"); const { db } = await import("../src/utils/db");
  const lib = await import("../src/utils/promptLibrary"); await lib.ensurePromptLibrary();
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#a1b2c3" } }).png().toBuffer();
  const bare = png.toString("base64"), dataUrl = "data:image/png;base64," + bare;
  let gate: Promise<void> = Promise.resolve();
  let entered = false, saveFinished = false, savedPath = "";
  const nativeImage = u.Ai.Image;
  u.Ai.Image = ((...args: Parameters<typeof u.Ai.Image>) => {
    const image = nativeImage(...args), save = image.save.bind(image);
    image.save = (async (...params: Parameters<typeof image.save>) => {
      savedPath = params[0];
      try { return await save(...params); } finally { saveFinished = true; }
    }) as typeof image.save;
    return image;
  }) as typeof u.Ai.Image;
  const captures: any[] = [], nativeVm = u.vm;
  u.vm = ((...args: Parameters<typeof u.vm>) => {
    const result = nativeVm(...args);
    if (result.imageRequest) { const fn = result.imageRequest; result.imageRequest = (input: any, model: any) => { captures.push(JSON.parse(JSON.stringify(input))); entered = true; return gate.then(() => fn(input, model)); }; }
    return result;
  }) as typeof u.vm;
  for (const version of ["1.0", "2.0"]) {
    const id = "audit-image-" + version[0];
    await db("o_vendorConfig").insert({ id, enable: 1, inputValues: "{}", models: "[]" });
    await fs.writeFile(path.join(temp, "data/vendor", id + ".ts"), `exports.vendor = { version: '${version}', inputValues: {}, models: [{modelName:'fixture',type:'image',name:'隔离适配器'}] }; exports.imageRequest = async (input) => '${bare}';`);
  }
  await db("o_vendorConfig").where({id:"comfyui-h3"}).delete();
  await db("o_vendorConfig").insert({id:"comfyui-h3",enable:1,inputValues:"{}",models:"[]"});
  await fs.writeFile(path.join(temp,"data/vendor/comfyui-h3.ts"), `exports.vendor = {version:'2.0',inputValues:{},models:[{modelName:'qwen-image-2.1-quality',type:'image',name:'隔离提示词适配器'}]};exports.imageRequest=async()=> '${bare}';`);
  const projectId = 99119700, scriptId = 99119701;
  const nativeText = u.Ai.Text;
  u.Ai.Text = (() => ({invoke:async()=>({text:"衍生角色隔离测试"})})) as any;
  await db("o_project").insert({ id: projectId, name: "原供应商兼容性", imageModel: "comfyui-h3:qwen-image-2.1-quality", imageQuality: "2K" });
  await db("o_script").insert({id:scriptId,projectId,name:"并发生命周期测试"});
  await installPortraitFixture(root,temp,u);
  const app = express(); app.use(express.json());
  app.use("/single", (await import("../src/routes/assetsGenerate/generateAssets")).default);
  app.use("/delete", (await import("../src/routes/assets/delAssets")).default);
  app.use("/cancel", (await import("../src/routes/assetsGenerate/cancelGenerate")).default);
  app.use("/batch", (await import("../src/routes/assetsGenerate/batchGenerateImageAssets")).default);
  app.use("/videoPrompt", (await import("../src/routes/production/workbench/generateVideoPrompt")).default);
  let derivativeFinished = false;
  const derivativeRouter = (await import("../src/routes/production/assets/batchGenerateAssetsImage")).default;
  const derivativeHandler = (derivativeRouter as any).stack[0].route.stack.at(-1);
  const originalDerivativeHandler = derivativeHandler.handle;
  derivativeHandler.handle = (...args: any[]) => Promise.resolve(originalDerivativeHandler(...args)).finally(() => { derivativeFinished = true; });
  app.use("/derivative", derivativeRouter);
  app.use((err: any, _req: any, res: any, _next: any) => { if (!res.headersSent) res.status(500).json({ message: err.name }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const realFetch = global.fetch;
  global.fetch = ((url: any, ...args: any[]) => { assert.ok(String(url).startsWith(base + "/"), "external network forbidden"); return (realFetch as any)(url, ...args); }) as any;
  const checks: any[] = [];
  async function check(name: string, fn: () => Promise<void>) { try { await fn(); checks.push({ name, pass: true }); } catch (e: any) { checks.push({ name, pass: false, reason: e.message }); } }
  try {
    async function post(route: string, body: any) {
      return fetch(base + route, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body), signal:AbortSignal.timeout(2500)});
    }
    for (const model of ["audit-image-2:fixture", "comfyui-h3:qwen-image-2.1-quality"]) for (const route of ["/single", "/batch", "/derivative"]) for (const mode of ["new-selection", "cancel", "delete"]) {
      await check(model + route + ":" + mode, async () => {
        await db("o_project").where({id:projectId}).update({imageModel:model,artStyle:"2D_flat_design"});
        const [id] = await db("o_assets").insert({projectId,type:"role",name:"隔离并发验证"});
        const [selected] = await db("o_image").insert({assetsId:id,state:"已完成"});
        let release!: () => void; entered = false; saveFinished = false; savedPath = "";
        gate = new Promise<void>(r => release = r);
        const item = {id,type:"role",name:"隔离并发验证",prompt:"灰衣青年"};
        const body = {projectId,model,resolution:"1K",...(route === "/single" ? item : route === "/derivative" ? {scriptId,assetIds:[id],concurrentCount:1} : {items:[item]})};
        // Attach a rejection handler immediately so a baseline hanging response is recorded safely.
        const pending = post(route, body).then(r => ({response:r}), e => ({failure:e.name}));
        try {
          for (let i=0;i<100&&!entered;i++) await new Promise(r=>setTimeout(r,10));
          assert.ok(entered, "本地供应商已收到任务");
          const running = await db("o_image").where({assetsId:id,state:"生成中"}).first(); assert.ok(running);
          if (mode === "cancel") assert.equal((await post("/cancel",{id:running.id})).status,200);
          else if (mode === "delete") assert.equal((await post("/delete",{id})).status,200);
          else await db("o_assets").where({id}).update({imageId:selected});
          release();
          const outcome:any = await pending;
          assert.equal(outcome.failure,undefined,"生成请求必须结束");
          assert.equal(outcome.response.status,route === "/single" && mode !== "new-selection" ? 409 : 200);
          let image:any;
          for(let i=0;i<100;i++) { image=await db("o_image").where({id:running.id}).first(); if(!image || image.state!=="生成中")break; await new Promise(r=>setTimeout(r,10)); }
          if(mode === "delete") assert.equal(image,undefined);
          else assert.equal(image.state,mode==="cancel"?"生成失败":"已完成");
          if(mode==="new-selection") assert.equal((await db("o_assets").where({id}).first()).imageId,selected,"后台结果不得覆盖用户的新选择");
          for(let i=0;i<200&&!saveFinished;i++) await new Promise(r=>setTimeout(r,10));
          assert.ok(saveFinished,"已等待真实保存回调结束");
          if(mode === "new-selection") {
            assert.equal((await u.oss.getFile(savedPath)).toString("base64"),bare);
            assert.equal((await db("o_generationRecipe").where({id:captures.at(-1).request_id}).first())?.state,"已完成");
            assert.equal((await post("/cancel",{id:running.id})).status,200);
            assert.equal((await db("o_image").where({id:running.id}).first()).state,"已完成","迟到取消不得覆盖成功状态");
          }
          if(mode === "delete") {
            assert.equal(await db("o_assets").where({id}).first(),undefined);
            assert.equal(await db("o_promptStandard").where({projectId,kind:"asset",targetId:id}).first(),undefined,"删除后不得重建视觉基准");
          }
          if(mode !== "new-selection") {
            const requestId=captures.at(-1).request_id;
            assert.equal(await db("o_generationRecipe").where({id:requestId}).first(),undefined,"取消或删除后不得保留复现记录");
            await assert.rejects(u.oss.getFile(savedPath),{code:"ENOENT"});
            await assert.rejects(fs.access(lib.mediaPath(savedPath)),{code:"ENOENT"});
            await assert.rejects(fs.access(path.join(temp,"data/reproduction",requestId)),{code:"ENOENT"});
          }
        } finally { release(); await pending; }
      });
    }
    for (const mode of ["cancel", "delete"]) {
      await check("derivative:text-pending:"+mode,async()=>{
        await db("o_project").where({id:projectId}).update({imageModel:"audit-image-2:fixture",artStyle:"2D_flat_design"});
        const [id]=await db("o_assets").insert({projectId,type:"role",name:"文本阶段取消测试",prompt:"用户原提示词"});
        let release!:()=>void, textEntered=false;
        const textGate=new Promise<void>(r=>release=r);
        u.Ai.Text=(()=>({invoke:async()=>{textEntered=true;await textGate;return{text:"不应保存的提示词"};}})) as any;
        derivativeFinished=false;
        const before=captures.length;
        try {
          assert.equal((await post("/derivative",{projectId,scriptId,assetIds:[id],concurrentCount:1})).status,200);
          for(let i=0;i<200&&!textEntered;i++) await new Promise(r=>setTimeout(r,10));
          assert.ok(textEntered);
          const image=await db("o_image").where({assetsId:id,state:"生成中"}).first();assert.ok(image);
          assert.equal((await post(mode==="cancel"?"/cancel":"/delete",{id:mode==="cancel"?image.id:id})).status,200);
          release();
          for(let i=0;i<200&&!derivativeFinished;i++)await new Promise(r=>setTimeout(r,10));
          assert.ok(derivativeFinished,"实际后台处理已结束");
          assert.equal(captures.length,before,"文本阶段取消不得再调用图片供应商");
          const asset=await db("o_assets").where({id}).first();
          if(mode==="delete")assert.equal(asset,undefined);
          else {assert.equal(asset.prompt,"用户原提示词");assert.equal((await db("o_image").where({id:image.id}).first()).state,"生成失败");}
        } finally {release();}
      });
    }
    console.log(JSON.stringify({results:checks,inference:"isolated SQLite; gated local provider; no external generation"}));
    assert.ok(checks.every(c=>c.pass));
  } finally {global.fetch=realFetch;u.vm=nativeVm;u.Ai.Image=nativeImage;u.Ai.Text=nativeText;await new Promise<void>(r=>server.close(()=>r()));await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
