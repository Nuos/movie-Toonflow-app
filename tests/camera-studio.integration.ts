import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
const Database = require("better-sqlite3");

async function main() {
  const root = process.cwd(), temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-camera-"));
  await fs.chmod(temp, 0o700); await fs.mkdir(path.join(temp, "data"));
  const original = new Database(path.join(root, "data/db2.sqlite"), { readonly: true });
  await original.backup(path.join(temp, "data/db2.sqlite")); original.close();
  await fs.copyFile(path.join(root, "package.json"), path.join(temp, "package.json"));
  process.chdir(temp); process.env.NODE_ENV = "prod";
  await import("../src/utils");
  const { db } = await import("../src/utils/db");
  const lib = await import("../src/utils/promptLibrary");
  const { default: router } = await import("../src/extensions/cameraStudio");
  await lib.ensurePromptLibrary();
  const projectId = 99129001, trackId = 99129002, boardId = 99129003, siblingId = 99129004;
  await db("o_project").insert({ id: projectId, name: "运镜隔离验证", imageModel: "comfyui-h3:qwen-image-2.1-quality", videoModel: "comfyui-h3:h3-quality", mode: "text", videoRatio: "16:9" });
  await db("o_videoTrack").insert({ id: trackId, projectId, duration: 10 });
  await db("o_storyboard").insert([
    { id: boardId, projectId, trackId, index: 0, duration: "5", videoDesc: "灰衣女子站在窗边。台词：我会等你。", prompt: "灰衣成年女子站在窗边，右手持信。" },
    { id: siblingId, projectId, trackId, index: 1, duration: "5", videoDesc: "黑衣男子放下雨伞。台词：我回来了。", prompt: "黑衣成年男子站在门口，雨伞在左手。" },
  ]);
  const baselinePath = `/${projectId}/camera-baseline.png`;
  await fs.mkdir(path.dirname(lib.mediaPath(baselinePath)), { recursive: true });
  await fs.writeFile(lib.mediaPath(baselinePath), Buffer.from("89504e470d0a1a0a", "hex"));
  await db("o_storyboard").where({ id: boardId }).update({ filePath: baselinePath });
  const [changingAsset] = await db("o_assets").insert({ projectId, name: "镜头道具", type: "tool", describe: "旧阶段带花纹信封" });
  await db("o_assets2Storyboard").insert({ assetId: changingAsset, storyboardId: boardId });
  const imageStandard = await lib.buildStandard(projectId, "storyboard", boardId);
  await lib.buildStandard(projectId, "track", trackId);
  await db("o_assets").where({ id: changingAsset }).update({ describe: "当前阶段无花纹信封" });
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { (req as any).user = { id: 1 }; next(); }); app.use("/api/cameraStudio", router);
  for (const file of ["camera-studio.html", "camera-studio.js", "camera-studio.css", "camera-skill-library.js", "camera-source-index.json"]) app.get(`/${file}`, (_req, res) => res.sendFile(path.join(root, "data/web", file)));
  app.get("/", (_req, res) => res.redirect(`/camera-studio.html?projectId=${projectId}`));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  async function request(endpoint: string, body?: any, status = 200) {
    const response = await fetch(base + "/api/cameraStudio/" + endpoint, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const json: any = await response.json(); assert.equal(response.status, status, JSON.stringify(json)); return json.data;
  }
  try {
    const target = { projectId, storyboardId: boardId };
    const catalog = await request("catalog"); assert.ok(catalog.moves.length >= 15); assert.ok(catalog.templates.length >= 5);
    assert.equal((await request("list", { projectId })).boards.length, 2);
    const first = await request("get", target); assert.equal(first.bundle, null); assert.equal(first.options.duration, 5);
    await request("get", { ...target, projectId: projectId + 1 }, 400);
    await request("build", { ...target, motionIds: ["unknown"] }, 400);
    const options = { ...first.options, openingFrame: first.options.openingFrame + " @图1保持无花纹信封的外形。", endingFrame: "女子面部近景，窗框仍在画面右侧。", subjectAction: "站位保持，抬眼望向门口。", purpose: "读清等待中的反应。", focus: "人物眼睛保持清晰。", continuity: "灰衣、右手持信、右侧窗框。", axisSide: "A侧" };
    const preview = await request("preview", { options, motionIds: ["static", "push_in"] });
    assert.equal(preview.revision, 0); assert.equal(preview.variants.length, 2);
    assert.equal((await request("get", target)).bundle, null);
    const fallback = await request("build", { projectId, storyboardId: siblingId });
    assert.deepEqual(fallback.variants.map((v: any) => v.id), ["static", "push_in", "truck_right"]);
    const plan = await request("build", { ...target, options, motionIds: ["static", "push_in", "truck_right"], revision: 0 });
    assert.equal(plan.variants.length, 3); assert.equal(plan.revision, 1);
    assert.equal((await db("o_storyboard").where({ id: boardId }).first()).prompt, first.board.prompt);
    await request("build", { ...target, options, revision: 0 }, 400);
    const applied = await request("apply", { ...target, revision: 1, variantId: "push_in", targets: ["storyboard", "image", "video"] });
    assert.equal(applied.bundle.revision, 2); assert.equal(applied.generatesMedia, false);
    assert.match(applied.videoPrompt, /当前阶段无花纹信封/);
    assert.match(applied.videoPrompt, /「镜头道具」保持无花纹信封的外形/);
    assert.doesNotMatch(applied.videoPrompt, /@图1/);
    assert.doesNotMatch(applied.videoPrompt, /旧阶段带花纹信封/);
    assert.ok(applied.videoPrompt.includes("我会等你。")); assert.ok(applied.videoPrompt.includes("我回来了。"));
    assert.ok(applied.videoPrompt.indexOf("我会等你。") < applied.videoPrompt.indexOf("我回来了。"));
    assert.match(applied.videoPrompt, /保持焦距，保留前后景视差/);
    const savedBoard = await db("o_storyboard").where({ id: boardId }).first();
    assert.equal(savedBoard.prompt, plan.variants[1].imagePrompt); assert.equal(savedBoard.videoDesc, plan.variants[1].storyboardPrompt);
    assert.equal((await request("get", target)).sourceChanged, false);
    const imageAfter = await lib.latestStandard(projectId, "storyboard", boardId);
    assert.equal(imageAfter.revision, imageStandard.revision + 1); assert.equal(imageAfter.cameraPlan.referenceRole, "identity");
    assert.ok(imageAfter.anchor.composition.includes(options.openingFrame)); assert.ok(!imageAfter.anchor.allowedChanges.includes("不改变构图"));
    const regenerated = await lib.standardizeVideo(projectId, trackId, "[Shot 1] 错误的旧运镜。\n\n[Shot 2] 黑衣男子放下雨伞。台词：我回来了。", "comfyui-h3:h3-quality", "text", []);
    assert.match(regenerated, /保持焦距，保留前后景视差/); assert.ok(regenerated.includes("我回来了。")); assert.ok(!regenerated.includes("错误的旧运镜"));
    const detailed = await lib.standardizeVideo(projectId, trackId, "[Shot 1] 灰衣女子在窗边。\n\n[Shot 2] 黑衣男子放下雨伞，水滴沿着伞柄落在铜盆。台词：我回来了。", "comfyui-h3:h3-quality", "text", []);
    assert.ok(detailed.includes("水滴沿着伞柄落在铜盆"));
    for (const ambiguous of ["全新的自由文本细节，不能被原分镜覆盖。", "[Shot 2] 后镜。\n\n[Shot 1] 前镜。", "[Shot 1] 前镜。\n\n[Shot 1] 后镜。", "额外序言。\n[Shot 1] 前镜。\n[Shot 2] 后镜。"]) {
      await assert.rejects(() => lib.standardizeVideo(projectId, trackId, ambiguous, "comfyui-h3:h3-quality", "text", []), /无法可靠对应/);
    }
    const imageAgain = await lib.buildStandard(projectId, "storyboard", boardId);
    assert.equal(imageAgain.cameraPlan?.referenceRole, "identity"); assert.ok(!imageAgain.variants[0].prompt.includes("严格复用基准构图"));
    const imageRequest = await lib.prepareImageRequest("comfyui-h3:qwen-image-2.1-quality", { prompt: savedBoard.prompt, referenceList: [] }, { projectId, taskClass: "生成分镜图片", relatedObjects: JSON.stringify({ storyboardId: boardId }) });
    assert.equal(imageRequest.input.referenceList.length, 1); assert.match(imageRequest.input.prompt, /仅作为人物身份、服装、材质与风格参考/);
    assert.ok(!imageRequest.input.prompt.includes("保持其框架")); assert.ok(!imageRequest.input.prompt.includes("严格复用基准构图"));
    await lib.applyVariant(projectId, "storyboard", boardId, "detail");
    assert.equal((await request("get", target)).sourceChanged, false);
    await request("apply", { ...target, revision: 1, variantId: "static", targets: ["image"] }, 400);
    const audit = await request("audit", { ...target, variantId: "push_in" }); assert.equal(audit.renderedStatus, "unverified");
    await db("o_storyboard").where({ id: boardId }).update({ videoDesc: "用户新写的对白：不要覆盖我。" });
    assert.equal((await request("get", target)).sourceChanged, true);
    await request("apply", { ...target, revision: 2, variantId: "static", targets: ["storyboard"] }, 400);
    await request("build", { ...target }, 400);
    const reset = await request("build", { ...target, reset: true }); assert.equal(reset.options.narrative, "用户新写的对白：不要覆盖我。");
    const edited = await lib.standardizeVideo(projectId, trackId, "[Shot 1] 用户新写的对白：不要覆盖我。\n\n[Shot 2] 我回来了。", "comfyui-h3:h3-quality", "text", []);
    assert.ok(edited.includes("不要覆盖我")); assert.ok(!edited.includes("我会等你"));
    assert.equal((await lib.latestStandard(projectId, "track", trackId)).cameraPlan, undefined);
    await db("o_videoTrack").where({ id: trackId }).update({ prompt: "独立创作的整轨自由文本，无法按分镜可靠拆分。" });
    const free = await request("build", { ...target, options: { ...options, narrative: "用户新写的对白：不要覆盖我。" } });
    const before = await db("o_storyboard").where({ id: boardId }).first();
    await request("apply", { ...target, revision: free.revision, variantId: "static", targets: ["storyboard", "image", "video"] }, 400);
    assert.deepEqual(await db("o_storyboard").where({ id: boardId }).first(), before);
    assert.equal((await db("o_videoTrack").where({ id: trackId }).first()).prompt, "独立创作的整轨自由文本，无法按分镜可靠拆分。");
    const soloTrack = 99129005, soloBoard = 99129006;
    await db("o_videoTrack").insert({ id: soloTrack, projectId, duration: 5 });
    await db("o_storyboard").insert({ id: soloBoard, projectId, trackId: soloTrack, index: 2, duration: "5", videoDesc: "角色说道：原始台词。", prompt: "成年角色在门边站立。" });
    await lib.buildStandard(projectId, "track", soloTrack, { model: "old:h3-quality", mode: "singleImage" });
    await lib.buildStandard(projectId, "storyboard", soloBoard);
    await db("o_project").where({ id: projectId }).update({ videoModel: "current:plain", mode: "text" });
    const soloTarget = { projectId, storyboardId: soloBoard };
    let solo = await request("build", { ...soloTarget, options: { ...options, narrative: "角色说道：原始台词。", openingFrame: "成年角色在门边站立。", mode: "singleImage" }, motionIds: ["push_in"] });
    let soloApplied = await request("apply", { ...soloTarget, revision: solo.revision, variantId: "push_in", targets: ["video", "image"] });
    assert.equal(soloApplied.generationMode, "text"); assert.ok(!soloApplied.videoPrompt.includes("integrated_multimodal_description:")); assert.ok(!soloApplied.videoPrompt.includes("【参考方式】"));
    const currentStandard = await lib.latestStandard(projectId, "track", soloTrack);
    assert.equal(currentStandard.mode, "text"); assert.equal(currentStandard.model, "current:plain");
    assert.equal(currentStandard.contextHash, (await lib.targetContext(projectId, "track", soloTrack)).contextHash);
    assert.equal(soloApplied.bundle.applied.video.revision, solo.revision);
    const singleMode = await lib.standardizeVideo(projectId, soloTrack, "角色说道：原始台词。", "current:plain", "singleImage", []);
    assert.match(singleMode, /选定的图片作为首帧/);
    const textMode = await lib.standardizeVideo(projectId, soloTrack, "角色说道：原始台词。", "current:plain", "text", []);
    assert.ok(!textMode.includes("【参考方式】"));
    solo = await request("build", { ...soloTarget, motionIds: ["static"] }); assert.equal(solo.selected, null);
    await db("o_videoTrack").where({ id: soloTrack }).update({ prompt: "用户手改整轨：保留这句新的台词和新的动作。" });
    await request("build", { ...soloTarget, reset: true });
    const manual = await lib.standardizeVideo(projectId, soloTrack, "用户手改整轨：保留这句新的台词和新的动作。", "current:plain", "text", []);
    assert.ok(manual.includes("保留这句新的台词和新的动作")); assert.ok(!manual.includes("角色说道：原始台词。"));
    await db("o_storyboard").where({ id: soloBoard }).update({ prompt: "用户重写的全景：成年角色在屋顶站立。" });
    const afterImageEdit = await lib.prepareImageRequest("comfyui-h3:qwen-image-2.1-quality", { prompt: "用户重写的全景：成年角色在屋顶站立。" }, { projectId, taskClass: "生成分镜图片", relatedObjects: JSON.stringify({ storyboardId: soloBoard }) });
    assert.equal(afterImageEdit.bundle?.cameraPlan, undefined); assert.ok(!afterImageEdit.input.prompt.includes("成年角色在门边站立"));
    const refTrack = 99129007, refBoard = 99129008;
    await db("o_videoTrack").insert({ id: refTrack, projectId, duration: 5 });
    await db("o_storyboard").insert({ id: refBoard, projectId, trackId: refTrack, index: 3, duration: "5", videoDesc: "角色在门边站立。", prompt: "成年角色在门边站立。", filePath: baselinePath });
    await lib.buildStandard(projectId, "track", refTrack);
    const nextReference = `/${projectId}/camera-new-reference.png`;
    await fs.copyFile(lib.mediaPath(baselinePath), lib.mediaPath(nextReference));
    await db("o_storyboard").where({ id: refBoard }).update({ filePath: nextReference });
    const refTarget = { projectId, storyboardId: refBoard };
    const refPlan = await request("build", { ...refTarget, options: { ...options, narrative: "角色在门边站立。", openingFrame: "成年角色在门边站立。" }, motionIds: ["static"] });
    const originalTrack = await db("o_videoTrack").where({ id: refTrack }).first();
    await request("apply", { ...refTarget, revision: refPlan.revision, variantId: "static", targets: ["video"] }, 400);
    assert.deepEqual(await db("o_videoTrack").where({ id: refTrack }).first(), originalTrack);
    console.log("PASS: camera HTTP catalog, validation, revisions, project scope, atomic application, multishot dialogue preservation, regeneration compatibility, manual-edit protection; zero inference");
    if (process.argv.includes("--serve")) {
      await db("o_storyboard").where({ id: boardId }).update({ prompt: first.board.prompt, videoDesc: first.board.videoDesc, duration: first.board.duration });
      await db("o_videoTrack").where({ id: trackId }).update({ prompt: "", duration: 10 });
      await db("o_cameraPlan").where({ projectId }).delete();
      await db("o_promptStandard").where({ projectId }).delete();
      console.log(`UI_TEST_URL=${base}`);
      await new Promise<void>(resolve => process.once("SIGTERM", resolve));
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.destroy(); process.chdir(root); await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
