import type { Knex } from "knex";

import voiceDesigns from "../../data/audio-library/voice-designs.json";

// Original fictional Mandarin samples, generated locally with matching style instructions.
export const CHARACTER_VOICES = voiceDesigns;

export function findCharacterVoice(id: string | null | undefined) {
  return CHARACTER_VOICES.find(v => v.id === id) || null;
}

export async function ensureCharacterVoiceColumn(db: Knex) {
  if (!(await db.schema.hasColumn("o_assets", "defaultVoice"))) {
    await db.schema.alterTable("o_assets", t => t.string("defaultVoice").nullable());
  }
}

export async function saveCharacterVoice(db: Knex, projectId: number, assetId: number, defaultVoice: string | null) {
  if (defaultVoice !== null && !findCharacterVoice(defaultVoice)) throw new Error("未知声线，请重新选择");
  const count = await db("o_assets").where({ id: assetId, projectId, type: "role" }).update({ defaultVoice });
  if (!count) throw new Error("角色不存在或不属于当前项目");
  return { assetId, defaultVoice, voice: findCharacterVoice(defaultVoice) };
}

export type VoiceReference = { id: number; sources: string };
export async function characterVoiceContext(db: Knex, projectId: number, trackId: number, info: VoiceReference[] = []) {
  // Include linked characters even when the generation input is only a storyboard image.
  const boards = await db("o_storyboard").where({ projectId }).andWhere(q => {
    q.where("trackId", trackId).orWhereIn("id", info.filter(i => i.sources === "storyboard").map(i => i.id));
  }).select("id");
  const links = await db("o_assets2Storyboard").whereIn("storyboardId", boards.map(b => b.id)).select("assetId");
  const ids = [...new Set([...links.map(l => l.assetId), ...info.filter(i => i.sources === "assets").map(i => i.id)])];
  if (!ids.length) return "";
  const roles = await db("o_assets").where({ projectId, type: "role" }).whereIn("id", ids).select("id", "assetsId", "name", "defaultVoice");
  const parents = await db("o_assets").where({ projectId, type: "role" }).whereIn("id", roles.map(r => r.assetsId).filter(Boolean)).select("id", "defaultVoice");
  const lines = roles.flatMap(role => {
    const voice = findCharacterVoice(role.defaultVoice ?? parents.find(p => p.id === role.assetsId)?.defaultVoice);
    return voice ? [`${role.name}：${voice.name}。${voice.description}`] : [];
  });
  return [...new Set(lines)].join("\n");
}

export function withCharacterVoices(prompt: string, context: string, audio = true): string {
  // Preserve structured H3 input; voice qualities belong to the soundscape.
  try {
    const data = JSON.parse(prompt);
    if (data && typeof data.overall_soundscape === "string") {
      const soundscape = withCharacterVoices(data.overall_soundscape, context, audio);
      return soundscape === data.overall_soundscape ? prompt : JSON.stringify({ ...data, overall_soundscape: soundscape });
    }
  } catch { /* Plain text prompts are the usual format. */ }
  // Reapplying or clearing defaults must not accumulate stale generated blocks.
  const base = prompt.replace(/\n*\[Character voice defaults\][\s\S]*?\[\/Character voice defaults\]/g, "");
  if (!audio || !context) return base;
  const block = `\n\n[Character voice defaults]\n以下声线只用于对应角色已有的台词，跨镜保持同一声音身份，情绪服从当前动作与剧情。声线说明中的年龄和气质仅描述声音，不改变参考图中的人物外貌或身份。完整保留原台词与画外旁白，不为无台词的角色添加说话或口型。只有实际提供音频文件时才使用音频引用，其声音身份优先于文字声线说明。\n${context}\n[/Character voice defaults]`;
  const music = /^non_diegetic_music:/m.exec(base);
  return music && /^overall_soundscape:/m.test(base)
    ? base.slice(0, music.index).trimEnd() + block + "\n\n" + base.slice(music.index)
    : base + block;
}
