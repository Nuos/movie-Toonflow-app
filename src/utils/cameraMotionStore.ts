import { assetSubject, refreshAutomaticSubject, VIDEO_SUBJECT_FALLBACK } from "./automaticSubject";
import { episodeVideoRatio } from "./videoAspectRatio";
import { assetMediaType } from "./assetMediaType";
import { catalogCode } from "./productionCatalog";
import { db } from "./db";
import { CAMERA_VERSION, cameraOptionsSchema, compileCameraVariant, defaultCameraOptions, auditCameraPlan, type CameraOptions, type CameraVariant } from "./cameraMotion";
import { digest, unwrapTemplate, parseH3, compileVideos, compileImages, type SemanticAnchor } from "./promptStandards";
import { characterVoiceContext, withCharacterVoices } from "./characterVoices";
import fs from "node:fs/promises";
import path from "node:path";
import getPath from "./getPath";

export type CameraTarget = "storyboard" | "image" | "video";
export type CameraSelection = { options: CameraOptions; variant: CameraVariant; revision: number; contentHash?: string; sourceContextHash?: string; trackPromptHash?: string };
let ready: Promise<void> | undefined;
export function ensureCameraLibrary() {
  return ready ??= (async () => {
    if (!(await db.schema.hasTable("o_cameraPlan"))) await db.schema.createTable("o_cameraPlan", t => {
      t.increments("id"); t.bigInteger("projectId").notNullable(); t.bigInteger("storyboardId").notNullable();
      t.integer("revision").notNullable(); t.text("data").notNullable(); t.bigInteger("createdAt").notNullable();
      t.unique(["projectId", "storyboardId", "revision"]);
    });
  })().catch(e => { ready = undefined; throw e; });
}

