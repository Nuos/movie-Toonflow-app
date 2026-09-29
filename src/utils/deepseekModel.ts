import fs from "node:fs";
import { parse } from "dotenv";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Server-side only: the shared credential never enters vendor code or browser settings.
export function createSharedDeepSeekModel(model: string, think = model === "deepseek-v4-pro", level = 2) {
  if (!["deepseek-flash", "deepseek-v4-pro"].includes(model)) throw new Error("未配置的 DeepSeek 模型");
  const env = parse(fs.readFileSync("/home/ubuntu/.config/llm/deepseek.env"));
  if (!env.DEEPSEEK_API_KEY) throw new Error("DeepSeek 共享配置缺少密钥");
  const baseURL = (env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  if (!/^https:\/\/api\.deepseek\.com(?:\/v1)?$/.test(baseURL)) throw new Error("DeepSeek 共享配置必须使用官方地址");
  return createOpenAICompatible({
    name: "deepseek",
    baseURL,
    apiKey: env.DEEPSEEK_API_KEY,
    fetch: async (url, options) => {
      if (new URL(String(url)).origin !== "https://api.deepseek.com") throw new Error("拒绝向非 DeepSeek 地址发送请求");
      const body = JSON.parse(String(options?.body || "{}"));
      const forcedTool = body.tool_choice === "required" || typeof body.tool_choice === "object";
      const thinking = think && !forcedTool;
      body.thinking = { type: thinking ? "enabled" : "disabled" };
      if (thinking) body.reasoning_effort = level >= 3 ? "max" : "high";
      const response = await fetch(url, { ...options, body: JSON.stringify(body), redirect: "error" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as any;
        throw new Error(`DeepSeek ${response.status}: ${error.error?.message || "请求失败"}`);
      }
      return response;
    },
  }).chatModel(model);
}
