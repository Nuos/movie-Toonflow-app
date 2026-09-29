import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMERA_MOVES,
  auditCameraPlan,
  cameraOptionsSchema,
  compileCameraVariant,
  defaultCameraOptions,
  type CameraOptions,
} from "../src/utils/cameraMotion";

function plan(overrides: Partial<CameraOptions> = {}): CameraOptions {
  return cameraOptionsSchema.parse({
    narrative: "女子读到信上的落款后抬眼，看向门口。",
    openingFrame: "窗边女子双手拿着信纸，门框在右后方，脸与信纸均在画面内。",
    endingFrame: "女子抬眼看向右后方的门口，信纸仍握在双手中。",
    subjectAction: "女子读完落款，抬眼并握紧信纸。",
    purpose: "读清她认出落款后的反应和视线目标。",
    shotSize: "中景",
    angle: "平视",
    lens: "50mm 自然视角参考",
    focus: "女子的眼睛清晰，信纸形状可辨。",
    lighting: "窗光从人物左侧照入。",
    duration: 8,
    continuity: "同一女子、灰色外套、双手持信，窗与门位置不变。",
    stability: "稳定支撑",
    ...overrides,
  });
}

const issueCodes = (options: CameraOptions, motionId: string, previous?: CameraOptions) =>
  auditCameraPlan(options, motionId, previous).issues.map(issue => issue.code);

test("a fixed camera allows a moving subject and never claims the generated footage has been verified", () => {
  const options = plan({ subjectAction: "女子从画面左侧走向右侧，双手握着信纸。", screenDirection: "画面左向右" });
  const variant = compileCameraVariant(options, "static");
  assert.equal(variant.audit.status, "ready");
  assert.equal(variant.audit.renderedStatus, "unverified");
  assert.ok(variant.videoPrompt.includes(options.subjectAction));
  assert.equal(variant.audit.checks.find(check => check.name === "成片运动已观看验证")?.passed, false);
});

test("a fixed camera can rack focus without creating a camera movement conflict", () => {
  const options = plan({ focus: "焦点从前景的信纸转移到女子的眼睛。" });
  const variant = compileCameraVariant(options, "static");
  assert.equal(variant.audit.status, "ready");
  assert.ok(variant.videoPrompt.includes(options.focus));
  assert.doesNotMatch(variant.imagePrompt, /转移|rack\s*focus/iu);
  assert.doesNotMatch(variant.endImagePrompt, /转移|rack\s*focus/iu);
});

test("fixed-camera alternatives omit shared movement speed and amplitude instructions", () => {
  const variant = compileCameraVariant(plan({ speed: "先停留再平稳移动", amplitude: "小幅向前移动" }), "static");
  assert.doesNotMatch(variant.cameraInstruction, /平稳移动|向前移动|完成主要运动/u);
  assert.match(variant.cameraInstruction, /摄影机持续保持/u);
});

test("rack focus retains different initial and final focal targets in its two stills", () => {
  const variant = compileCameraVariant(plan({ focus: "焦点从前景的信纸转移到女子的眼睛。" }), "static");
  assert.match(variant.imagePrompt, /(?:信纸[^。\n]{0,24}(?:清晰|清楚|焦点)|(?:焦点|清晰)[^。\n]{0,24}信纸)/u);
  assert.match(variant.endImagePrompt, /(?:眼睛[^。\n]{0,24}(?:清晰|清楚|焦点)|(?:焦点|清晰)[^。\n]{0,24}眼睛)/u);
});

test("follow-focus instructions remain in video, while the still expresses only the focal state", () => {
  const options = plan({ focus: "女子眼睛清晰，焦点随距离平稳调整。" });
  const variant = compileCameraVariant(options, "push_in");
  assert.ok(variant.videoPrompt.includes(options.focus));
  assert.doesNotMatch(variant.imagePrompt, /随距离|平稳调整/u);
  assert.match(variant.imagePrompt, /眼睛.*清晰|清晰.*眼睛/u);
});

test("dolly zoom is a valid coupled movement and does not imply an unspecified axis crossing", () => {
  const options = plan({ duration: 8, axisSide: "未标注" });
  const variant = compileCameraVariant(options, "dolly_zoom");
  assert.equal(variant.audit.status, "ready", JSON.stringify(variant.audit.issues));
  assert.match(variant.cameraInstruction, /后退/u);
  assert.match(variant.cameraInstruction, /焦距/u);
  assert.match(variant.cameraInstruction, /主体大小大致保持/u);
});

