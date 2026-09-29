import { installPortraitFixture } from "./portrait-fixture";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { PROMPT_LANGUAGE_RULE, withPromptLanguage } from "../src/utils/promptLanguage";
const Database = require("better-sqlite3");

async function main() {
  const root = process.cwd(), temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-prompt-language-"));
  await fs.chmod(temp, 0o700); await fs.mkdir(path.join(temp, "data"));
  const original = new Database(path.join(root, "data/db2.sqlite"), { readonly: true });
  await original.backup(path.join(temp, "data/db2.sqlite")); original.close();
  await fs.copyFile(path.join(root, "package.json"), path.join(temp, "package.json"));
  process.chdir(temp); process.env.NODE_ENV = "prod";
  const { default: u } = await import("../src/utils");
  const { db } = await import("../src/utils/db");
  const { default: single } = await import("../src/routes/assetsGenerate/polishAssetsPrompt");
  const { default: batch } = await import("../src/routes/assetsGenerate/batchPolishAssetsPrompt");
  const { default: style } = await import("../src/routes/artStyle/extractStylePrompt");
  const { default: derivative } = await import("../src/routes/production/assets/batchGenerateAssetsImage");
  const { default: extraction } = await import("../src/routes/script/extractAssets");
  const projectId = 99349001, scriptId = 99349002, baseId = 99349010;
  const legacyManual = "LEGACY_STYLE_RULE: Use only English prose. Keep <Picture 1>, [Shot 1], integrated_multimodal_description: and N/A.";
  const generated = "成年女性，灰色外套，眼神平静，柔和侧光。产品名 OpenAI；画中文字“我會等你”。";
  const manual = "USER MANUAL: intentionally English; do not rewrite 我會等你 or <Picture 1>.";
  const originals = { Text: u.Ai.Text, Image: u.Ai.Image, Video: u.Ai.Video, getArtPrompt: u.getArtPrompt };
  const calls: any[] = [], imageInputs: any[] = [];
  u.getArtPrompt = (() => legacyManual) as any;
  u.Ai.Text = (() => ({ invoke: async (request: any) => {
    const system = request.system || request.messages.find((message: any) => message.role === "system")?.content;
    assert.ok(system.endsWith(PROMPT_LANGUAGE_RULE));
    assert.match(system, /默认使用简体中文/); assert.match(system, /保留模型协议所需的字段名/);
    assert.match(system, /原始台词.*中文统一转换为简体字/);
    calls.push(request);
    if (request.tools?.resultTool) await request.tools.resultTool.execute({ newAssets: [{ name: "提取测试角色", desc: "成年男子，灰衣，头发整齐。", type: "role", scriptIds: [scriptId] }], existingAssetRefs: [] });
    return { text: generated, _output: generated };
  } })) as any;
  u.Ai.Video = (() => { throw Error("Video generation forbidden in language tests"); }) as any;
  u.Ai.Image = (() => ({ checkReady: async () => {}, run: async (input: any) => {
    imageInputs.push(input);
    throw Error("Fixture deliberately stops before image generation");
  } })) as any;
  await installPortraitFixture(root,temp,u);
  const app = express(); app.use(express.json());
  app.use("/single", single); app.use("/batch", batch); app.use("/style", style); app.use("/derivative", derivative); app.use("/extract", extraction);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  async function post(endpoint: string, body: any) {
    const response = await fetch(base + endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json: any = await response.json(); assert.equal(response.status, 200, JSON.stringify(json)); return json.data;
  }
  async function until(check: () => Promise<boolean>, label: string) {
    for (let i = 0; i < 150; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.fail(label);
  }
  try {
    assert.equal(withPromptLanguage(undefined), PROMPT_LANGUAGE_RULE);
    assert.ok(withPromptLanguage(legacyManual).startsWith(legacyManual + "\n\n"), "Protocol/template syntax must be preserved, not translated by code");
    await db("o_project").insert({ id: projectId, name: "提示词中文默认回归", userId: 1, artStyle: "fixture", imageModel: "test:image", imageQuality: "1K" });
    await db("o_script").insert({ id: scriptId, projectId, name: "测试剧本", content: "提取测试角色站在门口。" });
    await db("o_assets").insert([
      ...["role", "scene", "tool"].map((type, i) => ({ id: baseId + i, projectId, type, name: `测试${type}`, describe: "保留原设定。", prompt: "尚未生成" })),
      { id: baseId + 3, projectId, type: "role", name: "用户手写角色", prompt: manual },
      { id: baseId + 4, projectId, type: "role", name: "衍生造型", describe: "灰衣成年女子，发型不变。", prompt: "待生成新造型" },
    ]);
    for (const [i, type] of ["role", "scene", "tool"].entries()) {
      const result = await post("/single", { projectId, assetsId: baseId + i, type, name: `测试${type}`, describe: "原始描述含品牌 OpenAI 和台词“我會等你”。" });
      if(type === "role") assert.ok(result.prompt.includes(generated)); else assert.equal(result.prompt, generated); assert.ok(calls.at(-1).system.startsWith(legacyManual));
      assert.match(calls.at(-1).messages[0].content, /我會等你/);
    }
    await post("/batch", { projectId, concurrentCount: 2, otherTextPrompt: "增加柔和侧光。", items: ["role", "scene", "tool"].map((type, i) => ({ assetsId: baseId + i, type, name: `测试${type}`, describe: "批量原始描述。" })) });
    await until(async () => (await db("o_assets").whereIn("id", [baseId, baseId + 1, baseId + 2])).every(row => row.promptState === "已完成") && calls.length >= 6, "Batch polish did not finish");
    assert.ok(calls.slice(3, 6).every(call => call.system.includes("增加柔和侧光。")));
    assert.equal(await post("/style", { images: ["data:image/png;base64,iVBORw0KGgo="] }), generated);
    assert.ok(!calls.at(-1).system.includes("括号内必须包含中文和英文"));
    await post("/derivative", { projectId, scriptId, assetIds: [baseId + 4], concurrentCount: 1 });
    await until(async () => imageInputs.length === 1 && (await db("o_image").where({ assetsId: baseId + 4 }).first())?.state === "生成失败", "Derivative text phase did not finish");
    assert.ok(imageInputs[0].prompt.includes(generated)); assert.ok(imageInputs[0].prompt.includes("从左至右严格四栏"));
    await post("/extract", { projectId, scriptIds: [scriptId], groupSize: 1 });
    await until(async () => !!(await db("o_assets").where({ projectId, name: "提取测试角色" }).first()), "Asset extraction did not finish");
    assert.ok(calls.at(-1).tools.resultTool);
    assert.equal((await db("o_assets").where({ id: baseId + 3 }).first()).prompt, manual, "Unrequested user-authored text must remain byte-identical");
    assert.equal(calls.length, 9); assert.equal(imageInputs.length, 1);
    console.log("PASS: simplified Chinese instruction reaches single/batch character-scene-prop polish, style extraction, derivative image text and script extraction; protocol/original dialogue/manual text preserved; zero live AI/media");
  } finally {
    await new Promise(resolve => setTimeout(resolve, 100));
    Object.assign(u.Ai, { Text: originals.Text, Image: originals.Image, Video: originals.Video }); u.getArtPrompt = originals.getArtPrompt;
    await new Promise<void>(resolve => server.close(() => resolve())); await db.destroy(); process.chdir(root); await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
