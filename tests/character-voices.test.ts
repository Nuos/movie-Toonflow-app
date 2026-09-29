import assert from "node:assert/strict";
import knex from "knex";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CHARACTER_VOICES, ensureCharacterVoiceColumn, saveCharacterVoice, characterVoiceContext, withCharacterVoices } from "../src/utils/characterVoices";

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-voices-"));
  const config = { client: "better-sqlite3", connection: { filename: path.join(temp, "test.sqlite") }, useNullAsDefault: true };
  let db = knex(config);
  try {
    await db.schema.createTable("o_assets", t => { t.integer("id").primary(); t.integer("projectId"); t.integer("assetsId"); t.string("name"); t.string("type"); t.text("prompt"); });
    await db.schema.createTable("o_storyboard", t => { t.integer("id"); t.integer("projectId"); t.integer("trackId"); });
    await db.schema.createTable("o_assets2Storyboard", t => { t.integer("assetId"); t.integer("storyboardId"); });
    await db("o_assets").insert([
      { id: 1, projectId: 10, type: "role", name: "角色甲", prompt: "原始人物图提示词" },
      { id: 2, projectId: 10, type: "role", name: "角色乙" },
      { id: 3, projectId: 10, type: "scene", name: "院子" },
      { id: 4, projectId: 10, type: "role", name: "角色甲·雨天", assetsId: 1 },
      { id: 5, projectId: 20, type: "role", name: "外部项目角色" },
    ]);
    await db("o_storyboard").insert([{ id: 101, projectId: 10, trackId: 100 }, { id: 201, projectId: 20, trackId: 200 }]);
    await db("o_assets2Storyboard").insert([{ assetId: 4, storyboardId: 101 }, { assetId: 5, storyboardId: 201 }]);
    await ensureCharacterVoiceColumn(db);
    await ensureCharacterVoiceColumn(db);
    assert.equal((await db("o_assets").whereNotNull("defaultVoice")).length, 0, "migration preserves existing characters without assigning voices");
    assert.equal(new Set(CHARACTER_VOICES.map(v => v.id)).size, CHARACTER_VOICES.length);
    for (const voice of CHARACTER_VOICES) await saveCharacterVoice(db, 10, 1, voice.id);
    await saveCharacterVoice(db, 10, 1, "male-deep");
    await saveCharacterVoice(db, 10, 2, "female-gentle");
    await saveCharacterVoice(db, 20, 5, "male-rough");
    await assert.rejects(() => saveCharacterVoice(db, 10, 1, "missing"), /未知声线/);
    await assert.rejects(() => saveCharacterVoice(db, 20, 1, "male-clear"), /不属于/);
    await assert.rejects(() => saveCharacterVoice(db, 10, 3, "male-clear"), /角色不存在/);
    await assert.rejects(() => saveCharacterVoice(db, 10, 999, null), /角色不存在/);
    assert.equal((await db("o_assets").where({ id: 1 }).first()).prompt, "原始人物图提示词");
    // Close and reopen SQLite to verify persistence beyond one process/connection.
    await db.destroy(); db = knex(config);
    assert.equal((await db("o_assets").where({ id: 1 }).first()).defaultVoice, "male-deep");
    const inherited = await characterVoiceContext(db, 10, 100);
    assert.match(inherited, /角色甲·雨天：低沉男声/);
    await saveCharacterVoice(db, 10, 4, "male-clear");
    assert.match(await characterVoiceContext(db, 10, 100), /角色甲·雨天：清朗男声/);
    const context = await characterVoiceContext(db, 10, 100, [{ id: 2, sources: "assets" }, { id: 5, sources: "assets" }, { id: 201, sources: "storyboard" }]);
    assert.match(context, /温柔女声/); assert.doesNotMatch(context, /外部项目角色/);
    assert.equal(await characterVoiceContext(db, 10, 999), "");
    assert.match(await characterVoiceContext(db, 10, 999, [{ id: 101, sources: "storyboard" }]), /清朗男声/);
    const prompt = "角色甲说：今天回家。风吹过院子。";
    const voiced = withCharacterVoices(prompt, context);
    assert.equal(withCharacterVoices(voiced, context), voiced, "does not duplicate voice blocks");
    assert.equal(withCharacterVoices(voiced, ""), prompt, "clearing removes managed defaults");
    assert.equal(withCharacterVoices(voiced, context, false), prompt, "muted output has no voice instructions");
    assert.match(voiced, /不为无台词的角色添加说话/); assert.match(voiced, /实际提供音频文件/); assert.ok(voiced.startsWith(prompt));
    const h3 = "integrated_multimodal_description: 今天回家。\n\noverall_soundscape: 风声\n\nnon_diegetic_music: N/A";
    const voicedH3 = withCharacterVoices(h3, context);
    assert.ok(voicedH3.indexOf("[Character voice defaults]") < voicedH3.indexOf("non_diegetic_music:"));
    assert.equal(withCharacterVoices(voicedH3, context), voicedH3);
    assert.equal(withCharacterVoices(voicedH3, ""), h3);
    const structured = JSON.stringify({ integrated_multimodal_description: prompt, overall_soundscape: "风声", non_diegetic_music: "N/A" });
    const voicedJson = withCharacterVoices(structured, context);
    assert.equal(JSON.parse(voicedJson).integrated_multimodal_description, prompt);
    assert.match(JSON.parse(voicedJson).overall_soundscape, /温柔女声/);
    assert.equal(withCharacterVoices(voicedJson, ""), structured);
    await saveCharacterVoice(db, 10, 1, null); await saveCharacterVoice(db, 10, 4, null);
    assert.equal(await characterVoiceContext(db, 10, 100), "");
    console.log(`PASS: ${CHARACTER_VOICES.length} presets, repeatable migration, persistent save/clear, invalid input and project checks, character inheritance, storyboard-only references, silent output, reference audio priority, idempotent prompt updates; zero inference`);
  } finally { await db.destroy(); await fs.rm(temp, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
