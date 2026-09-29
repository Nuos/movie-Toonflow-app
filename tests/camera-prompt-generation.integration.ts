import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
const Database = require("better-sqlite3");

async function main() {
  const root = process.cwd(), temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-camera-prompt-"));
  await fs.chmod(temp, 0o700);
  await fs.mkdir(path.join(temp, "data"));
  const original = new Database(path.join(root, "data/db2.sqlite"), { readonly: true });
  await original.backup(path.join(temp, "data/db2.sqlite")); original.close();
  await fs.copyFile(path.join(root, "package.json"), path.join(temp, "package.json"));
  process.chdir(temp); process.env.NODE_ENV = "prod";
  const { default: u } = await import("../src/utils");
  const { db } = await import("../src/utils/db");
  const library = await import("../src/utils/promptLibrary");
  const camera = await import("../src/utils/cameraMotionStore");
  const { default: singlePrompt } = await import("../src/routes/production/workbench/generateVideoPrompt");
  const { default: batchPrompt } = await import("../src/routes/production/workbench/batchGeneratePrompt");
  await library.ensurePromptLibrary();
  const projectId = 99139001, trackId = 99139002, otherTrackId = 99139003;
  const firstId = 99139004, secondId = 99139005, otherBoardId = 99139006, roleId = 99139007;
  const model = "camera-test:cinematic-fixture", modelTemplate = "MODEL_SPECIFIC_OUTPUT_CONTRACT: preserve my output syntax and soundscape.";
  const firstStory = "灰衣女子看向门口，说：“我会等你。”", secondStory = "黑衣男子放下雨伞，说：“我回来了。”";
  const otherStory = "灰衣女子站在柜台前，说：“钥匙在这里。”";
  await db("o_project").insert({ id: projectId, name: "原生提示词运镜隔离验证", videoModel: model, mode: "text", videoRatio: "16:9" });
  await db("o_videoTrack").insert([{ id: trackId, projectId, duration: 10 }, { id: otherTrackId, projectId, duration: 10 }]);
  await db("o_script").insert({id:99139031,projectId,name:"竖屏第一集",content:"# 测试\n### 平台：竖屏9:16 | 风格：写实\n1-1 房间 日\n女子：不要把台词里的16:9当作画幅。"});
  await db("o_videoTrack").where({id:trackId}).update({scriptId:99139031});
  // Insertion and reference order deliberately differ from the real shot order.
  await db("o_storyboard").insert([
    { id: secondId, projectId, trackId: null, index: 9, duration: "10", videoDesc: secondStory, prompt: "黑衣男子在门口，左手持雨伞。", shouldGenerateImage: 0 },
    { id: firstId, projectId, trackId, index: 3, duration: "10", videoDesc: firstStory, prompt: "灰衣女子在窗边，右手持信。", shouldGenerateImage: 0 },
    { id: otherBoardId, projectId, trackId: otherTrackId, index: 0, duration: "10", videoDesc: otherStory, prompt: "灰衣女子在柜台前，钥匙在左侧。", shouldGenerateImage: 0 },
  ]);
  await db("o_assets").insert({ id: roleId, projectId, name: "灰衣女子", type: "role", describe: "成年女子", defaultVoice: "male-deep" });
  await db("o_assets2Storyboard").insert([{ assetId: roleId, storyboardId: firstId }, { assetId: roleId, storyboardId: otherBoardId }]);
  for (const id of [firstId, secondId]) {
    const filePath = `/${projectId}/${id}.png`;
    await fs.mkdir(path.dirname(library.mediaPath(filePath)), { recursive: true });
    await fs.writeFile(library.mediaPath(filePath), Buffer.from("89504e470d0a1a0a", "hex"));
    await db("o_storyboard").where({ id }).update({ filePath });
  }
  const templatePath = "video/camera-integration-fixture.md";
  await fs.mkdir(path.join(temp, "data/modelPrompt/video"), { recursive: true });
  await fs.writeFile(path.join(temp, "data/modelPrompt", templatePath), modelTemplate);
  await db("o_modelPrompt").insert([
    { id: 99139008, vendorId: "camera-test", model: "cinematic-fixture", fileName: "camera-integration-fixture.md", path: templatePath },
    { id: 99139009, vendorId: "camera-test", model: "h3-reference-fixture", fileName: "camera-integration-fixture.md", path: templatePath },
  ]);

  const calls: { request: any; context: any }[] = [];
  let mediaCalls = 0, unstructuredReply = false, replyOverride: string | null = null;
  const originalText = u.Ai.Text, originalVideo = u.Ai.Video, originalImage = u.Ai.Image, originalArtPrompt = u.getArtPrompt;
  function extractContext(request: any) {
    const content = request.messages.find((message: any) => message.role === "user").content as string;
    const afterMarker = content.slice(content.indexOf("【逐镜摄影生成上下文】"));
    const json = afterMarker.slice(afterMarker.indexOf("{")).replace(/\n*\[Character voice defaults\][\s\S]*$/, "").trim();
    const end = json.lastIndexOf("}");
    return JSON.parse(json.slice(0, end + 1));
  }
  u.getArtPrompt = (() => "ART_STYLE_MANUAL_FIXTURE") as any;
  u.Ai.Text = ((name: string) => ({ invoke: async (request: any) => {
    assert.equal(name, "universalAi");
    const context = extractContext(request);
    calls.push({ request, context });
    if (replyOverride != null) return { text: replyOverride };
    if (unstructuredReply) return { text: "无法定位到具体分镜的自由文本，不得覆盖已有轨道。" };
    return { text: context.shots.map((shot: any) => `[Shot ${shot.shot}] ${shot.story.narrative}\n逐镜摄影：${shot.camera ? `${shot.camera.name}，${shot.camera.path}` : "固定观察，先停留，主体保持原动作"}。\n新增可见细节：镜头${shot.shot}的雨滴沿窗框落下。`).join("\n\n") };
  } })) as any;
  const noMedia = (() => { mediaCalls++; throw new Error("提示词测试不得生成图片或视频"); }) as any;
  u.Ai.Video = noMedia; u.Ai.Image = noMedia;
  const app = express(); app.use(express.json()); app.use("/singlePrompt", singlePrompt); app.use("/batchPrompt", batchPrompt);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  async function post(endpoint: string, body: any, expectedStatus = 200) {
    const response = await fetch(base + endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json: any = await response.json(); assert.equal(response.status, expectedStatus, JSON.stringify(json)); return json.data;
  }
  async function waitCompleted(ids: number[], expectedCalls: number) {
    for (let i = 0; i < 150; i++) {
      const rows = await db("o_videoTrack").whereIn("id", ids);
      assert.ok(rows.every(row => row.state !== "生成失败"), JSON.stringify(rows.map(row => ({ id: row.id, state: row.state, reason: row.reason }))));
      if (calls.length >= expectedCalls && rows.every(row => row.state === "已完成")) return rows;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("原生批量提示词生成未完成");
  }
  function assertModelContext(call: typeof calls[number]) {
    assert.ok(call.request.system.startsWith(modelTemplate));
    assert.match(call.request.system, /【运镜生成规则】/);
    assert.match(call.request.system, /selectionMode=auto/);
    assert.match(call.request.system, /selectionMode=applied_video/);
    assert.match(call.request.system, /新生成的提示词正文默认使用简体中文/);
    assert.match(call.request.system, /保留模型协议所需的字段名/);
    assert.match(call.request.system, /原始台词.*中文统一转换为简体字/);
    assert.equal(call.request.messages[0].content, "ART_STYLE_MANUAL_FIXTURE");
    assert.match(call.request.messages[1].content, /灰衣女子：低沉男声/);
    assert.equal(call.context.projectId, projectId);
    assert.ok(call.context.capabilities.motionCount >= 40);
  }
  async function adoptFirst() {
    const plan = await camera.buildCameraPlan(projectId, firstId, { reset: true, motionIds: ["push_in", "static"], options: {
      narrative: (await db("o_storyboard").where({ id: firstId }).first()).videoDesc,
      openingFrame: "灰衣女子在窗边，右手持信。", endingFrame: "女子近景，门框仍在画面右侧。", subjectAction: "保持站位，抬眼望向门口。",
      purpose: "读清等待中的反应。", focus: "人物眼睛清晰。", duration: 10, axisSide: "A侧", continuity: "灰衣、右手信件、右侧门框连续。", mode: "singleImage",
    } });
    await camera.applyCameraPlan(projectId, firstId, plan.revision, "push_in", ["video"]);
    return plan;
  }
  try {
    await assert.rejects(() => camera.getCameraPromptGenerationSnapshot(projectId + 1, trackId, "text"), /不属于当前项目/);
    await db("o_storyboard").where({id:firstId}).update({duration:"5"});
    await post("/singlePrompt", {projectId,trackId,model,mode:"text",info:[]},400);
    assert.equal(calls.length,0,"短镜必须在模型调用前拦截");
    await db("o_storyboard").where({id:firstId}).update({duration:"10"});
    // Building candidates alone must never constrain native generation.
    await camera.buildCameraPlan(projectId, firstId, { motionIds: ["arc_right"] });
    let text = await post("/singlePrompt", { projectId, trackId, model, mode: "text", info: [] });
    assertModelContext(calls[0]);
    assert.ok(calls[0].request.messages.find((m:any)=>m.role==='user').content.includes("**画幅**：9:16"));
    assert.equal((await db("o_project").where({id:projectId}).first()).videoRatio, "16:9", "episode override never changes project settings");
    const {trackVideoRatio,scriptVideoRatio}=await import('../src/utils/videoAspectRatio');
    assert.equal(await trackVideoRatio(projectId,otherTrackId,'16:9'),'16:9');
    assert.equal(scriptVideoRatio('1-1 房间 日\n女子：画幅9:16。','16:9'),'16:9');
    assert.ok(!calls[0].request.system.includes("【H3 摄影配方适配】"));
    assert.deepEqual(calls[0].context.shots.map((shot: any) => shot.storyboardId), [firstId]);
    assert.deepEqual(calls[0].context.shots.map((shot: any) => shot.selectionMode), ["auto"]);
    assert.ok(calls[0].context.shots.every((shot: any) => !shot.camera));
    assert.ok(text.includes("我会等你。"));
    assert.ok(!text.includes("我回来了。"), "未关联此轨道的分镜不能混入");

    const selected = await adoptFirst();
    const referenceOrder = [{ id: secondId, sources: "storyboard" }];
    text = await post("/singlePrompt", { projectId, trackId, model, mode: "text", info: referenceOrder });
    const selectedCall = calls[1]; assertModelContext(selectedCall);
    assert.deepEqual(selectedCall.context.referenceSelection, referenceOrder);
    assert.deepEqual(selectedCall.context.shots.map((shot: any) => shot.storyboardId), [firstId]);
    assert.equal(selectedCall.context.shots[0].selectionMode, "applied_video");
    assert.equal(selectedCall.context.shots[0].camera.motionId, "push_in");
    assert.equal(selectedCall.context.shots[0].camera.revision, selected.revision);


    assert.ok(text.includes("我会等你。"));
    assert.ok(text.includes("镜头1的雨滴沿窗框落下"), "已采用运镜不能覆盖新生成的动作细节");
    assert.match(text, /灰衣女子：低沉男声/);
    let snapshot = await camera.getCameraPromptGenerationSnapshot(projectId, trackId, "text");
    assert.equal(snapshot.boards[0].selection?.options.mode, "text");
    assert.ok(snapshot.boards[0].selection, "repeated native generation must recognize the latest standardized prompt");

    // H3 Ref2VA allows a style introduction within the narrative field.
    replyOverride = `subject_definitions: 按已知角色保持身份。\n\ndetailed_description: 低饱和写实电影风格，柔和侧光。\n\n[Shot 1] ${firstStory} 生成正文中的铜盆反光仍应保留。\n\noverall_soundscape: 门外细雨。\n\nnon_diegetic_music: N/A`;
    text = await post("/singlePrompt", { projectId, trackId, model: "camera-test:h3-reference-fixture", mode: "text", info: [] });
    assertModelContext(calls.at(-1)!);
    assert.match(calls.at(-1)!.request.system, /【H3 摄影配方适配】/);
    assert.match(calls.at(-1)!.request.system, /15 个配方/);
    assert.ok(text.includes("低饱和写实电影风格，柔和侧光"));
    assert.ok(text.includes("生成正文中的铜盆反光仍应保留"));
    assert.ok(text.includes("我会等你。"));

    assert.match(text, /overall_soundscape: 门外细雨/);
    replyOverride = null;

    const batchStart = calls.length;
    await post("/batchPrompt", { projectId, model, mode: "text", concurrentCount: 2, trackData: [{ trackId, info: [] }, { trackId: otherTrackId, info: [] }] });
    const batchRows = await waitCompleted([trackId, otherTrackId], batchStart + 2);
    const batchCalls = calls.slice(batchStart, batchStart + 2); batchCalls.forEach(assertModelContext);
    assert.equal(batchCalls.find(call => call.context.trackId === trackId)!.context.shots[0].selectionMode, "applied_video");
    assert.equal(batchCalls.find(call => call.context.trackId === otherTrackId)!.context.shots[0].selectionMode, "auto");
    assert.ok(batchRows.find(row => row.id === trackId)!.prompt.includes("我会等你。"));
    assert.ok(batchRows.find(row => row.id === otherTrackId)!.prompt.includes("钥匙在这里。"));

    // A malformed model response must not let postprocessing silently drop an unselected shot.
    const beforeFailure = (await db("o_videoTrack").where({ id: trackId }).first()).prompt;
    unstructuredReply = true;
    await post("/singlePrompt", { projectId, trackId, model, mode: "text", info: [] }, 400);
    assert.equal((await db("o_videoTrack").where({ id: trackId }).first()).prompt, beforeFailure);
    unstructuredReply = false;

    // Reset/build previews cannot reactivate an adopted snapshot after dialogue changes.
    await db("o_storyboard").where({ id: firstId }).update({ videoDesc: "灰衣女子说：“新对白绝不能被旧方案覆盖。”" });
    await camera.buildCameraPlan(projectId, firstId, { reset: true });
    snapshot = await camera.getCameraPromptGenerationSnapshot(projectId, trackId, "text");
    assert.equal(snapshot.boards[0].selection, null);
    text = await post("/singlePrompt", { projectId, trackId, model, mode: "text", info: [] });
    assert.equal(calls.at(-1)!.context.shots[0].selectionMode, "auto");
    assert.ok(text.includes("新对白绝不能被旧方案覆盖"));
    assert.ok(!text.includes("我会等你"));


    // Manual edits to a whole-track prompt also invalidate adoption, even after preview reset.
    await adoptFirst();
    await db("o_videoTrack").where({ id: trackId }).update({ prompt: "用户手写整轨摄影：改为固定观察，保留当前对白。" });
    await camera.buildCameraPlan(projectId, firstId, { reset: true });
    snapshot = await camera.getCameraPromptGenerationSnapshot(projectId, trackId, "text");
    assert.equal(snapshot.boards[0].selection, null);
    const staleBatchStart = calls.length;
    await post("/batchPrompt", { projectId, model, mode: "text", trackData: [{ trackId, info: [] }] });
    await waitCompleted([trackId], staleBatchStart + 1);
    assert.equal(calls.at(-1)!.context.shots[0].selectionMode, "auto");

    await adoptFirst();
    const imagePlan = await camera.buildCameraPlan(projectId, firstId);
    await camera.applyCameraPlan(projectId, firstId, imagePlan.revision, "push_in", ["image"]);
    snapshot = await camera.getCameraPromptGenerationSnapshot(projectId, trackId, "text");
    assert.ok(snapshot.boards[0].selection?.sourceContextHash);
    await db("o_storyboard").where({ id: firstId }).update({ duration: "6" });
    assert.equal((await camera.getCameraPromptGenerationSnapshot(projectId, trackId, "text")).boards[0].selection, null);
    assert.ok(await camera.getAppliedCameraPlan(projectId, firstId, "image"), "a video timing edit must not invalidate unchanged image composition");
    await camera.buildCameraPlan(projectId, firstId, { reset: true });
    assert.equal((await camera.getCameraPromptGenerationSnapshot(projectId, trackId, "text")).boards[0].selection, null, "preview reset must not reactivate an adoption with stale source duration");
    await db("o_storyboard").where({ id: firstId }).update({ duration: "10" });
    assert.ok((await camera.getCameraPromptGenerationSnapshot(projectId, trackId, "text")).boards[0].selection);
    await db("o_storyboard").where({ id: firstId }).update({ trackId: otherTrackId });
    assert.equal((await camera.getCameraPromptGenerationSnapshot(projectId, otherTrackId, "text")).boards.find(board => board.id === firstId)!.selection, null);
    assert.ok(await camera.getAppliedCameraPlan(projectId, firstId, "image"));
    await camera.buildCameraPlan(projectId, firstId, { reset: true });
    assert.equal((await camera.getCameraPromptGenerationSnapshot(projectId, otherTrackId, "text")).boards.find(board => board.id === firstId)!.selection, null);
    await db("o_storyboard").where({ id: firstId }).update({ trackId });
    await camera.buildCameraPlan(projectId, firstId, { reset: true });

    // Imported camera durations need not equal the original board duration.
    // Freshness compares the stored source snapshot, never the camera settings.
    const row = await db("o_cameraPlan").where({ projectId, storyboardId: firstId }).orderBy("revision", "desc").first();
    const saved = JSON.parse(row.data); saved.applied.video.options.duration = 7;
    await db("o_cameraPlan").where({ id: row.id }).update({ data: JSON.stringify(saved) });
    assert.equal((await camera.getCameraPromptGenerationSnapshot(projectId, trackId, "text")).boards[0].selection?.options.duration, 7);
    delete saved.applied.video.sourceContextHash;
    await db("o_cameraPlan").where({ id: row.id }).update({ data: JSON.stringify(saved) });
    assert.equal((await camera.getCameraPromptGenerationSnapshot(projectId, trackId, "text")).boards[0].selection?.options.duration, 7, "legacy content-hash records remain readable without inferring their source duration");

    // Even without adoption, incomplete model output must not silently omit a shot.
    await db("o_storyboard").where({ id: firstId }).update({ videoDesc: '灰衣女子说：“自动编排必须保留原台词。”' });
    assert.equal((await camera.getCameraPromptGenerationSnapshot(projectId, trackId, "text")).boards[0].selection, null);
    const beforeOmission = (await db("o_videoTrack").where({ id: trackId }).first()).prompt;
    replyOverride = "[Shot 1] 模型只返回第一镜，遗漏第二镜。";
    await post("/singlePrompt", { projectId, trackId, model, mode: "text", info: [] }, 400);
    assert.equal(calls.at(-1)!.context.shots[0].selectionMode, "auto");
    assert.equal((await db("o_videoTrack").where({ id: trackId }).first()).prompt, beforeOmission);
    const omittedBatchStart = calls.length;
    await post("/batchPrompt", { projectId, model, mode: "text", trackData: [{ trackId, info: [] }] });
    for (let i = 0; i < 150; i++) {
      if ((await db("o_videoTrack").where({ id: trackId }).first()).state === "生成失败") break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const failed = await db("o_videoTrack").where({ id: trackId }).first();
    assert.equal(calls.length, omittedBatchStart + 2);
    assert.equal(failed.state, "生成失败"); assert.match(failed.reason, /遗漏了原文台词或旁白/);
    assert.equal(failed.prompt, beforeOmission);
    replyOverride = null;

    const { validateCameraGeneratedPrompt, formatCameraPromptGenerationContext } = await import("../src/utils/cameraPromptGeneration");
    const orderedContext = formatCameraPromptGenerationContext({projectId,trackId,mode:"text",boards:[{id: firstId,duration:10,videoDesc:"前镜。",selection:null},{id:secondId,duration:10,videoDesc:"后镜。",selection:null}]});
    for (const wrong of ["[Shot 2] 后镜。\n[Shot 1] 前镜。", "[Shot 1] 前镜。\n[Shot 1] 后镜。", "[Shot 1] 前镜。\n[Shot 2] 后镜。\n[Shot 3] 新加镜头。", "summary: [Shot 1] 前镜。\n[Shot 2] 后镜。\ndetailed_description: 无分镜正文。"]) {
      assert.throws(() => validateCameraGeneratedPrompt(wrong, orderedContext), /镜头数量或顺序不符/);
    }
    const soloContext = formatCameraPromptGenerationContext(await camera.getCameraPromptGenerationSnapshot(projectId, otherTrackId, "text"));
    assert.doesNotThrow(() => validateCameraGeneratedPrompt("未带镜号的旧格式单镜正文。钥匙在这里。", soloContext));
    assert.throws(() => validateCameraGeneratedPrompt("[Shot 2] 错号。钥匙在这里。", soloContext), /镜头数量或顺序不符/);
    assert.doesNotThrow(() => validateCameraGeneratedPrompt("[Shot1] 前镜。\n[Shot2] 后镜。", orderedContext));
    const emptyContext = formatCameraPromptGenerationContext({ projectId, trackId, mode: "text", boards: [] });
    assert.doesNotThrow(() => validateCameraGeneratedPrompt("旧轨道没有结构化分镜。", emptyContext));
    assert.equal(mediaCalls, 0);
    console.log("PASS: native single + batch prompt routes send ordered camera context, honor applied selections, auto-design unselected shots, retain model/art/voice context and dialogue, invalidate stale selections, reject ambiguous replacement; zero media or live AI calls");
  } finally {
    u.Ai.Text = originalText; u.Ai.Video = originalVideo; u.Ai.Image = originalImage; u.getArtPrompt = originalArtPrompt;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.destroy(); process.chdir(root); await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