test("every motion preset keeps its motion path and duration out of its generated still, retaining optical visual intent", () => {
  const options = plan({ axisSide: "A侧", axisReason: "由窗框连接两端构图，空间转换保持可读。" });
  for (const move of CAMERA_MOVES) {
    const variant = compileCameraVariant(options, move.id);
    for (const still of [variant.imagePrompt, variant.endImagePrompt]) {
      assert.ok(!still.includes(move.path), `${move.id} copied its temporal camera path into a still`);
      assert.doesNotMatch(still, /总时长|先建立起始画面|完成主要运动/u);
      assert.ok(still.includes(options.lens), `${move.id} lost its selected lens intent`);
      assert.match(still, /视觉参考/u);
      assert.ok(still.includes(options.continuity), `${move.id} lost continuity anchors`);
    }
  }
});

test("an explicit ending close-up is not contradicted by a repeated opening wide-shot label", () => {
  const options = plan({
    shotSize: "全景",
    openingFrame: "全景，女子全身站在窗边，双手拿信。",
    endingFrame: "女子眼睛的大特写，画面只容纳双眼与眉间。",
  });
  const variant = compileCameraVariant(options, "push_in");
  assert.match(variant.imagePrompt, /全景/u);
  assert.match(variant.endImagePrompt, /大特写/u);
  assert.doesNotMatch(variant.endImagePrompt, /全景/u);
});

test("a camera movement pasted into a still is flagged without silently changing the user's text", () => {
  const options = plan({ openingFrame: "镜头缓慢推进，然后女子抬眼看向门口。" });
  const before = structuredClone(options);
  const audit = auditCameraPlan(options, "push_in");
  assert.ok(audit.issues.some(issue => issue.code === "image_has_timeline"));
  assert.equal(audit.checks.find(check => check.name === "静态图不含时间过程")?.passed, false);
  assert.deepEqual(options, before);
});

test("a doll named Dolly in a static image is not mistaken for a dolly camera instruction", () => {
  const options = plan({ openingFrame: "A woman holds a doll named Dolly beside a closed window." });
  assert.ok(!issueCodes(options, "static").includes("image_has_timeline"));
});

test("an unexplained axis crossing and lateral direction reversal are actionable warnings", () => {
  const previous = plan({ axisSide: "A侧", screenDirection: "画面左向右" });
  const next = plan({ axisSide: "B侧", screenDirection: "画面右向左" });
  const audit = auditCameraPlan(next, "static", previous);
  assert.equal(audit.status, "needs_review");
  for (const code of ["axis_crossing", "direction_reversal"]) {
    const issue = audit.issues.find(entry => entry.code === code);
    assert.equal(issue?.severity, "warning");
    assert.ok(issue?.message);
    assert.ok(issue?.suggestion);
  }
});

test("a documented visible crossing or neutral camera provides a legal continuity transition", () => {
  const previous = plan({ axisSide: "A侧", screenDirection: "画面左向右" });
  const explained = plan({ axisSide: "B侧", screenDirection: "画面右向左", axisReason: "前镜连续展示摄影机越过人物轴线，再在 B 侧落稳。" });
  assert.ok(!issueCodes(explained, "static", previous).includes("axis_crossing"));
  assert.ok(!issueCodes(explained, "static", previous).includes("direction_reversal"));
  assert.ok(!issueCodes(plan({ axisSide: "B侧" }), "static", plan({ axisSide: "中性机位" })).includes("axis_crossing"));
});

test("missing opening imagery blocks the plan even when the narrative and camera settings are complete", () => {
  const audit = auditCameraPlan(plan({ openingFrame: "   " }), "push_in");
  assert.equal(audit.status, "blocked");
  assert.equal(audit.issues.find(issue => issue.code === "opening_missing")?.severity, "error");
});

test("a missing ending is required for a moving plan and is an error for required first/last-frame mode", () => {
  assert.ok(issueCodes(plan({ endingFrame: "" }), "push_in").includes("ending_missing"));
  assert.ok(!issueCodes(plan({ endingFrame: "" }), "static").includes("ending_missing"));
  const audit = auditCameraPlan(plan({ endingFrame: "", mode: "startEndRequired" }), "static");
  assert.equal(audit.status, "blocked");
  assert.ok(audit.issues.some(issue => issue.code === "end_reference_missing"));
});