async function context(projectId: number, storyboardId: number, connection: any = db) {
  const project = await connection("o_project").where({ id: projectId }).first();
  const board = await connection("o_storyboard").where({ id: storyboardId, projectId }).first();
  if (!project || !board) throw new Error("分镜不存在或不属于当前项目");
  const track = board.trackId ? await connection("o_videoTrack").where({ id: board.trackId, projectId }).first() : null;
  return { project, board, track };
}
function boardHash(board: any) {
  return digest(JSON.stringify({ videoDesc: board.videoDesc || "", prompt: unwrapTemplate(board.prompt || "", "storyboard"), duration: board.duration, trackId: board.trackId }));
}
function contentHash(board: any, target: CameraTarget) {
  return digest(target === "image" ? unwrapTemplate(board.prompt || "", "storyboard") : board.videoDesc || "");
}
function videoSourceContextHash(board: any) {
  // Capture the actual source, not the selected camera duration: imported and
  // legacy plans may intentionally carry a different duration from the board.
  return digest(JSON.stringify({ duration: board.duration == null || board.duration === "" ? null : String(board.duration), trackId: board.trackId ?? null }));
}
function activeSelection(bundle: any, board: any, target: CameraTarget): CameraSelection | null {
  const selection = bundle?.applied?.[target] as CameraSelection | undefined;
  if (!selection) return null;
  if (target === "video") {
    if (selection.sourceContextHash && selection.sourceContextHash !== videoSourceContextHash(board)) return null;
    // Older snapshots did not store duration context; retain their content-hash
    // compatibility, but never carry an adopted video plan to another track.
    if (bundle.trackId != null && bundle.trackId !== board.trackId) return null;
  }
  if (selection.contentHash) return selection.contentHash === contentHash(board, target) ? selection : null;
  // Compatibility with the initial camera-plan schema; never reactivate a
  // camera after manual edits merely because a new preview was built.
  const current = target === "image" ? unwrapTemplate(board.prompt || "", "storyboard") : board.videoDesc || "";
  const expected = target === "image" ? [selection.variant.imagePrompt] : [selection.variant.storyboardPrompt, selection.options.narrative];
  return expected.includes(current) ? selection : null;
}
function modeForCamera(mode: string): CameraOptions["mode"] {
  let value = mode;
  try { const parsed = JSON.parse(value); value = typeof parsed === "string" ? parsed : "reference"; } catch {}
  if (value.startsWith("[") || value === "reference") return "reference";
  if (value === "startEndRequired" || value === "endFrameOptional") return "startEndRequired";
  if (value === "singleImage" || value === "startFrameOptional") return "singleImage";
  return "text";
}
function selectionForMode(selection: CameraSelection, mode: string): CameraSelection {
  const options = { ...selection.options, mode: modeForCamera(mode) };
  return { ...selection, options, variant: compileCameraVariant(options, selection.variant.motionId) };
}
async function videoSelectionReferences(connection: any, projectId: number, storyboardId: number, selection: CameraSelection): Promise<CameraSelection> {
  // @图N belongs to the storyboard's asset order, not the video's input order.
  // Resolve it to a named semantic constraint before combining camera prose.
  const assets = await connection("o_assets2Storyboard as link")
    .join("o_assets as asset", "asset.id", "link.assetId")
    .where({ "link.storyboardId": storyboardId, "asset.projectId": projectId })
    .orderBy("link.rowid").select("asset.name");
  const resolve = (text: string) => text.replace(/@图\s*(\d+)/gu, (_match, number) => {
    const asset = assets[Number(number) - 1];
    if (!asset) throw new Error(`分镜图片引用@图${number}缺少对应资产，请先在原分镜修正引用后再采用运镜`);
    return `「${asset.name}」`;
  });
  return { ...selection, variant: { ...selection.variant, videoPrompt: resolve(selection.variant.videoPrompt), composition: resolve(selection.variant.composition) } };
}
async function generationContext(connection: any, projectId: number, kind: "storyboard" | "track", targetId: number, project: any, selection?: { id: number; sources: string }[]) {
  const target = await connection(kind === "track" ? "o_videoTrack" : "o_storyboard").where({ projectId, id: targetId }).first();
  const boards = kind === "track" ? await connection("o_storyboard").where({ projectId, trackId: targetId }).orderBy("index") : [target];
  const links = await connection("o_assets2Storyboard").whereIn("storyboardId", boards.map((b: any) => b.id));
  const assetIds = links.map((r: any) => r.assetId);
  const assets = await connection("o_assets").leftJoin("o_image", "o_image.id", "o_assets.imageId").where("o_assets.projectId", projectId)
    .whereIn("o_assets.id", assetIds).select("o_assets.*", "o_image.filePath");
  let mode = project.mode || "text";
  try { const parsed = JSON.parse(mode); mode = typeof parsed === "string" ? parsed : JSON.stringify(parsed); } catch {}
  const model = kind === "track" ? project.videoModel : project.imageModel;
  const references = boards.filter((b: any) => b.filePath).map((b: any) => ({ path: b.filePath, name: `分镜 S${Number(b.index) + 1}`, type: "image" }));
  if (kind === "track" && mode.startsWith("[")) references.unshift(...assets.filter((a: any) => a.filePath).map((a: any) => ({ path: a.filePath, name: a.name, type: assetMediaType(a) })));
  const contextHash = digest(JSON.stringify({ duration: target.duration || null, model, mode, ratio: project.videoRatio, quality: project.imageQuality, references, assetIds }));
  const promptRefs: any[] = [];
  if (kind === "track" && selection) {
    for (const item of selection) {
      const ref = item.sources === "storyboard" ? await connection("o_storyboard").where({ id: item.id, projectId }).first()
        : await connection("o_assets").leftJoin("o_image", "o_image.id", "o_assets.imageId").where({ "o_assets.id": item.id, "o_assets.projectId": projectId }).select("o_assets.*", "o_image.filePath").first();
      if (!ref?.filePath) throw new Error("视频参考素材已删除或尚未生成，请在工作台重新选择参考素材后生成提示词");
      promptRefs.push({ path: ref.filePath, name: ref.name || `分镜${item.id}`, type: assetMediaType(ref) });
    }
  } else promptRefs.push(...references);
  for (const ref of promptRefs) {
    const root = getPath("oss"), dest = path.resolve(root, ref.path.replace(/^[/\\]+/, ""));
    if (!dest.startsWith(root + path.sep)) throw new Error("参考素材路径越界");
    try { await fs.access(dest); } catch { throw new Error(`参考素材不可读取：${ref.name}，请重新选择参考素材`); }
  }
  const frozen: any[] = [];
  for (const ref of references) {
    const root = getPath("oss"), dest = path.resolve(root, ref.path.replace(/^[/\\]+/, ""));
    if (!dest.startsWith(root + path.sep)) throw new Error("参考素材路径越界");
    try { frozen.push({ ...ref, sha256: digest(await fs.readFile(dest)) }); }
    catch { throw new Error(`参考素材不可读取：${ref.name}，请更新参考图后重试`); }
  }
  return { automaticSubject: assetSubject(assets, kind === "track" ? VIDEO_SUBJECT_FALLBACK : target.prompt || target.videoDesc || ""), contextHash, model, mode, references: frozen, promptRefs, duration: Number(target.duration) || 5 };
}
async function latest(projectId: number, storyboardId: number, connection: any = db): Promise<any | null> {
  const row = await connection("o_cameraPlan").where({ projectId, storyboardId }).orderBy("revision", "desc").first();
  return row ? { ...JSON.parse(row.data), revision: row.revision } : null;
}
async function insertRevision(connection: any, bundle: any) {
  const last = await latest(bundle.projectId, bundle.storyboardId, connection);
  const revision = (last?.revision || 0) + 1;
  await connection("o_cameraPlan").insert({ projectId: bundle.projectId, storyboardId: bundle.storyboardId, revision, data: JSON.stringify({ ...bundle, revision }), createdAt: Date.now() });
  return { ...bundle, revision };
}
export async function listCameraBoards(projectId: number) {
  await ensureCameraLibrary();
  if (!(await db("o_project").where({ id: projectId }).first())) throw new Error("项目不存在");
  const boards = await db("o_storyboard").leftJoin("o_script", "o_script.id", "o_storyboard.scriptId").where("o_storyboard.projectId", projectId)
    .select("o_storyboard.*", "o_script.name as episode").orderBy("o_storyboard.scriptId").orderBy("o_storyboard.index").orderBy("o_storyboard.id");
  const rows = await db("o_cameraPlan").where({ projectId }).orderBy("revision", "desc");
  const plans = new Map<number, any>();
  for (const row of rows) if (!plans.has(row.storyboardId)) plans.set(row.storyboardId, { ...JSON.parse(row.data), revision: row.revision });
  return boards.map(board => {
    const plan = plans.get(board.id);
    return { ...board, hasImage: !!board.filePath, revision: plan?.revision || 0, selected: plan?.selected || null, applied: plan?.applied || {}, sourceChanged: !!plan && plan.currentHash !== boardHash(board) };
  });
}
export async function getCameraPlan(projectId: number, storyboardId: number) {
  await ensureCameraLibrary();
  const { board, project, track } = await context(projectId, storyboardId);
  project.videoRatio = await episodeVideoRatio(projectId, board.scriptId, project.videoRatio || "16:9");
  const bundle = await latest(projectId, storyboardId);
  const defaults = defaultCameraOptions({ ...board, prompt: unwrapTemplate(board.prompt || "", "storyboard") }, project);
  return { bundle, board: {...board, code: catalogCode(projectId, "storyboard", board.id)}, project: { id: project.id, name: project.name, videoModel: project.videoModel, mode: project.mode, videoRatio: project.videoRatio, artStyle: project.artStyle }, track, defaults, options: bundle?.options || defaults,
    sourceChanged: !!bundle && bundle.currentHash !== boardHash(board), preview: board.filePath || null };
}
export async function buildCameraPlan(projectId: number, storyboardId: number, input: { options?: Partial<CameraOptions>; motionIds?: string[]; reset?: boolean; revision?: number } = {}) {
  await ensureCameraLibrary();
  const { board, project, track } = await context(projectId, storyboardId);
  const old = await latest(projectId, storyboardId);
  if (input.revision != null && input.revision !== (old?.revision || 0)) throw new Error("运镜方案已更新，请刷新后重试");
  if (old && old.currentHash !== boardHash(board) && !input.reset) throw new Error("分镜内容已修改，请先从当前分镜重建，避免覆盖新内容");
  const defaults = defaultCameraOptions({ ...board, prompt: unwrapTemplate(board.prompt || "", "storyboard") }, project);
  const options = cameraOptionsSchema.parse({ ...defaults, ...(!input.reset ? old?.options : {}), ...input.options });
  const motionIds = [...new Set<string>(input.motionIds || old?.variants?.map((v: CameraVariant) => v.motionId) || ["static", "push_in", "truck_right"])];
  if (!motionIds.length || motionIds.length > 12) throw new Error("请选择 1 至 12 个运镜方案");
  const variants = motionIds.map(id => compileCameraVariant(options, id));
  const bundle = { version: CAMERA_VERSION, projectId, storyboardId, trackId: board.trackId, options, variants,
    source: !input.reset && old ? old.source : { videoDesc: board.videoDesc || "", imagePrompt: board.prompt || "", trackPrompt: track?.prompt || "" },
    sourceHash: !input.reset && old ? old.sourceHash : boardHash(board), currentHash: boardHash(board),
    trackHash: digest(track?.prompt || ""), applied: old?.applied || {}, selected: variants.some(v => v.id === old?.selected) ? old.selected : null };
  return db.transaction(async trx => {
    const now = await latest(projectId, storyboardId, trx);
    if ((now?.revision || 0) !== (old?.revision || 0)) throw new Error("运镜方案已更新，请刷新后重试");
    const current = await context(projectId, storyboardId, trx);
    if (boardHash(current.board) !== boardHash(board)) throw new Error("分镜内容已修改，请刷新后重试");
    return insertRevision(trx, bundle);
  });
}
export async function getAppliedCameraPlan(projectId: number, storyboardId: number, target: CameraTarget): Promise<CameraSelection | null> {
  await ensureCameraLibrary();
  const board = await db("o_storyboard").where({ id: storyboardId, projectId }).first();
  return board ? activeSelection(await latest(projectId, storyboardId), board, target) : null;
}

