import u from "@/utils";
import { v4 as uuidv4 } from "uuid";
import { getEmbedding, cosineSimilarity } from "./embedding";
import type { memories as MemoryRow } from "@/types/database";
import { tool, jsonSchema } from "ai";
import { z } from "zod";
import { optionalEmbedding, lexicalSearch } from "./memoryFallback";

// ── 可调配置默认值 ──
const DEFAULTS: {
  messagesPerSummary: number;
  shortTermLimit: number;
  summaryLimit: number;
  ragLimit: number;
  deepRetrieveSummaryLimit: number;
} = {
  messagesPerSummary: 3, // 每累积多少条message触发一次summary生成
  shortTermLimit: 5, // get()返回的近期未总结message条数
  summaryLimit: 10, // get()返回的summary条数
  ragLimit: 3, // get()向量相似搜索返回的message条数
  deepRetrieveSummaryLimit: 5, // deepRetrieve()向量召回summary的条数
};

// ── 向量搜索辅助 ──
function vectorSearch(rows: MemoryRow[], queryEmbedding: number[], limit: number) {
  return rows
    .map((row) => {
      let emb: number[] = [];
      try { emb = JSON.parse(row.embedding ?? "[]"); } catch {}
      if (!Array.isArray(emb) || emb.length !== queryEmbedding.length || !emb.every(Number.isFinite)) return null;
      return { ...row, similarity: cosineSimilarity(queryEmbedding, emb) };
    })
    .filter((row): row is MemoryRow & { similarity: number } => row !== null)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

class Memory {
  private agentType: string;
  private isolationKey: string;
  private embeddingWarningShown = false;

  private async embed(content: string) {
    const embedding = await optionalEmbedding(content, getEmbedding);
    if (!embedding && !this.embeddingWarningShown) {
      console.warn("[memory] 向量检索暂不可用，已保留对话并启用关键词检索");
      this.embeddingWarningShown = true;
    }
    return embedding;
  }

  constructor(agentType: string, isolationKey: string) {
    this.agentType = agentType;
    this.isolationKey = isolationKey;
  }

  private async generateSummary(contents: string[]): Promise<string> {
    const { text } = await u.Ai.Text(this.agentType as any).invoke({
      system: "你是一个记忆整理助手。请将以下多条记忆整理为简洁、完整的摘要，保留关键事实、台词约束、未完成事项和素材引用。只输出摘要正文。",
      messages: [{ role: "user", content: contents.map((c, i) => `${i + 1}. ${c}`).join("\n") }],
    });
    return text;
  }

  private async judgeSummaryRelevance(keyword: string, summaries: { id: string; content: string }[]): Promise<string[]> {
    const list = summaries.map((s) => `[${s.id}] ${s.content}`).join("\n");
    const { text } = await u.Ai.Text(this.agentType as any).invoke({
      system:
        '你是一个信息检索助手。用户会给你一个关键词和一组摘要，请判断哪些摘要可能包含与关键词相关的详细信息。只返回相关摘要的id列表，用JSON数组格式，例如 ["id1","id2"]。不要解释。',
      messages: [{ role: "user", content: `关键词: ${keyword}\n\n摘要列表:\n${list}` }],
    });
    try {
      const ids = JSON.parse(text);
      if (Array.isArray(ids)) return ids.map(String);
    } catch {}
    return [];
  }
  private async getConfigData<T extends Record<string, string | number>>(defaults: T): Promise<T> {
    const keys = Object.keys(defaults) as (keyof T & string)[];
    const rows = await u.db("o_setting").whereIn("key", keys);

    const dbMap: Record<string, string | null> = {};
    for (const row of rows) {
      if (row.key != null) dbMap[row.key] = row.value ?? null;
    }

    const result = { ...defaults };
    for (const key of keys) {
      const raw = dbMap[key];
      if (raw == null) continue; // null / undefined 使用默认值
      const num = Number(raw);
      (result as Record<string, string | number>)[key] = Number.isNaN(num) ? raw : num;
    }
    return result;
  }

  async add(role: string = "user", content: string, options?: { name?: string; createTime?: number }) {
    const { messagesPerSummary } = await this.getConfigData({ messagesPerSummary: DEFAULTS.messagesPerSummary });
    const id = uuidv4();
    const embedding = await this.embed(content);
    const isolationKey = this.isolationKey;

    await u.db("memories").insert({
      id,
      isolationKey,
      type: "message",
      role,
      name: options?.name,
      content,
      embedding: embedding ? JSON.stringify(embedding) : null,
      relatedMessageIds: null,
      summarized: 0,
      createTime: options?.createTime ?? Date.now(),
    } as any);

    // 检查未总结消息数量
    const unsummarized = await u.db("memories").where({ isolationKey, type: "message", summarized: 0 }).orderBy("createTime", "asc");

    if (unsummarized.length >= Number(messagesPerSummary)) {
      try {
        const batch = unsummarized.slice(0, Number(messagesPerSummary));
        const batchIds = batch.map((m) => m.id);
        const batchContents = batch.map((m) => m.content);

        const summaryContent = await this.generateSummary(batchContents);
        const summaryEmbedding = await this.embed(summaryContent);
        const summaryId = uuidv4();

        await u.db("memories").insert({
          id: summaryId,
          isolationKey,
          type: "summary",
          content: summaryContent,
          embedding: summaryEmbedding ? JSON.stringify(summaryEmbedding) : null,
          relatedMessageIds: JSON.stringify(batchIds),
          summarized: 0,
          createTime: Date.now(),
        } as any);

        // 标记已总结
        await u.db("memories").whereIn("id", batchIds).update({ summarized: 1 });
      } catch {
        console.warn("[memory] 自动摘要暂不可用，原始对话已保留，可继续使用");
      }
    }
  }

  async get(text: string) {
    const { shortTermLimit, summaryLimit, ragLimit } = await this.getConfigData({
      shortTermLimit: DEFAULTS.shortTermLimit,
      summaryLimit: DEFAULTS.summaryLimit,
      ragLimit: DEFAULTS.ragLimit,
    });

    const isolationKey = this.isolationKey;
    // shortTerm: 最近未被总结的 messages
    const shortTerm = await u
      .db("memories")
      .where({ isolationKey, type: "message", summarized: 0 })
      .orderBy("createTime", "desc")
      .limit(Number(shortTermLimit));
    shortTerm.reverse(); // 最旧在前

    // summaries: 最近的 summary
    const summaries = await u.db("memories").where({ isolationKey, type: "summary" }).orderBy("createTime", "desc").limit(Number(summaryLimit));
    summaries.reverse();

    // rag: 向量搜索所有 messages
    const queryEmbedding = await this.embed(text);
    const allMessages = await u.db("memories").where({ isolationKey, type: "message" });
    const ragResults = queryEmbedding ? vectorSearch(allMessages, queryEmbedding, Number(ragLimit)) : lexicalSearch(allMessages, text, Number(ragLimit));

    return {
      shortTerm: shortTerm.map((m: any) => ({ id: m.id, role: m.role, name: m.name, content: m.content, createTime: m.createTime })),
      summaries: summaries.map((s) => ({
        id: s.id,
        content: s.content,
        relatedMessageIds: JSON.parse(s.relatedMessageIds || "[]"),
        createTime: (s as any).createTime,
      })),
      rag: ragResults.map((r) => ({ id: r.id, content: r.content, similarity: r.similarity })),
    };
  }

  async deepRetrieve(keyword: string) {
    const { deepRetrieveSummaryLimit } = await this.getConfigData({ deepRetrieveSummaryLimit: DEFAULTS.deepRetrieveSummaryLimit });

    const isolationKey = this.isolationKey;
    // 步骤1: 向量搜索 summary
    const queryEmbedding = await this.embed(keyword);
    if (!queryEmbedding) {
      const messages = await u.db("memories").where({ isolationKey, type: "message" });
      return lexicalSearch(messages, keyword, Number(deepRetrieveSummaryLimit)).map(m => ({ id: m.id, content: m.content, createTime: m.createTime }));
    }
    const allSummaries = await u.db("memories").where({ isolationKey, type: "summary" });
    const topSummaries = vectorSearch(allSummaries, queryEmbedding, Number(deepRetrieveSummaryLimit));

    if (topSummaries.length === 0) return [];

    // 步骤2: AI 判断相关性
    const relevantIds = await this.judgeSummaryRelevance(
      keyword,
      topSummaries.map((s) => ({ id: s.id!, content: s.content })),
    );

    if (relevantIds.length === 0) return [];

    // 步骤3: 展开查询原始 messages
    const relevantSummaries = topSummaries.filter((s) => relevantIds.includes(s.id!));
    const messageIds = relevantSummaries.flatMap((s) => JSON.parse(s.relatedMessageIds || "[]") as string[]);

    if (messageIds.length === 0) return [];

    const messages = await u.db("memories").whereIn("id", messageIds).orderBy("createTime", "asc");

    return messages.map((m) => ({ id: m.id, content: m.content, createTime: m.createTime }));
  }

  getTools() {
    return {
      deepRetrieve: tool({
        description: "深度检索记忆：当你需要回忆与某个关键词相关的详细历史信息时使用此工具",
        inputSchema: jsonSchema<{ keyword: string }>(
          z
            .object({
              keyword: z.string().describe("要检索的关键词"),
            })
            .toJSONSchema(),
        ),
        execute: async ({ keyword }) => {
          const results = await this.deepRetrieve(keyword);
          if (results.length === 0) return { found: false, message: "未找到相关记忆" };
          return { found: true, memories: results.map((r) => r.content) };
        },
      }),
    };
  }
}

export default Memory;
