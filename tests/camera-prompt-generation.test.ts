import test from "node:test";
import assert from "node:assert/strict";
import { CAMERA_MOVES, CAMERA_TEMPLATES, cameraOptionsSchema, compileCameraVariant } from "../src/utils/cameraMotion";
import {
  cameraPromptGenerationSystem,
  formatCameraPromptGenerationContext,
  withCameraPromptContext,
  validateCameraGeneratedPrompt,
  type CameraPromptGenerationSnapshot,
} from "../src/utils/cameraPromptGeneration";

function snapshot(): CameraPromptGenerationSnapshot {
  return {
    projectId: 31, trackId: 72, duration: 10, mode: "text",
    boards: [
      { id: 102, index: 1, videoDesc: '男子进门，说：“我回来了。”', prompt: "男子位于门边，女子在窗旁。", duration: "5", selection: null },
      { id: 101, index: 0, videoDesc: '女子在窗边持信，说：“我会等你。”', prompt: "女子在窗边双手拿信。", duration: "5", selection: null },
    ],
  };
}
function payload(context: string) {
  return JSON.parse(context.slice(context.indexOf("{\n")));
}

test("unquoted source narration and dialogue cannot disappear from a generated action shot", () => {
  const input = snapshot();
  input.boards = [{id:101,index:0,duration:12,selection:null,videoDesc:"【原剧情与台词】旁白（冷静）：第9999次失败。\n△男子收回手掌。\n男子：我还要继续。\n\n【结束画面】目光停在山顶。"}];
  const context = formatCameraPromptGenerationContext(input);
  assert.throws(() => validateCameraGeneratedPrompt("[Shot 1] 男子收回手掌，说：我还要继续。", context), /遗漏.*第9999次失败/);
  assert.throws(() => validateCameraGeneratedPrompt("[Shot 1] 旁白：第9999次失败。男子收回手掌。", context), /遗漏.*我还要继续/);
  assert.doesNotThrow(() => validateCameraGeneratedPrompt("[Shot 1] 旁白：第9999次失败。男子收回手掌，说：我还要继续。", context));
});

test("generation system keeps model-specific fields and language while adding compact current camera capabilities", () => {
  const base = "Return H3 fields scene_description and detailed_description in English; preserve all Chinese dialogue.";
  const system = cameraPromptGenerationSystem(base);
  assert.ok(system.startsWith(base));
  assert.match(system, /【运镜生成规则】/u);
  assert.ok(system.includes(`主运镜能力摘要：${CAMERA_MOVES.length} 项`));
  assert.ok(system.includes(`场景模板摘要：${CAMERA_TEMPLATES.length} 项`));
  for (const move of CAMERA_MOVES) {
    assert.ok(system.includes(`${move.id}=${move.name}`), move.id);
    assert.ok(!system.includes(move.path), `${move.id}: copied the entire preset instead of a capability summary`);
  }
  assert.match(system, /正文默认使用简体中文.*优先于专用模板中的英文正文要求/u);
  assert.match(system, /台词保留原意与顺序，中文台词统一使用简体字/u);
  assert.match(system, /\[Shot 1\].*\[Shot N\]/u);
  assert.match(system, /每镜恰好一次/u);
  assert.match(system, /selectionMode=applied_video.*硬约束/u);
  assert.match(system, /逐镜独立决定/u);
  assert.match(system, /static 固定观察/u);
  assert.match(system, /成片效果仍未验证/u);
  assert.ok(system.length < 12000);
});

test("text mode with no selected references still supplies every shot and exact dialogue in source order", () => {
  const input = snapshot(), before = structuredClone(input);
  const data = payload(formatCameraPromptGenerationContext(input));
  assert.equal(data.outputShotCount, 2);
  assert.equal(data.targetDuration, 10);
  assert.equal(data.mode, "text");
  assert.deepEqual(data.referenceSelection, []);
  assert.deepEqual(data.shots.map((shot: any) => [shot.shot, shot.storyboardId, shot.selectionMode]), [[1, 101, "auto"], [2, 102, "auto"]]);
  assert.equal(data.shots[0].story.narrative, '女子在窗边持信，说：“我会等你。”');
  assert.equal(data.shots[1].story.narrative, '男子进门，说：“我回来了。”');
  assert.ok(data.shots.every((shot: any) => !Object.hasOwn(shot, "camera")));
  assert.deepEqual(input, before);
});

