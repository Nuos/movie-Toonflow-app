import { createHash } from "node:crypto";

export const STANDARD_VERSION = "toonflow-prompts/1.0";
export const CHARACTER_STYLES = [
  { id: "photoreal", name: "超真实", gender: "女性", subject: "成年女性，约25岁，自然五官比例，真实皮肤纹理，中长黑发；简洁现代服饰，无夸张妆容。", style: "超真实摄影，真实人体比例、皮肤毛孔与发丝，自然镜头质感，柔和影棚照明，中性灰背景；避免塑料皮肤和卡通渲染。" },
  { id: "historical", name: "古装", gender: "女性", subject: "成年女性，约25岁，东方五官，黑色长发盘成统一发髻，素雅交领长裙、布腰带与一支玉簪；服装层次、纹样与配饰在四视图完全一致。", style: "写实古装影视定妆摄影，丝麻织物纹理真实，发饰工艺清晰，柔和影棚照明，中性灰背景；无现代物件、无奇幻法术效果。" },
  { id: "fantasy", name: "玄幻", gender: "女性", subject: "成年女性，约25岁，东方五官，黑色长发半束，层叠轻甲与长裙，银色细纹护腕、统一玉石发冠；服饰、法器与标志纹样在四视图完全一致。", style: "东方玄幻电影质感，写实人体比例与精细服饰材质，低强度灵纹微光，柔和影棚照明，中性灰背景；法术效果不遮挡面容和服装结构。" },
] as const;
export const FOUR_VIEW_LAYOUT = "单张16:9横幅四视图定妆照：从左至右，正面头像特写（28%宽）、正面全身0°、角色自身左侧全身90°（鼻尖朝画面左方）、背面全身180°不回头；三个全身同缩放、同头顶高度与脚底基线，头脚完整。四视图同一身份、年龄、肤色、发型、服装和配饰，左右不镜像；中性浅灰背景、统一柔光。基本信息默认关闭。";
export type TargetKind = "asset" | "storyboard" | "track";
export interface SemanticAnchor {
  subject: string;
  style: string;
  composition: string;
  continuity: string;
  allowedChanges: string;
  exclusions: string;
}
export interface PromptVariant { id: string; name: string; difference: string; prompt: string }
export const TEMPLATE_GROUPS = [
  { id: "faithful", name: "A · 忠实复现", image: "严格复用基准构图、主体比例和外观；保留原有细节分布。", video: "忠实执行原镜头运动，动作按原有顺序和已分配的阶段时间自然展开，保留真实受力、呼吸与最后两秒的明确结果姿态。" },
  { id: "detail", name: "B · 细节表现", image: "固定原有机位、景别、主体位置；在相同材质范围内细化已有纹理与表面质感，不新增物件。", video: "保持原运镜方向及事件顺序；在主要动作发生前短暂蓄力，强调原文已有的手部、身体或物体受力变化，随后完成动作。" },
  { id: "rhythm", name: "C · 节奏变化", image: "固定原有空间布局、外观和光照体系；只对允许变化的细节做轻微自然调整，无法判断时保持原样。", video: "保持原运镜方向、动作顺序和结果；动作起步稍缓，主要动作阶段稍快，结尾至少两秒维持已经写明的结果姿态与目光目标；总时长和对白完整性不变。" },
] as const;
export const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const stableSeed = (value: string) => parseInt(digest(value).slice(0, 12), 16);

export function anchorText(a: SemanticAnchor) {
  return `【固定语义锚点】\n主体：${a.subject}\n风格：${a.style}\n框架与构图：${a.composition}\n连续性：${a.continuity}\n允许变化：${a.allowedChanges}\n禁止：${a.exclusions}`;
}

export function compileImages(a: SemanticAnchor, body: string, referenceCount = 0): PromptVariant[] {
  const reference = referenceCount ? "以所提供的基准参考图为视觉依据。参考图与文字共同约束主体身份、空间框架、服饰、材质及风格。" : "依据以下已固定的主体、风格、构图生成基准图。";
  return TEMPLATE_GROUPS.map(g => ({ id: g.id, name: g.name, difference: g.image,
    prompt: `${reference}\n${anchorText(a)}\n\n【画面内容】\n${body}\n\n【本组变化】\n${g.image}\n固定锚点优先于变化；只允许微小差异，不改变整体框架、风格和主体。` }));
}

const H3_FIELDS = ["subject_definitions", "summary", "retention_analysis", "detailed_description", "integrated_multimodal_description", "overall_soundscape", "non_diegetic_music"];
export function parseH3(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    if (parsed && typeof parsed === "object") for (const key of H3_FIELDS) if (parsed[key] != null) result[key] = typeof parsed[key] === "string" ? parsed[key] : JSON.stringify(parsed[key]);
  } catch {}
  if (!Object.keys(result).length) for (const key of H3_FIELDS) {
    const match = text.match(new RegExp(`^[ \\t]*${key}[ \\t]*:[ \\t]*([\\s\\S]*?)(?=^[ \\t]*(?:${H3_FIELDS.join("|")})[ \\t]*:|(?![\\s\\S]))`, "mi"));
    if (match) result[key] = match[1].trim();
  }
  return result;
}

