import sharp from "sharp";
import { portraitForRequest, PORTRAIT_MODEL } from "./characterPortrait";
import type { Knex } from "knex";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import getPath from "./getPath";
import { ensurePromptLibrary, prepareImageRequest, mediaPath, referenceBase64 } from "./promptLibrary";
import { digest, stableSeed } from "./promptStandards";
import { portraitEditInstruction } from "./portraitEdit";

export async function recordImageRequest(model: string, raw: any, task?: any) {
  await ensurePromptLibrary();
  const portrait = await portraitForRequest(raw, task);
  const replayRow = raw.replayOf ? await db("o_generationRecipe").where({id:raw.replayOf,projectId:task?.projectId}).first() : null;
  const replayPortrait = replayRow ? JSON.parse(replayRow.data).portrait?.document : null;
  const prepared = portrait ? { input: { ...raw, prompt: portrait.prompt, size: model === PORTRAIT_MODEL ? (portrait.settings.quality === "1080p" ? "portrait-1080p" : "portrait-2k") : raw.size, aspectRatio: "16:9", seed: raw.seed ?? portrait.seed }, bundle: null, kind: "asset", targetId: portrait.assetId } : raw.replayOf ? { input: raw, bundle: null, kind: raw.recipeKind, targetId: raw.recipeTargetId } : await prepareImageRequest(model, raw, task);
  const id = randomUUID();
  const input = { ...prepared.input, seed: prepared.input.seed ?? stableSeed(id), request_id: id };
  let portraitEdit: any = null;
  if (portrait && model === PORTRAIT_MODEL && input.referenceList?.length === 1) {
    const referenceHash = digest(Buffer.from(referenceBase64(input.referenceList[0].base64), 'base64'));
    const candidates = await db('o_generationRecipe').where({projectId:task.projectId,kind:'asset',targetId:portrait.assetId,state:'已完成'}).orderBy('createdAt','desc');
    for (const row of candidates) {
      const source = JSON.parse(row.data);
      if (source.outputHash !== referenceHash || !source.portrait?.document) continue;
      const edit = portraitEditInstruction(source.portrait.document, portrait);
      input.prompt = edit.prefix + portrait.prompt;
      portraitEdit = { sourceRecipeId: row.id, referenceHash, changes: edit.changes };
      break;
    }
  }
  delete input.replayOf; delete input.recipeKind; delete input.recipeTargetId;
  const folder = getPath(["reproduction", id]);
  await fs.mkdir(folder, { recursive: true });
  // Only generation parameters are archived; no provider configuration or API keys.
  const request = { prompt: input.prompt, referenceList: input.referenceList || [], size: input.size, aspectRatio: input.aspectRatio, seed: input.seed,
    ...(input.replayJobId ? { replayJobId: input.replayJobId } : {}) };
  await fs.writeFile(`${folder}/request.json`, JSON.stringify(request));
  const data = { version: 1, seed: input.seed, size: input.size, aspectRatio: input.aspectRatio, prompt: input.prompt,
    requestHash: digest(JSON.stringify(request)), references: request.referenceList.map((r: any) => ({ type: r.type, sha256: digest(Buffer.from(referenceBase64(r.base64), "base64")) })),
    anchor: prepared.bundle?.anchor || null, anchorRevision: prepared.bundle?.revision || null,
    portrait: (portrait || replayPortrait) ? { document: portrait || replayPortrait, edit: portraitEdit, status: "awaiting_image_generation" } : null,
    replayOf: raw.replayOf || null, bridgeJobId: model.startsWith("comfyui-h3:") ? id : null,
    replaySupported: model === "comfyui-h3:qwen-image-2.1-quality" || model === "comfyui-h3:z-image-turbo" };
  await db("o_generationRecipe").insert({ id, projectId: task?.projectId || null, kind: prepared.kind || null, targetId: prepared.targetId || null, model, state: "生成中", data: JSON.stringify(data), createdAt: Date.now() });
  return { id, input, bundle: prepared.bundle };
}

export async function finishImageRecipe(recipe: any, filePath: string, bytes: Buffer, client: Knex | Knex.Transaction = db) {
  const row = await client("o_generationRecipe").where("id", recipe.id).first();
  if (!row) return;
  const data = JSON.parse(row.data);
  if (data.portrait) {
    const meta = await sharp(bytes).metadata(), d = data.portrait.document;
    const passed = meta.width === d.width && meta.height === d.height;
    data.portrait = { ...data.portrait, actualSize: [meta.width, meta.height], pixelCheckPassed: passed, status: passed ? "awaiting_visual_review" : "resolution_unmet" };
  }
  await client("o_generationRecipe").where("id", recipe.id).update({ filePath, state: "已完成", data: JSON.stringify({ ...data, outputHash: digest(bytes) }) });
  // A newly created asset acquires an immutable visual baseline after its first successful image.
  if (recipe.bundle && !recipe.bundle.references.length) {
    const b = recipe.bundle;
    const references = [{ path: filePath, name: b.name, type: "image", sha256: digest(bytes) }];
    await client.transaction(async trx => {
      const latest = await trx("o_promptStandard").where({ projectId: b.projectId, kind: b.kind, targetId: b.targetId }).orderBy("revision", "desc").first();
      if (!latest) return;
      const data = JSON.parse(latest.data);
      if (data.references.length) return;
      data.references = references;
      await trx("o_promptStandard").insert({ projectId: b.projectId, kind: b.kind, targetId: b.targetId, revision: latest.revision+1, data: JSON.stringify(data), createdAt: Date.now() });
    });
  }
}

export async function discardImageRecipe(recipe: { id: string }) {
  await db("o_generationRecipe").where("id", recipe.id).delete();
  if (/^[a-f0-9-]{36}$/.test(recipe.id)) await fs.rm(getPath(["reproduction", recipe.id]), { recursive: true, force: true });
}

export async function loadReplayRequest(projectId: number, recipeId: string) {
  if (!/^[a-f0-9-]{36}$/.test(recipeId)) throw new Error("无效复现记录");
  const row = await db("o_generationRecipe").where({ id: recipeId, projectId, state: "已完成" }).first();
  if (!row) throw new Error("未找到本项目已完成的复现记录");
  const meta = JSON.parse(row.data);
  if (!meta.replaySupported) throw new Error("该历史模型不支持当前复现入口");
  const request = JSON.parse(await fs.readFile(getPath(["reproduction", recipeId, "request.json"]), "utf8"));
  if (digest(JSON.stringify(request)) !== meta.requestHash) throw new Error("生成参数校验失败");
  if (meta.outputHash !== digest(await fs.readFile(mediaPath(row.filePath)))) throw new Error("原始图片内容校验失败");
  return { row, input: { ...request, replayOf: recipeId, recipeKind: row.kind, recipeTargetId: row.targetId, replayJobId: meta.bridgeJobId } };
}
