import type { Knex } from "knex";
import fs from "node:fs/promises";
import { db } from "./db";
import oss from "./oss";
import getPath from "./getPath";
import { canonicalMediaPath } from "./productionStorage";

type AssetRow = { id: number; projectId: number | null; assetsId: number | null; flowId: number | null; type: string | null; imageId: number | null };
export type DeletionFiles = { media: string[]; archives: string[] };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** 在调用者事务中清理整棵资产树；文件只在提交成功后处理。 */
export async function deleteAssetRows(tx: Knex.Transaction, requested: number[], projectId?: number): Promise<DeletionFiles> {
  const files: DeletionFiles = { media: [], archives: [] };
  const roots: AssetRow[] = await tx("o_assets").whereIn("id", requested).modify(q => { if (projectId !== undefined) q.where({ projectId }); });
  const rows = new Map<number, AssetRow>(roots.map(r => [r.id, r]));
  let frontier = roots;
  while (frontier.length) {
    const children = await tx("o_assets").whereIn("assetsId", frontier.map(r => r.id));
    frontier = children.filter(r => !rows.has(r.id) && rows.get(r.assetsId!)?.projectId === r.projectId);
    for (const r of frontier) rows.set(r.id, r);
  }
  const ids = [...rows.keys()];
  if (!ids.length) return files;
  const emptyAudioParents: number[] = [];
  for (const parentId of new Set([...rows.values()].filter(r => r.type === "audio" && r.assetsId != null).map(r => r.assetsId!))) {
    if (!(await tx("o_assets").where({ assetsId: parentId }).whereNotIn("id", ids).first())) emptyAudioParents.push(parentId);
  }
  const removedAudioBindings = [...ids, ...emptyAudioParents];
  const removedSoundParents = await tx.schema.hasTable("o_soundLibraryAssets")
    ? await tx("o_soundLibraryAssets").whereIn("parentId", ids).orWhereIn("childId", ids).pluck("parentId") : [];
  const affectedRoles = await tx("o_assetsRole2Audio").whereIn("assetsAudioId", [...removedAudioBindings, ...removedSoundParents]).pluck("assetsRoleId");
  await tx("o_assetsRole2Audio").whereIn("assetsRoleId", ids).orWhereIn("assetsAudioId", removedAudioBindings).delete();
  if (await tx.schema.hasColumn("o_assets", "defaultVoice")) await tx("o_assets").whereIn("id", affectedRoles).update({ defaultVoice: null });
  await tx("o_scriptAssets").whereIn("assetId", ids).delete();
  await tx("o_assets2Storyboard").whereIn("assetId", ids).delete();
  if (await tx.schema.hasTable("o_soundLibraryAssets")) {
    await tx("o_soundLibraryAssets").whereIn("parentId", ids).orWhereIn("childId", ids).delete();
  }
  const projects = new Map<number | null, AssetRow[]>();
  for (const row of rows.values()) projects.set(row.projectId, [...(projects.get(row.projectId) || []), row]);
  for (const [owner, members] of projects) {
    const targetIds = members.map(r => r.id);
    if (await tx.schema.hasTable("o_characterPortrait")) await tx("o_characterPortrait").where({projectId:owner}).whereIn("assetId",targetIds).delete();
    for (const table of ["o_promptStandard", "o_generationRecipe"]) {
      if (!(await tx.schema.hasTable(table))) continue;
      const query = () => tx(table).where({ projectId: owner, kind: "asset" }).whereIn("targetId", targetIds);
      if (table === "o_generationRecipe") {
        for (const r of await query()) {
          if (uuid.test(String(r.id))) files.archives.push(getPath(["reproduction", r.id]));
          if (r.filePath) files.media.push(r.filePath);
        }
      }
      await query().delete();
    }
  }
  await tx("o_assets").whereIn("id", ids).update({ imageId: null });
  const selected = [...rows.values()].map(r => r.imageId).filter((id): id is number => id != null);
  const images = await tx("o_image").whereIn("assetsId", ids).orWhere(q => q.whereNull("assetsId").whereIn("id", selected));
  const retained = new Set(await tx("o_assets").whereIn("imageId", images.map(i => i.id)).pluck("imageId"));
  const removed = images.filter(i => !retained.has(i.id));
  // 旧数据可能让两个资产选中同一图片，保留仍在使用的图片。
  if (retained.size) await tx("o_image").whereIn("id", [...retained]).update({ assetsId: null });
  await tx("o_image").whereIn("id", removed.map(i => i.id)).delete();
  files.media.push(...removed.map(i => i.filePath).filter(Boolean));
  await tx("o_assets").whereIn("id", ids).delete();
  const flowIds = [...rows.values()].map(r => r.flowId).filter((id): id is number => id != null);
  for (const id of new Set(flowIds)) {
    if (!(await tx("o_assets").where({ flowId: id }).first()) && !(await tx("o_storyboard").where({ flowId: id }).first())) await tx("o_imageFlow").where({ id }).delete();
  }
  return files;
}

/** 保留其他素材、历史方案仍在使用的文件，以及 OSS 保护的共享声音。 */
export async function cleanDeletionFiles(files: DeletionFiles) {
  const retained = new Set<string>();
  const remember = (file: unknown) => { if (typeof file === "string" && file) retained.add(canonicalMediaPath(file)); };
  for (const table of ["o_image", "o_storyboard", "o_video", "o_cameraClip", "o_generationRecipe"]) {
    if (await db.schema.hasTable(table)) for (const r of await db(table).whereNotNull("filePath").select("filePath")) remember(r.filePath);
  }
  if (await db.schema.hasTable("o_promptStandard")) {
    for (const r of await db("o_promptStandard").select("data")) {
      try { for (const ref of JSON.parse(r.data).references || []) remember(ref.path); } catch { /* 旧方案无法解析不影响已完成的数据库删除。 */ }
    }
  }
  for (const file of new Set(files.media)) {
    if (retained.has(canonicalMediaPath(file))) continue;
    try { await oss.deleteFile(file); } catch (e: any) { if (e.code !== "ENOENT") throw e; }
  }
  for (const directory of new Set(files.archives)) await fs.rm(directory, { recursive: true, force: true });
}

export async function deleteAssets(ids: number[], projectId?: number) {
  const files = await db.transaction(tx => deleteAssetRows(tx, ids, projectId));
  await cleanDeletionFiles(files);
}
