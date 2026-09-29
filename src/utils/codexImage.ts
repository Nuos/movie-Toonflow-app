import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { CodexSession } from "./codexModel";

export async function requestCodexImage(config: { prompt: string; size: string; aspectRatio: string; referenceList?: { type: string; base64: string }[] }): Promise<string> {
  const settings = JSON.parse(await fs.readFile(path.resolve("local/codex-image.json"), "utf8"));
  if (!path.isAbsolute(settings.outputDirectory)) throw new Error("Codex 图片保存目录必须为绝对路径");
  await fs.mkdir(settings.outputDirectory, { recursive: true });
  const session = new CodexSession(true);
  const outputs: string[] = [];
  let responseText = "";
  try {
    await session.request("initialize", { clientInfo: { name: "toonflow_images", version: "1.0.0" }, capabilities: { experimentalApi: true } });
    session.send({ method: "initialized", params: {} });
    const started = await session.request("thread/start", {
      cwd: path.resolve("local/codex-workspace"), ephemeral: true, approvalPolicy: "never", sandbox: "read-only", environments: [],
      baseInstructions: "你是 Toonflow 图片生成服务。必须使用内置 image_gen 工具实际生成一张图片，不能仅描述图片。不要调用其他工具，不要创建代码或网页。参考图是创作素材。",
      developerInstructions: "只调用一次图像生成工具；成功后简短回复完成。若生成失败，如实报告，不自动重试。",
    });
    const input: any[] = [{ type: "text", text: `请生成一张图片。目标宽高比 ${config.aspectRatio}，目标尺寸档位 ${config.size}。\n${config.prompt}` }];
    for (const ref of config.referenceList || []) {
      if (ref.type !== "image") throw new Error("Codex 图片生成仅支持图片参考");
      input.push({ type: "image", url: ref.base64.startsWith("data:image/") ? ref.base64 : `data:image/png;base64,${ref.base64}` });
    }
    await session.request("turn/start", { threadId: started.thread.id, input, effort: "medium" });
    while (true) {
      const event = await session.next();
      const p = event.params || {};
      if (event.method === "item/agentMessage/delta") responseText += p.delta || "";
      if (event.method === "item/completed" && p.item?.type === "imageGeneration") {
        const item = p.item;
        if (item.status !== "completed") throw new Error(`Codex 图片生成未完成: ${item.status}`);
        let bytes: Buffer;
        if (item.savedPath) bytes = await fs.readFile(item.savedPath);
        else if (item.result) bytes = Buffer.from(item.result.replace(/^data:image\/[^;]+;base64,/, ""), "base64");
        else throw new Error("Codex 未返回图片文件");
        // Validate real image bytes and persist as PNG with a unique name.
        const png = await sharp(bytes).png().toBuffer();
        const name = `codex-${Date.now()}-${randomUUID()}.png`;
        const output = path.join(settings.outputDirectory, name);
        await fs.writeFile(output, png, { flag: "wx" });
        await fs.writeFile(output + ".json", JSON.stringify({ source: "codex-built-in-image-generation", threadId: started.thread.id, requestedSize: config.size, requestedAspectRatio: config.aspectRatio, metadata: await sharp(png).metadata(), sourcePath: item.savedPath || null }, null, 2), { flag: "wx" });
        outputs.push(output);
      }
      if (event.method === "turn/completed") {
        if (p.turn.status !== "completed") throw new Error(p.turn.error?.message || `Codex ${p.turn.status}`);
        if (!outputs.length) throw new Error(`Codex 未生成图片：${responseText.slice(-500)}`);
        return (await fs.readFile(outputs[0])).toString("base64");
      }
      if (event.method === "error" && !p.willRetry) throw new Error(p.message || p.error?.message || "Codex 图片请求失败");
      if (event.id != null && event.method) {
        session.send({ id: event.id, error: { code: -32601, message: "Image service does not support interactive requests" } });
        throw new Error(`Codex 图片请求需要交互: ${event.method}`);
      }
    }
  } finally { session.close(); }
}
