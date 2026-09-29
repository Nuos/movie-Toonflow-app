/** 全项目中文内容规则：保留内容含义与协议，统一为简体中文。 */
export const PROMPT_LANGUAGE_RULE = `【项目内容与生成提示词的语言要求】
新生成的提示词正文默认使用简体中文，适用于人物定妆照、角色/场景/道具图、分镜图、镜头运动和视频提示词；视觉描述、动作、摄影与光线要求均写成可直接使用的简体中文。
这项本次输出语言要求优先于旧模板或示例中的英文正文、全部英文及强制中英双语要求。所有项目说明、剧本、分镜、角色资料和生成提示词以简体中文为主，禁止输出繁体字；不要因为引用素材、旧提示词或模型名称包含英文而改用英文。
保留模型协议所需的字段名、JSON/XML 键、标签、编号、占位符、模型 ID 和参数语法，例如 integrated_multimodal_description、subject_definitions、detailed_description、overall_soundscape、non_diegetic_music、[Shot N]、<Picture N>、<Subject N>、@图N、N/A；仅将这些字段中的新自然语言描述写为简体中文，不翻译或重排引用。
原始台词、人物/产品专名及画面中必须出现的文字保留含义、顺序与信息；其中的中文统一转换为简体字，禁止保留繁体字。非中文专名及明确要求的外语对白保留，不扩写或删改剧情。使用原有要求的输出结构与工具调用，不额外输出译文、语言说明或双语副本；不得借此覆盖未要求重新生成的手写内容。`;

export function withPromptLanguage(system: string | null | undefined): string {
  if (system?.endsWith(PROMPT_LANGUAGE_RULE)) return system;
  return [system?.trimEnd(), PROMPT_LANGUAGE_RULE].filter(Boolean).join("\n\n");
}
