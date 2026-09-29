import { spawn } from 'node:child_process';
import { z } from 'zod';
import { db } from './db';
import getPath from './getPath';
import { digest, stableSeed } from './promptStandards';
import { preserveSelectedPrompt } from './imagePrompts';

export const PORTRAIT_MODEL = 'comfyui-h3:qwen-image-2.1-quality';
const text = z.string().trim().min(1).max(12000);
export const portraitDocument = z.object({
  name: text.max(100), brief: text.max(15000), settings: z.record(z.string(), z.unknown()).default({}),
  character: z.object({
    sections: z.record(z.string(), text), assumptions: z.array(z.string().max(6000)).max(100), negative: z.string().max(6000),
    fingerprint: z.object({ height: text, head_body_ratio: text, face_structure: text, facial_features: text, hair: text, body_silhouette: text, costume_silhouette: text, palette: text }).strict(),
    basic_info: z.object({ age: text, gender: text }).strict(),
    cast_comparison: z.array(z.object({ name: text, differences: z.record(z.string(), text) }).strict()).max(30),
  }).strict(),
  cast: z.array(z.object({ name: text, fingerprint: z.record(z.string(), text) }).strict()).max(30).default([]),
}).strict();
export type PortraitDocument = z.infer<typeof portraitDocument>;
const patchPath = z.string().refine(value => /^(brief|character\/(negative|assumptions)|character\/(sections|fingerprint|basic_info)\/[^/]+|settings\/[^/]+)$/.test(value) && !value.split('/').some(k=>['__proto__','prototype','constructor'].includes(k)), '只允许修改角色模板中的明确字段');
export const portraitPatch = z.object({path:patchPath,op:z.enum(['set','append']).default('set'),value:z.union([z.string().max(15000),z.number().finite(),z.boolean(),z.array(z.string().max(6000)).max(100)])}).strict();

