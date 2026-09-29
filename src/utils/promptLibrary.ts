import { episodeVideoRatio } from "./videoAspectRatio";
import { assetSubject, refreshAutomaticSubject, VIDEO_SUBJECT_FALLBACK } from "./automaticSubject";
import { assetMediaType } from "./assetMediaType";
import { db } from "./db";
import { characterVoiceContext, ensureCharacterVoiceColumn, withCharacterVoices } from "./characterVoices";
import getPath from "./getPath";
import fs from "node:fs/promises";
import path from "node:path";
import { STANDARD_VERSION, TEMPLATE_GROUPS, anchorText, compileImages, compileVideos, digest, stableSeed, validateVariants, unwrapTemplate, SemanticAnchor, TargetKind } from "./promptStandards";
import { getAppliedCameraPlan, cameraTrackContext, cameraAnchor, cameraImageVariants } from "./cameraMotionStore";

let ready: Promise<void> | undefined;
export function ensurePromptLibrary() {
  return ready ??= (async () => {
    await ensureCharacterVoiceColumn(db);
    if (!(await db.schema.hasTable("o_promptStandard"))) await db.schema.createTable("o_promptStandard", t => {
      t.increments("id"); t.bigInteger("projectId").notNullable(); t.string("kind").notNullable(); t.bigInteger("targetId").notNullable();
      t.integer("revision").notNullable(); t.text("data").notNullable(); t.bigInteger("createdAt").notNullable();
      t.unique(["projectId", "kind", "targetId", "revision"]);
    });
    if (!(await db.schema.hasTable("o_generationRecipe"))) await db.schema.createTable("o_generationRecipe", t => {
      t.string("id").primary(); t.bigInteger("projectId"); t.string("kind"); t.bigInteger("targetId");
      t.string("model"); t.string("state"); t.text("filePath"); t.text("data"); t.bigInteger("createdAt");
    });
  })();
}

export function mediaPath(file: string) {
  const root = getPath("oss");
  const dest = path.resolve(root, file.replace(/^[/\\]+/, ""));
  if (!dest.startsWith(root + path.sep)) throw new Error("素材路径越界");
  return dest;
}
export async function referenceData(file: string) {
  const bytes = await fs.readFile(mediaPath(file));
  // Existing OSS sometimes stores PNG bytes with a .jpg name; sniff real image type.
  const mime = bytes[0] === 137 && bytes[1] === 80 ? "image/png" : bytes.toString("ascii", 0, 4) === "RIFF" ? "image/webp" : "image/jpeg";
  return { type: "image" as const, base64: `data:${mime};base64,${bytes.toString("base64")}` };
}

export async function targetContext(projectId: number, kind: TargetKind, targetId: number) {
  const project = await db("o_project").where("id", projectId).first();
  if (!project) throw new Error("项目不存在");
  const table = kind === "asset" ? "o_assets" : kind === "storyboard" ? "o_storyboard" : "o_videoTrack";
  const target = await db(table).where({ id: targetId, projectId }).first();
  if (!target) throw new Error("目标不属于当前项目或已删除");
  if (kind !== "asset") project.videoRatio = await episodeVideoRatio(projectId, (target as any).scriptId, project.videoRatio || "16:9");
  const boards = kind === "track" ? await db("o_storyboard").where({ trackId: targetId, projectId }).orderBy("index") : kind === "storyboard" ? [target] : [];
  const assetIds = kind === "asset" ? [targetId] : (await db("o_assets2Storyboard").whereIn("storyboardId", boards.map(b => b.id))).map(r => r.assetId);
  const assets = await db("o_assets").leftJoin("o_image", "o_image.id", "o_assets.imageId").where("o_assets.projectId", projectId)
    .whereIn("o_assets.id", assetIds).select("o_assets.*", "o_image.filePath");
  const source = kind === "asset" ? (target.prompt || target.describe || target.name) : kind === "storyboard" ? (target.prompt || target.videoDesc) : boards.map(b => b.videoDesc).filter(Boolean).join("\n\n") || target.prompt || "";
  let mode = project.mode || "text";
  try { const p = JSON.parse(mode); mode = typeof p === "string" ? p : JSON.stringify(p); } catch {}
  const references: {path: string; name: string; type: string}[] = kind === "asset" ? assets.filter(a => a.filePath).map(a => ({ path: a.filePath, name: a.name, type: assetMediaType(a) })) : boards.filter(b => b.filePath).map(b => ({ path: b.filePath, name: `分镜 S${Number(b.index)+1}`, type: "image" }));
  if (kind === "track" && mode.startsWith("[")) references.unshift(...assets.filter(a => a.filePath).map(a => ({ path: a.filePath, name: a.name, type: assetMediaType(a) })));
  const missing = assets.filter(a => !a.filePath).map(a => a.name);
  const contextHash = digest(JSON.stringify({ duration: target.duration || null, model: kind === "track" ? project.videoModel : project.imageModel, mode, ratio: project.videoRatio, quality: project.imageQuality, references, assetIds }));
  return { project, target, boards, assets, source, mode, references, missing, contextHash };
}

