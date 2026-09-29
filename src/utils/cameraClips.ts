import { episodeVideoRatio } from "./videoAspectRatio";
import { shotDurationSchema, validateActionText, validatePromptReferences } from "./shotActionRules";
import { isLocalH3, resolveLocalVideoParameters, promptAspectRatio, alignVideoPrompt } from "./localVideoParameters";
import { assetMediaType } from "./assetMediaType";
import fs from "node:fs/promises";
import { compactVideoMode } from "./cameraWorkflowPreview";
import path from "node:path";
import { randomUUID, randomInt } from "node:crypto";
import { z } from "zod";
import u from "@/utils";
import { db } from "./db";
import { productionCatalog, catalogCode } from "./productionCatalog";
import { resolveCameraMentions } from "./cameraPromptEditing";
import { linkPromptReferences, recommendCameraParameters } from "./cameraReferencePlan";
import { cameraOptionsSchema, compileCameraVariant } from "./cameraMotion";
import { compileVideos, digest } from "./promptStandards";
import { mediaPath } from "./promptLibrary";
import { characterVoiceContext, withCharacterVoices } from "./characterVoices";
import { cleanDeletionFiles } from "./assetDeletion";
import { inspectVideoFile } from "./videoTechnicalAudit";

const targetSchema = z.object({ projectId: z.number().int().positive(), storyboardId: z.number().int().positive() });
const referenceSchema = z.object({ id: z.number().int().positive(), sources: z.enum(["storyboard", "assets"]) }).strict();
const previewSchema = targetSchema.extend({
  options: cameraOptionsSchema, motionId: z.string().min(1).max(80), workflowId: z.string().min(1).max(200),
  mode: z.string().min(1).max(300), duration: shotDurationSchema, resolution: z.string().min(1).max(80),
  promptOverride: z.string().trim().min(1).max(40000).optional(),
  aspectRatio: z.string().regex(/^\d+:\d+$/).optional(),
  audio: z.boolean(), references: z.array(referenceSchema).max(16).default([]), seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();
const generateSchema = targetSchema.extend({ prepareToken: z.uuid(), requestId: z.uuid(), confirmed: z.literal(true) }).strict();
const running = new Set<string>();
/** 本进程是否仍有该片段的生成协程，用于收尾检查。 */
export function isCameraClipGenerating(id: string) { return running.has(id); }
const recovering = new Map<string, Promise<void>>();
let ready: Promise<void> | undefined;
const MAX_REFERENCE_BYTES = 60 * 1024 * 1024;
const MAX_TOTAL_REFERENCE_BYTES = 69 * 1024 * 1024;
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;

export function ensureCameraClips() {
  return ready ??= (async () => {
    if (!(await db.schema.hasTable("o_cameraClipDraft"))) await db.schema.createTable("o_cameraClipDraft", t => {
      t.string("id").primary(); t.bigInteger("ownerId").notNullable(); t.bigInteger("projectId").notNullable();
      t.bigInteger("storyboardId").notNullable(); t.text("data").notNullable(); t.bigInteger("createdAt").notNullable(); t.bigInteger("expiresAt").notNullable();
    });
    if (!(await db.schema.hasTable("o_cameraClip"))) await db.schema.createTable("o_cameraClip", t => {
      t.string("id").primary(); t.bigInteger("ownerId").notNullable(); t.bigInteger("projectId").notNullable();
      t.bigInteger("storyboardId").notNullable(); t.string("prepareToken").notNullable(); t.string("status").notNullable();
      t.text("data").notNullable(); t.text("filePath"); t.text("error"); t.bigInteger("createdAt").notNullable(); t.bigInteger("updatedAt").notNullable();
      t.index(["ownerId", "projectId", "storyboardId"]);
      t.unique(["ownerId", "prepareToken"]);
    });
    if (!(await db.schema.hasColumn("o_cameraClip", "review"))) await db.schema.alterTable("o_cameraClip", t => { t.text("review"); });
    if (!(await db.schema.hasColumn("o_cameraClip", "technicalAudit"))) await db.schema.alterTable("o_cameraClip", t => { t.text("technicalAudit"); });
  })().catch(e => { ready = undefined; throw e; });
}

function owner(value: number) { if (!Number.isSafeInteger(value) || value < 1) throw Error("请先登录再使用运镜切片"); return value; }
function asMode(value: unknown): string { return Array.isArray(value) ? JSON.stringify(value) : String(value); }
function modeSpec(raw: unknown) {
  const value = asMode(raw), referenceLimits = { image: 0, video: 0, audio: 0 };
  if (Array.isArray(raw)) for (const item of raw) {
    const match = String(item).match(/^(image|video|audio)Reference:(\d+)$/);
    if (match) referenceLimits[match[1] as keyof typeof referenceLimits] = Number(match[2]);
  }
  const labels: Record<string, string> = { text: "文字生成视频", singleImage: "单图首帧", startEndRequired: "首尾帧", endFrameOptional: "首帧（尾帧可选）", startFrameOptional: "可选首帧" };
  const minImages = value === "singleImage" || value === "endFrameOptional" ? 1 : value === "startEndRequired" ? 2 : 0;
  const maxImages = value === "startEndRequired" || value === "endFrameOptional" ? 2 : value === "singleImage" || value === "startFrameOptional" ? 1 : referenceLimits.image;
  if (!Array.isArray(raw)) referenceLimits.image = maxImages;
  return { value, label: compactVideoMode(value), description: labels[value] || "多素材参考生成视频与音频", referenceLimits, minImages, maxImages };
}

/** Only installed and enabled ComfyUI video adapters, with their actual specifications. */
export async function cameraClipWorkflows() {
  const providers = await db("o_vendorConfig").where("enable", 1);
  const workflows: any[] = [];
  for (const provider of providers) {
    if (!/^comfyui(?:-|$)/i.test(provider.id)) continue;
    const vendor = u.vendor.getVendor(provider.id);
    if (!vendor) continue;
    for (const model of await u.vendor.getModelList(provider.id)) {
      if (model.type !== "video" || !Array.isArray(model.mode)) continue;
      const modes = model.mode.filter((m: any) => Array.isArray(m) || ["text", "singleImage", "startEndRequired", "endFrameOptional", "startFrameOptional"].includes(m)).map(modeSpec);
      const specifications = (model.durationResolutionMap || []).map((s: any) => ({
        duration: (s.duration || []).filter((v: any) => typeof v === "number" && v > 0 && Number.isFinite(v)),
        resolution: (s.resolution || []).filter((v: any) => typeof v === "string" && v.length > 0),
      })).filter((s: any) => s.duration.length && s.resolution.length);
      if (!modes.length || !specifications.length) continue;
      const audio = model.audio === true || model.audio === "required" ? "required" : model.audio === "optional" ? "optional" : "none";
      workflows.push({ id: `${provider.id}:${model.modelName}`, name: model.name || model.modelName, vendorName: vendor.name || provider.id,
        description: vendor.description || "", modes, specifications, parameterCapabilities: model.parameterCapabilities, audio, available: true,
        defaults: { mode: modes[0].value, duration: specifications[0].duration[0], resolution: specifications[0].resolution[0], audio: audio === "required" },
      });
    }
  }
  return { workflows, notice: "使用已安装的 ComfyUI 工作流及其参数规格；切换规格不会新建工作流。仅点击生成按钮才提交任务。" };
}

async function context(projectId: number, storyboardId: number, ownerId: number) {
  const project = await db("o_project").where({ id: projectId }).first();
  const board = await db("o_storyboard").where({ id: storyboardId, projectId }).first();
  if (!project || !board || Number(project.userId) !== ownerId) throw Error("分镜不存在或不属于当前账号项目");
  project.videoRatio = await episodeVideoRatio(projectId, board.scriptId, project.videoRatio || "16:9");
  // A clip contains one board, so do not pull voices from its other track shots.
  const voices = await characterVoiceContext(db, projectId, -1, [{ id: storyboardId, sources: "storyboard" }]);
  const sourceHash = digest(JSON.stringify({ board: { id: board.id, videoDesc: board.videoDesc, prompt: board.prompt, duration: board.duration, trackId: board.trackId, filePath: board.filePath }, style: project.artStyle, ratio: project.videoRatio, voices }));
  return { project, board, voices, sourceHash };
}

async function resolveReference(projectId: number, ref: z.infer<typeof referenceSchema>) {
  let item: any;
  if (ref.sources === "storyboard") {
    const board = await db("o_storyboard").where({ projectId, id: ref.id }).first();
    if (board) item = { filePath: board.filePath, name: `分镜 S${Number(board.index) + 1}`, type: "image" };
  } else {
    const asset = await db("o_assets").leftJoin("o_image", "o_assets.imageId", "o_image.id")
      .where({ "o_assets.projectId": projectId, "o_assets.id": ref.id }).select("o_assets.name", "o_assets.type", "o_image.filePath").first();
    if (asset) item = { ...asset, type: assetMediaType(asset) };
  }
  if (!item?.filePath) throw Error("所选参考素材尚未生成、已删除或不属于当前项目");
  return { ...ref, ...item, code: catalogCode(projectId, ref.sources === "storyboard" ? "storyboard" : (await db("o_assets").where("id", ref.id).first())?.type || "", ref.id), url: await u.oss.getFileUrl(item.filePath) };
}

export async function cameraClipContext(raw: unknown, ownerId: number) {
  owner(ownerId); const t = targetSchema.parse(raw), ctx = await context(t.projectId, t.storyboardId, ownerId);
  const boards = await db("o_storyboard").where({ projectId: t.projectId }).whereNotNull("filePath").orderBy("index");
  const assets = await db("o_assets").leftJoin("o_image", "o_assets.imageId", "o_image.id").where("o_assets.projectId", t.projectId).whereNotNull("o_image.filePath").select("o_assets.id");
  const references: any[] = [];
  for (const ref of [...boards.map(b => ({ id: b.id, sources: "storyboard" as const })), ...assets.map(a => ({ id: a.id, sources: "assets" as const }))]) {
    try { const r = await resolveReference(t.projectId, ref); await fs.access(mediaPath(r.filePath)); references.push(r); } catch { /* Broken references remain unavailable. */ }
  }
  const catalog = await productionCatalog(t.projectId, t.storyboardId);
  return { ...t, catalog, aspectRatio: ctx.project.videoRatio || "16:9", references };
}

async function storyboardReferenceOrder(projectId: number, storyboardId: number, entries: any[]) {
  const links = await db("o_assets2Storyboard").where({ storyboardId }).orderBy("rowid");
  // Preserve missing slots; never shift a later asset into an earlier @图N.
  return links.map(link => entries.find(entry => entry.sources === "assets" && entry.id === link.assetId && entry.code.startsWith(`DR-${projectId}-`)));
}

export async function recommendCameraClip(raw: unknown, ownerId: number) {
  const t = targetSchema.extend({prompt:z.string().max(40000),duration:z.number().finite().positive(),mode:z.string().optional(),references:z.array(referenceSchema).max(16).default([]),order:z.array(referenceSchema).max(16).default([])}).strict().parse(raw);
  const ctx = await cameraClipContext(targetSchema.parse(t), ownerId);
  const entries = [...ctx.catalog.assets, ...ctx.catalog.shots.map(s=>({...s,name:s.label,type:'image'}))];
  const linked = linkPromptReferences(t.prompt, entries, t.references, await storyboardReferenceOrder(t.projectId,t.storyboardId,entries));
  const refs: any[] = [];
  for (const r of linked.references) {
    const available = ctx.references.find(a=>a.sources===r.sources && a.id===r.id);
    if (available) refs.push(available);
    else linked.issues.push(`素材 ${entries.find(a=>a.sources===r.sources && a.id===r.id)?.name || r.id} 尚无可用文件，请先生成或修复该素材。`);
  }
  const order = (r:any) => {const index=t.order.findIndex(a=>a.sources===r.sources && a.id===r.id);return index<0?Infinity:index;};
  refs.sort((a,b)=>order(a)-order(b));
  const recommendation = recommendCameraParameters((await cameraClipWorkflows()).workflows, refs, t.prompt, t.duration, t.mode);
  return {...recommendation,references:refs,automatic:linked.automatic.map(r=>({id:r.id,sources:r.sources})),issues:linked.issues,generatesMedia:false};
}

async function readReferences(projectId: number, refs: z.infer<typeof referenceSchema>[], includeBytes = false) {
  if (new Set(refs.map(r => `${r.sources}:${r.id}`)).size !== refs.length) throw Error("参考素材不能重复选择");
  let total = 0; const items: any[] = [], payload: any[] = [];
  for (const ref of refs) {
    const item = await resolveReference(projectId, ref), stat = await fs.stat(mediaPath(item.filePath));
    if (!stat.isFile() || stat.size > MAX_REFERENCE_BYTES) throw Error("单个参考素材须为可读取文件且不超过 60 MiB");
    total += stat.size;
    if (total > MAX_TOTAL_REFERENCE_BYTES) throw Error("参考素材总量过大，请减少引用后重试");
    const bytes = await fs.readFile(mediaPath(item.filePath));
    items.push({ ...item, sha256: digest(bytes), bytes: stat.size });
    if (includeBytes) {
      const ext = path.extname(item.filePath).toLowerCase();
      const mime = bytes[0] === 137 && bytes[1] === 80 ? "image/png" : ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".png": "image/png", ".mp4": "video/mp4", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".flac": "audio/flac", ".m4a": "audio/mp4" } as Record<string,string>)[ext];
      if (!mime || !mime.startsWith(item.type + "/")) throw Error("参考素材类型与文件格式不一致");
      payload.push({ type: item.type, base64: `data:${mime};base64,${bytes.toString("base64")}` });
    }
  }
  return { items, payload };
}

