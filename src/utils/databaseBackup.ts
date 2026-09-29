import { db } from "./db";
import knex from "knex";
import initDB from "@/lib/initDB";

export async function ensureBackupSchema() {
  // 保留当前版本的结构，避免丢失迁移字段及扩展表。
  await (await import("./promptLibrary")).ensurePromptLibrary();
  await (await import("./cameraMotionStore")).ensureCameraLibrary();
  await (await import("./cameraSkillLibrary")).ensureCameraSkills();
  await (await import("./cameraClips")).ensureCameraClips();
  await (await import("./soundLibrary")).ensureSoundLibrarySchema(db);
}

export async function exportDatabase() {
  await ensureBackupSchema();
  return db.transaction(async tx => {
    const tables = await tx("sqlite_master").where("type", "table").whereNot("name", "like", "sqlite_%").whereNot("name", "like", "knex_%").select("name");
    const data: Record<string, unknown[]> = {};
    for (const { name } of tables) data[name] = await tx(name).select("*");
    return { exportTime: Date.now(), tables: data };
  });
}

export async function importDatabase(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !Object.keys(input).length) throw Error("无效的导入数据格式");
  // 原版导出也包含这些核心表，拒绝把局部对象误当成完整备份。
  for (const name of ["o_user", "o_setting", "o_project", "o_assets", "o_script"]) {
    if (!Object.hasOwn(input, name)) throw Error(`备份不完整，缺少核心数据表：${name}`);
  }
  await ensureBackupSchema();
  await db.transaction(async tx => {
    const tables = await tx("sqlite_master").where("type", "table").whereNot("name", "like", "sqlite_%").whereNot("name", "like", "knex_%").select("name");
    const known = new Set(tables.map(t => t.name));
    const imported = Object.entries(input);
    // 先检查全部结构；任何不兼容都在删除数据前中止。
    for (const [name, rows] of imported) {
      if (!known.has(name)) throw Error(`备份包含当前版本不支持的数据表：${name}`);
      if (!Array.isArray(rows)) throw Error(`数据表格式无效：${name}`);
      const columns = new Set(Object.keys(await tx(name).columnInfo()));
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row) || !Object.keys(row).length) throw Error(`数据行格式无效：${name}`);
        for (const key of Object.keys(row)) if (!columns.has(key)) throw Error(`备份字段与当前版本不兼容：${name}.${key}`);
      }
    }
    await tx.raw("PRAGMA defer_foreign_keys = ON");
    for (const { name } of tables) await tx(name).delete();
    for (const [name, rows] of imported) {
      try {
        // 逐行插入兼容不同字段集合及 SQLite 绑定参数上限。
        for (const row of rows as Record<string, any>[]) await tx(name).insert(row);
      } catch {
        // SQL 错误可能包含密钥等整行数据，禁止回传驱动原始错误。
        throw Error(`数据表导入失败，已取消本次导入：${name}`);
      }
    }
  });
}

export async function resetDatabase() {
  // 先在独立内存库生成默认数据；任何初始化失败都不触碰现有数据库。
  const defaults = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
  try {
    await initDB(defaults);
    const tables = await defaults("sqlite_master").where("type", "table").whereNot("name", "like", "sqlite_%").select("name");
    const data: Record<string, unknown[]> = {};
    for (const { name } of tables) data[name] = await defaults(name).select("*");
    await importDatabase(data);
  } finally {
    await defaults.destroy();
  }
}