// No shell, credentials or model configuration are passed through argv/logs.
export function portraitWorker(payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [getPath(['skills', 'female-portrait-director', 'scripts', 'toonflow.py'])], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', failed = false;
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', () => { failed = true; reject(Error('无法启动人物模板编译器，请检查 Python 3')); });
    child.on('close', () => {
      if (failed) return;
      try { const result = JSON.parse(output); if (!result.ok) throw Error(result.error); resolve(result.data); }
      catch (e) { reject(e instanceof SyntaxError ? Error('人物模板编译器返回无效数据') : e); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
export const portraitRuntime = { expand: portraitWorker };
let ready: Promise<void> | undefined;
export function ensurePortraits() {
  return ready ??= (async () => {
    if (!await db.schema.hasTable('o_characterPortrait')) await db.schema.createTable('o_characterPortrait', t => {
      t.increments('id'); t.bigInteger('projectId').notNullable(); t.bigInteger('assetId').notNullable();
      t.integer('revision').notNullable(); t.text('data').notNullable(); t.bigInteger('createdAt').notNullable();
      t.unique(['projectId', 'assetId', 'revision']);
    });
  })();
}
export async function portraitAsset(projectId: number, assetId: number) {
  const asset = await db('o_assets').where({ id: assetId, projectId, type: 'role' }).whereNull('archivedAt').first();
  if (!asset) throw Error('角色不存在、已归档或不属于当前项目');
  return asset;
}
export async function getPortrait(projectId: number, assetId: number) {
  await portraitAsset(projectId, assetId); await ensurePortraits();
  const row = await db('o_characterPortrait').where({ projectId, assetId }).orderBy('revision', 'desc').first();
  return row ? { ...JSON.parse(row.data), revision: row.revision } : null;
}
export async function portraitCast(projectId: number, assetId: number) {
  await ensurePortraits();
  const rows = await db('o_characterPortrait').where({ projectId }).whereNot({ assetId }).orderBy('revision', 'desc');
  const seen = new Set<number>(), cast: any[] = [];
  for (const row of rows) {
    if (seen.has(row.assetId)) continue; seen.add(row.assetId);
    if (!await db('o_assets').where({ id: row.assetId, projectId }).whereNull('archivedAt').first()) continue;
    const d = JSON.parse(row.data); cast.push({ name: d.name, fingerprint: d.character.fingerprint });
  }
  return cast.slice(0, 30);
}
export async function draftPortrait(projectId: number, assetId: number, brief?: string, settings: any = {}) {
  const asset = await portraitAsset(projectId, assetId);
  return portraitRuntime.expand({ name: asset.name, brief: brief || asset.describe || asset.name, settings, cast: await portraitCast(projectId, assetId), generate: true });
}
export async function savePortrait(projectId: number, assetId: number, raw: unknown, expectedRevision: number, seed?: number, pendingImageId?: number) {
  await portraitAsset(projectId, assetId); await ensurePortraits();
  const doc = portraitDocument.parse(raw);
  const compiled = await portraitWorker(doc);
  if (seed !== undefined) z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(seed);
  return db.transaction(async trx => {
    const asset = await trx('o_assets').where({ id: assetId, projectId, type: 'role' }).whereNull('archivedAt').first();
    if (!asset) throw Error('角色已删除');
    if (pendingImageId !== undefined && !await trx('o_image').where({id:pendingImageId,assetsId:assetId,state:'生成中'}).first()) throw Error('生成已取消，未保存角色修改');
    if (doc.name !== asset.name) throw Error('文档角色名与资产不一致，请刷新');
    const row = await trx('o_characterPortrait').where({ projectId, assetId }).orderBy('revision', 'desc').first();
    if ((row?.revision || 0) !== expectedRevision) throw Error('角色版本已变化，请刷新后重新修改');
    const old = row ? JSON.parse(row.data) : null;
    const result = { ...compiled, seed: seed ?? old?.seed ?? stableSeed(`portrait:${projectId}:${assetId}`), model: PORTRAIT_MODEL,
      promptHash: digest(compiled.prompt), revision: expectedRevision + 1 };
    await trx('o_characterPortrait').insert({ projectId, assetId, revision: result.revision, data: JSON.stringify(result), createdAt: Date.now() });
    // Keep the selected image's historical prompt; the new draft belongs to the next image.
    await preserveSelectedPrompt(trx, asset);
    await trx('o_assets').where({ id: assetId, projectId }).update({ prompt: result.prompt, promptState: '已完成', promptErrorReason: null });
    return result;
  });
}
export async function polishPortrait(projectId: number, assetId: number, brief: string, pendingImageId?: number) {
  const old = await getPortrait(projectId, assetId);
  const draft = await draftPortrait(projectId, assetId, brief, old?.settings || {});
  return savePortrait(projectId, assetId, portraitDocument.parse({ name: draft.name, brief: draft.brief, settings: draft.settings, character: draft.character, cast: draft.cast }), old?.revision || 0, undefined, pendingImageId);
}
export async function patchPortrait(projectId: number, assetId: number, expectedRevision: number, patches: z.infer<typeof portraitPatch>[]) {
  const old = await getPortrait(projectId, assetId);
  if (!old || old.revision !== expectedRevision) throw Error('角色版本已变化或不存在，请先读取当前模板');
  const doc: any = portraitDocument.parse({name:old.name,brief:old.brief,settings:old.settings,character:old.character,cast:old.cast});
  for (const patch of z.array(portraitPatch).min(1).max(40).parse(patches)) {
    const keys = patch.path.split('/'), key = keys.pop()!;
    let owner = doc; for (const part of keys) owner = owner[part];
    if (!owner || (keys[0] !== 'settings' && !Object.hasOwn(owner, key))) throw Error('未知角色字段：'+patch.path);
    if (patch.op === 'append') {
      if (typeof owner[key] !== 'string' || typeof patch.value !== 'string') throw Error('append仅适用于文本字段');
      owner[key] += patch.value;
    } else owner[key] = patch.value;
  }
  return savePortrait(projectId,assetId,doc,expectedRevision,old.seed);
}
export async function portraitForRequest(input: any, task?: any) {
  if (!task || input.replayOf) return null;
  const related = JSON.parse(task.relatedObjects || '{}');
  if (related.storyboardId) return null;
  const assetId = related.assetId || related.id;
  if (!assetId) return null;
  const asset = await db('o_assets').where({ id: assetId, projectId: task.projectId, type: 'role' }).first();
  if (!asset) return null;
  // Older databases without the optional extension table need no portrait migration.
  if (!await db.schema.hasTable('o_characterPortrait')) return null;
  const row = await db('o_characterPortrait').where({projectId:task.projectId,assetId}).orderBy('revision','desc').first();
  const doc = row ? {...JSON.parse(row.data),revision:row.revision} : null;
  if (!doc) return null; // Legacy hand-written assets remain usable until explicitly converted.
  if (!input.prompt.includes(doc.prompt)) throw Error('提示词与已保存角色模板不一致，请在人物定妆中按字段修改并保存，或选择对应的历史配方复现');
  return { ...doc, assetId };
}