function validateReferences(mode: any, refs: any[], workflowId: string, audio: boolean) {
  const counts = { image: 0, video: 0, audio: 0 };
  for (const ref of refs) counts[ref.type as keyof typeof counts]++;
  for (const type of ["image", "video", "audio"] as const) if (counts[type] > mode.referenceLimits[type]) throw Error(`当前工作流模式不支持所选数量的${type === "image" ? "图片" : type === "video" ? "视频" : "音频"}参考`);
  if (counts.image < mode.minImages) throw Error(`当前模式需要 ${mode.minImages} 张图片，请按首帧、尾帧顺序选择`);
  if (mode.value.startsWith("[") && !counts.image && !counts.video) throw Error("多素材参考模式至少需要一张图片或一段视频");
  if (!audio && counts.audio) throw Error("关闭声音时请移除音频参考");
  if (workflowId.startsWith("comfyui-h3:") && refs.length > 12) throw Error("H3 多参考素材合计最多 12 项");
}

export async function previewCameraClip(raw: unknown, ownerId: number) {
  owner(ownerId); await ensureCameraClips(); const t = previewSchema.parse(raw);
  const ctx = await context(t.projectId, t.storyboardId, ownerId);
  const workflow = (await cameraClipWorkflows()).workflows.find(w => w.id === t.workflowId);
  if (!workflow) throw Error("所选 ComfyUI 视频工作流尚未安装或已停用");
  const mode = workflow.modes.find((m: any) => m.value === t.mode);
  if (!mode || (!isLocalH3(t.workflowId) && !workflow.specifications.some((s: any) => s.duration.includes(t.duration) && s.resolution.includes(t.resolution)))) throw Error("当前工作流不支持所选模式、时长或分辨率规格");
  if (workflow.audio === "required" && !t.audio) throw Error("当前工作流要求生成声音");
  if (workflow.audio === "none" && t.audio) throw Error("当前工作流不支持生成声音");
  const catalog = await productionCatalog(t.projectId,t.storyboardId);
  const entries = [...catalog.assets,...catalog.shots.map(s=>({...s,name:s.label,type:"image"}))];
  const referenceOrder = await storyboardReferenceOrder(t.projectId,t.storyboardId,entries);
  const linked = linkPromptReferences(t.promptOverride || compileCameraVariant(t.options,t.motionId).videoPrompt, entries,t.references,referenceOrder);
  if (linked.issues.length) throw Error(linked.issues.join(' '));
  const { items: references } = await readReferences(t.projectId, linked.references);
  validateReferences(mode, references, t.workflowId, t.audio);
  const cameraMode = t.mode.startsWith("[") ? "reference" : t.mode === "endFrameOptional" ? (references.length === 2 ? "startEndRequired" : "singleImage") : t.mode === "startFrameOptional" ? (references.length ? "singleImage" : "text") : t.mode;
  const options = cameraOptionsSchema.parse({ ...t.options, duration: t.duration, mode: cameraMode });
  const variant = compileCameraVariant(options, t.motionId);
  variant.videoPrompt = linkPromptReferences(variant.videoPrompt,entries,[],referenceOrder).prompt;
  const anchor = { subject: "仅使用本镜情节中明确描述的人物与对象，身份、数量保持一致。", style: ctx.project.artStyle || "遵循分镜及所选参考的风格。", composition: variant.composition,
    continuity: options.continuity || "保持人物身份、服装、持物手与空间关系。", allowedChanges: "执行所选主运镜、焦点变化及原主体动作，不添加剧情、台词或人物。", exclusions: "身份漂移、无依据增添人物、字幕、水印；与选定运镜方向冲突的摄影。" };
  const compiledMode = cameraMode === "reference" ? t.mode : cameraMode;
  const compiledPrompt = withCharacterVoices(compileVideos(anchor, variant.videoPrompt, t.duration, compiledMode, references, t.workflowId)[0].prompt, ctx.voices, t.audio);
  let prompt = await resolveCameraMentions(t.projectId, t.promptOverride ? linked.prompt : linkPromptReferences(compiledPrompt,entries,[],referenceOrder).prompt, references);
  if (t.workflowId.startsWith("comfyui-h3:") && [...prompt].length > 40000) throw Error("编译后提示词超过 H3 的 40000 字限制，请精简情节和运镜要求后重新准备");
  const aspectRatio = t.aspectRatio || (t.promptOverride ? promptAspectRatio(t.promptOverride) : undefined) || ctx.project.videoRatio || "16:9";
  const resolved = isLocalH3(t.workflowId) ? await resolveLocalVideoParameters(t.workflowId, { duration: t.duration, resolution: t.resolution, aspectRatio }) : {};
  if (isLocalH3(t.workflowId)) prompt = alignVideoPrompt(prompt, aspectRatio, t.duration);
  validateActionText(prompt);
  validatePromptReferences(prompt, { Picture: references.filter(r=>r.type==="image").length, Audio: references.filter(r=>r.type==="audio").length, Video: references.filter(r=>r.type==="video").length });
  const parameters = { ...resolved, workflowId: workflow.id, workflowName: workflow.name, mode: t.mode, duration: t.duration, resolution: t.resolution, aspectRatio, audio: t.audio, seed: t.seed ?? randomInt(0, 2 ** 32) };
  const warnings = variant.audit.issues.filter(i => i.severity !== "error").map(i => i.message);
  if (aspectRatio !== ctx.project.videoRatio) warnings.push(`本次画幅 ${aspectRatio} 覆盖项目默认 ${ctx.project.videoRatio}。`);
  if (resolved.width * resolved.height > 1344 * 768 || t.duration > 15) warnings.push("自定义规格超出既有本机测试范围，生成耗时、显存和效果尚未验证。");
  if (t.duration !== Number(ctx.board.duration)) warnings.push(`此切片为 ${t.duration} 秒，原分镜时长保持 ${ctx.board.duration || "未设置"} 秒。`);
  if (t.workflowId.startsWith("comfyui-h3:")) warnings.push("H3 帧数会按工作流对齐，名义时长与成片时长可能略有差异；加速规格不保证运镜表现一致。");
  if (t.promptOverride) warnings.push("使用已编辑的视频提示词；请核对其运镜方向、台词和素材引用。镜头设置审计不替代正文核对。");
  const canGenerate = variant.audit.status !== "blocked";
  const data = { ...t, options, motionName: variant.name, prompt, parameters, references, audit: variant.audit, warnings, canGenerate, sourceHash: ctx.sourceHash, workflowHash: digest(JSON.stringify(workflow)) };
  const prepareToken = randomUUID(), createdAt = Date.now(), expiresAt = createdAt + 30 * 60 * 1000;
  await db("o_cameraClipDraft").insert({ id: prepareToken, ownerId, projectId: t.projectId, storyboardId: t.storyboardId, data: JSON.stringify(data), createdAt, expiresAt });
  // Only expired preparations are disposable; completed clips and history are retained.
  await db("o_cameraClipDraft").where("ownerId", ownerId).where("expiresAt", "<", createdAt - 24 * 60 * 60 * 1000).delete();
  return { prepareToken, expiresAt, prompt, parameters, references, audit: variant.audit, warnings, canGenerate };
}