function sourceNarrative(prompt: string) {
  const source = unwrapTemplate(prompt || "", "track");
  const fields = parseH3(source);
  return { fields, narrative: fields.detailed_description || fields.integrated_multimodal_description || source };
}
function replaceNarrative(fields: Record<string, string>, narrative: string) {
  if (!Object.keys(fields).length) return narrative;
  const key = fields.detailed_description != null ? "detailed_description" : "integrated_multimodal_description";
  return Object.entries({ ...fields, [key]: narrative }).map(([k, v]) => `${k}: ${v}`).join("\n\n");
}
async function composeTrackSource(connection: any, projectId: number, trackId: number, rawPrompt: string, replacements: Map<number, CameraSelection>, mode: string) {
  const boards = await connection("o_storyboard").where({ projectId, trackId }).orderBy("index").orderBy("id");
  const { fields, narrative } = sourceNarrative(rawPrompt);
  let segments: string[] = [];
  let styleIntro = "";
  if (boards.length > 1 && narrative.trim()) {
    let shotBody = narrative;
    const firstMarker = /\[Shot\s*\d+\]/i.exec(narrative);
    if ((fields.detailed_description != null || fields.integrated_multimodal_description != null) && firstMarker?.index) {
      styleIntro = narrative.slice(0, firstMarker.index).trim();
      shotBody = narrative.slice(firstMarker.index);
    }
    const marked = shotBody.split(/(?=\[Shot\s*\d+\])/i).map(s => s.trim()).filter(Boolean);
    if (marked.length === boards.length && marked.every((s, i) => Number(s.match(/^\[Shot\s*(\d+)\]/i)?.[1]) === i + 1)) segments = marked.map(s => s.replace(/^\[Shot\s*\d+\]\s*/i, ""));
    else {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const rawBoards = boards.map((b: any) => b.videoDesc || "").join("\n\n");
      if (!rawBoards.trim() || normalize(narrative.replace(/^\[Shot\s*1\]\s*/i, "")) !== normalize(rawBoards)) throw new Error("多镜轨道的现有提示词无法可靠对应每个分镜。请先在工作台按完整分镜生成视频提示词，再套用运镜；原提示词已保留。");
    }
  }
  const texts: string[] = [];
  for (let i = 0; i < boards.length; i++) {
    const board = boards[i];
    const saved = activeSelection(await latest(projectId, board.id, connection), board, "video");
    const candidate = replacements.get(board.id) || (saved ? selectionForMode(saved, mode) : null);
    const selected = candidate ? await videoSelectionReferences(connection, projectId, board.id, candidate) : null;
    texts.push(`[Shot ${i + 1}] ${selected ? selected.variant.videoPrompt : segments[i] || board.videoDesc || board.prompt || ""}`);
  }
  return replaceNarrative(fields, [styleIntro, ...texts].filter(Boolean).join("\n\n"));
}
export async function getCameraPromptGenerationSnapshot(projectId: number, trackId: number, mode: string) {
  await ensureCameraLibrary();
  const track = await db("o_videoTrack").where({ id: trackId, projectId }).first();
  if (!track) throw new Error("视频轨道不存在或不属于当前项目");
  const boards = await db("o_storyboard").where({ projectId, trackId }).orderBy("index").orderBy("id");
  const snapshots: { id: number; index: number | null; videoDesc: string | null; prompt: string | null; duration: string | number | null; selection: CameraSelection | null }[] = [];
  for (const board of boards) {
    const bundle = await latest(projectId, board.id);
    const selection = activeSelection(bundle, board, "video");
    snapshots.push({ id: board.id, index: board.index, videoDesc: board.videoDesc, prompt: board.prompt, duration: board.duration,
      selection: selection ? selectionForMode(selection, mode) : null });
  }
  const selections = snapshots.flatMap(b => b.selection ? [b.selection] : []);
  if (selections.length && track.prompt && !selections.some(s => s.trackPromptHash === digest(track.prompt))) {
    const row = await db.schema.hasTable("o_promptStandard") ? await db("o_promptStandard").where({ projectId, kind: "track", targetId: trackId }).orderBy("revision", "desc").first() : null;
    const standard = row ? JSON.parse(row.data) : null;
    if (!standard?.cameraPlan || !standard.variants?.some((v: any) => v.prompt === track.prompt)) {
      for (const board of snapshots) board.selection = null;
    }
  }
  return { projectId, trackId, duration: track.duration, mode, boards: snapshots };
}
export async function cameraTrackContext(projectId: number, trackId: number, basePrompt: string, mode: string) {
  const snapshot = await getCameraPromptGenerationSnapshot(projectId, trackId, mode);
  const selections = await Promise.all(snapshot.boards.filter(b => b.selection).map(b => videoSelectionReferences(db, projectId, b.id, b.selection!)));
  if (!selections.length) return null;
  return { source: await composeTrackSource(db, projectId, trackId, basePrompt, new Map(), mode), selections };
}
export function cameraAnchor(anchor: SemanticAnchor, selections: CameraSelection[], kind: "storyboard" | "track"): SemanticAnchor {
  return { ...anchor,
    composition: selections.map(s => s.variant.composition).join("\n"),
    allowedChanges: kind === "storyboard" ? "使用本次选定镜头的机位、景别、构图和对焦；既有参考图仅约束人物身份、服装、材质和风格。" : "逐镜执行已选运镜路线、景别与轴线；只允许同一动作内微调节奏，保留全部对白、事件顺序和结果。",
  };
}
export function cameraImageVariants(anchor: SemanticAnchor, prompt: string) {
  return compileImages(anchor, prompt, 0).map(v => ({ ...v, prompt: v.prompt.replace("严格复用基准构图、主体比例和外观；保留原有细节分布。", "严格执行本次选定的镜头构图、主体比例和外观；参考图仅用于身份、服装、材质和风格。") }));
}
async function updateExistingStandard(connection: any, projectId: number, kind: "storyboard" | "track", targetId: number, prompt: string, selections: CameraSelection[], project: any, duration: number, voiceContext: string) {
  if (!(await connection.schema.hasTable("o_promptStandard"))) return;
  const row = await connection("o_promptStandard").where({ projectId, kind, targetId }).orderBy("revision", "desc").first();
  if (!row) return;
  const old = JSON.parse(row.data);
  const current = await generationContext(connection, projectId, kind, targetId, project, old.referenceSelection);
  const anchor = cameraAnchor(refreshAutomaticSubject(old.anchor, old, current.automaticSubject), selections, kind);
  const variants = kind === "storyboard" ? cameraImageVariants(anchor, prompt) : compileVideos(anchor, prompt, duration, current.mode, current.promptRefs, current.model || "").map(v => ({ ...v, prompt: withCharacterVoices(v.prompt, voiceContext) }));
  const currentSource = kind === "track" ? (await connection("o_storyboard").where({ projectId, trackId: targetId }).orderBy("index")).map((b: any) => b.videoDesc).filter(Boolean).join("\n\n") || prompt : prompt;
  const data = { ...old, ...current, automaticSubject: anchor.subject === current.automaticSubject ? current.automaticSubject : undefined, anchor, source: prompt, sourceHash: digest(currentSource), variants, cameraPlan: { selections, referenceRole: "identity" } };
  await connection("o_promptStandard").insert({ projectId, kind, targetId, revision: row.revision + 1, data: JSON.stringify(data), createdAt: Date.now() });
}
export async function auditStoredCameraPlan(projectId: number, storyboardId: number, input: { options?: Partial<CameraOptions>; motionId?: string; variantId?: string } = {}) {
  const { bundle, defaults, board } = await getCameraPlan(projectId, storyboardId);
  const options = cameraOptionsSchema.parse({ ...defaults, ...bundle?.options, ...input.options });
  const previousBoard = await db("o_storyboard").where({ projectId, scriptId: board.scriptId }).where("index", "<", board.index ?? 0).orderBy("index", "desc").first();
  const previous = previousBoard ? activeSelection(await latest(projectId, previousBoard.id), previousBoard, "storyboard")?.options : undefined;
  const motionId = input.motionId || bundle?.variants?.find((v: CameraVariant) => v.id === input.variantId)?.motionId || bundle?.variants?.[0]?.motionId || "static";
  return auditCameraPlan(options, motionId, previous);
}
export async function applyCameraPlan(projectId: number, storyboardId: number, revision: number, variantId: string, targets: CameraTarget[]) {
  await ensureCameraLibrary();
  const initial = await context(projectId, storyboardId);
  const voices = initial.track ? await characterVoiceContext(db, projectId, initial.track.id) : "";
  return db.transaction(async trx => {
    const { board, project, track } = await context(projectId, storyboardId, trx);
    const bundle = await latest(projectId, storyboardId, trx);
    if (!bundle || bundle.revision !== revision) throw new Error("运镜方案已更新，请刷新后重试");
    if (bundle.currentHash !== boardHash(board)) throw new Error("分镜内容已修改，请从当前分镜重建方案");
    const variant = bundle.variants.find((v: CameraVariant) => v.id === variantId) as CameraVariant | undefined;
    if (!variant) throw new Error("运镜方案不存在");
    const audit = auditCameraPlan(bundle.options, variant.motionId);
    if (audit.status === "blocked") throw new Error("运镜方案存在阻断项，请先根据审计建议修正");
    const selection: CameraSelection = { options: bundle.options, variant, revision };
    let videoSelection = selection;
    const updates: Record<string, any> = {};
    if (targets.includes("storyboard")) { updates.videoDesc = variant.storyboardPrompt; updates.duration = String(bundle.options.duration); }
    if (targets.includes("image")) updates.prompt = variant.imagePrompt;
    let videoPrompt: string | null = null;
    let videoSource = "";
    if (targets.includes("video")) {
      if (!track) throw new Error("当前分镜没有视频轨道");
      if (digest(track.prompt || "") !== bundle.trackHash) throw new Error("视频轨道提示词已修改，请重建运镜方案后再套用");
      if (!targets.includes("storyboard") && Number(board.duration) > 0 && Number(board.duration) !== bundle.options.duration) throw new Error("方案时长与当前分镜不一致，请同时套用分镜以同步时长");
      videoSelection = selectionForMode(selection, project.mode || "text");
      videoSource = await composeTrackSource(trx, projectId, track.id, track.prompt || "", new Map([[storyboardId, videoSelection]]), project.mode || "text");
    }
    if (Object.keys(updates).length) await trx("o_storyboard").where({ id: storyboardId, projectId }).update(updates);
    if (targets.includes("storyboard") && track) {
      const siblings = await trx("o_storyboard").where({ projectId, trackId: track.id }).select("duration");
      const duration = siblings.reduce((sum: number, b: any) => sum + (Number(b.duration) || 0), 0);
      if (duration !== Number(track.duration)) await trx("o_videoTrack").where({ id: track.id, projectId }).update({ duration });
    }
    if (targets.includes("image")) await updateExistingStandard(trx, projectId, "storyboard", storyboardId, variant.imagePrompt, [selection], project, bundle.options.duration, voices);
    if (targets.includes("video") && track) {
      const source = videoSource;
      const boards = await trx("o_storyboard").where({ projectId, trackId: track.id }).orderBy("index").orderBy("id");
      const duration = boards.reduce((sum: number, b: any) => sum + (Number(b.duration) || 0), 0) || bundle.options.duration;
      const anchor: SemanticAnchor = { subject: "严格保留逐镜正文中的全部人物、动作、对白与道具。", style: project.artStyle || "沿用项目和参考素材的视觉风格。", composition: "遵循逐镜构图。", continuity: "人物身份、服饰与场景布局连续；空间轴线按逐镜方案执行。", allowedChanges: "仅按已选镜头方案调整摄影。", exclusions: "新增人物、台词、剧情、字幕、水印。" };
      const selections: CameraSelection[] = [];
      for (const b of boards) { const selected = b.id === storyboardId ? videoSelection : activeSelection(await latest(projectId, b.id, trx), b, "video"); if (selected) selections.push(await videoSelectionReferences(trx, projectId, b.id, selectionForMode(selected, project.mode || "text"))); }
      const standard = await trx.schema.hasTable("o_promptStandard") ? await trx("o_promptStandard").where({ projectId, kind: "track", targetId: track.id }).orderBy("revision", "desc").first() : null;
      const old = standard ? JSON.parse(standard.data) : null;
      const current = await generationContext(trx, projectId, "track", track.id, project, old?.referenceSelection);
      if (old) {
        const refsKey = (refs: any[]) => JSON.stringify(refs.map(r => ({ path: r.path, name: r.name, type: r.type })));
        if (refsKey(old.promptRefs || old.references || []) !== refsKey(current.promptRefs)) throw new Error("视频参考素材或顺序已改变，请先在工作台按当前参考重新生成完整提示词，再套用运镜");
      }
      videoPrompt = withCharacterVoices(compileVideos(cameraAnchor(refreshAutomaticSubject(old?.anchor || anchor, old, current.automaticSubject), selections, "track"), source, duration, current.mode, current.promptRefs, current.model || "")[0].prompt, voices);
      await trx("o_videoTrack").where({ id: track.id, projectId }).update({ prompt: videoPrompt, duration, state: "已完成", reason: null });
      await updateExistingStandard(trx, projectId, "track", track.id, source, selections, project, duration, voices);
    }
    const currentBoard = { ...board, ...updates };
    const applied = { ...bundle.applied };
    for (const target of targets) applied[target] = { ...(target === "video" ? videoSelection : selection), contentHash: contentHash(currentBoard, target), ...(target === "video" ? { sourceContextHash: videoSourceContextHash(currentBoard), trackPromptHash: digest(videoPrompt || "") } : {}) };
    const saved = await insertRevision(trx, { ...bundle, selected: variantId, applied, currentHash: boardHash(currentBoard), trackHash: digest(videoPrompt ?? track?.prompt ?? "") });
    return { bundle: saved, targets, storyboardId, trackId: track?.id || null, videoPrompt, generationMode: targets.includes("video") ? project.mode || "text" : null, generatesMedia: false };
  });
}