export function unwrapTemplate(source: string, kind: TargetKind) {
  let text = source;
  for (let i = 0; i < 10; i++) {
    if (kind !== "track") {
      const found = text.match(/【画面内容】\s*([\s\S]*?)\s*【本组变化】/);
      if (!found) break;
      text = found[1];
    } else {
      const fields = parseH3(text);
      const field = fields.detailed_description != null ? "detailed_description" : "integrated_multimodal_description";
      const found = (fields[field] || text).match(/【镜头内容与原始台词】\s*([\s\S]*?)\s*【动作执行】/);
      if (!found) break;
      if (fields[field] != null) { fields[field] = found[1]; text = Object.entries(fields).map(([k,v]) => `${k}: ${v}`).join("\n\n"); }
      else text = found[1];
    }
  }
  return text;
}

export function compileVideos(a: SemanticAnchor, body: string, duration: number, mode: string, refs: {type: string; name: string}[], model: string): PromptVariant[] {
  // Model-specific LLM output may already be an H3 document. Recompose its
  // sections once instead of nesting a second complete document in Shot 1.
  const fields = parseH3(unwrapTemplate(body, "track"));
  const originalNarrative = fields.detailed_description || fields.integrated_multimodal_description || unwrapTemplate(body, "track");
  const referenceMode = mode.startsWith("[") || model.includes("h3-reference");
  const pictures = refs.filter(r => r.type === "image");
  let prefix = "";
  if (mode === "singleImage" && pictures.length) prefix = "For the target video, at 0 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\n";
  else if (mode === "startEndRequired" && pictures.length >= 2) prefix = `How the reference pictures align with the target video — Picture 1 aligns with the 0-second mark; Picture 2 aligns with the ${duration}-second mark.\n\n`;
  else if (mode.startsWith("[")) prefix = pictures.map((r, i) => `<Picture ${i+1}>：${r.name}`).join("\n") + "\n\n";
  const sound = fields.overall_soundscape || [...body.matchAll(/音效[：:]([^\n]+?)(?=关联资产|$)/gm)].map(m => m[1]).join("；") || "仅保留原镜头描述明确指定的环境音、动作音与呼吸声。";
  const music = fields.non_diegetic_music || "N/A";
  const counts: Record<string, number> = {};
  const refDefinitions = refs.map(r => { const label = r.type === "audio" ? "Audio" : r.type === "video" ? "Video" : "Picture"; counts[label] = (counts[label] || 0)+1; return `<${label} ${counts[label]}>：${r.name}`; }).join("\n");
  return TEMPLATE_GROUPS.map(g => {
    // Keep the complete source (including every dialogue) in every alternative.
    const narrative = `${anchorText(a)}\n\n【镜头内容与原始台词】\n${originalNarrative.match(/\[Shot\s*\d+\]/i) ? originalNarrative : "[Shot 1] " + originalNarrative}\n\n【动作执行】\n${g.video}\n目标时长：${duration}秒。原文要求切镜才切镜；不添加剧情、台词、人物或道具，不改变既定镜头轴线。对白按原语言完整表达，不显示字幕；对白时长优先，禁止为节奏变化截断台词。`;
    const prompt = model.includes("h3") ? referenceMode
      ? `subject_definitions: ${fields.subject_definitions || refDefinitions || "按镜头原文定义主体，不虚构参考素材。"}\n\nsummary: ${fields.summary || "生成当前视频片段，保持参考主体、空间框架与风格，按原镜头顺序完成动作。"}\n\nretention_analysis: ${fields.retention_analysis || "保留已提供参考中的主体身份、服饰、背景布局与风格；动作变化以镜头原文为准。"}\n\ndetailed_description: ${narrative}\n\noverall_soundscape: ${sound}\n\nnon_diegetic_music: ${music}`
      : `${prefix}integrated_multimodal_description: ${narrative}\n\noverall_soundscape: ${sound}\n\nnon_diegetic_music: ${music}`
      : `${prefix}${narrative}\n\n声音：${sound}\n${music === "N/A" ? "无额外配乐。" : `配乐：${music}`}无字幕、水印。`;
    return { id: g.id, name: g.name, difference: g.video, prompt };
  });
}

export function validateVariants(variants: PromptVariant[]) {
  if (variants.length < 3 || new Set(variants.map(v => v.prompt)).size < 3) throw new Error("至少需要三套不同的完整提示词");
  if (variants.some(v => !v.prompt.includes("【固定语义锚点】") || v.prompt.length < 100)) throw new Error("提示词缺少固定语义锚点或完整内容");
}