async function clipView(row: any) {
  const data = JSON.parse(row.data);
  return { id: row.id, projectId: row.projectId, storyboardId: row.storyboardId, motionId: data.motionId, motionName: data.motionName,
    prompt: data.prompt, parameters: data.parameters, references: data.references, status: row.status,
    url: row.status === "completed" && row.filePath ? await u.oss.getFileUrl(row.filePath) : "", error: row.error || "", review: row.review ? JSON.parse(row.review) : null, technicalAudit:row.technicalAudit?JSON.parse(row.technicalAudit):null, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

/** 只在片段和原分镜仍存在时提交本地结果；网络请求不放入事务。 */
async function saveClipResult(row: any, output: string, save: () => Promise<unknown>) {
  let wrote = false;
  try {
    return await db.transaction(async trx => {
      const clip = await trx("o_cameraClip").where({ id: row.id, projectId: row.projectId, storyboardId: row.storyboardId }).whereIn("status", ["queued", "running", "uncertain"]).first();
      if (!clip || !(await trx("o_storyboard").where({ id: row.storyboardId, projectId: row.projectId }).first())) return false;
      wrote = true;
      await save();
      if (!(await fs.stat(mediaPath(output))).size) throw Error("工作流未保存有效的视频文件");
      await trx("o_cameraClip").where({ id: row.id }).update({ status: "completed", filePath: output, error: null, updatedAt: Date.now() });
      return true;
    });
  } catch (error) {
    if (wrote) {
      try { await u.oss.deleteFile(output); } catch (cleanup: any) { if (cleanup.code !== "ENOENT") throw cleanup; }
    }
    throw error;
  }
}

async function cleanDeletedClipArchive(id: string) {
  if (!(await db("o_cameraClip").where({ id }).first())) {
    await fs.rm(u.getPath(["reproduction", "camera-clips", id]), { recursive: true, force: true });
  }
}

async function executeClip(row: any, prepared: any, referenceList: any[]) {
  running.add(row.id);
  let providerStarted = false;
  try {
    if (!(await db("o_cameraClip").where({ id: row.id, status: "queued" }).update({ status: "running", updatedAt: Date.now() }))) return;
    const p = prepared.parameters;
    const input = { prompt: prepared.prompt, duration: p.duration, resolution: p.resolution, aspectRatio: p.aspectRatio, audio: p.audio,
      mode: p.mode.startsWith("[") ? JSON.parse(p.mode) : p.mode, seed: p.seed, request_id: row.id, referenceList };
    const directory = u.getPath(["reproduction", "camera-clips", row.id]);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(directory, "request.json"), JSON.stringify(input), { mode: 0o600 });
    const generator = u.Ai.Video(p.workflowId);
    providerStarted = true;
    await generator.run(input as any, { projectId: row.projectId, taskClass: "运镜视频切片生成", describe: `${prepared.motionName} · ${p.workflowName}`, relatedObjects: JSON.stringify({ projectId: row.projectId, storyboardId: row.storyboardId, cameraClipId: row.id, type: "运镜切片" }) });
    const output = `/${row.projectId}/camera-clips/${row.id}.mp4`;
    await saveClipResult(row, output, () => generator.save(output));
  } catch (e: any) {
    const message = u.error(e).message;
    const needsRecovery = (providerStarted && prepared.workflowId.startsWith("comfyui-h3:")) || /状态查询失败|submission_uncertain|timeout|超时|ECONN|未确认/i.test(message);
    await db("o_cameraClip").where("id", row.id).update({ status: needsRecovery ? "uncertain" : "failed", error: message, updatedAt: Date.now() });
  } finally {
    try { await cleanDeletedClipArchive(row.id); } finally { running.delete(row.id); }
  }
}

export async function generateCameraClip(raw: unknown, ownerId: number) {
  owner(ownerId); await ensureCameraClips(); const t = generateSchema.parse(raw);
  await context(t.projectId, t.storyboardId, ownerId);
  const previous = await db("o_cameraClip").where("id", t.requestId).first();
  if (previous) {
    if (previous.ownerId !== ownerId || previous.projectId !== t.projectId || previous.storyboardId !== t.storyboardId || previous.prepareToken !== t.prepareToken) throw Error("该请求编号已用于其他切片，请重新准备");
    return { clip: await clipView(previous), duplicate: true };
  }
  const draft = await db("o_cameraClipDraft").where({ id: t.prepareToken, ownerId, projectId: t.projectId, storyboardId: t.storyboardId }).first();
  if (!draft || draft.expiresAt < Date.now()) throw Error("生成预览已过期，请重新准备提示词与参数");
  const prepared = JSON.parse(draft.data);
  if (!prepared.canGenerate) throw Error("提示词审计尚有阻断项，请补全后重新准备");
  if ((await context(t.projectId, t.storyboardId, ownerId)).sourceHash !== prepared.sourceHash) throw Error("原分镜、声线或项目设置已修改，请重新准备");
  const workflow = (await cameraClipWorkflows()).workflows.find(w => w.id === prepared.workflowId);
  if (!workflow || digest(JSON.stringify(workflow)) !== prepared.workflowHash) throw Error("工作流配置已改变，请重新选择规格并准备");
  const refs = await readReferences(t.projectId, prepared.references.map((r: any) => ({ id: r.id, sources: r.sources })), true);
  if (digest(JSON.stringify(refs.items)) !== digest(JSON.stringify(prepared.references))) throw Error("参考素材已修改，请重新选择并准备");
  const now = Date.now();
  const result = await db.transaction(async trx => {
    const duplicate = await trx("o_cameraClip").where("id", t.requestId).first();
    if (duplicate) {
      if (duplicate.ownerId !== ownerId || duplicate.projectId !== t.projectId || duplicate.storyboardId !== t.storyboardId || duplicate.prepareToken !== t.prepareToken) throw Error("该请求编号已用于其他切片");
      return { row: duplicate, duplicate: true };
    }
    if (await trx("o_cameraClip").where({ ownerId, prepareToken: t.prepareToken }).first()) throw Error("此生成预览已经提交，请刷新切片列表；要再次生成请重新准备");
    const row = { id: t.requestId, ownerId, projectId: t.projectId, storyboardId: t.storyboardId, prepareToken: t.prepareToken, status: "queued", data: JSON.stringify(prepared), createdAt: now, updatedAt: now };
    await trx("o_cameraClip").insert(row); return { row, duplicate: false };
  });
  if (!result.duplicate) void executeClip(result.row, prepared, refs.payload);
  return { clip: await clipView(result.row), duplicate: result.duplicate };
}

/** Read an existing bridge handle after app restart; never creates a new job. */
async function recoverClip(row: any) {
  const prepared = JSON.parse(row.data);
  if (running.has(row.id) || !["queued", "running", "uncertain"].includes(row.status)) return;
  if (recovering.has(row.id)) return recovering.get(row.id);
  const work = (async () => {
    if (!prepared.workflowId.startsWith("comfyui-h3:")) {
      await db("o_cameraClip").where("id", row.id).update({ status: "uncertain", error: "服务重启后无法自动读取此工作流任务，请核对原 ComfyUI 队列；勿重复提交。", updatedAt: Date.now() }); return;
    }
    const base = `http://127.0.0.1:10589/jobs/${row.id}`;
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(10000), redirect: "error" });
      if (!response.ok) throw Error("原工作流任务暂不可读取；保留原任务编号，勿重复提交");
      const job: any = await response.json();
      if (job.state === "success") {
        const output = `/${row.projectId}/camera-clips/${row.id}.mp4`, destination = mediaPath(output), temporary = destination + ".part";
        const media = await fetch(base + "/output", { signal: AbortSignal.timeout(60000), redirect: "error" });
        if (!media.ok || !media.body || Number(media.headers.get("content-length")) > MAX_VIDEO_BYTES) throw Error("原视频输出暂不可读取或超过文件大小限制");
        await fs.mkdir(path.dirname(destination), { recursive: true });
        try {
          const file = await fs.open(temporary, "w", 0o600); let bytes = 0;
          try { for await (const chunk of media.body as any) { bytes += chunk.length; if (bytes > MAX_VIDEO_BYTES) throw Error("视频输出超过文件大小限制"); await file.write(chunk); } }
          finally { await file.close(); }
          if (!bytes) throw Error("原视频输出为空");
          const mediaBytes = await fs.readFile(temporary);
          await saveClipResult(row, output, () => u.oss.writeFile(output, mediaBytes));
        } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
      } else if (job.state === "error") await db("o_cameraClip").where("id", row.id).update({ status: "failed", error: job.error || "工作流生成失败", updatedAt: Date.now() });
      else if (job.state === "submission_uncertain") throw Error(job.error || "原任务提交状态未确认，请检查工作流队列");
      else if (["submitting", "queued", "running"].includes(job.state)) await db("o_cameraClip").where("id", row.id).update({ status: "running", error: null, updatedAt: Date.now() });
      else throw Error("原任务返回未知状态，请核对原任务；勿重复提交");
    } catch (e: any) {
      await db("o_cameraClip").where("id", row.id).update({ status: "uncertain", error: e.message, updatedAt: Date.now() });
    } finally {
      await cleanDeletedClipArchive(row.id);
    }
  })();
  recovering.set(row.id, work);
  try { await work; } finally { recovering.delete(row.id); }
}

