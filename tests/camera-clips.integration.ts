import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
const Database = require("better-sqlite3");

/** HTTP/SQLite/provider-boundary regression only. All media are local test fixtures; no inference. */
async function main() {
  const root = process.cwd();
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-camera-clips-"));
  await fs.chmod(temp, 0o700);
  await fs.mkdir(path.join(temp, "data"));
  const original = new Database(path.join(root, "data/db2.sqlite"), { readonly: true });
  await original.backup(path.join(temp, "data/db2.sqlite")); original.close();
  await fs.copyFile(path.join(root, "package.json"), path.join(temp, "package.json"));
  const originalEnv = { NODE_ENV: process.env.NODE_ENV, ossURL: process.env.ossURL };
  process.chdir(temp); process.env.NODE_ENV = "prod"; delete process.env.ossURL;
  const { default: u } = await import("../src/utils");
  const { db } = await import("../src/utils/db");
  const { default: router } = await import("../src/extensions/cameraStudio");
  const owner = 1, otherOwner = 99339099;
  const projectId = 99339001, trackId = 99339002, storyboardId = 99339003, siblingId = 99339004;
  const otherProject = 99339011, otherTrack = 99339012, otherBoard = 99339013;
  const foreignProject = 99339021, foreignTrack = 99339022, foreignBoard = 99339023;
  const assetId = 99339031, imageId = 99339032, foreignAsset = 99339033, foreignImage = 99339034;
  const audioAsset = 99339035, audioImage = 99339036, videoAsset = 99339037, videoImage = 99339038;
  const target = { projectId, storyboardId };
  const vendorId = "comfyui-camera-integration";
  const workflowId = `${vendorId}:h3-fixture`;
  const fixtureModel = {
    name: "Camera integration fixture (never runs inference)", modelName: "h3-fixture", type: "video",
    mode: ["text", "singleImage", "startEndRequired", ["imageReference:2", "videoReference:1", "audioReference:1"]],
    audio: "optional", durationResolutionMap: [{ duration: [5, 8], resolution: ["preview", "768p"] }],
  };
  const imageModel = { name: "Image fixture", modelName: "image-only", type: "image", mode: ["text"] };
  const fixtureCode = (id: string) => `exports.vendor = ${JSON.stringify({ id, name: id, version: "2.0", inputs: [], inputValues: {}, models: [fixtureModel, imageModel] })}; exports.videoRequest = () => { throw new Error("Test fixture provider must never execute"); };`;
  const firstImage = `/${projectId}/fixture-opening.png`, lastImage = `/${projectId}/fixture-ending.png`;
  const assetImage = `/${projectId}/fixture-asset.png`, foreignImagePath = `/${foreignProject}/fixture-foreign.png`;
  const audioPath = `/${projectId}/fixture-audio.wav`, videoPath = `/${projectId}/fixture-video.mp4`;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2Z9sAAAAASUVORK5CYII=", "base64");
  // FFmpeg synthesizes two blank frames. This fixture is not an AI output or a camera-effect acceptance test.
  const fixtureVideoPath = path.join(temp, "mock-provider-output.mp4");
  execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=32x32:r=2", "-frames:v", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", fixtureVideoPath]);
  const fixtureVideo = await fs.readFile(fixtureVideoPath);
  const aiOriginal = { Video: u.Ai.Video, Image: u.Ai.Image, Text: u.Ai.Text };
  type Run = { key: string; input: any; taskRecord: any; savedPath?: string };
  const runs: Run[] = [];
  let nextOutcome: "success" | "run-failure" | "save-failure" = "success";
  let gate: Promise<void> | undefined, release: (() => void) | undefined;
  u.Ai.Text = (() => { throw new Error("Text inference is forbidden in camera clip tests"); }) as any;
  u.Ai.Image = (() => { throw new Error("Image inference is forbidden in camera clip tests"); }) as any;
  u.Ai.Video = ((key: string) => {
    const outcome = nextOutcome; nextOutcome = "success";
    const wait = gate;
    let record: Run;
    return {
      async run(input: any, taskRecord: any) {
        record = { key, input: structuredClone(input), taskRecord: structuredClone(taskRecord) }; runs.push(record);
        if (wait) await wait;
        if (outcome === "run-failure") throw new Error("Mock provider rejected the clip");
        return this;
      },
      async save(destination: string) {
        if (outcome === "save-failure") throw new Error("Mock media save failed");
        record.savedPath = destination; await u.oss.writeFile(destination, fixtureVideo); return this;
      },
    };
  }) as any;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    const user = req.header("x-camera-test-user");
    if (user !== "anonymous") (req as any).user = { id: user ? Number(user) : owner };
    next();
  });
  app.use("/api/cameraStudio", router);
  app.use("/oss", express.static(path.join(temp, "data/oss")));
  app.use(express.static(path.join(root, "data/web")));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const originalFetch = globalThis.fetch;
  let bridgeGate: Promise<void> | undefined, bridgeEntered=false;
  const bridgeRequests: string[] = [];
  const bridgeJobs = new Map<string, { state?: string; error?: string; httpStatus?: number; output?: Buffer }>();
  // Fail closed on every external URL. Recovery responses are local mocks, never a real ComfyUI bridge.
  globalThis.fetch = (async (input: any, init: any) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin === base) return originalFetch(input, init);
    assert.equal(url.origin, "http://127.0.0.1:10589", `Unexpected network request: ${url.origin}`);
    if (url.pathname === "/capabilities") return Response.json({ "h3-fixture": { customDuration: true, customResolution: true, duration: {max:30}, durationSuggestions:[5,8,12], presets:{preview:[608,352],"768p":[1344,768]} } });
    if (url.pathname === "/parameters") {
      const body = JSON.parse(init.body);
      assert.equal(init.method, "POST");
      return Response.json({duration:body.duration,resolution:body.resolution,aspectRatio:body.aspectRatio,width:1344,height:768,frames:124,fps:24,actualDuration:124/24});
    }
    assert.ok(!init?.method || init.method === "GET", "Recovery must not submit a provider job");
    bridgeRequests.push(url.pathname);
    const match = /^\/jobs\/([a-z0-9-]+)(\/output)?$/.exec(url.pathname);
    assert.ok(match, `Unexpected bridge request: ${url.pathname}`);
    const job = bridgeJobs.get(match[1]); assert.ok(job, "No fixture for the requested bridge job");
    if (match[2] && bridgeGate) { bridgeEntered=true; await bridgeGate; }
    if (match[2]) return new Response(new Uint8Array(job.output || fixtureVideo), { status: 200, headers: { "Content-Type": "video/mp4" } });
    return new Response(JSON.stringify({ state: job.state, error: job.error }), { status: job.httpStatus || 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  async function request(endpoint: string, body?: any, status = 200, user = String(owner)) {
    const response = await fetch(`${base}/api/cameraStudio/${endpoint}`, {
      method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", "x-camera-test-user": user },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json: any = await response.json();
    assert.equal(response.status, status, `${endpoint}: ${JSON.stringify(json)}`);
    return json.data;
  }
  const options = {
    narrative: "灰衣女子站在窗边等待。她低声说：我会等你。",
    openingFrame: "中景，灰衣女子在左侧，窗框在画面右侧，右手持信。",
    endingFrame: "女子面部近景，灰衣和右侧窗框保持一致。",
    subjectAction: "女子保持站位，缓慢抬眼望向门口。", purpose: "读清等待中的反应。",
    focus: "眼睛保持清晰。", continuity: "灰衣、右手持信、右侧窗框与侧光保持连续。",
    axisSide: "A侧", duration: 8, mode: "text",
  };
  const draft = { ...target, options, motionId: "push_in", workflowId, mode: "text", duration: 8, resolution: "preview", audio: false, references: [], seed: 12345 };
  const preview = (changes: any = {}) => request("clipPreview", { ...draft, ...changes });
  const generate = (prepared: any, changes: any = {}, status = 200, user = String(owner)) => request("clipGenerate", { ...target, prepareToken: prepared.prepareToken, requestId: randomUUID(), confirmed: true, ...changes }, status, user);
  async function waitForClip(id: string, status: string) {
    let clip: any;
    for (let count = 0; count < 150; count++) {
      clip = (await request("clipList", target)).clips.find((row: any) => row.id === id);
      if (clip?.status === status) return clip;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail(`Clip did not reach ${status}: ${JSON.stringify(clip)}`);
  }
  async function sourceSnapshot() {
    return {
      boards: await db("o_storyboard").whereIn("projectId", [projectId, otherProject, foreignProject]).orderBy("id"),
      tracks: await db("o_videoTrack").whereIn("projectId", [projectId, otherProject, foreignProject]).orderBy("id"),
      videos: await db("o_video").whereIn("projectId", [projectId, otherProject, foreignProject]).orderBy("id"),
      cameraPlans: await db.schema.hasTable("o_cameraPlan") ? await db("o_cameraPlan").where({ projectId }) : [],
      standards: await db.schema.hasTable("o_promptStandard") ? await db("o_promptStandard").where({ projectId }) : [],
    };
  }
  try {
    await db("o_vendorConfig").update({ enable: 0 });
    for (const [id, enable] of [[vendorId, 1], ["comfyui-camera-disabled", 0], ["cloud-camera-fixture", 1]] as const) {
      u.vendor.writeCode(id, fixtureCode(id));
      await db("o_vendorConfig").insert({ id, enable, models: "[]", inputValues: "{}" }).onConflict("id").merge();
    }
    await db("o_project").insert([
      { id: projectId, name: "Camera clip isolated test", userId: owner, videoModel: workflowId, mode: "text", videoRatio: "16:9" },
      { id: otherProject, name: "Same owner, different project", userId: owner, videoModel: workflowId, mode: "text", videoRatio: "9:16" },
      { id: foreignProject, name: "Other owner", userId: otherOwner, videoModel: workflowId, mode: "text", videoRatio: "16:9" },
    ]);
    await db("o_videoTrack").insert([
      { id: trackId, projectId, duration: 10, prompt: "原本整轨提示词：不要被独立样片覆盖。", state: "已完成", selectVideoId: 99339041 },
      { id: otherTrack, projectId: otherProject, duration: 5, prompt: "其他项目整轨。" },
      { id: foreignTrack, projectId: foreignProject, duration: 5, prompt: "其他用户整轨。" },
    ]);
    await db("o_storyboard").insert([
      { id: storyboardId, projectId, trackId, index: 0, duration: "5", videoDesc: "原故事：女子在窗边等待。台词：我会等你。", prompt: "灰衣女子站在窗边。", filePath: firstImage },
      { id: siblingId, projectId, trackId, index: 1, duration: "5", videoDesc: "下一镜：男子从门外回来。", prompt: "黑衣男子站在门口。", filePath: lastImage },
      { id: otherBoard, projectId: otherProject, trackId: otherTrack, index: 0, duration: "5", videoDesc: "其他项目故事。", prompt: "远山。", filePath: `/${otherProject}/missing.png` },
      { id: foreignBoard, projectId: foreignProject, trackId: foreignTrack, index: 0, duration: "5", videoDesc: "其他用户故事。", prompt: "树林。", filePath: foreignImagePath },
    ]);
    await db("o_video").insert({ id: 99339041, projectId, videoTrackId: trackId, filePath: `/${projectId}/original-video.mp4`, state: "已完成" });
    await db("o_assets").insert([
      { id: assetId, projectId, name: "信封", type: "道具" },
      { id: foreignAsset, projectId: foreignProject, name: "别人的角色", type: "角色" },
      { id: audioAsset, projectId, name: "测试音频", type: "clip" },
      { id: videoAsset, projectId, name: "测试视频", type: "clip" },
    ]);
    await db("o_image").insert([
      { id: imageId, assetsId: assetId, filePath: assetImage, type: "image", state: "已完成" },
      { id: foreignImage, assetsId: foreignAsset, filePath: foreignImagePath, type: "image", state: "已完成" },
      { id: audioImage, assetsId: audioAsset, filePath: audioPath, type: "audio", state: "已完成" },
      { id: videoImage, assetsId: videoAsset, filePath: videoPath, type: "video", state: "已完成" },
    ]);
    await db("o_assets").where({ id: assetId }).update({ imageId });
    await db("o_assets").where({ id: foreignAsset }).update({ imageId: foreignImage });
    await db("o_assets").where({ id: audioAsset }).update({ imageId: audioImage });
    await db("o_assets").where({ id: videoAsset }).update({ imageId: videoImage });
    await db("o_assets2Storyboard").insert({ assetId, storyboardId });
    for (const file of [firstImage, lastImage, assetImage, foreignImagePath]) await u.oss.writeFile(file, png);
    const wav = Buffer.alloc(46);
    wav.write("RIFF"); wav.writeUInt32LE(38, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(2, 40);
    await u.oss.writeFile(audioPath, wav); await u.oss.writeFile(videoPath, fixtureVideo);
    const baseline = await sourceSnapshot();

    // Discovery and context use actual vendor metadata, not a mocked capability catalogue.
    const catalog = await request("clipWorkflows");
    assert.deepEqual(catalog.workflows.map((row: any) => row.id), [workflowId]);
    const workflow = catalog.workflows[0];
    const referenceMode = workflow.modes.find((mode: any) => mode.referenceLimits.video === 1).value;
    assert.ok(workflow.modes.some((mode: any) => mode.value === "text"));
    assert.ok(workflow.modes.some((mode: any) => mode.value === "startEndRequired" && mode.minImages === 2));
    const context = await request("clipContext", target);
    assert.equal(context.aspectRatio, "16:9");
    assert.ok(context.references.some((ref: any) => ref.id === storyboardId && ref.sources === "storyboard"));
    assert.ok(context.references.some((ref: any) => ref.id === assetId && ref.sources === "assets"));
    for (const [id, type] of [[audioAsset, "audio"], [videoAsset, "video"], [assetId, "image"]]) {
      assert.equal(context.references.find((ref: any) => ref.id === id && ref.sources === "assets").type, type);
      assert.equal(context.catalog.assets.find((ref: any) => ref.id === id).type, type);
    }
    assert.ok(!context.references.some((ref: any) => ref.id === foreignBoard || ref.id === foreignAsset));
    await request("clipContext", { projectId, storyboardId: otherBoard }, 400);
    await request("clipContext", { projectId: foreignProject, storyboardId: foreignBoard }, 400);
    await request("clipContext", target, 400, "anonymous");
    await request("clipList", target, 400, String(otherOwner));
    await request("clipPreview", draft, 400, "anonymous");
    await request("clipPreview", draft, 400, String(otherOwner));
    await request("clipPreview", { ...draft, projectId: otherProject, storyboardId: otherBoard, mode: "singleImage", references: [{ id: otherBoard, sources: "storyboard" }] }, 400);

    const ctx = await request("clipContext", target);
    const mention = ctx.catalog.assets.find((a:any)=>a.id === assetId);
    assert.ok(mention?.code); assert.ok(ctx.catalog.shots.every((s:any)=>s.code.startsWith(`DR-${projectId}-SHOT-`)));
    const autoText = await request("promptText", {...target,options,motionId:"push_in"});
    assert.match(autoText.prompt,/我会等你/);
    const alternate = await request("promptText", {...target,options,motionId:"truck_right"});
    assert.notEqual(autoText.prompt,alternate.prompt);
    const manualText = `手工核对：@${mention.code}。台词：我会等你。摄影机向右平移。`;
    const recommended = await request('clipRecommend',{...target,prompt:manualText,duration:8,references:[]});
    assert.deepEqual(recommended.issues,[]);assert.equal(recommended.references[0].id,assetId);assert.equal(recommended.parameters.duration,8);
    const edited = await preview({mode:'singleImage',promptOverride:manualText});
    assert.equal(edited.references[0].id,assetId);assert.match(edited.prompt,/<Picture 1>/);
    const legacy = await preview({mode:'singleImage',options:{...options,openingFrame:`@图1 为${mention.name}角色。@图1 在窗边。`}});
    assert.equal(legacy.references[0].id,assetId);assert.doesNotMatch(legacy.prompt,/@图/);
    const numbered = await request('clipRecommend',{...target,prompt:'@图1 在窗边等待。',duration:8,references:[]});
    assert.deepEqual(numbered.issues,[]);assert.equal(numbered.references[0].id,assetId);
    const numberedPreview=await preview({mode:'singleImage',promptOverride:'@图 1 在窗边等待，摄影机缓推。'});
    assert.equal(numberedPreview.references[0].id,assetId);
    assert.match(numberedPreview.prompt,/<Picture 1>/);assert.doesNotMatch(numberedPreview.prompt,/@图/);
    await request('clipPreview',{...draft,mode:'singleImage',promptOverride:'@图2 在窗边。'},400);
    await request('clipPreview',{...draft,promptOverride:manualText},400);
    await request('clipRecommend',{...target,prompt:manualText,duration:5},400,String(otherOwner));
    assert.ok(edited.prompt.includes(mention.name));assert.ok(edited.prompt.includes('摄影机向右平移'));assert.ok(!edited.prompt.includes('@DR-'));
    const editedRecord=JSON.parse((await db('o_cameraClipDraft').where('id',edited.prepareToken).first()).data);
    assert.equal(editedRecord.prompt,edited.prompt);
    await request('clipPreview',{...draft,promptOverride:'@DR-123-CHR-999999'},400);
    const referencedEdit = await preview({mode:'singleImage',references:[{id:assetId,sources:'assets'}],promptOverride:manualText});
    assert.ok(referencedEdit.prompt.includes('<Picture 1>'));
    const reordered = await preview({mode:'startEndRequired',references:[{id:storyboardId,sources:'storyboard'},{id:assetId,sources:'assets'}],promptOverride:referencedEdit.prompt});
    assert.match(reordered.prompt,/<Picture 2>/);assert.doesNotMatch(reordered.prompt,/<Picture 1>/);
    const compiled = await preview();
    assert.equal(compiled.canGenerate, true); assert.ok(compiled.prepareToken); assert.ok(compiled.expiresAt);
    assert.match(compiled.prompt, /我会等你/); assert.match(compiled.prompt, /保持焦距|推近|推进/);
    assert.equal(runs.length, 0);
    assert.equal((await request("clipList", target)).clips.length, 0);
    assert.equal(await db("o_cameraClip").where({ projectId }).count({ count: "*" }).first().then((row: any) => Number(row.count)), 0);
    assert.deepEqual(await sourceSnapshot(), baseline);
    for (const bad of [
      { workflowId: "missing:model" }, { workflowId: "comfyui-camera-disabled:h3-fixture" },
      { workflowId: "cloud-camera-fixture:h3-fixture" }, { workflowId: `${vendorId}:image-only` },
      { motionId: "nonexistent-motion" }, { mode: "unknown" }, { duration: 37 }, { resolution: "64k" },
      { mode: "singleImage", references: [] }, { mode: "startEndRequired", references: [{ id: storyboardId, sources: "storyboard" }] },
      { mode: "singleImage", references: [{ id: foreignBoard, sources: "storyboard" }] },
      { mode: "singleImage", references: [{ id: foreignAsset, sources: "assets" }] },
      { mode: "singleImage", references: [{ id: storyboardId, sources: "untrusted" }] },
      { mode: "singleImage", references: [{ id: 999999999, sources: "storyboard" }] },
      { mode: "text", references: [{ id: storyboardId, sources: "storyboard" }] },
      { mode: "startEndRequired", references: [{ id: storyboardId, sources: "storyboard" }, { id: storyboardId, sources: "storyboard" }] },
      { mode: referenceMode, references: [{ id: storyboardId, sources: "storyboard" }, { id: siblingId, sources: "storyboard" }, { id: assetId, sources: "assets" }] },
      { mode: referenceMode, references: [{ id: audioAsset, sources: "assets" }], audio: true },
      { mode: referenceMode, references: [{ id: storyboardId, sources: "storyboard" }, { id: audioAsset, sources: "assets" }], audio: false },
      { mode: "singleImage", references: [{ id: audioAsset, sources: "assets" }], audio: true },
    ]) await request("clipPreview", { ...draft, ...bad }, 400);
    await generate(compiled, { confirmed: false }, 400);
    await generate(compiled, { confirmed: undefined }, 400);
    await generate(compiled, { requestId: "not-a-uuid" }, 400);
    await generate(compiled, { prompt: "未审查的新提示词不可直接提交" }, 400);
    await generate(compiled, { prepareToken: randomUUID() }, 400);
    await generate(compiled, {}, 400, String(otherOwner));
    await generate(compiled, { projectId: otherProject, storyboardId: otherBoard }, 400);
    const expired = await preview();
    await db("o_cameraClipDraft").where({ id: expired.prepareToken }).update({ expiresAt: Date.now() - 1 });
    await generate(expired, {}, 400);
    const blocked = await preview({ options: { ...options, narrative: "", openingFrame: "" } });
    assert.equal(blocked.canGenerate, false); await generate(blocked, {}, 400);
    assert.equal(runs.length, 0);

    // Mutable source and referenced bytes invalidate an earlier review before any provider request.
    const beforeEdit = await preview();
    const board = await db("o_storyboard").where({ id: storyboardId }).first();
    await db("o_storyboard").where({ id: storyboardId }).update({ videoDesc: "用户刚刚修改了故事。" });
    await generate(beforeEdit, {}, 400);
    await db("o_storyboard").where({ id: storyboardId }).update({ videoDesc: board.videoDesc });
    const imagePreview = await preview({ mode: "singleImage", references: [{ id: storyboardId, sources: "storyboard" }] });
    await u.oss.writeFile(firstImage, Buffer.concat([png, Buffer.from("changed fixture bytes")]));
    await generate(imagePreview, {}, 400); await u.oss.writeFile(firstImage, png);
    const beforeWorkflowChange = await preview();
    await db("o_vendorConfig").where({ id: vendorId }).update({ models: JSON.stringify([{ ...fixtureModel, durationResolutionMap: [{ duration: [8], resolution: ["768p"] }] }]) });
    await generate(beforeWorkflowChange, {}, 400);
    await db("o_vendorConfig").where({ id: vendorId }).update({ models: "[]" });
    const beforeDisabled = await preview();
    await db("o_vendorConfig").where({ id: vendorId }).update({ enable: 0 });
    await generate(beforeDisabled, {}, 400);
    await db("o_vendorConfig").where({ id: vendorId }).update({ enable: 1 });
    // Boolean audio capability is the existing vendor schema's mandatory-audio form.
    await db("o_vendorConfig").where({ id: vendorId }).update({ models: JSON.stringify([{ ...fixtureModel, audio: true }]) });
    const requiredAudio = (await request("clipWorkflows")).workflows[0];
    assert.equal(requiredAudio.audio, "required"); assert.equal(requiredAudio.defaults.audio, true);
    await request("clipPreview", draft, 400);
    assert.equal((await preview({ audio: true })).canGenerate, true);
    await db("o_vendorConfig").where({ id: vendorId }).update({ models: JSON.stringify([{ ...fixtureModel, audio: "none" }]) });
    await request("clipPreview", { ...draft, audio: true }, 400);
    await db("o_vendorConfig").where({ id: vendorId }).update({ models: "[]" });
    assert.equal(runs.length, 0);

    // A pending invocation is idempotent, including concurrent HTTP submissions.
    const approved = await preview({ promptOverride: "编辑提交验收：灰衣女子在窗边等待，摄影机固定观察。台词：我会等你。", mode: "startEndRequired", references: [{ id: storyboardId, sources: "storyboard" }, { id: siblingId, sources: "storyboard" }] });
    gate = new Promise<void>(resolve => { release = resolve; });
    const requestId = randomUUID();
    const responses = await Promise.all([generate(approved, { requestId }), generate(approved, { requestId })]);
    assert.equal(responses[0].clip.id, responses[1].clip.id);
    assert.ok(responses.some(row => row.duplicate === true));
    const clipId = responses[0].clip.id;
    await waitForClip(clipId, "running");
    const review = {...target,clipId,status:"accepted",notes:"隔离测试夹具，仅检验验收记录逻辑，不代表真实视频质量。",checks:{action:true,ending:true,identity:true,continuity:true,speech:true}};
    await request("clipReview", review, 400);
    await request("clipDelete", {...target,clipId}, 400);
    // The row enters running before request.json is written and the mocked provider is entered.
    for (let count = 0; count < 150 && !runs.some(run => run.input.request_id === clipId); count++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(runs.length, 1);
    assert.equal(runs[0].key, workflowId); assert.equal(runs[0].input.prompt, approved.prompt);
    assert.equal(runs[0].input.request_id, clipId); assert.equal(runs[0].input.duration, 8);
    assert.equal(runs[0].input.resolution, "preview"); assert.equal(runs[0].input.aspectRatio, "16:9");
    assert.equal(runs[0].input.audio, false); assert.equal(runs[0].input.seed, 12345);
    assert.equal(runs[0].input.referenceList.length, 2);
    assert.equal(runs[0].input.mode, "startEndRequired");
    assert.equal(runs[0].taskRecord.projectId, projectId);
    assert.equal(JSON.parse(runs[0].taskRecord.relatedObjects).cameraClipId, clipId);
    assert.equal(bridgeRequests.length, 0, "A live in-process run must not query or recover its own bridge job");
    const anotherToken = await preview({ mode: "startEndRequired", references: [{ id: storyboardId, sources: "storyboard" }, { id: siblingId, sources: "storyboard" }] });
    await generate(anotherToken, { requestId }, 400);
    await generate(approved, {}, 400);
    release!(); gate = undefined; release = undefined;
    const completed = await waitForClip(clipId, "completed");
    assert.match(completed.url, /^\/oss\//);
    const media = await fetch(base + completed.url);
    assert.equal(media.status, 200); assert.match(media.headers.get("content-type") || "", /video\/mp4/);
    assert.deepEqual(Buffer.from(await media.arrayBuffer()), fixtureVideo);
    const repeated = await generate(approved, { requestId });
    assert.equal(repeated.duplicate, true); assert.equal(repeated.clip.id, clipId); assert.equal(runs.length, 1);
    await generate(approved, { requestId, projectId: otherProject, storyboardId: otherBoard }, 400);
    assert.equal((await request("clipList", { projectId, storyboardId: siblingId })).clips.length, 0);
    assert.equal((await request("clipList", { projectId: otherProject, storyboardId: otherBoard })).clips.length, 0);
    await generate(approved, {}, 400);
    const storedRequest = JSON.parse(await fs.readFile(path.join(temp, "data/reproduction/camera-clips", clipId, "request.json"), "utf8"));
    assert.deepEqual(storedRequest, runs[0].input);
    assert.equal(completed.prompt, approved.prompt); assert.deepEqual(completed.parameters, approved.parameters);
    assert.equal((await request("clipList", target)).qualifiedCount, 0);
    await request("clipReview", review, 400, String(otherOwner));
    await request("clipAudit", {...target,clipId}, 400, String(otherOwner));
    const measured = await request("clipAudit", {...target,clipId});
    assert.match(measured.technicalAudit.mediaSha256,/^[a-f0-9]{64}$/);
    assert.notEqual(measured.technicalAudit.status,"pass");
    assert.equal((await db("o_cameraClip").where({id:clipId}).first()).review,null);
    await request("clipReview", {...review,storyboardId:siblingId}, 400);
    await request("clipReview", {...review,checks:{...review.checks,speech:false}}, 400);
    await request("clipReview", {...review,notes:""}, 400);
    const accepted = await request("clipReview", review);
    assert.match(accepted.review.mediaSha256, /^[a-f0-9]{64}$/);
    assert.equal((await request("clipList", target)).qualifiedCount, 1);
    assert.equal((await request("clipList", target)).qualificationTarget, 4);
    await db("o_storyboard").where({ id: storyboardId }).update({ videoDesc: "完成后用户继续编辑故事。" });
    assert.equal((await generate(approved, { requestId })).clip.id, clipId);
    await db("o_storyboard").where({ id: storyboardId }).update({ videoDesc: board.videoDesc });

    const mixed = await preview({ mode: referenceMode, audio: true, references: [], promptOverride:[assetId,videoAsset,audioAsset].map(id=>'@'+ctx.catalog.assets.find((a:any)=>a.id===id).code).join('，')+'。灰衣女子在窗边读信。' });
    assert.match(mixed.prompt,/<Picture 1>/);assert.match(mixed.prompt,/<Video 1>/);assert.match(mixed.prompt,/<Audio 1>/);
    const competing = await Promise.all([randomUUID(), randomUUID()].map(async id => {
      const response = await fetch(`${base}/api/cameraStudio/clipGenerate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...target, prepareToken: mixed.prepareToken, requestId: id, confirmed: true }) });
      return { status: response.status, json: await response.json() as any };
    }));
    assert.deepEqual(competing.map(row => row.status).sort(), [200, 400], "Two tabs must not generate two clips from one approved preparation");
    const mixedId = competing.find(row => row.status === 200)!.json.data.clip.id;
    await waitForClip(mixedId, "completed");
    // A different request yielding byte-identical media cannot inflate the qualified count.
    await request("clipReview", {...review,clipId:mixedId}, 400);
    await request("clipReview", {...review,status:"rejected",checks:{...review.checks,action:false}});
    assert.equal((await request("clipList", target)).qualifiedCount, 0);
    assert.equal(runs.length, 2);
    assert.deepEqual(runs[1].input.mode, JSON.parse(referenceMode));
    assert.deepEqual(runs[1].input.referenceList.map((ref: any) => ref.type), ["image", "video", "audio"]);
    assert.match(runs[1].input.referenceList[0].base64, /^data:image\/png;base64,/);
    assert.match(runs[1].input.referenceList[1].base64, /^data:video\/mp4;base64,/);
    assert.match(runs[1].input.referenceList[2].base64, /^data:audio\/wav;base64,/);

    for (const failure of ["run-failure", "save-failure"] as const) {
      const prepared = await preview(); nextOutcome = failure;
      const started = await generate(prepared);
      const failed = await waitForClip(started.clip.id, "failed");
      assert.match(failed.error, /Mock/); assert.ok(!failed.url);
    }
    const clips = (await request("clipList", target)).clips;
    assert.equal(clips.length, 4); assert.equal(clips.filter((clip: any) => clip.status === "completed").length, 2);
    assert.equal(runs.length, 4);
    assert.equal(bridgeRequests.length, 0, "Terminal records must not perform bridge status queries");

    u.vendor.writeCode("comfyui-h3", fixtureCode("comfyui-h3"));
    await db("o_vendorConfig").insert({ id: "comfyui-h3", enable: 1, inputValues: "{}", models: "[]" }).onConflict("id").merge();
    const h3Workflow = "comfyui-h3:h3-fixture";
    await request("clipPreview", { ...draft, workflowId: h3Workflow, options: { ...options, narrative: "N".repeat(19000), openingFrame: "O".repeat(19000), endingFrame: "E".repeat(11000), subjectAction: "S".repeat(11000) } }, 400);
    assert.equal(runs.length, 4, "An oversized H3 prompt must be rejected before provider execution");
    // A provider may have submitted successfully before run/save failed; preserve that handle and recover it.
    for (const failure of ["run-failure", "save-failure"] as const) {
      const prepared = await preview({ workflowId: h3Workflow }); nextOutcome = failure;
      const id = randomUUID(); bridgeJobs.set(id, { state: "success", output: fixtureVideo });
      await generate(prepared, { requestId: id });
      let state = "";
      for (let count = 0; count < 150; count++) {
        state = (await db("o_cameraClip").where({ id }).first()).status;
        if (state === "uncertain") break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.equal(state, "uncertain", "H3 failures after entering the provider must retain a recoverable job handle");
      const priorRuns: number = runs.length;
      await waitForClip(id, "completed");
      assert.equal(runs.length, priorRuns, "Recovering a submitted H3 job must not resubmit generation");
    }
    assert.equal(runs.length, 6);

    // Simulate persisted jobs from a previous process. Listing can recover bytes but never resubmit inference.
    const completedRow = await db("o_cameraClip").where({ id: clipId }).first();
    async function orphan(status: string, job?: { state?: string; error?: string; httpStatus?: number; output?: Buffer }, comfy = true) {
      const id = randomUUID(), data = JSON.parse(completedRow.data);
      if (comfy) { data.workflowId = "comfyui-h3:h3-fixture"; data.parameters.workflowId = data.workflowId; }
      await db("o_cameraClip").insert({ ...completedRow, id, prepareToken: randomUUID(), status, data: JSON.stringify(data), filePath: null, error: null });
      if (job) bridgeJobs.set(id, job);
      return id;
    }
    const recoveredId = await orphan("running", { state: "success", output: fixtureVideo });
    const failedId = await orphan("queued", { state: "error", error: "Mock interrupted workflow failed" });
    const queuedId = await orphan("queued", { state: "running" });
    const uncertainId = await orphan("uncertain", { state: "submission_uncertain", error: "Mock unconfirmed submission" });
    const unavailableId = await orphan("running", { httpStatus: 503 });
    const otherVendorId = await orphan("running", undefined, false);
    const unknownId = await orphan("running", { state: "future-unknown-state" });
    const emptyId = await orphan("running", { state: "success", output: Buffer.alloc(0) });
    const recovered = (await request("clipList", target)).clips;
    const result = (id: string) => recovered.find((clip: any) => clip.id === id);
    assert.equal(result(recoveredId).status, "completed"); assert.ok(result(recoveredId).url);
    assert.equal(result(failedId).status, "failed"); assert.match(result(failedId).error, /Mock interrupted/);
    assert.equal(result(queuedId).status, "running");
    assert.equal(result(uncertainId).status, "uncertain"); assert.ok(!result(uncertainId).url);
    assert.equal(result(unavailableId).status, "uncertain");
    assert.equal(result(otherVendorId).status, "uncertain");
    assert.equal(result(unknownId).status, "uncertain");
    assert.equal(result(emptyId).status, "uncertain");
    await assert.rejects(() => fs.stat(path.join(temp, "data/oss", String(projectId), "camera-clips", `${emptyId}.mp4.part`)), /ENOENT/);
    assert.ok(!bridgeRequests.some(url => url.includes(otherVendorId)));
    assert.equal(runs.length, 6, "Recovery must not create another provider request");
    const recoveredMedia = await fetch(base + result(recoveredId).url);
    assert.equal(recoveredMedia.status, 200); assert.deepEqual(Buffer.from(await recoveredMedia.arrayBuffer()), fixtureVideo);
    const recoveredQueries = bridgeRequests.filter(url => url.includes(recoveredId)).length;
    const failedQueries = bridgeRequests.filter(url => url.includes(failedId)).length;
    await request("clipList", target);
    assert.equal(bridgeRequests.filter(url => url.includes(recoveredId)).length, recoveredQueries);
    assert.equal(bridgeRequests.filter(url => url.includes(failedId)).length, failedQueries);
    assert.deepEqual(await sourceSnapshot(), baseline);
    await request("clipDelete", {...target,clipId}, 400, String(otherOwner));
    await request("clipDelete", {projectId,storyboardId:siblingId,clipId}, 400);
    const removeResult = await request("clipDelete", {...target,clipId});
    assert.equal(removeResult.deleted,true);
    assert.equal(await db("o_cameraClip").where({id:clipId}).first(),undefined);
    assert.equal(await db("o_cameraClipDraft").where({id:approved.prepareToken}).first(),undefined);
    assert.equal((await fetch(base+completed.url)).status,404);
    await assert.rejects(fs.access(path.join(temp,"data/reproduction/camera-clips",clipId)));
    assert.deepEqual(await sourceSnapshot(),baseline);
    await generate(approved,{requestId},400);
    assert.ok(!(await request("clipList",target)).clips.some((c:any)=>c.id===clipId));
    // 等待真实后台协程结束后检查删除竞态，不用固定延迟假定工作已经结束。
    const {isCameraClipGenerating}=await import("../src/utils/cameraClips");
    const {deleteStoryboards}=await import("../src/utils/productionDeletion");
    const {mediaPath}=await import("../src/utils/promptLibrary");
    async function until(test:()=>boolean,label:string){for(let i=0;i<200;i++){if(test())return;await new Promise(r=>setTimeout(r,10));}throw Error("等待超时："+label);}
    const lifecycleResults:any[]=[];
    for(const phase of ["generation","recovery"]){
      const id=phase==="generation"?99339901:99339902;
      await db("o_storyboard").insert({id,projectId,index:99,duration:"5",videoDesc:"删除竞态测试",prompt:"灰衣女子在窗边"});
      let clipId="",pending:Promise<any>|undefined;
      let unblock:()=>void=()=>{};
      try {
        if(phase==="generation"){
          const prepared=await preview({storyboardId:id});
          gate=new Promise<void>(r=>{unblock=r;});const before=runs.length;
          const created=await generate(prepared,{storyboardId:id});clipId=created.clip.id;
          await until(()=>runs.length>before,"供应商已开始");
          await deleteStoryboards([id],projectId);unblock();gate=undefined;
          await until(()=>!isCameraClipGenerating(clipId),"生成协程结束");
        }else{
          clipId=randomUUID();
          const prepared=await preview({storyboardId:id});const record=JSON.parse((await db("o_cameraClipDraft").where({id:prepared.prepareToken}).first()).data);
          record.workflowId="comfyui-h3:fixture";
          await db("o_cameraClip").insert({id:clipId,ownerId:owner,projectId,storyboardId:id,prepareToken:prepared.prepareToken,status:"running",data:JSON.stringify(record),createdAt:Date.now(),updatedAt:Date.now()});
          bridgeJobs.set(clipId,{state:"success",output:fixtureVideo});bridgeEntered=false;bridgeGate=new Promise<void>(r=>{unblock=r;});
          pending=request("clipList",{projectId,storyboardId:id});
          await until(()=>bridgeEntered,"恢复下载已经开始");await deleteStoryboards([id],projectId);unblock();await pending;bridgeGate=undefined;
        }
        assert.equal(await db("o_cameraClip").where({id:clipId}).first(),undefined);
        await assert.rejects(fs.access(mediaPath(`/${projectId}/camera-clips/${clipId}.mp4`)),{code:"ENOENT"});
        await assert.rejects(fs.access(u.getPath(["reproduction","camera-clips",clipId])),{code:"ENOENT"});
        lifecycleResults.push({phase,pass:true});
      }catch(e:any){lifecycleResults.push({phase,pass:false,reason:e.message});}
      finally {unblock();if(pending)await pending;gate=undefined;bridgeGate=undefined;await deleteStoryboards([id],projectId);}
    }
    console.log(JSON.stringify({cameraLifecycle:lifecycleResults}));assert.ok(lifecycleResults.every(r=>r.pass));
    assert.deepEqual(await sourceSnapshot(),baseline);
    console.log("PASS: camera clip HTTP workflow/context, owner scope, preview isolation and expiry, stale-source/reference/workflow guards, concurrent idempotency, provider failures, restart recovery, independent records and served mock MP4; zero inference");
    if (process.argv.includes("--serve")) {
      await db("o_cameraClip").where({ projectId }).delete();
      await db("o_cameraClipDraft").where({ projectId }).delete();
      u.Ai.Text = (()=>({invoke:async()=>({text:"AI 测试提示词：灰衣女子读信，摄影机缓慢推进。台词：我会等你。"})})) as any;
      await request("build", { ...target, options, motionIds: ["static", "push_in", "truck_right"], revision: 0 });
      console.log(`UI_TEST_URL=${base}/camera-studio.html?projectId=${projectId}`);
      console.log("UI_TEST_MODE=isolated copied database; all Video/Image/Text providers mocked; generated gray MP4 is a fixture, not AI output");
      await new Promise<void>(resolve => { process.once("SIGTERM", resolve); process.once("SIGINT", resolve); });
    }
  } finally {
    release?.();
    // Let any just-released asynchronous mock complete its final SQLite status write before teardown.
    await new Promise(resolve => setTimeout(resolve, 100));
    u.Ai.Video = aiOriginal.Video; u.Ai.Image = aiOriginal.Image; u.Ai.Text = aiOriginal.Text;
    await new Promise<void>(resolve => server.close(() => resolve()));
    globalThis.fetch = originalFetch;
    await db.destroy(); process.chdir(root);
    for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
