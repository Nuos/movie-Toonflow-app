import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import express from "express";
const Database = require("better-sqlite3");

async function main() {
  const root = process.cwd(), temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-backup-"));
  await fs.chmod(temp, 0o700);
  await fs.mkdir(path.join(temp, "data"));
  const source = new Database(path.join(root, "data/db2.sqlite"), { readonly: true });
  await source.backup(path.join(temp, "data/db2.sqlite")); source.close();
  for (const folder of ["vendor", "skills", "modelPrompt", "audio-library"]) {
    await fs.cp(path.join(root, "data", folder), path.join(temp, "data", folder), { recursive: true });
  }
  await fs.symlink(path.join(root, "data/models"), path.join(temp, "data/models"));
  await fs.copyFile(path.join(root, "package.json"), path.join(temp, "package.json"));
  process.chdir(temp); process.env.NODE_ENV = "prod";
  await import("../src/utils");
  const { db } = await import("../src/utils/db");
  const { ensurePromptLibrary } = await import("../src/utils/promptLibrary");
  const { ensureCameraLibrary } = await import("../src/utils/cameraMotionStore");
  const { ensureCameraClips } = await import("../src/utils/cameraClips");
  const { ensureCameraSkills } = await import("../src/utils/cameraSkillLibrary");
  const { ensureSoundLibrarySchema } = await import("../src/utils/soundLibrary");
  await ensurePromptLibrary(); await ensureCameraLibrary(); await ensureCameraClips(); await ensureCameraSkills(); await ensureSoundLibrarySchema(db);
  const app = express(); app.use(express.json({ limit: "100mb" }));
  app.use("/export", (await import("../src/routes/setting/dbConfig/exportData")).default);
  app.use("/import", (await import("../src/routes/setting/dbConfig/importData")).default);
  app.use("/clear", (await import("../src/routes/setting/dbConfig/clearData")).default);
  app.use("/deleteAll", (await import("../src/routes/other/deleteAllData")).default);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const snapshot = async () => (await (await fetch(base + "/export")).json()).tables;
  const restore = async (tables: any) => fetch(base + "/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tables }) });
  try {
    const id = 99119600;
    await db("o_project").insert({ id, name: "备份兼容性隔离测试" });
    await db("o_assets").insert({ id, projectId: id, type: "role", name: "测试角色", defaultVoice: "male-deep" });
    await db("o_promptStandard").insert({ projectId: id, kind: "asset", targetId: id, revision: 1, data: "{}", createdAt: 1 });
    await db("o_cameraPlan").insert({ projectId: id, storyboardId: id, revision: 1, data: "{}", createdAt: 1 });
    const before = await snapshot();
    const result = await restore(before);
    assert.equal(result.status, 200, `roundtrip failed: ${(await result.json()).message || "unknown"}`);
    assert.deepEqual(await snapshot(), before, "all original and extension rows survive export/import");
    const invalid = structuredClone(before);
    invalid.o_project.push({ ...invalid.o_project[0] });
    const failure = await restore(invalid);
    assert.ok(failure.status >= 400, "duplicate primary key rejected");
    assert.deepEqual(await snapshot(), before, "failed import rolls back every table");
    const unknown = structuredClone(before); unknown.o_project[0].unknownBackupColumn = "unexpected";
    assert.ok((await restore(unknown)).status >= 400);
    assert.deepEqual(await snapshot(), before, "schema mismatch leaves database unchanged");
    assert.equal((await restore({ o_project: [] })).status, 400);
    assert.deepEqual(await snapshot(), before, "partial backup rejected without data loss");
    const empty = structuredClone(before); empty.o_cameraPlan = [];
    assert.equal((await restore(empty)).status, 200);
    assert.equal((await db("o_cameraPlan")).length, 0, "empty exported table clears existing rows");
    await ensureCameraLibrary(); await ensurePromptLibrary();
    assert.ok(await db.schema.hasColumn("o_assets", "defaultVoice"));
    const legacy = structuredClone(before);
    for (const name of ["o_promptStandard", "o_generationRecipe", "o_cameraPlan", "o_cameraClip", "o_cameraClipDraft", "o_cameraSkillSettings", "o_soundLibraryAssets"]) delete legacy[name];
    for (const asset of legacy.o_assets) delete asset.defaultVoice;
    assert.equal((await restore(legacy)).status, 200, "original export accepted without extension tables/columns");
    assert.equal((await db("o_project").where({ id }).first()).name, "备份兼容性隔离测试");
    for (const [route, method] of [["/clear", "GET"], ["/deleteAll", "POST"]]) {
      assert.equal((await restore(before)).status, 200);
      assert.equal((await fetch(base + route, { method })).status, 200, route);
      assert.equal((await db("o_project")).length, 0);
      assert.equal((await db("o_promptStandard")).length, 0);
      assert.equal((await db("o_cameraPlan")).length, 0);
      assert.equal((await db("o_soundLibraryAssets")).length, 0);
      assert.ok(await db("o_user").where({ id: 1 }).first());
      await ensureCameraLibrary(); await ensurePromptLibrary(); await ensureCameraClips();
      assert.ok(await db.schema.hasColumn("o_assets", "defaultVoice"));
      assert.ok(await db.schema.hasColumn("o_agentDeploy", "type"));
    }
    console.log(JSON.stringify({ pass: true, tables: Object.keys(before).length, checks: ["full-roundtrip", "extension-columns", "transaction-rollback", "schema-validation", "partial-backup-rejection", "empty-table", "legacy-backup", "both-reset-routes", "cached-schema-survives"] }));
  } finally {
    await new Promise<void>(r => server.close(() => r())); await db.destroy();
    process.chdir(root); await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
