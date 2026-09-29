import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { PROMPT_LANGUAGE_RULE } from "../src/utils/promptLanguage";
const Database = require("better-sqlite3");

/** Generic prompt assistance is text-only and must never persist a replacement automatically. */
async function main() {
  const root = process.cwd(), temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-prompt-assist-"));
  await fs.chmod(temp, 0o700); await fs.mkdir(path.join(temp, "data"));
  const original = new Database(path.join(root, "data/db2.sqlite"), { readonly: true });
  await original.backup(path.join(temp, "data/db2.sqlite")); original.close();
  await fs.copyFile(path.join(root, "package.json"), path.join(temp, "package.json"));
  const originalEnvironment = process.env.NODE_ENV;
  process.chdir(temp); process.env.NODE_ENV = "prod";
  const { default: u } = await import("../src/utils");
  const { db } = await import("../src/utils/db");
  const { ensurePromptLibrary } = await import("../src/utils/promptLibrary");
  const { default: router } = await import("../src/extensions/promptStudio");
  await ensurePromptLibrary();
  const originals = { Text: u.Ai.Text, Image: u.Ai.Image, Video: u.Ai.Video };
  const calls: any[] = []; let mediaCalls = 0;
  let reply: any = { text: "灰衣成年女子站在窗边，保持人物身份与衣着一致，柔和侧光。" }, failure: Error | null = null;
  u.Ai.Text = ((key: string) => ({ invoke: async (request: any) => {
    assert.equal(key, "universalAi");
    const system = request.system || request.messages?.find((message: any) => message.role === "system")?.content;
    assert.ok(system.includes(PROMPT_LANGUAGE_RULE)); calls.push(request);
    if (failure) throw failure;
    return reply;
  } })) as any;
  const noMedia = (() => { mediaCalls++; throw Error("Prompt assistance must not generate media"); }) as any;
  u.Ai.Image = noMedia; u.Ai.Video = noMedia;
  const app = express(); app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => { (req as any).user = { id: 1 }; next(); }); app.use("/api/promptStandards", router);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  async function assist(body: any, status = 200) {
    const response = await fetch(base + "/api/promptStandards/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json: any = await response.json(); assert.equal(response.status, status, JSON.stringify(json)); return json;
  }
  const projectId = 99359001, assetId = 99359002, trackId = 99359003, boardId = 99359004;
  const manual = "Manual English prompt; 台词原字：我會等你。<Picture 1> [Shot 1]";
  async function snapshot() {
    const tables = ["o_project", "o_assets", "o_storyboard", "o_assets2Storyboard", "o_videoTrack", "o_video", "o_image", "o_promptStandard", "o_generationRecipe"];
    return Object.fromEntries(await Promise.all(tables.map(async table => [table, await db(table).select("*").orderBy("rowid")])));
  }
  try {
    await db("o_project").insert({ id: projectId, name: "通用提示词助手隔离测试", userId: 1 });
    await db("o_assets").insert({ id: assetId, projectId, name: "灰衣女子", type: "role", prompt: manual, describe: "保留手写角色描述。" });
    await db("o_videoTrack").insert({ id: trackId, projectId, prompt: manual, duration: 5 });
    await db("o_storyboard").insert({ id: boardId, projectId, trackId, index: 0, prompt: manual, videoDesc: "【起始画面】站在窗前。\n【主体动作】随后坐下。\n【结束画面】坐定。\n【摄影机】侧后方观察。", duration: "5" });
    await db("o_assets2Storyboard").insert({storyboardId:boardId,assetId});
    await db("o_image").insert({id:99881,assetsId:assetId});
    await db("o_assets").where({id:assetId}).update({imageId:99881});
    const baseline = await snapshot();

    for (const body of [
      {}, { kind: "image", action: "generate" }, { kind: "image", action: "generate", source: "  \n\t ", context: "   " },
      { kind: "unknown", action: "generate", source: "有描述" }, { kind: "image", action: "overwrite", source: "有描述" },
      { kind: "image", action: "generate", source: 42 }, { kind: "video", action: "generate", source: "A".repeat(30001) },
      { kind: "storyboard", action: "generate", source: "人物站立。", context: "B".repeat(15001) },
    ]) await assist(body, 400);
    assert.equal(calls.length, 0, "Validation failures must not incur an LLM call");

    for (const kind of ["image", "storyboard", "video"] as const) {
      const source = `SOURCE_${kind}：成年女子在窗边，产品名 OpenAI；原台词“我會等你”。`;
      const result = (await assist({ kind, action: "generate", source, context: `CONTEXT_${kind}：柔和侧光，保持角色原设定。` })).data;
      assert.equal(result.prompt, reply.text); assert.equal(result.language, "zh-CN"); assert.equal(result.generatesMedia, false);
      const request = JSON.stringify(calls.at(-1));
      assert.ok(request.includes(source)); assert.ok(request.includes(`CONTEXT_${kind}`));
      assert.match(request, /默认使用简体中文/); assert.match(request, /原始台词.*中文统一转换为简体字/);
    }

    await assist({kind:"image",action:"generate",imagePurpose:"singleFrontReference",source:"四视图角色设定",context:"素材类型：role\n素材名称：测试角色"});
    assert.match(calls.at(-1).system,/重新生成单人正面全身参考图/);
    assert.match(calls.at(-1).system,/不裁切、不拼接原图/);
    const beforeBoardCalls = calls.length;
    await assist({kind:"image",action:"generate",source:"旧提示词",storyboardId:boardId+100},400);
    await db("o_project").where({id:projectId}).update({userId:2});
    await assist({kind:"image",action:"generate",source:"旧提示词",storyboardId:boardId},400);
    await db("o_project").where({id:projectId}).update({userId:1});
    assert.equal(calls.length,beforeBoardCalls);
    await assist({kind:"image",action:"generate",source:"旧提示词",storyboardId:boardId});
    const frameRequest = calls.at(-1), frame = JSON.parse(frameRequest.messages[0].content).firstFrameContext;
    assert.equal(frame.openingFrame,"站在窗前。");
    assert.equal(frame.laterActionForExclusionOnly,"随后坐下。");
    assert.equal(frame.references[0].referenceNumber,1);
    assert.equal(frame.references[0].id,assetId);
    assert.match(frameRequest.system,/场景参考中的示意人物不得变成新增角色/);
    assert.match(frameRequest.system,/不复制后续运镜/);

    const protocol = "integrated_multimodal_description: [Shot 1] <Picture 1> A woman stands. She says <d>[Chinese] 我會等你。</d>\noverall_soundscape: Wind.\nnon_diegetic_music: N/A";
    reply = { text: "integrated_multimodal_description: [Shot 1] <Picture 1> 女子站立，说<d>[Chinese] 我會等你。</d>\noverall_soundscape: 风声。\nnon_diegetic_music: N/A" };
    const simplified = (await assist({ kind: "video", action: "simplify", source: protocol })).data;
    assert.equal(simplified.prompt, reply.text);
    for (const token of ["integrated_multimodal_description:", "[Shot 1]", "<Picture 1>", "<d>[Chinese] 我會等你。</d>", "overall_soundscape:", "non_diegetic_music: N/A"]) {
      assert.ok(simplified.prompt.includes(token)); assert.ok(JSON.stringify(calls.at(-1)).includes(token));
    }
    assert.match(JSON.stringify(calls.at(-1)), /简体中文/);

    reply = { _output: "备用文本结果：成年女子，灰衣，柔和侧光。" };
    assert.equal((await assist({ kind: "image", action: "generate", source: "成年女子，灰衣。" })).data.prompt, reply._output);
    reply = { text: "边界输入测试的中文结果。" };
    await assist({ kind: "image", action: "generate", source: "A".repeat(30000), context: "B".repeat(15000) });
    const beforeError = calls.length;
    failure = Error("Mock text provider unavailable");
    await assist({ kind: "image", action: "generate", source: "成年女子。" }, 400); failure = null;
    for (const empty of [{ text: "" }, { text: " \n\t " }, {}, { _output: "" }]) {
      reply = empty; await assist({ kind: "image", action: "generate", source: "成年女子。" }, 400);
    }
    assert.equal(calls.length, beforeError + 5);
    assert.equal(mediaCalls, 0);
    assert.deepEqual(await snapshot(), baseline, "Assistance must not save, select, or mutate original project/media/prompt-standard rows");
    console.log("PASS: prompt assist HTTP validation/bounds, simplified Chinese instruction, protocol and dialogue preservation, _output fallback, provider/empty-response failures, no DB mutations and no media generation");
  } finally {
    Object.assign(u.Ai, originals);
    await new Promise<void>(resolve => server.close(() => resolve())); await db.destroy(); process.chdir(root);
    if (originalEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalEnvironment;
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
