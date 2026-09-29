import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CAMERA_MOVES } from "../src/utils/cameraMotion";
import { H3_CAMERA_RECIPES, H3_CAMERA_SOURCE, h3CameraGenerationRules } from "../src/utils/h3CameraRecipes";

const get = (id: string) => {
  const item = H3_CAMERA_RECIPES.find(recipe => recipe.id === id);
  assert.ok(item, id);
  return item;
};

test("all fifteen source recipes have pinned provenance and explicitly lack local render validation", () => {
  assert.equal(H3_CAMERA_RECIPES.length, 15);
  assert.equal(new Set(H3_CAMERA_RECIPES.map(recipe => recipe.id)).size, 15);
  assert.equal(H3_CAMERA_SOURCE.commit, "8609642953b083891129569b09ecbcc54adbaaa2");
  const knownMotions = new Set(CAMERA_MOVES.map(move => move.id));
  for (const recipe of H3_CAMERA_RECIPES) {
    assert.equal(recipe.sourceEvidence, "source_reported");
    assert.equal(recipe.localRendered, false);
    assert.ok(recipe.sourceUrl.startsWith(`https://github.com/Nuos/minimaxh3-shots-skills/blob/${H3_CAMERA_SOURCE.commit}/`));
    assert.ok(recipe.sourceUrl.endsWith(`/shots/${recipe.id}.md`));
    assert.ok(recipe.opening && recipe.instruction && recipe.sourceReportedStatus);
    assert.ok(recipe.requirements.length > 0 && recipe.limitations.length > 0);
    for (const id of recipe.motionIds) assert.ok(knownMotions.has(id), `${recipe.id}: unknown related motion ${id}`);
  }
  assert.ok(!H3_CAMERA_RECIPES.some(recipe => recipe.id === "bullet-time"));
});

test("H3 conditioning is opt-in by model and preserves source data", () => {
  const before = structuredClone(H3_CAMERA_RECIPES);
  for (const model of [undefined, "", "wan2.6", "seedance-2.0", "MiniMax-Hailuo-02"]) assert.equal(h3CameraGenerationRules(model), "");
  for (const model of ["H3", "MiniMax-H3", "comfyui-h3:local"]) {
    const rules = h3CameraGenerationRules(model);
    assert.match(rules, /【H3 摄影配方适配】/u);
    for (const recipe of H3_CAMERA_RECIPES) assert.ok(rules.includes(`${recipe.id}：`), recipe.id);
    assert.match(rules, /sourceEvidence=source_reported，localRendered=false/u);
    assert.match(rules, /不把来源自报通过当作本地验证/u);
  }
  assert.deepEqual(H3_CAMERA_RECIPES, before);
});

test("existing dolly_zoom maps only to the weaker telephoto direction and never reverses its primitives", () => {
  const wide = get("dolly-zoom"), telephoto = get("dolly-zoom-telephoto");
  assert.deepEqual(wide.primitives, ["Push In", "Zoom Out"]);
  assert.deepEqual(telephoto.primitives, ["Pull Out", "Zoom In"]);
  assert.ok(!wide.motionIds.includes("dolly_zoom"));
  assert.deepEqual(telephoto.motionIds, ["dolly_zoom"]);
  assert.equal(telephoto.sourceReportedStatus, "rendered-weak-evidence");
  assert.match(telephoto.limitations.join(" "), /身份参考图.*证据较弱/u);
  assert.match(h3CameraGenerationRules("H3"), /dolly_zoom.*dolly-zoom-telephoto：Pull Out \+ Zoom In，绝不可反转为 Push In \+ Zoom Out/u);
});

test("movement, geometry and layout prerequisites cannot manufacture story actions or subjects", () => {
  assert.match(get("super-dolly-in").requirements.join(" "), /近前景/u);
  assert.match(get("super-dolly-in").limitations.join(" "), /不能.*增加树木/u);
  assert.match(get("crane-rise").requirements.join(" "), /原故事已经有跑动/u);
  assert.match(get("crane-rise").limitations.join(" "), /不得给静止人物添加跑步/u);
  assert.match(get("handheld").requirements.join(" "), /故事已有跑动/u);
  assert.match(get("handheld").limitations.join(" "), /不等于 handheld_breath/u);
  assert.match(get("rack-focus").requirements.join(" "), /既有两个深度层/u);
  assert.match(get("rack-focus").limitations.join(" "), /不得复制新增人物或素材/u);
  assert.equal(get("split-screen").selectionPolicy, "explicit_only");
  assert.match(get("split-screen").requirements.join(" "), /明确授权.*不能自动新增/u);
  assert.match(get("split-screen").limitations.join(" "), /不能把普通 \[Shot 1\]/u);
});

test("nearby moves are not treated as interchangeable named effects", () => {
  assert.equal(get("eyes-in").selectionPolicy, "explicit_only");
  assert.match(get("eyes-in").limitations.join(" "), /普通推近不得自动变成钻眼/u);
  assert.equal(get("yoyo-zoom").selectionPolicy, "explicit_only");
  assert.match(get("yoyo-zoom").limitations.join(" "), /不能把单次/u);
  assert.deepEqual(get("snorricam").motionIds, []);
  assert.match(get("snorricam").limitations.join(" "), /不等于普通 tracking_front/u);
  assert.deepEqual(get("dutch-angle").motionIds, []);
  assert.match(get("dutch-angle").limitations.join(" "), /不等于静态 angle_dutch/u);
  assert.match(get("orbit-360").limitations.join(" "), /不能把 arc_left.*有限航拍弧移扩成整周/u);
});

test("generation rules keep real modes and timing authority while distinguishing observations from parameters", () => {
  const rules = h3CameraGenerationRules("h3");
  assert.match(rules, /不能强制改成 Ref2VA/u);
  assert.match(rules, /不增加、删除、重新排序图片/u);
  assert.match(rules, /正文默认简体中文.*模型专用字段名.*中文对白统一使用简体字/u);
  assert.match(rules, /15 个配方.*特定参考模式与工作流测试/u);
  assert.match(rules, /20 steps、124\/192 frames.*特定工作流观察.*不是普适硬参数/u);
  assert.match(rules, /不要修改步数、帧数、采样器、时长或参考模式/u);
  assert.match(rules, /bullet time 尝试未成功，只记录限制/u);
  assert.match(rules, /人物保持.*自然呼吸或眨眼.*不给无生命物体添加呼吸/u);
  assert.match(rules, /不承诺.*毫秒级事件/u);
  assert.ok(rules.length < 13000, `H3 summary unexpectedly verbose: ${rules.length}`);
});

test("MIT attribution accompanies the adapted source material", () => {
  const notice = fs.readFileSync(path.resolve(__dirname, "../docs/third-party/h3-shots-LICENSE"), "utf8");
  assert.match(notice, /Copyright \(c\) 2026 Loop Forge/u);
  assert.match(notice, /Permission is hereby granted, free of charge/u);
  assert.match(notice, /THE SOFTWARE IS PROVIDED "AS IS"/u);
  assert.ok(notice.includes(H3_CAMERA_SOURCE.commit));
});
