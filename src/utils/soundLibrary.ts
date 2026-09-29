import type { Knex } from "knex";
import fs from "node:fs/promises";
import path from "node:path";
import getPath from "./getPath";

export type LibrarySound = {
  id: string; name: string; category: string; categoryName: string; description: string;
  instrument?: string;
  usageNotice?: string; previewSrc?: string; originalSrc?: string;
  gender?: string; age?: string; traits?: string[]; language?: string;
  filePath: string; duration: number; sha256: string; bytes: number;
  author: string; license: string; sourceUrl: string; provenance: string;
};
export async function soundCatalog(): Promise<LibrarySound[]> {
  const data = JSON.parse(await fs.readFile(getPath("audio-library/catalog.json"), "utf8"));
  return data.sounds;
}
export async function soundWithUrl(sound: LibrarySound) {
  return { ...sound, src: `/oss${sound.filePath}`, creditUrl: "/oss/library/audio/CREDITS.md" };
}
export async function requireSound(id: string) {
  const sound = (await soundCatalog()).find(s => s.id === id);
  if (!sound || !/^\/library\/audio\/(voices|effects|music)\/[a-z0-9-]+\.wav$/.test(sound.filePath)) throw new Error("未知声音素材，请重新选择");
  const file = getPath(path.join("oss", sound.filePath.slice(1)));
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile() || stat.size !== sound.bytes) throw new Error("本地声音文件缺失或不完整，请修复素材库后重试");
  return sound;
}
export async function ensureSoundLibrarySchema(db: Knex) {
  if (!(await db.schema.hasTable("o_soundLibraryAssets"))) {
    await db.schema.createTable("o_soundLibraryAssets", t => {
      t.integer("projectId").notNullable(); t.string("key").notNullable();
      t.integer("parentId").notNullable(); t.integer("childId").notNullable(); t.integer("imageId").notNullable();
      t.primary(["projectId", "key"]);
    });
  }
}
async function insertSound(tx: Knex.Transaction, projectId: number, sound: LibrarySound, repair: boolean) {
  const old = await tx("o_soundLibraryAssets").where({ projectId, key: sound.id }).first();
  let parentId: number | undefined, childId: number | undefined;
  if (old) {
    const parent = await tx("o_assets").where({ id: old.parentId, projectId, type: "audio" }).first();
    const child = await tx("o_assets").where({ id: old.childId, projectId, assetsId: old.parentId, type: "audio" }).first();
    if (!repair || (parent && child?.imageId && await tx("o_image").where({ id: child.imageId, filePath: sound.filePath }).first())) return old;
    // Keep the parent ID and other character bindings when repairing a removed audio version.
    parentId = parent?.id; childId = parent ? child?.id : undefined;
  }
  const describe = `${sound.description} ${sound.age || ""} ${(sound.traits || []).join("、")}。来源：${sound.author}；${sound.license}。${sound.usageNotice ? ` ${sound.usageNotice} 来源链接：${sound.sourceUrl}` : ""}`;
  if (!parentId) [parentId] = await tx("o_assets").insert({ projectId, type: "audio", name: sound.name, describe: `${sound.gender || sound.categoryName}|${describe}`, startTime: Date.now() });
  if (!childId) [childId] = await tx("o_assets").insert({ projectId, assetsId: parentId, type: "audio", name: sound.name, describe, prompt: sound.description, startTime: Date.now() });
  const [imageId] = await tx("o_image").insert({ assetsId: childId, type: "audio", filePath: sound.filePath, state: "已完成", model: "local-sound-library" });
  await tx("o_assets").where({ id: childId }).update({ imageId });
  const record = { projectId, key: sound.id, parentId, childId, imageId };
  await tx("o_soundLibraryAssets").insert(record).onConflict(["projectId", "key"]).merge();
  if (old && old.parentId !== parentId) await tx("o_assetsRole2Audio").where({ assetsAudioId: old.parentId }).update({ assetsAudioId: parentId });
  return record;
}
export async function importProjectSounds(db: Knex, projectId: number) {
  if (!(await db("o_project").where({ id: projectId }).first())) throw new Error("项目不存在");
  const sounds = await soundCatalog();
  const existing = await db("o_soundLibraryAssets").where({ projectId }).select("key");
  const ids = new Set(existing.map(r => r.key));
  const missing = sounds.filter(s => !ids.has(s.id));
  for (const sound of missing) await requireSound(sound.id);
  if (missing.length) await db.transaction(async tx => { for (const sound of missing) await insertSound(tx, projectId, sound, false); });
  return { count: sounds.length, imported: missing.length };
}
export async function selectedAssetSound(db: Knex, projectId: number, assetId: number) {
  const asset = await db("o_assets").where({ id: assetId, projectId }).whereIn("type", ["role", "scene", "tool"]).first();
  if (!asset) throw new Error("资产不存在或不属于当前项目");
  const bindings = await db("o_assetsRole2Audio").where({ assetsRoleId: assetId }).select("assetsAudioId");
  const match = bindings.length ? await db("o_soundLibraryAssets").where({ projectId }).whereIn("parentId", bindings.map(b => b.assetsAudioId)).first() : null;
  const id = match?.key || (!bindings.length ? asset.defaultVoice : null);
  const sound = (await soundCatalog()).find(s => s.id === id) || null;
  return { assetId, type: asset.type, defaultVoice: asset.defaultVoice ?? null, selectedSound: sound?.id ?? null, sound: sound ? await soundWithUrl(sound) : null, customAudio: bindings.length > 0 && !match };
}
export async function selectAssetSound(db: Knex, projectId: number, assetId: number, soundId: string | null) {
  const sound = soundId ? await requireSound(soundId) : null;
  await db.transaction(async tx => {
    const asset = await tx("o_assets").where({ id: assetId, projectId }).whereIn("type", ["role", "scene", "tool"]).first();
    if (!asset) throw new Error("资产不存在或不属于当前项目");
    if (sound?.category === "music") throw new Error("影视配乐请加入项目音频资产，用于后期配乐，不绑定人物声线");
    if (sound?.category === "voice" && asset.type !== "role") throw new Error("人物声线只能选择给角色；场景和道具请选择环境或动物声音");
    if (sound) {
      const imported = await insertSound(tx, projectId, sound, true);
      await tx("o_assetsRole2Audio").where({ assetsRoleId: assetId }).delete();
      await tx("o_assetsRole2Audio").insert({ assetsRoleId: assetId, assetsAudioId: imported.parentId });
    } else {
      // Clearing a built-in default never deletes an independently uploaded reference.
      const managed = await tx("o_soundLibraryAssets").where({ projectId }).select("parentId");
      await tx("o_assetsRole2Audio").where({ assetsRoleId: assetId }).whereIn("assetsAudioId", managed.map(m => m.parentId)).delete();
    }
    await tx("o_assets").where({ id: assetId }).update({ defaultVoice: sound?.category === "voice" ? sound.id : null });
  });
  return selectedAssetSound(db, projectId, assetId);
}
// Keep the original audio picker and automatic audio matching in sync with defaults.
export async function bindProjectAudio(db: Knex, assetId: number, audioId: number | null) {
  await db.transaction(async tx => {
    const asset = await tx("o_assets").where({ id: assetId }).whereIn("type", ["role", "scene", "tool"]).first();
    if (!asset) throw new Error("资产不存在");
    if (audioId && !(await tx("o_assets").where({ id: audioId, projectId: asset.projectId, type: "audio", assetsId: null }).first())) throw new Error("音频不存在或不属于当前项目");
    const library = audioId ? await tx("o_soundLibraryAssets").where({ projectId: asset.projectId, parentId: audioId }).first() : null;
    const voice = library ? (await soundCatalog()).find(s => s.id === library.key && s.category === "voice") : null;
    await tx("o_assetsRole2Audio").where({ assetsRoleId: assetId }).delete();
    if (audioId) await tx("o_assetsRole2Audio").insert({ assetsRoleId: assetId, assetsAudioId: audioId });
    await tx("o_assets").where({ id: assetId }).update({ defaultVoice: asset.type === "role" ? voice?.id ?? null : null });
  });
}

export function audioReferenceLimit(mode: unknown): number {
  let value = mode;
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { return 0; } }
  if (!Array.isArray(value)) return 0;
  const entry = value.find(v => typeof v === "string" && /^audioReference:\d+$/i.test(v));
  return entry ? Math.max(0, Number(entry.split(":")[1])) : 0;
}
