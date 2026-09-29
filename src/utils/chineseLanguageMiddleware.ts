import type { LanguageModelV3Middleware, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { PROMPT_LANGUAGE_RULE, withPromptLanguage } from "./promptLanguage";
import { simplifiedChinese, simplifyToolInput } from "./simplifiedChinese";

/** 覆盖普通生成、代理工具调用及流式回复；协议元数据不参与转换。 */
export const chineseLanguageMiddleware: LanguageModelV3Middleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => ({ ...params, prompt: params.prompt.some(part => part.role === "system")
    ? params.prompt.map(part => part.role === "system" ? { ...part, content: withPromptLanguage(part.content) } : part)
    : [{ role: "system", content: PROMPT_LANGUAGE_RULE }, ...params.prompt],
  }),
  wrapGenerate: async ({ doGenerate }) => {
    const result = await doGenerate();
    return { ...result, content: result.content.map(part => {
      if (part.type === "text" || part.type === "reasoning") return { ...part, text: simplifiedChinese(part.text) };
      if (part.type === "tool-call") return { ...part, input: simplifyToolInput(part.input) };
      return part;
    }) };
  },
  wrapStream: async ({ doStream }) => {
    const result = await doStream();
    const pending = new Map<string, { part: any; text: string }>();
    return { ...result, stream: result.stream.pipeThrough(new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
      transform(part, controller) {
        if (part.type === "text-delta" || part.type === "reasoning-delta" || part.type === "tool-input-delta") {
          const key = part.type + ":" + part.id;
          const entry = pending.get(key) || { part, text: "" };
          entry.text += part.delta;
          pending.set(key, entry);
          // 按段落输出，避免词组、转义序列及 URL 跨数据块时被破坏。
          if (part.type !== "tool-input-delta") {
            const end = entry.text.lastIndexOf("\n") + 1;
            if (end) { controller.enqueue({ ...part, delta: simplifiedChinese(entry.text.slice(0, end)) }); entry.text = entry.text.slice(end); }
          }
          return;
        }
        if (part.type === "text-end" || part.type === "reasoning-end" || part.type === "tool-input-end") {
          const key = part.type.replace(/end$/, "delta") + ":" + part.id;
          const entry = pending.get(key);
          if (entry?.text) controller.enqueue({ ...entry.part, delta: part.type === "tool-input-end" ? simplifyToolInput(entry.text) : simplifiedChinese(entry.text) });
          pending.delete(key);
        }
        if (part.type === "tool-call") part = { ...part, input: simplifyToolInput(part.input) };
        controller.enqueue(part);
      },
      flush(controller) {
        for (const entry of pending.values()) if (entry.text) controller.enqueue({ ...entry.part, delta: entry.part.type === "tool-input-delta" ? simplifyToolInput(entry.text) : simplifiedChinese(entry.text) });
      },
    })) };
  },
};
