import { Converter } from "opencc-js/t2cn";

const convert = Converter({ from: "t", to: "cn" });

/** 仅转换文字字形；资源地址和引用协议保持可用。 */
export function simplifiedChinese(text: string): string {
  if (/^\s*[\[{]/.test(text)) {
    try {
      const parsed = JSON.parse(text), converted = simplifyContent(parsed);
      return JSON.stringify(parsed) === JSON.stringify(converted) ? text : JSON.stringify(converted);
    } catch {}
  }
  return text.split(/((?:https?:\/\/|data:)[^\s<>"']+|`(?:\.{0,2}\/|[A-Za-z]:\\)[^`]+`|(?:\.{0,2}\/|[A-Za-z]:\\)[^\s<>"'，。；：]+|<\/?[A-Za-z][^>]*>|\[Shot\s+\d+\])/g)
    .map((part, index) => index % 2 ? part : convert(part)).join("");
}

// 只处理内容字段，禁止修改密钥、路径、模型名、枚举和身份标识。
const contentKeys = /^(?:name|title|label|tips|text|content|script|scriptPlan|storyboardTable|prompt|negativePrompt|videoPrompt|imagePrompt|videoDesc|describe|description|desc|intro|remark|reason|errorReason|message|detail|chapter|chapterData|reel|event|directorManual|artStyle|subject|style|composition|continuity|allowedChanges|exclusions|dialogue|action|source|context|instruction|instructions|summary|retention_analysis|detailed_description|integrated_multimodal_description|subject_definitions|overall_soundscape|non_diegetic_music|otherTextPrompt|requirements|purpose|motivation|startFrame|endFrame)$/i;
const opaqueKeys = /(?:id|ids|key|token|password|secret|hash|digest|url|uri|path|base64|model|code|embedding|signature|fileName|type|mode|status|state)$/i;
const jsonKeys = new Set(["data", "flowData", "messages", "options", "anchor", "variants", "boards", "shots", "nodes"]);

export function simplifyContent<T>(value: T, key = "", inherited = false): T {
  if (opaqueKeys.test(key)) return value;
  const prose = contentKeys.test(key) || inherited;
  if (typeof value === "string") {
    if (jsonKeys.has(key) || (prose && /^\s*[\[{]/.test(value))) {
      try { const parsed = JSON.parse(value); const result = simplifyContent(parsed); return (JSON.stringify(result) === JSON.stringify(parsed) ? value : JSON.stringify(result)) as T; } catch {}
    }
    return (prose || key === "data" ? simplifiedChinese(value) : value) as T;
  }
  if (Array.isArray(value)) return value.map(item => simplifyContent(item, "", prose)) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, simplifyContent(item, childKey)])) as T;
  }
  return value;
}

export function simplifyToolInput(input: string): string {
  try { const parsed = JSON.parse(input); const converted = simplifyContent(parsed); return JSON.stringify(parsed) === JSON.stringify(converted) ? input : JSON.stringify(converted); }
  catch { return input; } // 不修补无效工具调用，交给原有校验流程。
}