test("short action shots are blocked while historical options remain readable", () => {
  for (const duration of [2, 7, 8.5, 16, 121]) assert.equal(auditCameraPlan(plan({duration}), "static").status, "blocked");
  const short = auditCameraPlan(plan({ duration: 2 }), "push_in");
  assert.equal(short.status, "blocked");
  assert.equal(short.issues.find(issue => issue.code === "duration_short")?.severity, "warning");
  assert.ok(!issueCodes(plan({ duration: 8 }), "push_in").includes("duration_short"));
  for (const duration of [0, -1, NaN, Infinity]) {
    assert.equal(cameraOptionsSchema.safeParse({ ...plan(), duration }).success, false);
  }
});

test("compilation and neighboring-shot audit preserve all caller inputs and are deterministic", () => {
  const options = plan({ narrative: "  女子读信，台词：我记得你。  " });
  const previous = plan({ axisSide: "A侧" });
  const original = structuredClone(options);
  const oldPrevious = structuredClone(previous);
  Object.freeze(options);
  Object.freeze(previous);
  const first = compileCameraVariant(options, "push_in");
  auditCameraPlan(options, "push_in", previous);
  assert.deepEqual(compileCameraVariant(options, "push_in"), first);
  assert.deepEqual(options, original);
  assert.deepEqual(previous, oldPrevious);
  assert.ok(first.storyboardPrompt.includes("我记得你。"));
  assert.ok(first.videoPrompt.includes("我记得你。"));
});

test("virtual movement remains selectable with declared anchors and intent", () => {
  const options = plan({ axisReason: "穿过信纸进入往事，开头和结尾以同一印章为视觉锚点。", duration: 8 });
  const variant = compileCameraVariant(options, "virtual_pass");
  assert.equal(variant.audit.status, "ready");
  assert.match(variant.cameraInstruction, /virtual/u);
  assert.equal(variant.audit.renderedStatus, "unverified");
});

test("legacy boards keep existing text and get safe defaults without mutating persistence objects", () => {
  const board = { prompt: "原始图片描述", videoDesc: "原始动作描述", duration: "not-a-duration" };
  const before = structuredClone(board);
  const defaults = defaultCameraOptions(board, { mode: '["imageReference:9"]' });
  assert.equal(defaults.openingFrame, board.prompt);
  assert.equal(defaults.narrative, board.videoDesc);
  assert.equal(defaults.duration, 10);
  assert.equal(defaults.mode, "reference");
  assert.deepEqual(board, before);
});

test("unknown motion IDs fail explicitly instead of silently selecting a different camera", () => {
  assert.throws(() => compileCameraVariant(plan(), "invented_move"), /未知运镜方案/u);
  assert.throws(() => auditCameraPlan(plan(), "invented_move"), /未知运镜方案/u);
});

test("first-person flythrough asks for an explicit route and preserves physical openings once supplied", () => {
  const incomplete = auditCameraPlan(plan({ amplitude: "", duration: 8 }), "fpv_flythrough");
  const issue = incomplete.issues.find(issue => issue.code === "fpv_route_missing");
  assert.equal(issue?.severity, "warning");
  assert.match(issue?.suggestion || "", /路线|门洞|地标/u);
  const options = plan({ amplitude: "从门洞进入廊下，在两根柱子之间左转，保留头顶净空，停在窗前。", duration: 8 });
  const complete = compileCameraVariant(options, "fpv_flythrough");
  assert.ok(!complete.audit.issues.some(issue => issue.code === "fpv_route_missing"));
  assert.ok(complete.videoPrompt.includes(options.amplitude));
  assert.match(complete.cameraInstruction, /真实开口/u);
  assert.equal(complete.audit.renderedStatus, "unverified");
});

test("right whip pan warns on slow tempo and supports a fast move with readable endpoints without inventing a cut", () => {
  const slow = auditCameraPlan(plan({ speed: "缓慢，起止平顺" }), "whip_pan_right");
  assert.equal(slow.issues.find(issue => issue.code === "whip_speed_conflict")?.severity, "warning");
  const fast = compileCameraVariant(plan({ speed: "快速启动后减速停稳" }), "whip_pan_right");
  assert.ok(!fast.audit.issues.some(issue => issue.code === "whip_speed_conflict"));
  assert.match(fast.cameraInstruction, /向右/u);
  assert.match(fast.cameraInstruction, /结束主体/u);
  assert.match(fast.cameraInstruction, /一镜内完成，不自动切换场景/u);
});

