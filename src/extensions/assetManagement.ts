import express from "express";
import { preserveSelectedPrompt, selectImagePrompt } from "@/utils/imagePrompts";
import { z } from "zod";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { db } from "@/utils/db";
import oss from "@/utils/oss";
import { deleteAssetRows, cleanDeletionFiles } from "@/utils/assetDeletion";

export async function ensureAssetManagementSchema(database: Knex) {
  if (!(await database.schema.hasColumn("o_image", "prompt"))) await database.schema.alterTable("o_image", t => t.text("prompt").nullable());
  for (const table of ["o_assets", "o_image"]) {
    if (!(await database.schema.hasColumn(table, "archivedAt"))) await database.schema.alterTable(table, t => t.bigInteger("archivedAt").nullable());
  }
}
const router = express.Router();
const target = z.object({ projectId: z.number().int().positive(), assetId: z.number().int().positive() });
async function owned(database: Knex | Knex.Transaction, projectId: number, assetId: number) {
  const asset = await database("o_assets").where({ id: assetId, projectId }).whereIn("type", ["role", "scene", "tool"]).first();
  if (!asset) throw new Error("资产不存在或不属于当前项目");
  return asset;
}
router.post("/list", async (req, res) => {
  const t = z.object({ projectId: z.number().int().positive(), archived: z.boolean().default(false), assetId: z.number().int().positive().optional() }).parse(req.body);
  const query = db("o_assets").where({ projectId: t.projectId }).whereIn("type", ["role", "scene", "tool"]);
  if (t.assetId) query.where({ id: t.assetId }); else query.whereNull("assetsId").modify(q => { t.archived ? q.whereNotNull("archivedAt") : q.whereNull("archivedAt"); });
  const rows = await query.orderBy("id");
  const data = await Promise.all(rows.map(async a => ({ ...a, images: await Promise.all((await db("o_image").where({ assetsId: a.id }).orderBy("id", "desc")).map(async i => ({ ...i, url: i.filePath ? await oss.getFileUrl(i.filePath) : null }))) })));
  res.json({ code: 200, data });
});
router.post("/change", async (req, res) => {
  const t = target.extend({ imageId: z.number().int().positive().optional(), action: z.enum(["archive", "restore", "delete", "select"]) }).parse(req.body);
  const files = await db.transaction(async tx => {
    const a = await owned(tx, t.projectId, t.assetId);
    if (!t.imageId) {
      if (t.action === "select") throw new Error("请选择图片");
      const images = await tx("o_image").where({ assetsId: a.id, state: "生成中" }).first();
      if (images) throw new Error("该资产正在生成，请等待完成或先取消任务");
      if (t.action === "delete") return deleteAssetRows(tx, [a.id], t.projectId);
      await tx("o_assets").where({ id: a.id }).update({ archivedAt: t.action === "archive" ? Date.now() : null });
    } else {
      const image = await tx("o_image").where({ id: t.imageId, assetsId: a.id }).first();
      if (!image) throw new Error("图片不存在或不属于当前资产");
      if (image.state === "生成中") throw new Error("图片正在生成，请先取消任务");
      if (t.action === "select") {
        if (image.archivedAt || a.archivedAt || !image.filePath) throw new Error("请先恢复归档项，且图片必须已完成");
        await selectImagePrompt(tx, a, image);
      } else if (t.action === "delete") {
        // Other assets may share the same image row: never break their live reference.
        if (await tx("o_assets").where({ imageId: image.id }).whereNot({ id: a.id }).first()) throw new Error("图片仍被其他资产使用，请先解除其他引用");
        await tx("o_assets").where({ imageId: image.id }).update({ imageId: null });
        await tx("o_image").where({ id: image.id }).delete();
        const files = { media: image.filePath ? [image.filePath] : [], archives: [] as string[] };
        // A removed version must not remain recoverable through its reproduction recipe.
        if (image.filePath && await tx.schema.hasTable("o_generationRecipe")) {
          const recipes = await tx("o_generationRecipe").where({ projectId: t.projectId, kind: "asset", targetId: a.id, filePath: image.filePath });
          const getPath = (await import("@/utils/getPath")).default;
          for (const recipe of recipes) if (/^[a-f0-9-]{36}$/i.test(recipe.id)) files.archives.push(getPath(["reproduction", recipe.id]));
          await tx("o_generationRecipe").whereIn("id", recipes.map(r => r.id)).delete();
        }
        return files;
      } else {
        await tx("o_image").where({ id: image.id }).update({ archivedAt: t.action === "archive" ? Date.now() : null });
        if (t.action === "archive") await preserveSelectedPrompt(tx, a);
        if (t.action === "archive") await tx("o_assets").where({ id: a.id, imageId: image.id }).update({ imageId: null });
      }
    }
    return { media: [], archives: [] };
  });
  await cleanDeletionFiles(files);
  res.json({ code: 200, data: { saved: true } });
});
router.post("/prompt", async (req, res) => {
  const t = target.extend({ imageId: z.number().int().positive(), prompt: z.string().max(100000) }).parse(req.body);
  await db.transaction(async tx => {
    const a = await owned(tx, t.projectId, t.assetId);
    const image = await tx("o_image").where({ id: t.imageId, assetsId: a.id }).first();
    if (!image) throw new Error("图片不属于此资产");
    await tx("o_image").where({ id: image.id }).update({ prompt: t.prompt });
    if (a.imageId === image.id) await tx("o_assets").where({ id: a.id }).update({ prompt: t.prompt });
  });
  res.json({code:200,data:{saved:true}});
});
// Create a separate single-view reference; selecting it remains an explicit native action.
router.post("/crop", async (req, res) => {
  const t = target.extend({imageId:z.number().int().positive(),left:z.number().int().nonnegative(),top:z.number().int().nonnegative(),width:z.number().int().positive(),height:z.number().int().positive()}).strict().parse(req.body);
  const a = await owned(db,t.projectId,t.assetId);
  const source = await db("o_image").where({id:t.imageId,assetsId:a.id}).first();
  if (a.archivedAt || !source?.filePath || source.archivedAt || source.state!=="已完成") throw Error("请先选择已完成且未归档的图片");
  const input = await oss.getFile(source.filePath);
  const pipeline = sharp(input,{limitInputPixels:40_000_000}).rotate();
  const normalized = await pipeline.png().toBuffer();
  const size = await sharp(normalized).metadata();
  if(t.left+t.width>size.width! || t.top+t.height>size.height!) throw Error("裁切范围超出原图");
  const pixels = await sharp(normalized).extract({left:t.left,top:t.top,width:t.width,height:t.height}).png().toBuffer();
  const filePath=`/${t.projectId}/${a.type}/${randomUUID()}.png`;
  await oss.writeFile(filePath,pixels);
  try {
    const data=await db.transaction(async tx=>{
      const current=await owned(tx,t.projectId,t.assetId);
      const original=await tx("o_image").where({id:t.imageId,assetsId:a.id}).first();
      if(current.archivedAt || original?.filePath!==source.filePath || original?.archivedAt) throw Error("原图已变化，请重新选择");
      const [imageId]=await tx("o_image").insert({assetsId:a.id,filePath,type:a.type,state:"已完成",prompt:"",model:`local-crop:${t.imageId}:${t.left},${t.top},${t.width},${t.height}`});
      return {assetId:a.id,imageId,filePath,url:await oss.getFileUrl(filePath),selected:false};
    });
    res.json({code:200,data});
  } catch(e) {await oss.deleteFile(filePath);throw e;}
});
router.post("/upload", async (req, res) => {
  const t = z.object({ projectId: z.number().int().positive(), assetId: z.number().int().positive().optional(), name: z.string().trim().min(1).max(100), type: z.enum(["role", "scene", "tool"]), base64: z.string().max(29_000_000) }).parse(req.body);
  if (!(await db("o_project").where({ id: t.projectId }).first())) throw new Error("项目不存在");
  const match = /^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(t.base64);
  if (!match) throw new Error("请选择 PNG、JPG 或 WebP 图片");
  const input = Buffer.from(match[2], "base64");
  if (input.length > 20 * 1024 * 1024) throw new Error("图片不能超过20MB");
  // Decode and normalize actual pixels; do not trust file extensions or client MIME.
  const image = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().png().toBuffer();
  const filePath = `/${t.projectId}/${t.type}/${randomUUID()}.png`;
  await oss.writeFile(filePath, image);
  try {
    const data = await db.transaction(async tx => {
      let id = t.assetId;
      if (id) {
        const asset = await owned(tx, t.projectId, id);
        if (asset.archivedAt) throw new Error("请先恢复资产再上传");
        await preserveSelectedPrompt(tx, asset);
        if (asset.type !== t.type) throw new Error("资产类型不匹配");
        if (await tx("o_image").where({ assetsId: id, state: "生成中" }).first()) throw new Error("请等待当前生成完成或取消后再上传");
      } else [id] = await tx("o_assets").insert({ projectId: t.projectId, name: t.name, type: t.type, prompt: "", describe: "", startTime: Date.now() });
      const [imageId] = await tx("o_image").insert({ assetsId: id, filePath, type: t.type, state: "已完成", model: "local-upload", prompt: "" });
      await tx("o_assets").where({ id }).update({ imageId, prompt: "", promptState: null });
      return { assetId: id, imageId };
    });
    res.json({ code: 200, data });
  } catch (e) { await oss.deleteFile(filePath); throw e; }
});
router.use((err: any, _req: any, res: any, _next: any) => res.status(400).json({ code: 400, message: err instanceof z.ZodError ? "资产操作参数不正确" : err.message || "资产操作失败" }));
export default router;
