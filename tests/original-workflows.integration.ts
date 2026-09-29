import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import sharp from "sharp";
const Database = require("better-sqlite3");

async function main() {
  const root = process.cwd(), temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-original-"));
  await fs.chmod(temp, 0o700); await fs.mkdir(path.join(temp, "data/oss"), { recursive: true });
  const original = new Database(path.join(root, "data/db2.sqlite"), { readonly: true });
  await original.backup(path.join(temp, "data/db2.sqlite")); original.close();
  for (const folder of ["vendor", "skills", "modelPrompt", "audio-library"]) await fs.cp(path.join(root, "data", folder), path.join(temp, "data", folder), { recursive: true });
  await fs.copyFile(path.join(root, "package.json"), path.join(temp, "package.json"));
  process.chdir(temp); process.env.NODE_ENV = "prod";
  const { default: u } = await import("../src/utils");
  const { db } = await import("../src/utils/db");
  await (await import("../src/utils/databaseBackup")).ensureBackupSchema();
  // 本套件不调用外部推理，原文事件使用确定性返回值。
  u.Ai.Image = (() => { throw Error("Unexpected image inference"); }) as any;
  u.Ai.Video = (() => { throw Error("Unexpected video inference"); }) as any;
  u.Ai.Text = (() => { throw Error("Unexpected text inference"); }) as any;
  u.cleanNovel = class {
    emitter = new EventEmitter();
    start(rows: any[]) { for (const row of rows) this.emitter.emit("item", { id: row.id, event: "主角抵达山村。" }); }
  } as any;
  const app = express(); app.use(express.json({ limit: "10mb" }));
  app.use((req, _res, next) => { (req as any).user = { id: 1 }; next(); });
  await (await import("../src/router")).default(app);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ message: err.code || err.name || "error" }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const realFetch = global.fetch;
  global.fetch = ((url: any, ...args: any[]) => {
    assert.ok(String(url).startsWith(base + "/"), "external network forbidden");
    return (realFetch as any)(url, ...args);
  }) as any;
  const endpoints = new Set<string>(), results: { name: string; pass: boolean; reason?: string }[] = [];
  async function request(route: string, body?: any, method = "POST") {
    endpoints.add(`${method} ${route}`);
    const r = await fetch(base + "/api/" + route, { method, ...(method === "GET" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }) });
    assert.equal(r.status, 200, `${route}: HTTP ${r.status}`);
    return r;
  }
  async function post(route: string, body?: any) { return (await (await request(route, body)).json()).data; }
  async function check(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push({ name, pass: true }); }
    catch (err: any) { results.push({ name, pass: false, reason: err.message }); }
  }
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#698baf" } }).png().toBuffer();
  const image = "data:image/png;base64," + png.toString("base64");
  try {
    const projectInput = { projectType: "novel", name: "原功能隔离测试", intro: "一名青年抵达山村。", type: "剧情", artStyle: "电影写实", directorManual: "", videoRatio: "16:9" };
    await post("project/addProject", projectInput);
    const project = await db("o_project").where({ name: projectInput.name }).first(); const projectId = project.id;
    await check("new-project-defaults", async () => {
      assert.equal(project.imageModel, "comfyui-h3:qwen-image-2.1-quality");
      assert.equal(project.videoModel, "comfyui-h3:h3-quality"); assert.equal(project.imageQuality, "2K"); assert.equal(project.mode, "text");
    });
    await check("project-edit-list-detail", async () => {
      await post("project/editProject", { ...projectInput, id: projectId, name: "修改后的项目", imageModel: "comfyui-h3:qwen-image-2.1-quality", videoModel: "comfyui-h3:h3-quality", imageQuality: "2K", mode: "text" });
      assert.ok((await post("project/getProject")).some((p: any) => p.id === projectId && p.name === "修改后的项目"));
      await post("general/updateProject", { id: projectId, intro: "更新简介" });
      assert.equal((await post("general/getSingleProject", { id: projectId }))[0].intro, "更新简介");
    });
    await check("novel-import-edit-search-delete", async () => {
      await post("novel/addNovel", { projectId, data: [{ index: 1, reel: "第一卷", chapter: "抵达", chapterData: "主角沿山路走进村落。" }, { index: 2, reel: "第一卷", chapter: "相遇", chapterData: "他遇见一位村民。" }] });
      let chapters = await post("novel/getNovel", { projectId, page: 1, limit: 10 }); assert.equal(chapters.total, 2);
      const first = chapters.data[0];
      await post("novel/updateNovel", { id: first.id, index: 1, reel: "第一卷", chapter: "抵达村口", chapterData: "主角停在村口。", event: "主角抵达村口。" });
      chapters = await post("novel/getNovel", { projectId, page: 1, limit: 10, search: "村口" });
      assert.equal(chapters.total, 1); assert.equal(chapters.data[0].chapterData, "主角停在村口。");
      assert.equal((await post("novel/getNovelData", { projectId })).length, 2);
      await post("novel/delNovel", { id: first.id });
      const rest = await post("novel/getNovelData", { projectId });
      await post("novel/batchDeleteNovel", { ids: rest.map((x: any) => x.id) });
      assert.equal((await post("novel/getNovelData", { projectId })).length, 0);
    });
    let assetId = 0, scriptId = 0, boardId = 0, trackId = 0;
    await check("asset-add-edit-upload-select-read", async () => {
      await post("assets/addAssets", { projectId, type: "role", name: "青年", describe: "灰色外套", prompt: "灰色外套的青年" });
      const asset = await db("o_assets").where({ projectId, name: "青年" }).first(); assetId = asset.id;
      await post("assets/updateAssets", { id: assetId, name: "青年甲", describe: "黑发，灰色外套", prompt: "青年站在村口" });
      await post("assets/saveAssets", { id: assetId, projectId, type: "role", base64: image, prompt: "青年站在村口" });
      const saved = await db("o_assets").where({ id: assetId }).first();
      const img = await db("o_image").where({ id: saved.imageId }).first();
      assert.deepEqual(await u.oss.getFile(img.filePath), png);
      await post("assets/saveAssets", { id: assetId, projectId, type: "role", imageId: saved.imageId, prompt: "青年甲" });
      const list = await post("assets/getAssetsApi", { projectId, type: "role", page: 1, limit: 10 });
      assert.equal(list.total, 1); assert.equal(list.data[0].name, "青年甲"); assert.ok(list.data[0].src);
    });
    await check("script-add-edit-relations-batch-export", async () => {
      await post("script/addScript", { projectId, name: "第一集", content: "青年抵达村口。", assets: [assetId] });
      let scripts = await post("script/getScrptApi", { projectId }); scriptId = scripts[0].id;
      assert.equal(scripts[0].relatedAssets[0].id, assetId);
      await post("script/updateScript", { id: scriptId, name: "第一集：抵达", content: "青年甲抵达村口。", assets: [assetId] });
      await post("script/batchAddScript", { projectId, data: [{ scriptName: "第二集", scriptData: "村民出现。" }] });
      scripts = await post("script/getScrptApi", { projectId }); assert.equal(scripts.length, 2);
      assert.equal(scripts.find((s: any) => s.id === scriptId).content, "青年甲抵达村口。");
      const zip = Buffer.from(await (await request("script/exportScript", { id: [scriptId] })).arrayBuffer()); assert.equal(zip.toString("ascii", 0, 2), "PK");
      await post("script/delScript", { ids: scripts.filter((s: any) => s.id !== scriptId).map((s: any) => s.id) });
      assert.equal((await post("script/getScrptApi", { projectId })).length, 1);
    });
    await check("production-plan-save-reload-storyboard", async () => {
      const flow = await post("production/getFlowData", { projectId, episodesId: scriptId }); assert.equal(flow.assets[0].id, assetId);
      flow.scriptPlan = "村口建立空间后切人物近景。";
      await post("production/saveFlowData", { projectId, episodesId: scriptId, data: flow });
      assert.equal((await post("production/getFlowData", { projectId, episodesId: scriptId })).scriptPlan, flow.scriptPlan);
      const board = await post("production/storyboard/addStoryboard", { projectId, scriptId, prompt: "村口远景", videoDesc: "青年甲走向村口", duration: 5, state: "未生成", shouldGenerateImage: 0, src: null });
      boardId = board.id; trackId = (await db("o_storyboard").where({ id: boardId }).first()).trackId;
      await db("o_assets2Storyboard").insert({ storyboardId: boardId, assetId });
      await post("production/storyboard/editStoryboardInfo", { id: boardId, prompt: "村口固定机位远景", videoDesc: "青年甲进入画面" });
      const boards = await post("production/storyboard/getStoryboardData", { scriptId, page: 1, limit: 10 });
      assert.equal(boards.total, 1); assert.equal(boards.data[0].prompt, "村口固定机位远景");
      assert.deepEqual((await post("production/getFlowData", { projectId, episodesId: scriptId })).storyboard[0].associateAssetsIds, [assetId]);
    });
    await check("image-editor-upload-save-update-link", async () => {
      const url = await post("production/editImage/uploadImage", { projectId, scriptId, base64Data: image });
      const nodes = [{ id: "source", type: "upload", data: { image: url } }];
      const flow = await post("production/editImage/saveImageFlow", { nodes, edges: [] });
      assert.equal((await post("production/editImage/getImageFlow", { id: flow.id })).nodes[0].data.image, url);
      await post("production/editImage/updateImageFlow", { flowId: flow.id, nodes: [...nodes, { id: "note", type: "text", data: { text: "保留原图" } }], edges: [] });
      assert.equal((await post("production/editImage/getImageFlow", { id: flow.id })).nodes.length, 2);
      await post("production/storyboard/updateStoryboardUrl", { id: boardId, url, flowId: flow.id });
      await post("production/assets/updateAssetsUrl", { id: assetId, url, flowId: flow.id });
      assert.equal((await db("o_storyboard").where({ id: boardId }).first()).flowId, flow.id);
      assert.equal((await db("o_assets").where({ id: assetId }).first()).flowId, flow.id);
    });
    await check("workbench-prompt-duration-video-selection", async () => {
      await post("production/workbench/updateVideoPrompt", { id: trackId, prompt: "青年甲缓步走向村口，镜头保持固定。" });
      await post("production/workbench/updateVideoDuration", { id: trackId, duration: 8 });
      const track = await db("o_videoTrack").where({ id: trackId }).first(); assert.equal(track.duration, 8); assert.ok(track.prompt.includes("青年甲"));
      const [videoId] = await db("o_video").insert({ projectId, scriptId, videoTrackId: trackId, state: "已完成" });
      await post("production/workbench/selectVideo", { trackId, videoId });
      assert.equal((await db("o_videoTrack").where({ id: trackId }).first()).videoId, videoId);
      assert.ok((await post("production/workbench/getVideoList", { projectId, scriptId })).some((v: any) => v.id === videoId));
      await post("production/workbench/delVideo", { id: videoId });
      assert.equal((await db("o_videoTrack").where({ id: trackId }).first()).videoId, null);
      const extra = await post("production/workbench/addTrack", { projectId, scriptId, duration: 3 });
      await post("production/workbench/deleteTrack", { id: extra }); assert.equal(await db("o_videoTrack").where({ id: extra }).first(), undefined);
    });
    await check("art-style-and-visual-manual", async () => {
      await post("artStyle/addArtStyle", { name: "测试风格", fileUrl: image, prompt: "柔和自然光" });
      const style = await db("o_artStyle").where({ name: "测试风格" }).first();
      await post("artStyle/editArtStyle", { id: style.id, name: "测试风格更新", fileUrl: image, prompt: "日落自然光" });
      assert.ok((await post("artStyle/getArtStyle")).some((s: any) => s.id === style.id && s.prompt === "日落自然光"));
      await post("project/addVisualManual", { name: "测试视觉手册", stylePath: "audit-style", images: [image], data: [{ label: "README", value: "README", data: "测试视觉手册\n保持自然光。" }] });
      assert.ok((await post("project/getVisualManual")).some((v: any) => v.stylePath === "audit-style"));
      await post("project/deleteVisualManual", { name: "audit-style" });
      assert.ok(!(await post("project/getVisualManual")).some((v: any) => v.stylePath === "audit-style"));
    });
    await check("settings-prompts-memory-agent-mode", async () => {
      const prompts = await post("setting/promptManage/getPrompt"); const promptId = prompts[0].id;
      await post("setting/promptManage/updatePrompt", { id: promptId, data: "测试自定义提示词" });
      assert.equal((await post("setting/promptManage/getPrompt")).find((p: any) => p.id === promptId).data, "测试自定义提示词");
      const memory = { messagesPerSummary: 20, shortTermLimit: 10, summaryMaxLength: 200, summaryLimit: 4, ragLimit: 5, deepRetrieveSummaryLimit: 4, modelOnnxFile: ["all-MiniLM-L6-v2", "onnx", "model_fp16.onnx"], modelDtype: "fp16" };
      await post("setting/memoryConfig/sureMemory", memory);
      assert.deepEqual((await (await request("setting/memoryConfig/getMemory", undefined, "GET")).json()).data, memory);
      await post("setting/agentDeploy/updateUseMode", { agentUseMode: "1" });
      assert.equal((await (await request("setting/agentDeploy/getAgentUseMode", undefined, "GET")).json()).data, "1");
      await db("memories").insert({ id: "audit-memory", isolationKey: `${projectId}:scriptAgent`, role: "user", type: "message", content: "规划第一集", createTime: Date.now(), summarized: 0 });
      assert.equal((await post("agents/getMemory", { projectId, agentType: "scriptAgent" }))[0].content[0].data, "规划第一集");
      await post("agents/clearMemory", { projectId, agentType: "scriptAgent" });
      assert.equal((await post("agents/getMemory", { projectId, agentType: "scriptAgent" })).length, 0);
    });
    await check("project-delete-cleans-extension-records", async () => {
      const recipeId = randomUUID(), clipId = randomUUID();
      const archives = [path.join(temp, "data/reproduction", recipeId), path.join(temp, "data/reproduction/camera-clips", clipId)];
      for (const folder of archives) { await fs.mkdir(folder, { recursive: true }); await fs.writeFile(path.join(folder, "request.json"), "{}"); }
      const shared = path.join(temp, "data/oss/library/audio/keep.wav");
      await fs.mkdir(path.dirname(shared), { recursive: true }); await fs.writeFile(shared, "shared");
      await db("o_cameraPlan").insert({ projectId, storyboardId: boardId, revision: 1, data: "{}", createdAt: 1 });
      await db("o_generationRecipe").insert({ id: recipeId, projectId, kind: "asset", targetId: assetId, data: "{}", createdAt: 1 });
      await db("o_cameraClipDraft").insert({ id: "audit-draft", ownerId: 1, projectId, storyboardId: boardId, data: "{}", createdAt: 1, expiresAt: 2 });
      await db("o_cameraClip").insert({ id: clipId, ownerId: 1, projectId, storyboardId: boardId, prepareToken: "audit-token", status: "completed", data: "{}", createdAt: 1, updatedAt: 1 });
      await db("o_soundLibraryAssets").insert({ projectId, key: "test", parentId: assetId, childId: assetId, imageId: 0 });
      const ownedFlow = (await db("o_storyboard").where({ id: boardId }).first()).flowId;
      const [sharedFlow] = await db("o_imageFlow").insert({ flowData: "{}" });
      const otherProject = 99119993;
      await db("o_project").insert({ id: otherProject, name: "共享编辑流程测试" });
      await db("o_assets").insert([{ projectId, type: "role", name: "本项目引用", flowId: sharedFlow }, { projectId: otherProject, type: "role", name: "其他项目引用", flowId: sharedFlow }]);
      const projectTables = ["o_assets", "o_storyboard", "o_script", "o_videoTrack", "o_promptStandard", "o_generationRecipe", "o_cameraPlan", "o_cameraClipDraft", "o_cameraClip", "o_soundLibraryAssets"];
      const others = new Map<string, any[]>();
      for (const table of projectTables) others.set(table, await db(table).whereNot({ projectId }));
      const [chapter] = await db("o_novel").insert({ projectId, chapter: "关联清理测试" });
      await db("o_event").insert({ id: 99119991, name: "测试事件" });
      await db("o_eventChapter").insert({ id: 99119992, eventId: 99119991, novelId: chapter });
      await post("project/delProject", { id: projectId });
      for (const table of projectTables) {
        assert.equal((await db(table).where({ projectId })).length, 0, `${table}: project rows remain`);
        assert.deepEqual(await db(table).whereNot({ projectId }), others.get(table), `${table}: another project's rows changed`);
      }
      assert.equal(await db("o_imageFlow").where({ id: ownedFlow }).first(), undefined, "project-only editor flow removed");
      assert.ok(await db("o_imageFlow").where({ id: sharedFlow }).first(), "shared editor flow retained");
      assert.equal(await db("o_event").where({ id: 99119991 }).first(), undefined);
      assert.equal(await db("o_eventChapter").where({ id: 99119992 }).first(), undefined);
      for (const folder of archives) await assert.rejects(fs.stat(folder), { code: "ENOENT" });
      assert.equal(await fs.readFile(shared, "utf8"), "shared");
      await assert.rejects(fs.stat(path.join(temp, "data/oss/productions", `DR-${projectId}`)), { code: "ENOENT" });
    });
    const report = { results, endpoints: [...endpoints].sort(), inference: "disabled" };
    await fs.writeFile(path.join(root, "local/full-regression-20260924/original-workflows-results.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    assert.ok(results.every(r => r.pass), "original workflow failures listed above");
  } finally {
    global.fetch = realFetch; await new Promise<void>(r => server.close(() => r())); await db.destroy();
    process.chdir(root); await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