export async function listCameraClips(raw: unknown, ownerId: number) {
  owner(ownerId); await ensureCameraClips(); const t = targetSchema.parse(raw); await context(t.projectId, t.storyboardId, ownerId);
  const query = () => db("o_cameraClip").where({ ownerId, projectId: t.projectId, storyboardId: t.storyboardId }).orderBy("createdAt", "desc").limit(100);
  const rows = await query();
  await Promise.all(rows.map(recoverClip));
  const clips = await Promise.all((await query()).map(clipView));
  return { clips, qualifiedCount: new Set(clips.filter(c => c.status === "completed" && c.url && c.review?.status === "accepted" && c.review.mediaSha256).map(c => c.review.mediaSha256)).size, qualificationTarget: 4 };
}

/** Explicit review of an existing output; generation success never implies quality. */
const auditingClips = new Map<string,Promise<unknown>>();
export async function auditCameraClip(raw: unknown, ownerId: number) {
  owner(ownerId); await ensureCameraClips();
  const t = targetSchema.extend({clipId:z.uuid()}).strict().parse(raw);
  await context(t.projectId,t.storyboardId,ownerId);
  const row:any = await db("o_cameraClip").where({id:t.clipId,ownerId,projectId:t.projectId,storyboardId:t.storyboardId}).first();
  if (!row || row.status!=="completed" || !row.filePath) throw Error("只能检测本镜已完成的视频切片");
  const key = `${ownerId}:${row.id}`;
  if (auditingClips.has(key)) return auditingClips.get(key);
  const job = (async()=>{
    const data = JSON.parse(row.data);
    const measured = await inspectVideoFile(mediaPath(row.filePath),data.parameters||{});
    const report = {...measured,clipId:row.id,promptSha256:digest(data.prompt||""),submissionSha256:digest(row.data),sourceHash:data.sourceHash,workflowHash:data.workflowHash};
    const history:any[] = row.technicalAudit?JSON.parse(row.technicalAudit).history||[]:[];
    const technicalAudit = {...report,history:[...history,{createdAt:report.createdAt,mediaSha256:report.mediaSha256,status:report.status,checks:report.checks}]};
    const count = await db("o_cameraClip").where({id:row.id,ownerId,status:"completed",filePath:row.filePath}).update({technicalAudit:JSON.stringify(technicalAudit)} as any);
    if (!count) throw Error("切片已移除，检测结果未保存");
    return {clipId:row.id,technicalAudit};
  })();
  auditingClips.set(key,job);
  try {return await job;} finally {auditingClips.delete(key);}
}