export async function latestStandard(projectId: number, kind: TargetKind, targetId: number) {
  await ensurePromptLibrary();
  const row = await db("o_promptStandard").where({ projectId, kind, targetId }).orderBy("revision", "desc").first();
  return row ? { ...JSON.parse(row.data), revision: row.revision } : null;
}

// Optional enrichment must never turn an already-saved legacy operation into a
// failed response. Surface incomplete source data in the prompt panel instead.
export async function tryBuildStandard(projectId: number, kind: TargetKind, targetId: number, options: Parameters<typeof buildStandard>[3] = {}) {
  try { return { bundle: await buildStandard(projectId, kind, targetId, options), error: "" }; }
  catch (e: any) { return { bundle: null, error: e.message || "提示词方案待补充" }; }
}

export async function ensureAssetBaselines(projectId: number, ids: number[], model?: string) {
  const previous = new Map<number, number | null>();
  // Finish all preflight reads before a caller replaces any selected image.
  for (const id of ids) {
    const ctx = await targetContext(projectId, "asset", id);
    previous.set(id, ctx.target.imageId ?? null);
    // Preserve rollback identity only. Creating an auxiliary proposal/baseline
    // belongs to its explicit UI action, not a prerequisite of original generation.
  }
  return previous;
}

export async function buildStandard(projectId: number, kind: TargetKind, targetId: number, options: { anchor?: SemanticAnchor; selected?: string; basePrompt?: string; model?: string; mode?: string; info?: {id: number; sources: string}[]; preserveGeneratedBody?: boolean; reset?: boolean } = {}) {
  await ensurePromptLibrary();
  const ctx = await targetContext(projectId, kind, targetId);
  const old = await latestStandard(projectId, kind, targetId);
  const { target, project, assets } = ctx;
  const incoming = options.basePrompt || ctx.source;
  let source = unwrapTemplate(old?.variants.some((v: any) => v.prompt === incoming) ? old.source : incoming, kind);
  const imageCamera = kind === "storyboard" ? await getAppliedCameraPlan(projectId, targetId, "image") : null;
  const videoCamera = kind === "track" ? await cameraTrackContext(projectId, targetId, source, options.mode || ctx.mode) : null;
  if (videoCamera && !options.preserveGeneratedBody) source = videoCamera.source;
  if (!source.trim()) throw new Error("请先填写镜头描述或提示词，再建立三组方案");
  const staleCamera = !!old?.cameraPlan && !imageCamera && !videoCamera;
  const videoSubjectFallback = VIDEO_SUBJECT_FALLBACK;
  const automaticSubject = kind === "asset" ? `${target.name}：${target.describe || target.prompt}` : assetSubject(assets, kind === "track" ? videoSubjectFallback : source);
  let anchor: SemanticAnchor = options.anchor || (!options.reset && !staleCamera && old?.anchor) || {
    subject: automaticSubject,
    style: project.artStyle || "保持基准参考图的表现媒介、色彩体系、光照方向与材质；无基准图时遵循原始画面描述，不混入其他风格。",
    composition: kind === "asset" ? target.type === "role" ? "基准图存在时保持其面板数量、机位与主体比例；初次生成采用角色标准四视图，正面、侧面、背面与面部近景，服装和身份完全一致。" : target.type === "scene" ? "保持基准图机位、透视、地形与建筑布局、地平线、前中后景层次和关键物件位置；场景资产图不新增人物。" : "保持基准图物件数量、轮廓、尺度、材质与朝向。" : kind === "track" ? "起始构图遵循分镜和实际参考图；保持主体身份、数量与空间关系，景别、机位、透视和焦点随逐镜摄影指令连续变化，结束构图按各镜落幅执行。" : "以分镜构图和关联参考图为准，固定主体数量、相对位置、景别、视轴与空间布局。",
    continuity: "人物面部、发型、服饰、标志物一致；场景地形与关键物件位置一致；主体身份不变，状态变化仅依照原始镜头描述。",
    allowedChanges: kind === "track" ? "同一动作的节奏、蓄力和收尾停顿可小幅变化；保留原运镜方向、台词、事件顺序、时长及最终状态。" : "仅允许皮肤或材质的微观纹理、细小表情或环境自然细节变化；不改变构图、整体风格与主体。",
    exclusions: "身份漂移、换脸、改变服装、增加人物或道具、改变空间结构、画风混杂、字幕、水印、Logo；未经描述的动作和对白。",
  };
  if (!options.anchor && !options.reset) anchor = refreshAutomaticSubject(anchor, old, automaticSubject);
  // Older asset-free tracks used the entire H3 document as a subject, duplicating
  // its field headers and dialogue inside the next H3 document.
  if (kind === "track" && !assets.length && !options.anchor && old && anchor.subject === old.source) {
    anchor = { ...anchor, subject: videoSubjectFallback };
  }
  // Migrate the former image-style default without replacing deliberate custom anchors.
  if (kind === "track" && anchor.composition === "以分镜构图和关联参考图为准，固定主体数量、相对位置、景别、视轴与空间布局。") {
    anchor = { ...anchor, composition: "起始构图遵循分镜和实际参考图；保持主体身份、数量与空间关系，景别、机位、透视和焦点随逐镜摄影指令连续变化，结束构图按各镜落幅执行。" };
  }
  if (imageCamera) anchor = cameraAnchor(anchor, [imageCamera], "storyboard");
  if (videoCamera) anchor = cameraAnchor(anchor, videoCamera.selections, "track");
  const model = options.model || (kind === "track" ? project.videoModel : project.imageModel);
  const mode = options.mode || ctx.mode;
  const referenceSelection = options.info ?? old?.referenceSelection;
  let selectedRefs: {type: string; name: string; path: string}[] | undefined;
  if (kind === "track" && referenceSelection) {
    selectedRefs = [];
    for (const info of referenceSelection) {
      const k = info.sources === "storyboard" ? "storyboard" : "asset";
      const ref = await targetContext(projectId, k, info.id);
      const a = k === "asset" ? ref.assets[0] : ref.target;
      if (!a?.filePath) throw new Error("选中的参考素材尚未生成");
      selectedRefs.push({ type: assetMediaType(a), name: a.name || `分镜${info.id}`, path: a.filePath });
    }
  }
  // 视频只绑定本次实际选择的素材；文字模式的空选择不能被历史分镜图阻断。
  // 图片基准仍保持冻结，所选视频参考仍需可读取并保存校验值。
  const references = selectedRefs ? [] : (!options.reset && old?.references) || [];
  if (selectedRefs || !old || options.reset) {
    for (const r of selectedRefs ?? ctx.references) {
      try { const bytes = await fs.readFile(mediaPath(r.path)); references.push({ ...r, sha256: digest(bytes) }); }
      catch { throw new Error(`基准图片不可读取：${r.name}`); }
    }
  }
  const promptRefs = selectedRefs ?? references;
  const variants = kind === "track" ? compileVideos(anchor, source, target.duration || 5, mode, promptRefs, model || "") : imageCamera ? cameraImageVariants(anchor, source) : compileImages(anchor, source, references.length);
  if (kind === "track") {
    const voices = await characterVoiceContext(db, projectId, targetId, options.info);
    for (const variant of variants) variant.prompt = withCharacterVoices(variant.prompt, voices);
  }
  validateVariants(variants);
  const selected = options.selected || old?.selected || "faithful";
  if (!variants.some(v => v.id === selected)) throw new Error("未知提示词方案");
  const data = { version: STANDARD_VERSION, projectId, kind, targetId, name: target.name || `S${ctx.boards[0]?.index != null ? Number(ctx.boards[0].index)+1 : targetId}`,
    automaticSubject: anchor.subject === automaticSubject ? automaticSubject : undefined,
    anchor, source, sourceHash: digest(ctx.source), contextHash: ctx.contextHash, variants, selected, references, promptRefs, referenceSelection, model, mode,
    seed: old?.seed ?? stableSeed(`${projectId}:${kind}:${targetId}`), ratio: kind === "asset" ? "16:9" : project.videoRatio || "16:9",
    resolution: project.imageQuality || "2K", missingAssets: ctx.missing,
    ...((imageCamera || videoCamera) ? { cameraPlan: { selections: imageCamera ? [imageCamera] : videoCamera!.selections, referenceRole: "identity" } } : {}),
    provenance: ["ArcReel: lib/prompt_templates/templates/asset/sheet.md", "ArcReel: lib/prompt_templates/templates/storyboard/video.md", "ComfyUI: Qwen Image 2.1 / H3 workflow snapshots"],
  };
  // Serialize revision allocation in a DB transaction, preserving every previous version.
  const revision = await db.transaction(async trx => {
    const row = await trx("o_promptStandard").where({ projectId, kind, targetId }).max("revision as r").first();
    const next = Number(row?.r || 0)+1;
    await trx("o_promptStandard").insert({ projectId, kind, targetId, revision: next, data: JSON.stringify(data), createdAt: Date.now() });
    return next;
  });
  return { ...data, revision };
}

