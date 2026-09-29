declare const exports: any;
exports.vendor = {
  id: "codex", name: "OpenAI Codex · ChatGPT 登录", version: "2.0", author: "Local deployment",
  description: "通过官方 Codex App Server 使用本机 ChatGPT 登录；支持流式回复及 Toonflow 原生工具调用，使用 Codex 当前默认模型。",
  inputs: [], inputValues: {},
  models: [{ name: "Codex 内置出图（ChatGPT 额度）", modelName: "codex-image", type: "image", mode: ["text", "singleImage", "multiReference"] },{ name: "Codex · 当前默认模型", modelName: "codex-default", type: "text", think: true }],
};
exports.textRequest = () => { throw new Error("请通过 Toonflow Codex 适配器调用"); };
exports.checkForUpdates = async () => ({ hasUpdate: false, latestVersion: "1.0", notice: "本地 Codex 适配器" });
exports.updateVendor = async () => "";
