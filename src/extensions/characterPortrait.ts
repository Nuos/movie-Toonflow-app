import express from 'express';
import axios from 'axios';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import u from '@/utils';
import { db } from '@/utils/db';
import { success, error } from '@/lib/responseFormat';
import { ensurePromptLibrary, referenceData } from '@/utils/promptLibrary';
import { PORTRAIT_MODEL, portraitDocument, portraitWorker, portraitAsset, getPortrait, draftPortrait, savePortrait, ensurePortraits, portraitPatch, patchPortrait } from '@/utils/characterPortrait';

const router = express.Router();
const target = z.object({ projectId: z.number().int().positive(), assetId: z.number().int().positive() });
router.post('/create', async (req, res) => {
  const t = z.object({ projectId: z.number().int().positive(), name: z.string().trim().min(1).max(100), brief: z.string().trim().min(1).max(15000) }).strict().parse(req.body);
  if (!await db('o_project').where({id:t.projectId}).first()) throw Error('项目不存在');
  const [id] = await db('o_assets').insert({projectId:t.projectId,type:'role',name:t.name,describe:t.brief,prompt:'',promptState:'未生成',startTime:Date.now()});
  res.json(success({id,name:t.name,describe:t.brief}));
});
router.get('/projects', async (_req, res) => res.json(success(await db('o_project').select('id', 'name'))));
router.post('/list', async (req, res) => {
  const { projectId } = target.pick({ projectId: true }).parse(req.body);
  res.json(success(await db('o_assets').where({ projectId, type: 'role' }).whereNull('archivedAt').select('id', 'name', 'describe', 'imageId')));
});
router.post('/get', async (req, res) => {
  const t = target.parse(req.body); await ensurePortraits(); await ensurePromptLibrary();
  const document = await getPortrait(t.projectId, t.assetId);
  const history = await db('o_characterPortrait').where(t).orderBy('revision', 'desc').select('revision', 'createdAt');
  const recipes = await db('o_generationRecipe').where({ projectId: t.projectId, kind: 'asset', targetId: t.assetId }).orderBy('createdAt', 'desc');
  const images = [];
  for (const row of recipes) {
    const data = JSON.parse(row.data);
    if (data.portrait) images.push({ id: row.id, state: row.state, filePath: row.filePath, data, url: row.filePath ? await u.oss.getFileUrl(row.filePath) : null });
  }
  res.json(success({ document, history, images }));
});
router.post('/draft', async (req, res) => {
  const t = target.extend({ brief: z.string().min(1).max(15000), settings: z.record(z.string(), z.unknown()).default({}) }).strict().parse(req.body);
  res.json(success({ ...await draftPortrait(t.projectId, t.assetId, t.brief, t.settings), generatesMedia: false }));
});
router.post('/compile', async (req, res) => {
  const t = target.extend({ document: portraitDocument }).strict().parse(req.body);
  await portraitAsset(t.projectId, t.assetId);
  res.json(success({ ...await portraitWorker(t.document), generatesMedia: false }));
});
router.post('/save', async (req, res) => {
  const t = target.extend({ document: portraitDocument, expectedRevision: z.number().int().min(0), seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional() }).strict().parse(req.body);
  res.json(success(await savePortrait(t.projectId, t.assetId, t.document, t.expectedRevision, t.seed)));
});
router.post('/patch', async (req, res) => {
  const t=target.extend({expectedRevision:z.number().int().positive(),patches:z.array(portraitPatch).min(1).max(40)}).strict().parse(req.body);
  res.json(success(await patchPortrait(t.projectId,t.assetId,t.expectedRevision,t.patches)));
});
router.post('/revision', async (req, res) => {
  const t = target.extend({ revision: z.number().int().positive() }).strict().parse(req.body);
  await portraitAsset(t.projectId, t.assetId); await ensurePortraits();
  const row = await db('o_characterPortrait').where(t).first();
  if (!row) throw Error('角色历史版本不存在');
  res.json(success(JSON.parse(row.data)));
});
router.post('/generate', async (req, res) => {
  const t = target.extend({ generate: z.literal(true), expectedRevision: z.number().int().positive(), useReference: z.boolean().default(true) }).strict().parse(req.body);
  const doc = await getPortrait(t.projectId, t.assetId);
  if (!doc || doc.revision !== t.expectedRevision) throw Error('请先保存并确认当前角色版本');
  const generator = u.Ai.Image(PORTRAIT_MODEL);
  await generator.checkReady();
  try { await axios.get('http://127.0.0.1:10589/health', {timeout:10000}); }
  catch { throw Error('本地 Qwen / ComfyUI 不可用，请检查 NVIDIA 驱动和后端服务；角色模板已保存，可恢复后继续出图'); }
  const asset = await portraitAsset(t.projectId, t.assetId);
  const reference = t.useReference && asset.imageId ? await db('o_image').where({id:asset.imageId,assetsId:t.assetId}).first() : null;
  const referenceList = reference?.filePath ? [await referenceData(reference.filePath)] : [];
  const imageId = await db.transaction(async trx => {
    if (await trx('o_image').where({assetsId:t.assetId,state:'生成中'}).first()) throw Error('该角色已有生成任务，请等待完成');
    const [id] = await trx('o_image').insert({ assetsId: t.assetId, type: 'role', state: '生成中', prompt: doc.prompt, model: PORTRAIT_MODEL.split(':')[1], resolution: doc.settings.quality });
    return id;
  });
  const filePath = `/${t.projectId}/role/${randomUUID()}.png`;
  try {
    await generator.run({ prompt: doc.prompt, referenceList, size: '2K', aspectRatio: '16:9' }, {
      projectId: t.projectId, taskClass: '角色定妆照生成', describe: `角色定妆：${doc.name} · 版本${doc.revision}`, relatedObjects: JSON.stringify({ assetId: t.assetId }),
    });
    const saved = await generator.save(filePath, { imageId, assetId: t.assetId, projectId: t.projectId, type: 'role', model: PORTRAIT_MODEL.split(':')[1], resolution: doc.settings.quality });
    if (!saved) throw Error('生成已取消或角色已删除');
    // Candidate images are reviewed and selected explicitly via the original asset UI.
    res.json(success({ imageId, filePath, url: await u.oss.getFileUrl(filePath), reviewRequired: true }));
  } catch (e: any) {
    await db('o_image').where({ id: imageId, assetsId: t.assetId }).update({ state: '生成失败', errorReason: e.message });
    throw e;
  }
});
const checks = z.object({ four_views: z.boolean(), identity_and_costume: z.boolean(), angles_and_sides: z.boolean(), full_body_uncropped: z.boolean(), body_and_age: z.boolean(), cast_distinction: z.boolean(), optional_caption: z.boolean() }).strict();
router.post('/review', async (req, res) => {
  const t = target.extend({ recipeId: z.string().uuid(), checks, notes: z.string().trim().min(1).max(6000) }).strict().parse(req.body);
  await portraitAsset(t.projectId, t.assetId);
  const result = await db.transaction(async trx => {
    const row = await trx('o_generationRecipe').where({ id: t.recipeId, projectId: t.projectId, kind: 'asset', targetId: t.assetId }).first();
    if (!row?.filePath) throw Error('定妆图片尚未生成');
    const data = JSON.parse(row.data); if (!data.portrait) throw Error('不是人物定妆配方');
    const status = !data.portrait.pixelCheckPassed ? 'resolution_unmet' : Object.values(t.checks).every(Boolean) ? 'accepted' : 'visual_review_failed';
    const review = { checks: t.checks, notes: t.notes, status, createdAt: Date.now() };
    data.portrait.reviews = [...(data.portrait.reviews || []), review]; data.portrait.status = status;
    await trx('o_generationRecipe').where({ id: row.id }).update({ data: JSON.stringify(data) }); return review;
  });
  res.json(success(result));
});
router.use((err: any, _req: any, res: any, _next: any) => res.status(400).json(error(err.message || '角色定妆操作失败')));
export default router;
