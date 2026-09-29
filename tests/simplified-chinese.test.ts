import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { simplifiedChinese, simplifyContent, simplifyToolInput } from "../src/utils/simplifiedChinese";
import { chineseLanguageMiddleware as middleware } from "../src/utils/chineseLanguageMiddleware";
import { chineseContent } from "../src/extensions/chineseContent";
import { generateText, streamText, tool, wrapLanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";

const source = "乾隆年間，鏡頭緩慢推進。她說：我會等你。";
const target = "乾隆年间，镜头缓慢推进。她说：我会等你。";
test("简体转换保留词义、外语专名、协议与链接", () => {
  assert.equal(simplifiedChinese(source), target);
  const protocol = "integrated_multimodal_description: [Shot 1] <Picture 1> @图1 N/A OpenAI https://example.test/圖片.png";
  assert.equal(simplifiedChinese(protocol), protocol);
  assert.equal(simplifiedChinese(target), target);
  assert.equal(simplifiedChinese('路径 `/素材/人物 圖.png` 与 /圖片.png'), '路径 `/素材/人物 圖.png` 与 /圖片.png');
  assert.deepEqual(JSON.parse(simplifiedChinese(JSON.stringify({ prompt: source, filePath: '/圖片.png' }))), { prompt: target, filePath: '/圖片.png' });
});
test("嵌套项目内容转换但不改密钥、路径、枚举及 JSON 键", () => {
  const input = { name: "鏡頭", prompt: source, filePath: "/素材/圖片.png", model: "模型繁體", id: "識別碼", mode: "複合", token: "機密", data: JSON.stringify({ nodes: [{ data: { prompt: source, filePath: "/圖片.png" } }] }) };
  const output = simplifyContent(input);
  assert.equal(output.name, "镜头"); assert.equal(output.prompt, target);
  for (const key of ["filePath", "model", "id", "mode", "token"] as const) assert.equal(output[key], input[key]);
  assert.equal(JSON.parse(output.data).nodes[0].data.prompt, target);
  assert.deepEqual(input.prompt, source);
  assert.equal(simplifyToolInput('{broken'), '{broken');
});
test("普通 AI 回复和工具参数统一简体，保留执行身份及原始数据", async () => {
  const original: any = { content: [{ type: "text", text: source }, { type: "tool-call", toolCallId: "繁體-ID", toolName: "save", input: JSON.stringify({ prompt: source, filePath: "/圖片.png" }) }], usage: { outputTokens: 20 } };
  const result = await middleware.wrapGenerate!({ doGenerate: async () => original } as any);
  assert.equal((result.content[0] as any).text, target);
  assert.equal((result.content[1] as any).toolCallId, "繁體-ID");
  assert.equal(JSON.parse((result.content[1] as any).input).prompt, target);
  assert.equal(original.content[0].text, source);
  const params = await middleware.transformParams!({ params: { prompt: [{ role: "system", content: "Use English" }, { role: "user", content: [] }] } } as any);
  assert.ok(params.prompt.some((p: any) => p.role === "system" && p.content.includes("禁止输出繁体字")));
});
test("流式跨块词组、工具 JSON 和事件顺序保持正确", async () => {
  const input = JSON.stringify({ prompt: source, filePath: "/圖片.png" });
  const chunks: any[] = [
    { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "乾" }, { type: "text-delta", id: "t", delta: "隆年間，鏡頭\n" }, { type: "text-delta", id: "t", delta: "我會等你" }, { type: "text-end", id: "t" },
    { type: "tool-input-start", id: "c", toolName: "save" }, { type: "tool-input-delta", id: "c", delta: input.slice(0, 15) }, { type: "tool-input-delta", id: "c", delta: input.slice(15) }, { type: "tool-input-end", id: "c" }, { type: "tool-call", toolCallId: "c", toolName: "save", input },
  ];
  const result = await middleware.wrapStream!({ doStream: async () => ({ stream: new ReadableStream({ start(c) { chunks.forEach(x => c.enqueue(x)); c.close(); } }) }) } as any);
  const output: any[] = []; for await (const p of result.stream as any) output.push(p);
  assert.equal(output.filter(p => p.type === "text-delta").map(p => p.delta).join(""), "乾隆年间，镜头\n我会等你");
  assert.equal(JSON.parse(output.find(p => p.type === "tool-input-delta").delta).prompt, target);
  assert.ok(output.findIndex(p => p.type === "tool-input-delta") < output.findIndex(p => p.type === "tool-input-end"));
  assert.equal(JSON.parse(output.find(p => p.type === "tool-call").input).filePath, "/圖片.png");
});
test("保存和读取入口转换正文，登录与供应商配置保持原值", async () => {
  const app = express(); app.use(express.json()); app.use(chineseContent);
  app.post('/api/production/save', (req, res) => res.json({ data: req.body, message: "儲存成功" }));
  app.post('/api/login/login', (req, res) => res.json(req.body));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once('listening', r));
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}`;
    const post = async (path: string, body: any) => (await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
    assert.deepEqual(await post('/api/production/save',{prompt:source,filePath:'/圖片.png'}),{data:{prompt:target,filePath:'/圖片.png'},message:'储存成功'});
    assert.deepEqual(await post('/api/login/login',{name:'繁體',password:'機密'}),{name:'繁體',password:'機密'});
  } finally { await new Promise<void>(r => server.close(() => r())); }
});

test("真实 AI SDK 执行与流式消费均使用简体文本，不改变工具结构", async () => {
  const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } };
  let saved: unknown;
  const input = JSON.stringify({ prompt: source, filePath: '/圖片.png' });
  const base = new MockLanguageModelV3({
    doGenerate: { content: [{ type: 'text', text: source }, { type: 'tool-call', toolCallId: 'call-1', toolName: 'save', input }], finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage, warnings: [] },
    doStream: async () => ({ stream: new ReadableStream({ start(c) {
      const parts: LanguageModelV3StreamPart[] = [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: source.slice(0, 1) }, { type: 'text-delta', id: 't', delta: source.slice(1) }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage }]; parts.forEach(p => c.enqueue(p)); c.close();
    } }) }),
  });
  const model = wrapLanguageModel({ model: base, middleware });
  const result = await generateText({ model, prompt: '保存提示词', tools: { save: tool({ inputSchema: z.object({ prompt: z.string(), filePath: z.string() }), execute: async value => { saved = value; return { ok: true }; } }) } });
  assert.equal(result.text, target);
  assert.deepEqual(saved, { prompt: target, filePath: '/圖片.png' });
  const streamed = streamText({ model, prompt: '生成提示词' });
  let text = ''; for await (const delta of streamed.textStream) text += delta;
  assert.equal(text, target); assert.equal(await streamed.finishReason, 'stop');
});