test("catalog motion IDs and paths stay distinct while every movement produces an unverified variant", () => {
  assert.equal(new Set(CAMERA_MOVES.map(move => move.id)).size, CAMERA_MOVES.length);
  assert.equal(new Set(CAMERA_MOVES.map(move => move.path)).size, CAMERA_MOVES.length);
  for (const move of CAMERA_MOVES) {
    assert.match(move.id, /^[a-z][a-z0-9_]+$/u);
    assert.ok(move.risk.length > 0);
    assert.ok(Number.isFinite(move.minDuration) && move.minDuration > 0);
    const variant = compileCameraVariant(plan(), move.id);
    assert.equal(variant.audit.renderedStatus, "unverified");
    assert.ok(variant.cameraInstruction.includes(move.path));
  }
});

test("front, rear and parallel tracking preserve different subject-camera relations", () => {
  const options = plan({ subjectAction: "女子沿廊道向前走。", amplitude: "沿廊道从门口走到窗前，摄影机保持同侧和距离。" });
  const front = compileCameraVariant(options, "tracking_front");
  const back = compileCameraVariant(options, "tracking_back");
  const side = compileCameraVariant(options, "tracking_side");
  assert.match(front.cameraInstruction, /主体前方.*倒退领拍/u);
  assert.match(back.cameraInstruction, /后方.*背面.*同速前进/u);
  assert.match(side.cameraInstruction, /同一侧.*平行路线.*同速移动/u);
  for (const variant of [front, back, side]) {
    assert.ok(variant.videoPrompt.includes(options.subjectAction));
    assert.doesNotMatch(variant.imagePrompt, /倒退领拍|同速前进|同速移动/u);
  }
});

test("expanded flight and walking paths require a route while top-down rotation requires angle and extent", () => {
  for (const id of ["drone_flyover", "drone_reveal_rise", "drone_dive", "pov_walk", "tracking_front", "tracking_back", "tracking_side", "topdown_follow"]) {
    assert.ok(issueCodes(plan({ amplitude: "" }), id).includes("movement_route_missing"), id);
    assert.ok(!issueCodes(plan({ amplitude: "沿门口至窗前的路线，避开柱子，在窗前停留。" }), id).includes("movement_route_missing"), id);
  }
  const missing = issueCodes(plan({ angle: "平视", amplitude: "" }), "topdown_rotate");
  assert.ok(missing.includes("topdown_view_conflict"));
  assert.ok(missing.includes("rotation_extent_missing"));
  const corrected = compileCameraVariant(plan({ angle: "顶视", amplitude: "顺时针旋转小幅角度，以窗沿作为地面方向参照。" }), "topdown_rotate");
  assert.ok(!corrected.audit.issues.some(issue => issue.code === "topdown_view_conflict" || issue.code === "rotation_extent_missing"));
  assert.match(corrected.cameraInstruction, /机位、俯视轴与焦距保持/u);
  assert.match(corrected.cameraInstruction, /沿光轴.*滚转/u);
  assert.match(corrected.cameraInstruction, /不沿圆周绕行/u);
});

test("half and full orbits require a visible axis transition even if their starting side is known", () => {
  for (const id of ["orbit_half", "orbit_full_fast"]) {
    const incomplete = plan({ axisSide: "A侧", amplitude: "向右围绕主体，结束时停稳。", duration: 10, speed: "快速启动后减速停稳" });
    assert.ok(issueCodes(incomplete, id).includes("wide_orbit_axis"), id);
    const complete = { ...incomplete, axisReason: "连续显示越过人物轴线，以窗和门作为背景地标，再在结束方位停稳。" };
    assert.ok(!issueCodes(complete, id).includes("wide_orbit_axis"), id);
    assert.ok(!issueCodes(complete, id).includes("axis_unspecified"), id);
  }
  assert.ok(issueCodes(plan({ amplitude: "向右有限弧移" }), "drone_orbit").includes("axis_unspecified"));
  assert.ok(!issueCodes(plan({ axisSide: "A侧", amplitude: "在 A 侧向右有限弧移" }), "drone_orbit").includes("axis_unspecified"));
});