export async function applyVariant(projectId: number, kind: TargetKind, targetId: number, selected: string) {
  const ctx = await targetContext(projectId, kind, targetId);
  const bundle = await latestStandard(projectId, kind, targetId);
  if (!bundle) throw new Error("请先建立三组提示词");
  const variant = bundle.variants.find((v: any) => v.id === selected);
  if (!variant) throw new Error("未知提示词方案");
  await db.transaction(async trx => {
    const row = await trx("o_promptStandard").where({ projectId, kind, targetId }).orderBy("revision", "desc").first();
    if (row.revision !== bundle.revision) throw new Error("方案已更新，请刷新后选择");
    await trx("o_promptStandard").insert({ projectId, kind, targetId, revision: row.revision+1, createdAt: Date.now(), data: JSON.stringify({ ...bundle, selected, appliedPrompt: variant.prompt }) });
  });
  await db(kind === "asset" ? "o_assets" : kind === "storyboard" ? "o_storyboard" : "o_videoTrack").where({ projectId, id: ctx.target.id }).update({ prompt: variant.prompt });
  return variant.prompt;
}

export async function standardizeVideo(projectId: number, targetId: number, basePrompt: string, model: string, mode: string, info: {id:number; sources:string}[]) {
  const existing = await latestStandard(projectId, "track", targetId);
  const camera = await cameraTrackContext(projectId, targetId, basePrompt, mode);
  const explicitlyApplied = typeof existing?.appliedPrompt === "string" && existing.appliedPrompt.length > 0 && basePrompt.includes(existing.appliedPrompt);
  if (!camera && !explicitlyApplied) {
    // Refresh an existing auxiliary snapshot with the original editor's actual
    // model/mode/reference order. Otherwise legacy implicit references can
    // reject camera adoption even after the requested original regeneration.
    // This only refreshes proposals; the original model output stays unchanged.
    if (existing) await tryBuildStandard(projectId, "track", targetId, { basePrompt, model, mode, info });
    return basePrompt;
  }
  const bundle = await buildStandard(projectId, "track", targetId, { basePrompt, model, mode, info, preserveGeneratedBody: true });
  return bundle.variants.find(v => v.id === bundle.selected)!.prompt;
}

