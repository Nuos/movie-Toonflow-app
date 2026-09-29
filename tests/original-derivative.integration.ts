import { installPortraitFixture } from "./portrait-fixture";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import sharp from "sharp";
const Database = require("better-sqlite3");

async function main() {
  const root = process.cwd(), temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-derivative-"));
  await fs.chmod(temp, 0o700); await fs.mkdir(path.join(temp, "data/vendor"), { recursive: true });
  const original = new Database(path.join(root, "data/db2.sqlite"), { readonly: true });
  await original.backup(path.join(temp, "data/db2.sqlite")); original.close();
  await fs.copyFile(path.join(root, "package.json"), path.join(temp, "package.json"));
  process.chdir(temp); process.env.NODE_ENV = "prod";
  const { default: u } = await import("../src/utils"); const { db } = await import("../src/utils/db");
  const lib = await import("../src/utils/promptLibrary"); await lib.ensurePromptLibrary();
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#a1b2c3" } }).png().toBuffer();
  const bare = png.toString("base64"), dataUrl = "data:image/png;base64," + bare;
  const captures: any[] = [], nativeVm = u.vm;
  u.vm = ((...args: Parameters<typeof u.vm>) => {
    const result = nativeVm(...args);
    if (result.imageRequest) { const fn = result.imageRequest; result.imageRequest = (input: any, model: any) => { captures.push(JSON.parse(JSON.stringify(input))); return fn(input, model); }; }
    return result;
  }) as typeof u.vm;
  for (const version of ["1.0", "2.0"]) {
    const id = "audit-image-" + version[0];
    await db("o_vendorConfig").insert({ id, enable: 1, inputValues: "{}", models: "[]" });
    await fs.writeFile(path.join(temp, "data/vendor", id + ".ts"), `exports.vendor = { version: '${version}', inputValues: {}, models: [{modelName:'fixture',type:'image',name:'隔离适配器'}] }; exports.imageRequest = async (input) => '${bare}';`);
  }
  const projectId = 99119700;
  await db("o_project").insert({ id: projectId, name: "原供应商兼容性", imageModel: "comfyui-h3:qwen-image-2.1-quality", imageQuality: "2K" });
  await installPortraitFixture(root,temp,u);
  const app = express(); app.use(express.json());
  app.use("/single", (await import("../src/routes/assetsGenerate/generateAssets")).default);
  app.use("/batch", (await import("../src/routes/assetsGenerate/batchGenerateImageAssets")).default);
  app.use("/videoPrompt", (await import("../src/routes/production/workbench/generateVideoPrompt")).default);
  app.use("/derivative", (await import("../src/routes/production/assets/batchGenerateAssetsImage")).default);
  app.use((err: any, _req: any, res: any, _next: any) => { if (!res.headersSent) res.status(500).json({ message: err.name }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const realFetch = global.fetch;
  global.fetch = ((url: any, ...args: any[]) => { assert.ok(String(url).startsWith(base + "/"), "external network forbidden"); return (realFetch as any)(url, ...args); }) as any;
  const checks: any[] = [];
  async function check(name: string, fn: () => Promise<void>) { try { await fn(); checks.push({ name, pass: true }); } catch (e: any) { checks.push({ name, pass: false, reason: e.message }); } }
  try {
    await db("o_project").where({id:projectId}).update({imageModel:"audit-image-2:fixture",artStyle:"2D_flat_design"});
    const scriptId=99119401;await db("o_script").insert({id:scriptId,projectId,name:"衍生资产测试"});
    const [parent]=await db("o_assets").insert({projectId,type:"role",name:"原角色",describe:"灰衣青年"});
    const parentFile=`/${projectId}/role/parent.png`;await u.oss.writeFile(parentFile,png);const [parentImage]=await db("o_image").insert({assetsId:parent,filePath:parentFile,state:"已完成"});await db("o_assets").where({id:parent}).update({imageId:parentImage});
    const endpoints=["POST production/assets/batchGenerateAssetsImage"];
    for(const mode of ["success","text-error","missing-parent"]){
      await check(mode,async()=>{
        const [child]=await db("o_assets").insert({projectId,type:"role",name:"衍生造型",assetsId:parent,describe:"蓝衣青年"});
        const oldFile=`/${projectId}/role/old-${child}.png`;await u.oss.writeFile(oldFile,png);const [previous]=await db("o_image").insert({assetsId:child,filePath:oldFile,state:"已完成"});await db("o_assets").where({id:child}).update({imageId:previous});
        let textInput:any;u.Ai.Text=(()=>({invoke:async(input:any)=>{textInput=input;if(mode==="text-error")throw Error("模拟文本服务失败");return{text:"蓝色外套青年，身份保持一致。"};}})) as any;
        await db("o_image").where({id:parentImage}).update({filePath:mode==="missing-parent"?`/${projectId}/missing.png`:parentFile});
        const response=await fetch(base+"/derivative",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,scriptId,assetIds:[child],concurrentCount:1})});assert.equal(response.status,200);
        let image:any;for(let i=0;i<100;i++){image=await db("o_image").where({assetsId:child}).whereNot({id:previous}).first();if(image&&image.state!=="生成中")break;await new Promise(r=>setTimeout(r,10));}
        assert.equal(image.state,mode==="success"?"已完成":"生成失败");
        if(mode==="success"){
          assert.equal((await db("o_assets").where({id:child}).first()).imageId,image.id);assert.equal((await u.oss.getFile(image.filePath)).toString("base64"),bare);
          assert.ok(textInput.messages[0].content.includes("灰衣青年"));assert.equal(captures.at(-1).referenceList[0].base64,await u.oss.getImageBase64(parentFile));assert.ok(captures.at(-1).prompt.includes("蓝色外套青年，身份保持一致。"));assert.ok(captures.at(-1).prompt.includes("从左至右严格四栏"));assert.ok(await db("o_generationRecipe").where({projectId,filePath:image.filePath,state:"已完成"}).first());
        }else{assert.equal((await db("o_assets").where({id:child}).first()).imageId,previous);assert.ok(image.errorReason);assert.equal((await u.oss.getFile(oldFile)).toString("base64"),bare);}
      });
    }
    await check("failed-item-does-not-block-next-item",async()=>{
      await db("o_image").where({id:parentImage}).update({filePath:parentFile});
      const ids:number[]=[];for(const describe of ["故意失败项","可成功项"]){const [id]=await db("o_assets").insert({projectId,type:"role",name:describe,describe,assetsId:parent});ids.push(id);}
      u.Ai.Text=(()=>({invoke:async(input:any)=>{if(input.messages[0].content.includes("故意失败项"))throw Error("模拟文本失败");return{text:"成功项的图片提示词"};}})) as any;
      const r=await fetch(base+"/derivative",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,scriptId,assetIds:ids,concurrentCount:1})});assert.equal(r.status,200);
      let rows:any[]=[];for(let i=0;i<100;i++){rows=await db("o_image").whereIn("assetsId",ids);if(rows.length===2&&rows.every(r=>r.state!=="生成中"))break;await new Promise(r=>setTimeout(r,10));}
      assert.equal(rows.find(r=>r.assetsId===ids[0]).state,"生成失败");assert.equal(rows.find(r=>r.assetsId===ids[1]).state,"已完成");
    });
    const report={results:checks,endpoints,inference:"local deterministic provider; no external generation"};await fs.writeFile(path.join(root,"local/full-regression-20260924/original-derivative-results.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.ok(checks.every(c=>c.pass));
  } finally {global.fetch=realFetch;u.vm=nativeVm;await new Promise<void>(r=>server.close(()=>r()));await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