test("intrinsically rapid moves warn about slow pacing and subtle performance even with a slow speed field", () => {
  for (const id of ["push_in_fast", "orbit_full_fast", "snap_zoom_in", "drone_dive", "whip_pan_left", "whip_pan_right"]) {
    const slow = issueCodes(plan({ speed: "缓慢，起止平顺", purpose: "读清人物细微的眼神变化。" }), id);
    assert.ok(slow.includes(id.startsWith("whip_") ? "whip_speed_conflict" : "rapid_speed_conflict"), id);
    assert.ok(slow.includes("readability"), id);
    const fast = issueCodes(plan({ speed: "快速启动后减速停稳" }), id);
    assert.ok(!fast.includes("rapid_speed_conflict") && !fast.includes("whip_speed_conflict"), id);
  }
  const left = compileCameraVariant(plan({ speed: "快速启动后减速停稳" }), "whip_pan_left");
  assert.match(left.cameraInstruction, /向左甩摇/u);
  assert.match(left.cameraInstruction, /一镜内完成，不自动切换场景/u);
});

test("microscopic and cosmic moves require virtual anchors without claiming ordinary optical zoom", () => {
  for (const id of ["macro_dive", "cosmic_dive"]) {
    assert.equal(CAMERA_MOVES.find(move => move.id === id)?.virtual, true);
    assert.ok(issueCodes(plan({ axisReason: "" }), id).includes("virtual_anchors"), id);
    assert.ok(issueCodes(plan({ openingFrame: "", axisReason: "用同一形状连接尺度层级" }), id).includes("virtual_anchors"), id);
    const options = plan({ duration: 12, axisReason: "各尺度层级以同一红色环形地标衔接，两端指向相同地点。" });
    const variant = compileCameraVariant(options, id);
    assert.ok(!variant.audit.issues.some(issue => issue.code === "virtual_anchors"), id);
    assert.match(variant.cameraInstruction, /virtual/u);
    assert.doesNotMatch(variant.endImagePrompt, /尾帧采用变焦后的视角/u);
    assert.equal(variant.audit.renderedStatus, "unverified");
  }
});

test("only focal-length-changing moves label the selected lens as an opening reference in the ending still", () => {
  for (const id of ["zoom_in", "zoom_out", "snap_zoom_in", "dolly_zoom"]) {
    const variant = compileCameraVariant(plan(), id);
    assert.match(variant.endImagePrompt, /起始参考；尾帧采用变焦后的视角/u);
    assert.doesNotMatch(variant.imagePrompt, /起始参考；尾帧采用变焦后的视角/u);
  }
  for (const id of ["push_in_fast", "cosmic_dive", "macro_dive", "topdown_rotate"]) {
    assert.doesNotMatch(compileCameraVariant(plan(), id).endImagePrompt, /尾帧采用变焦后的视角/u);
  }
  const wide = compileCameraVariant(plan(), "zoom_out");
  assert.match(wide.cameraInstruction, /焦距由长变短/u);
  assert.match(wide.cameraInstruction, /位置与朝向保持/u);
  assert.ok(issueCodes(plan({ openingFrame: "camera zoom out from a woman beside the window" }), "zoom_out").includes("image_has_timeline"));
});

test("a defocus-to-focus skill gives separate still states and keeps the temporal change in video", () => {
  const options = plan({ focus: "对焦揭示：窗边女子由虚焦变为清晰。" });
  const variant = compileCameraVariant(options, "static");
  assert.match(variant.imagePrompt, /窗边女子处于虚焦状态/u);
  assert.match(variant.endImagePrompt, /窗边女子清晰/u);
  for (const still of [variant.imagePrompt, variant.endImagePrompt]) assert.doesNotMatch(still, /由虚焦变为清晰/u);
  assert.ok(variant.videoPrompt.includes(options.focus));
  assert.equal(variant.audit.status, "ready");
});


test("分镜默认设置保留明确景别并排除空值占位文本", () => {
 const o = defaultCameraOptions({videoDesc:"人物读信。景别：大特写。运镜：缓推。台词：等我。",prompt:"null"});
 assert.equal(o.shotSize,"大特写"); assert.equal(o.openingFrame,"");
 const p=compileCameraVariant(o,"static").videoPrompt;
 assert.ok(p.includes("台词：等我。")); assert.ok(!p.includes("运镜：缓推")); assert.ok(!p.includes("。。"));
});