export function referenceBase64(value: string) {
  if (typeof value !== "string") throw new Error("参考图片数据格式无效");
  return value.replace(/^data:[^,]*;base64,/i, "");
}

export async function prepareImageRequest(model: string, input: any, task?: {projectId: number; relatedObjects: string; taskClass: string}) {
  if (!task || !model.startsWith("comfyui-h3:")) return { input, bundle: null, targetId: null, kind: null };
  const related = JSON.parse(task.relatedObjects || "{}");
  const kind: TargetKind = related.storyboardId ? "storyboard" : "asset";
  const targetId = related.storyboardId || related.assetId || related.id;
  if (!targetId) return { input, bundle: null, targetId: null, kind: null };
  let bundle = await latestStandard(task.projectId, kind, targetId);
  const camera = kind === "storyboard" ? await getAppliedCameraPlan(task.projectId, targetId, "image") : null;
  if (!bundle) {
    if (!camera) return { input, bundle: null, targetId, kind };
    bundle = await buildStandard(task.projectId, kind, targetId);
  } else if (bundle.cameraPlan && !camera) return { input, bundle: null, targetId, kind };
  // Previewing or auto-building an auxiliary proposal is not adopting it.
  // The original editor remains authoritative, including edits after adoption.
  const explicitlyApplied = typeof bundle.appliedPrompt === "string" && bundle.appliedPrompt.length > 0 && input.prompt.includes(bundle.appliedPrompt);
  if (!bundle.cameraPlan && !explicitlyApplied) return { input, bundle: null, targetId, kind };
  const references = [...(input.referenceList || [])];
  let referenceNote = "";
  for (const ref of bundle.references) {
    const bytes = await fs.readFile(mediaPath(ref.path));
    if (digest(bytes) !== ref.sha256) throw new Error("固定参考图内容已改变，请先在提示词面板更新基准");
    const data = await referenceData(ref.path);
    if (!references.some(r => referenceBase64(r.base64) === referenceBase64(data.base64))) references.push(data);
    referenceNote += bundle.cameraPlan?.referenceRole === "identity"
      ? `\n@图${references.findIndex(r => referenceBase64(r.base64) === referenceBase64(data.base64))+1} 仅作为人物身份、服装、材质与风格参考；机位、景别、构图与焦点按本次选定镜头方案。`
      : `\n@图${references.findIndex(r => referenceBase64(r.base64) === referenceBase64(data.base64))+1} 是已确认的基准构图；保持其框架、风格和主体。`;
  }
  if (references.length > 16) throw new Error("固定参考图与当前参考图合计超过16张，请减少引用");
  const variation = TEMPLATE_GROUPS.find(g => g.id === bundle.selected)!;
  const prompt = input.prompt.includes("【固定语义锚点】") ? input.prompt : bundle.cameraPlan
    ? cameraImageVariants(bundle.anchor, input.prompt).find(v => v.id === bundle.selected)!.prompt
    : `${input.prompt}\n\n${anchorText(bundle.anchor)}\n【本组变化】${variation.image}`;
  return { input: { ...input, prompt: prompt+referenceNote, referenceList: references, seed: input.seed ?? bundle.seed }, bundle, targetId, kind };
}
