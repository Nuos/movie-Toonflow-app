import { assetMediaType } from "./assetMediaType";
import { canonicalMediaPath } from "./productionStorage";
import type { Knex } from "knex";
import getPath from "./getPath";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const kindCodes: Record<string, string> = { role: "CHR", scene: "SCN", tool: "PRP", audio: "AUD", video: "VID", storyboard: "SHOT", script: "EP" };
export function productionCode(projectId: number) { return `DR-${projectId}`; }
export function catalogCode(projectId: number, type: string, id: number) {
  return `${productionCode(projectId)}-${kindCodes[type] || "AST"}-${String(id).padStart(6, "0")}`;
}
export async function productionCatalog(projectId: number, storyboardId?: number, connection?: Knex) {
  const db: Knex = connection || (await import("./db")).db;
  const assets = await db("o_assets").leftJoin("o_image", "o_assets.imageId", "o_image.id").where("o_assets.projectId", projectId)
    .select("o_assets.id", "o_assets.name", "o_assets.type", "o_assets.describe", "o_assets.assetsId", "o_image.filePath");
  const linked = storyboardId ? await db("o_assets2Storyboard").where({ storyboardId }).select("assetId") : [];
  const relatedIds = new Set(linked.map(r => r.assetId));
  const entries = assets.map(a => ({ id: a.id, sources: "assets", code: catalogCode(projectId, a.type || "", a.id), name: a.name || "未命名素材", kind: a.type,
    type: assetMediaType(a), description: a.describe || "", related: relatedIds.has(a.id) || relatedIds.has(a.assetsId), filePath: a.filePath ? canonicalMediaPath(a.filePath) : null }));
  const boards = await db("o_storyboard").where({ projectId }).orderBy("scriptId").orderBy("index");
  const scripts = await db("o_script").where({ projectId }).select("id", "name");
  return { projectId, productionCode: productionCode(projectId), root: getPath(["oss", "productions", productionCode(projectId)]),
    assets: entries.sort((a,b) => Number(b.related)-Number(a.related) || a.id-b.id),
    episodes: scripts.map(s => ({ ...s, code: catalogCode(projectId, "script", s.id) })),
    shots: boards.map(b => ({ id: b.id, sources: "storyboard", code: catalogCode(projectId, "storyboard", b.id), episodeCode: catalogCode(projectId, "script", b.scriptId || 0), label: `S${String(Number(b.index)+1).padStart(2,"0")}`, filePath: b.filePath ? canonicalMediaPath(b.filePath) : null })),
  };
}
export async function writeProductionCatalog(projectId: number) {
  const catalog = await productionCatalog(projectId);
  await fs.mkdir(catalog.root, { recursive: true });
  const file = path.join(catalog.root, "catalog.json"), temp = file + `.${randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(catalog, null, 2)); await fs.rename(temp, file);
  return catalog;
}