test("reference subset and input order are independent from the complete chronological shot list", () => {
  const input = snapshot(); input.mode = '["imageReference:9","audioReference:4"]';
  input.boards.push({ id: 103, index: 1, videoDesc: "女子点头。", duration: 2, selection: null });
  const refs = [{ id: 999, sources: "assets" }, { id: 102, sources: "storyboard" }];
  const data = payload(formatCameraPromptGenerationContext(input, refs));
  assert.deepEqual(data.referenceSelection, refs);
  assert.deepEqual(data.shots.map((shot: any) => shot.storyboardId), [101, 102, 103]);
  assert.equal(data.mode, input.mode);
  assert.equal(data.outputShotCount, 3);
});

test("only an explicitly valid adopted video selection becomes hard camera data", () => {
  const input = snapshot();
  const options = cameraOptionsSchema.parse({
    narrative: input.boards[1].videoDesc, openingFrame: "女子在窗边持信。", endingFrame: "女子抬眼，信仍在双手间。",
    subjectAction: '她握住信纸，说：“我会等你。”', duration: 5, shotSize: "近景", angle: "平视",
    focus: "女子眼睛清晰。", amplitude: "轻微靠近，停在脸和信纸均可见的位置。", axisSide: "A侧", continuity: "服饰与信纸持物手保持。",
  });
  input.boards[1].selection = { revision: 4, options, variant: compileCameraVariant(options, "push_in") };
  const extra = input.boards[0] as any;
  extra.bundle = { selected: "orbit_full_fast", variants: [{ motionId: "orbit_full_fast" }] };
  const before = structuredClone(input);
  const data = payload(formatCameraPromptGenerationContext(input));
  assert.equal(data.shots[0].selectionMode, "applied_video");
  assert.equal(data.shots[0].camera.motionId, "push_in");
  assert.equal(data.shots[0].camera.duration, 5);
  assert.equal(data.shots[0].camera.revision, 4);
  assert.equal(data.shots[0].camera.subjectAction, options.subjectAction);
  assert.equal(data.shots[0].camera.focus, options.focus);
  assert.equal(data.shots[0].camera.axisSide, "A侧");
  assert.equal(data.shots[1].selectionMode, "auto");
  assert.ok(!Object.hasOwn(data.shots[1], "camera"));
  assert.deepEqual(input, before);
});

test("skill summary excludes long content and personal curation while retaining knowledge-only boundaries", () => {
  const skills = [
    { id: "static", label: "固定观察", domain: "movement" as const, mechanism: "fixed" as const, motionId: "static", knowledgeOnly: false },
    { id: "focus_rack", label: "转焦", domain: "optics" as const, mechanism: "focus" as const, motionId: null, knowledgeOnly: false, notes: "PRIVATE_NOTE", favorite: true, usage: "LONG_FULL_SKILL" },
    { id: "bullet_time", label: "子弹时间", domain: "movement" as const, mechanism: "temporal" as const, motionId: null, knowledgeOnly: true },
  ];
  const context = formatCameraPromptGenerationContext(snapshot(), [], skills), data = payload(context);
  assert.equal(data.capabilities.skillCount, 3);
  assert.equal(data.capabilities.motionCount, CAMERA_MOVES.length);
  assert.equal(data.capabilities.templateCount, CAMERA_TEMPLATES.length);
  assert.deepEqual(data.capabilities.supportSkills.map((skill: any) => skill.id), ["focus_rack", "bullet_time"]);
  assert.equal(data.capabilities.supportSkills[1].knowledgeOnly, true);
  assert.doesNotMatch(context, /PRIVATE_NOTE|LONG_FULL_SKILL|favorite/u);
});

test("null-index ordering matches database order and invalid adopted selections fail without silent replacement", () => {
  const input = snapshot(); input.boards.push({ id: 111, index: null, videoDesc: "开场空镜。", selection: null });
  assert.deepEqual(payload(formatCameraPromptGenerationContext(input)).shots.map((shot: any) => shot.storyboardId), [111, 101, 102]);
  input.boards.push({ ...input.boards[0] });
  assert.throws(() => formatCameraPromptGenerationContext(input), /重复或无效分镜/u);
  const invalid = snapshot();
  invalid.boards[0].selection = { revision: 1, options: cameraOptionsSchema.parse({}), variant: { motionId: "deleted_motion" } as any };
  assert.throws(() => formatCameraPromptGenerationContext(invalid), /已采用运镜已不可用/u);
});

test("camera context composition preserves existing model, story and voice input exactly", () => {
  const content = "模型 H3\n角色音色：低沉男声。\n原话：“我回来了。”";
  const context = formatCameraPromptGenerationContext(snapshot());
  assert.equal(withCameraPromptContext(content, context), `${content}\n\n${context}`);
  assert.equal(withCameraPromptContext(content, ""), content);
});
