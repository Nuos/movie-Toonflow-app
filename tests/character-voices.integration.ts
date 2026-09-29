import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const Database = require("better-sqlite3");
import express from "express";

async function main() {
  const root = process.cwd();
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-voice-integration-"));
  await fs.chmod(temp, 0o700); await fs.mkdir(path.join(temp, "data"));
  const original = new Database(path.join(root, "data/db2.sqlite"), { readonly: true });
  await original.backup(path.join(temp, "data/db2.sqlite")); original.close();
  await fs.copyFile(path.join(root, "package.json"), path.join(temp, "package.json"));
  process.chdir(temp); process.env.NODE_ENV = "prod";
  const { default: u } = await import("../src/utils");
  const { db } = await import("../src/utils/db");
  const { ensureCharacterVoiceColumn } = await import("../src/utils/characterVoices");
  await ensureCharacterVoiceColumn(db);
  const { ensureSoundLibrarySchema } = await import("../src/utils/soundLibrary");
  await ensureSoundLibrarySchema(db);
  await fs.cp(path.join(root, "data/audio-library"), path.join(temp, "data/audio-library"), { recursive: true });
  await fs.mkdir(path.join(temp, "data/oss"), { recursive: true });
  await fs.symlink(path.join(root, "data/oss/library"), path.join(temp, "data/oss/library"));
  const { default: voices } = await import("../src/extensions/characterVoices");
  const { default: singleVideo } = await import("../src/routes/production/workbench/generateVideo");
  const { default: batchVideo } = await import("../src/routes/production/workbench/batchGenerateVideo");
  const { default: singlePrompt } = await import("../src/routes/production/workbench/generateVideoPrompt");
  const { default: batchPrompt } = await import("../src/routes/production/workbench/batchGeneratePrompt");
  const { buildStandard } = await import("../src/utils/promptLibrary");
  const projectId = 99119001, assetId = 99119002, trackId = 99119003, boardId = 99119004, sceneId = 99119005;
  await db("o_project").insert({ id: projectId, name: "声线隔离验证", videoModel: "test:model", mode: "text", videoRatio: "16:9" });
  await db("o_assets").insert([{ id: assetId, projectId, name: "测试角色", type: "role", describe: "成年角色" }, { id: sceneId, projectId, name: "测试场景", type: "scene" }]);
  await db("o_videoTrack").insert({ id: trackId, projectId, duration: 5 });
  await db("o_storyboard").insert({ id: boardId, trackId, projectId, index: 0, videoDesc: "测试角色说：今天回家。", shouldGenerateImage: 0 });
  await db("o_assets2Storyboard").insert({ assetId, storyboardId: boardId });
  const requests: any[] = [], textRequests: any[] = [];
  u.Ai.Video = (() => ({ run: async (input: any) => { requests.push(input); }, save: async () => {} })) as any;
  u.Ai.Text = (() => ({ invoke: async (input: any) => { textRequests.push(input); return { text: "测试角色说：今天回家。风吹过院子。" }; } })) as any;
  const app = express(); app.use(express.json());
  app.use("/api/characterVoices", voices); app.use("/singleVideo", singleVideo); app.use("/batchVideo", batchVideo); app.use("/singlePrompt", singlePrompt); app.use("/batchPrompt", batchPrompt);
  app.get("/character-voices.js", (_req, res) => res.sendFile(path.join(root, "data/web/character-voices.js")));
  app.get("/", (_req, res) => res.type("html").send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>默认声线隔离验证</title><body style="background:#20232b;color:#eee;font:16px system-ui;padding:32px;max-width:440px"><h1>默认声线隔离验证</h1><p>测试角色（独立数据库）</p><toonflow-character-voice asset-id="${assetId}" project-id="${projectId}"></toonflow-character-voice><script src="/character-voices.js"></script></body></html>`));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  async function post(endpoint: string, body: any, status = 200) {
    const response = await fetch(base + endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, status); return (await response.json()).data;
  }
  async function until(check: () => boolean | Promise<boolean>) {
    for (let i = 0; i < 100; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 20)); }
    throw new Error("后台测试未完成");
  }
  try {
    const target = { projectId, assetId };
    assert.equal((await post("/api/characterVoices/get", target)).defaultVoice, null);
    await post("/api/characterVoices/save", { ...target, defaultVoice: "male-deep" });
    assert.equal((await post("/api/characterVoices/get", target)).voice.name, "低沉男声");
    await post("/api/characterVoices/save", { ...target, defaultVoice: "bad" }, 400);
    await post("/api/characterVoices/save", { ...target, defaultVoice: 12 }, 400);
    await post("/api/characterVoices/save", { ...target, projectId: projectId + 1, defaultVoice: null }, 400);
    await post("/api/characterVoices/save", { ...target, assetId: sceneId, defaultVoice: null }, 400);
    const request = { projectId, scriptId: 0, trackId, prompt: "测试角色说：今天回家。", uploadData: [], model: "test:model", mode: "text", resolution: "test", duration: 5, audio: true };
    await post("/singleVideo", request); await until(() => requests.length === 1);
    assert.match(requests[0].prompt, /测试角色：低沉男声/);
    await post("/batchVideo", { ...request, trackData: [{ trackId, prompt: request.prompt, uploadData: [], duration: 5 }] }); await until(() => requests.length === 2);
    assert.match(requests[1].prompt, /低沉男声/);
    await post("/singleVideo", { ...request, audio: false }); await until(() => requests.length === 3);
    assert.equal(requests[2].prompt, request.prompt);
    const promptRequest = { projectId, trackId, info: [], model: "test:model", mode: "text" };
    assert.match(await post("/singlePrompt", promptRequest), /低沉男声/);
    assert.match(textRequests[0].messages[1].content, /低沉男声/);
    await post("/batchPrompt", { ...promptRequest, trackData: [{ trackId, info: [] }] });
    await until(async () => textRequests.length === 2 && (await db("o_videoTrack").where({ id: trackId }).first()).state === "已完成");
    assert.match(textRequests[1].messages[1].content, /低沉男声/);
    const bundle = await buildStandard(projectId, "track", trackId);
    assert.ok(bundle.variants.every(v => v.prompt.includes("低沉男声")));
    await post("/api/characterVoices/save", { ...target, defaultVoice: null });
    assert.equal((await post("/api/characterVoices/get", target)).defaultVoice, null);
    console.log("PASS: real HTTP routes, validation, persistence, single/batch prompts and video request capture, muted generation, three prompt variants; all AI calls stubbed");
    if (process.argv.includes("--serve")) {
      console.log(`UI_TEST_URL=${base}`);
      await new Promise<void>(resolve => process.once("SIGTERM", resolve));
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.destroy(); process.chdir(root); await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
