import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
const Database = require("better-sqlite3");

async function main() {
  const root = process.cwd(), temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-camera-skills-"));
  await fs.chmod(temp, 0o700); await fs.mkdir(path.join(temp, "data"));
  const original = new Database(path.join(root, "data/db2.sqlite"), { readonly: true });
  await original.backup(path.join(temp, "data/db2.sqlite")); original.close();
  await fs.copyFile(path.join(root, "package.json"), path.join(temp, "package.json"));
  process.chdir(temp); process.env.NODE_ENV = "prod";
  await import("../src/utils");
  const { db } = await import("../src/utils/db");
  const { CAMERA_MOVES, compileCameraVariant, defaultCameraOptions } = await import("../src/utils/cameraMotion");
  const { cameraSkillOptionsSchema, CAMERA_SOURCE_INDEX } = await import("../src/utils/cameraSkillLibrary");
  const { default: router } = await import("../src/extensions/cameraStudio");
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { const id = req.headers["x-fixture-user"] || "998801"; if (id !== "none") (req as any).user = { id: Number(id) }; next(); });
  app.use("/api/cameraStudio", router); app.use(express.static(path.join(root, "data/web")));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  async function request(endpoint = "", body?: any, status = 200, user = "998801") {
    const response = await fetch(`${base}/api/cameraStudio/skills${endpoint}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "x-fixture-user": user }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const json: any = await response.json(); assert.equal(response.status, status, JSON.stringify(json)); return json.data;
  }
  try {
    const initial = await request();
    assert.deepEqual(initial.domains.map((d: any) => d.id), ["shot_size", "angle", "movement", "optics", "transition", "performance"]);
    assert.equal(initial.skills.filter((s: any) => s.motionId).length, CAMERA_MOVES.length);
    assert.ok(initial.skills.some((s: any) => s.motionId === null));
    for (const domain of initial.domains) assert.ok(initial.skills.some((s: any) => s.domain === domain.id), `missing domain coverage: ${domain.id}`);
    const ids = new Set(initial.skills.map((s: any) => s.id));
    const chapterSource = CAMERA_SOURCE_INDEX.find(s => s.id === "VhTxVGw0Cms")!;
    assert.equal(chapterSource.entries.length, 40);
    assert.deepEqual(chapterSource.entries.map(e => e.index), Array.from({ length: 40 }, (_, i) => i + 1));
    for (const entry of chapterSource.entries) {
      assert.ok(entry.skillIds.length, `unmapped source chapter ${entry.index}`);
      assert.ok(entry.skillIds.every(id => ids.has(id)), `unknown skill in source chapter ${entry.index}`);
      const seconds = entry.timestamp.split(":").reduce((total, value) => total * 60 + Number(value), 0);
      for (const id of entry.skillIds) assert.ok(initial.skills.find((s: any) => s.id === id).sources.some((s: any) => s.url === `${chapterSource.url}&t=${seconds}` && s.label.includes(entry.title)));
    }
    for (const skill of initial.skills) {
      assert.equal(skill.builtin, true); assert.equal(skill.favorite, false); assert.equal(skill.hidden, false);
      assert.ok(skill.prerequisites.length && skill.applicable.length && skill.avoid.length && skill.inputs.length && skill.risks.length && skill.usage);
      assert.ok(initial.domains.some((d: any) => d.id === skill.domain));
      assert.ok(initial.mechanisms.some((m: any) => m.id === skill.mechanism && m.domains.includes(skill.domain)));
      assert.ok(skill.combinations.every((id: string) => ids.has(id)));
      assert.deepEqual(skill.changedFields, Object.keys(skill.options));
      cameraSkillOptionsSchema.parse(skill.options);
      assert.equal(skill.knowledgeOnly, skill.motionId === null && !Object.keys(skill.options).length);
    }
    for (const id of ["bullet_time", "performance_emotion", "transition_match", "angle_selfie_reference"]) {
      const skill = initial.skills.find((s: any) => s.id === id);
      assert.equal(skill.knowledgeOnly, true); assert.equal(skill.motionId, null); assert.deepEqual(skill.options, {});
    }
    assert.equal(initial.skills.find((s: any) => s.id === "focus_rack").motionId, null);
    assert.equal(initial.skills.find((s: any) => s.id === "handheld_breath").options.stability, "轻微手持呼吸");
    assert.ok(initial.skills.filter((s: any) => s.motionId).every((s: any) => !Object.hasOwn(s.options, "duration")));
    assert.equal(initial.skills.find((s: any) => s.id === "fpv_flythrough").mechanism, "flythrough");
    for (const id of ["whip_pan_right", "whip_pan_left", "push_in_fast", "orbit_full_fast", "snap_zoom_in", "drone_dive"]) assert.equal(initial.skills.find((s: any) => s.id === id).options.speed, "快速启动后减速停稳");
    assert.equal(initial.skills.find((s: any) => s.id === "zoom_out").domain, "optics");
    assert.equal(initial.skills.find((s: any) => s.id === "lens_fisheye").motionId, null);
    assert.equal(initial.skills.find((s: any) => s.id === "focus_reveal").options.focus, "对焦揭示：已指定主体由虚焦变为清晰。");
    await request("", undefined, 400, "none");
    const favored = await request("/preference", { id: "push_in", favorite: true, hidden: true, group: " 对话镜头 ", notes: "微表情先停留，再靠近。" });
    assert.equal(favored.favorite, true); assert.equal(favored.group, "对话镜头");
    assert.ok((await request()).groups.includes("对话镜头"));
    const otherUser = await request("", undefined, 200, "998802");
    assert.equal(otherUser.skills.find((s: any) => s.id === "push_in").favorite, false); assert.deepEqual(otherUser.groups, []);
    const stored = JSON.parse((await db("o_cameraSkillSettings").where({ userId: 998801 }).first()).data);
    assert.equal(stored.preferences.push_in.notes, "微表情先停留，再靠近。");
    assert.equal(initial.skills.find((s: any) => s.id === "push_in").favorite, false);
    await request("/preference", { id: "push_in", group: "", hidden: false });
    const cleared = await request(); assert.ok(!cleared.groups.includes("对话镜头")); assert.equal(cleared.skills.find((s: any) => s.id === "push_in").favorite, true);
    await request("/preference", { id: "not_a_skill", favorite: true }, 400);
    await request("/preference", { id: "static" }, 400);
    await request("/preference", { id: "static", notes: "x".repeat(5001) }, 400);
    await request("/preference", { id: "static", favorite: true, userId: 998802 }, 400);
    await request("/delete", { id: "static" }, 400);
    await request("/save", { id: "static", label: "修改内建", motionId: "static" }, 400);
    await request("/save", { label: "未知运镜", motionId: "teleport" }, 400);
    await request("/save", { label: "错误分类", motionId: "push_in", domain: "angle", mechanism: "translation" }, 400);
    await request("/save", { label: "错误运动类型", motionId: "push_in", mechanism: "fixed" }, 400);
    await request("/save", { label: "不能改表演", motionId: "static", domain: "performance" }, 400);
    for (const protectedField of ["narrative", "openingFrame", "endingFrame", "subjectAction", "unknown"]) await request("/save", { label: "不能改剧情", motionId: "push_in", options: { [protectedField]: "覆盖原稿" } }, 400);
    await request("/save", { label: "不安全来源", motionId: "static", sources: [{ label: "bad", url: "javascript:alert(1)" }] }, 400);
    await request("/save", { label: "未知组合", motionId: "static", combinations: ["not_a_skill"] }, 400);
    const custom = await request("/save", { label: "缓推反应练习", motionId: "push_in", options: { shotSize: "中近景", focus: "人物眼睛保持清晰。", duration: 6 }, tags: ["反应"], prerequisites: ["角色反应已明确"], usage: "先读眼神再靠近。", combinations: ["focus_rack"] });
    assert.match(custom.id, /^custom:/); assert.equal(custom.builtin, false); assert.equal(custom.motionId, "push_in");
    assert.deepEqual(custom.changedFields.sort(), ["duration", "focus", "shotSize"]);
    const camera = defaultCameraOptions({ videoDesc: "保留原台词。", prompt: "保留原始画面。" });
    const merged = { ...camera, ...custom.options };
    const prompt = compileCameraVariant(merged, custom.motionId);
    assert.ok(prompt.videoPrompt.includes("保留原台词。")); assert.ok(prompt.imagePrompt.includes("保留原始画面。"));
    const focusSkill = initial.skills.find((s: any) => s.id === "focus_reveal");
    const focusPrompt = compileCameraVariant({ ...camera, endingFrame: "保留原始画面。", ...focusSkill.options }, "static");
    assert.ok(focusPrompt.imagePrompt.includes("虚焦")); assert.ok(focusPrompt.endImagePrompt.includes("清晰"));
    const bare = await request("/save", { label: "仅选择主运镜", motionId: "zoom_in" });
    assert.equal(bare.domain, "optics"); assert.deepEqual(bare.options, {}); assert.deepEqual(bare.changedFields, []);
    await request("/preference", { id: custom.id, favorite: true, group: "自订反应", notes: "不要改动剧情原文" });
    const updated = await request("/save", { id: custom.id, label: "缓推反应练习 v2", motionId: "push_in", options: custom.options, combinations: ["focus_rack"] });
    assert.equal(updated.favorite, true); assert.equal(updated.group, "自订反应"); assert.equal(updated.notes, "不要改动剧情原文");
    assert.ok(!(await request("", undefined, 200, "998802")).skills.some((s: any) => s.id === custom.id));
    await request("/save", { id: custom.id, label: "跨用户修改", motionId: "static" }, 400, "998802");
    await request("/preference", { id: custom.id, favorite: true }, 400, "998802");
    await request("/delete", { id: custom.id }, 400, "998802");
    const dependent = await request("/save", { label: "组合引用", motionId: "static", combinations: [custom.id] });
    await request("/delete", { id: custom.id }, 400);
    await request("/save", { id: dependent.id, label: "自身引用", motionId: "static", combinations: [dependent.id] }, 400);
    await Promise.all([request("/preference", { id: "static", favorite: true }), request("/preference", { id: "static", group: "并发保存" })]);
    const concurrent = (await request()).skills.find((s: any) => s.id === "static"); assert.equal(concurrent.favorite, true); assert.equal(concurrent.group, "并发保存");
    await request("/delete", { id: dependent.id }); await request("/delete", { id: custom.id }); await request("/delete", { id: bare.id });
    const afterDelete = await request(); assert.ok(!afterDelete.skills.some((s: any) => s.id === custom.id)); assert.ok(!afterDelete.groups.includes("自订反应"));
    assert.equal(afterDelete.skills.length, initial.skills.length);
    console.log(`PASS: ${initial.skills.length} camera skills / ${CAMERA_MOVES.length} motion presets / ${chapterSource.entries.length} mapped source chapters; classification, metadata, references, user isolation, persistent preferences, strict photographic patches, custom CRUD, protected builtins, concurrent preference updates; zero inference`);
    if (process.argv.includes("--serve")) { console.log(`UI_TEST_URL=${base}/camera-studio.html`); await new Promise<void>(resolve => process.once("SIGTERM", resolve)); }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); await db.destroy(); process.chdir(root); await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