export async function reviewCameraClip(raw: unknown, ownerId: number) {
  owner(ownerId); await ensureCameraClips();
  const t = targetSchema.extend({clipId:z.uuid(),status:z.enum(["accepted","rejected"]),notes:z.string().trim().min(8).max(5000),
    checks:z.object({action:z.boolean(),ending:z.boolean(),identity:z.boolean(),continuity:z.boolean(),speech:z.boolean()}).strict()}).strict().parse(raw);
  await context(t.projectId,t.storyboardId,ownerId);
  if(t.status === "accepted" && !Object.values(t.checks).every(Boolean))throw Error("动作、结束状态、人物身份、连续性和声音都确认通过后才能标为合格");
  const row:any=await db("o_cameraClip").where({id:t.clipId,ownerId,projectId:t.projectId,storyboardId:t.storyboardId}).first();
  if(!row || row.status!=="completed" || !row.filePath)throw Error("只能验收当前分镜已完成的视频切片");
  const bytes=await fs.readFile(mediaPath(row.filePath));if(!bytes.length)throw Error("视频文件为空");
  const review={status:t.status,checks:t.checks,notes:t.notes,mediaSha256:digest(bytes),reviewedAt:Date.now(),reviewerId:ownerId};
  if(t.status==="accepted") {
    const siblings:any[]=await db("o_cameraClip").where({ownerId,projectId:t.projectId,storyboardId:t.storyboardId}).whereNot({id:t.clipId});
    if(siblings.some(r=>{const q=r.review?JSON.parse(r.review):null;return q?.status==="accepted" && q.mediaSha256===review.mediaSha256;}))throw Error("同一视频文件不能重复计为多个合格切片");
  }
  await db("o_cameraClip").where({id:t.clipId,ownerId,status:"completed"}).update({review:JSON.stringify(review),updatedAt:Date.now()} as any);
  return {clipId:t.clipId,review};
}

/** 删除一个已终止切片，不修改原分镜、视频轨道或其他比较结果。 */
export async function deleteCameraClip(raw: unknown, ownerId: number) {
  owner(ownerId); await ensureCameraClips();
  const t = targetSchema.extend({ clipId: z.uuid() }).strict().parse(raw);
  await context(t.projectId, t.storyboardId, ownerId);
  const files = await db.transaction(async trx => {
    const query = () => trx("o_cameraClip").where({ id: t.clipId, ownerId, projectId: t.projectId, storyboardId: t.storyboardId });
    const row = await query().first();
    if (!row) throw Error("切片不存在或不属于当前分镜");
    if (!["completed", "failed"].includes(row.status) || running.has(row.id) || recovering.has(row.id)) throw Error("切片任务尚未结束，请等待结果确认后再删除");
    await query().delete();
    // 删除准备记录，旧令牌不能重新提交已删除的任务。
    await trx("o_cameraClipDraft").where({ id: row.prepareToken, ownerId }).delete();
    return { media: row.filePath ? [row.filePath] : [], archives: [u.getPath(["reproduction", "camera-clips", row.id])] };
  });
  await cleanDeletionFiles(files);
  return { deleted: true, clipId: t.clipId };
}
