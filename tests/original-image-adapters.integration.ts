import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import sharp from "sharp";
const Database = require("better-sqlite3");

async function main() {
  const root = process.cwd(), temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-adapters-"));
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
  const app = express(); app.use(express.json());
  app.use("/single", (await import("../src/routes/assetsGenerate/generateAssets")).default);
  app.use("/batch", (await import("../src/routes/assetsGenerate/batchGenerateImageAssets")).default);
  app.use("/videoPrompt", (await import("../src/routes/production/workbench/generateVideoPrompt")).default);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ message: err.name }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const realFetch = global.fetch;
  global.fetch = ((url: any, ...args: any[]) => { assert.ok(String(url).startsWith(base + "/"), "external network forbidden"); return (realFetch as any)(url, ...args); }) as any;
  const checks: any[] = [];
  async function check(name: string, fn: () => Promise<void>) { try { await fn(); checks.push({ name, pass: true }); } catch (e: any) { checks.push({ name, pass: false, reason: e.message }); } }
  try {
    for (const version of [1, 2]) for (const reference of [bare, dataUrl]) {
      await check(`v${version}-${reference === bare ? "raw-base64" : "data-url"}`, async () => {
        const last = captures.length;
        const image = await u.Ai.Image(`audit-image-${version}:fixture`).run({ prompt: "青年在村口", size: "2K", aspectRatio: "16:9", referenceList: [{ type: "image", base64: reference }] });
        await image.save(`/${projectId}/role/v${version}-${reference === bare ? "raw" : "url"}.png`);
        assert.equal(captures.length, last + 1); assert.equal(captures[last].prompt, "青年在村口");
        assert.equal(captures[last].referenceList[0].base64, reference, "original provider payload preserved");
        if (version === 1) assert.equal(captures[last].imageBase64[0], reference, "v1 compatibility field preserved");
        const recipe = await db("o_generationRecipe").orderBy("createdAt", "desc").first();
        assert.equal(recipe.state, "已完成"); assert.equal(JSON.parse(recipe.data).references[0].sha256, (await import("../src/utils/promptStandards")).digest(png));
      });
    }
    for (const route of ["single", "batch"]) await check(`${route}-legacy-regenerate-missing-previous-file`, async () => {
      const [assetId] = await db("o_assets").insert({ projectId, name: "青年", type: "role", prompt: "青年在村口" });
      const [oldImage] = await db("o_image").insert({ assetsId: assetId, filePath: `/${projectId}/role/missing.png`, state: "已完成" });
      await db("o_assets").where({ id: assetId }).update({ imageId: oldImage });
      const item = { id: assetId, type: "role", name: "青年", prompt: "青年在村口" };
      const body = { projectId, model: "audit-image-2:fixture", resolution: "2K", ...(route === "single" ? item : { items: [item] }) };
      const response = await fetch(base + "/" + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      assert.equal(response.status, 200, `${route}: missing unselected historical image blocks original generation`);
      for (let attempt = 0; attempt < 100; attempt++) {
        const row = await db("o_image").where({ assetsId: assetId }).whereNot({ id: oldImage }).first();
        if (row?.state === "已完成") { assert.ok(row.filePath); break; }
        if (attempt === 99 || row?.state === "生成失败") assert.fail("mock provider request did not finish");
        await new Promise(r => setTimeout(r, 20));
      }
      assert.equal((await db("o_promptStandard").where({ projectId, kind: "asset", targetId: assetId })).length, 0, "legacy model does not require H3 baseline");
    });
    await check("h3-missing-baseline-remains-explicit-error", async () => {
      const [assetId] = await db("o_assets").insert({ projectId, name: "基准丢失", type: "role", prompt: "青年在村口" });
      const [imageId] = await db("o_image").insert({ assetsId: assetId, filePath: `/${projectId}/role/missing-h3.png`, state: "已完成" });
      await db("o_assets").where({ id: assetId }).update({ imageId });
      await assert.rejects(() => lib.ensureAssetBaselines(projectId, [assetId]), /基准图片不可读取/);
      assert.equal((await db("o_assets").where({ id: assetId }).first()).imageId, imageId);
    });
    await check("legacy-text-video-prompt-does-not-require-unused-image", async () => {
      const trackId = 99119799;
      await db("o_videoTrack").insert({ id: trackId, projectId, duration: 5, prompt: "旧提示词" });
      await db("o_storyboard").insert({ projectId, trackId, videoDesc: "青年在村口抬头。", filePath: `/${projectId}/missing-frame.png`, duration: 5 });
      const originalText = u.Ai.Text;
      const answer = "[Shot 1] 青年在村口抬头，镜头保持固定。";
      u.Ai.Text = (() => ({ invoke: async () => ({ text: answer }) })) as any;
      try {
        const r = await fetch(base + "/videoPrompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, trackId, model: "audit-video:fixture", mode: "text", info: [] }) });
        assert.equal(r.status, 200, "text-only prompt generation must not read an unselected old image");
        assert.ok((await db("o_videoTrack").where({ id: trackId }).first()).prompt.includes("青年在村口抬头"));
      } finally { u.Ai.Text = originalText; }
    });
    await fs.writeFile(path.join(root, "local/full-regression-20260924/original-image-adapters-results.json"), JSON.stringify({ checks, inference: "local deterministic provider; no external generation" }, null, 2));
    console.log(JSON.stringify({ checks, providerCalls: captures.length }));
    assert.ok(checks.every(c => c.pass), "provider compatibility failures listed above");
  } finally {
    global.fetch = realFetch; u.vm = nativeVm;
    await new Promise<void>(r => server.close(() => r())); await db.destroy(); process.chdir(root); await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
