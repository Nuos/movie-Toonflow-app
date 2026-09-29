// 对话正文始终保存；向量索引和摘要只是辅助功能。
export async function optionalEmbedding(text: string, embed: (text: string) => Promise<number[]>): Promise<number[] | null> {
  try { return await embed(text); }
  catch { return null; }
}

export function lexicalSearch<T extends { content: string; createTime?: number | null }>(rows: T[], query: string, limit: number) {
  const normalized = query.toLowerCase().replace(/\s+/g, "");
  const terms = [...new Set(normalized.match(/[a-z0-9]+|[\u4e00-\u9fff]{1,2}/g) || [])];
  return rows.map(row => {
    const content = row.content.toLowerCase().replace(/\s+/g, "");
    const matches = terms.filter(term => content.includes(term)).length;
    return { ...row, similarity: terms.length ? matches / terms.length : 0 };
  }).filter(row => row.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity || Number(b.createTime || 0) - Number(a.createTime || 0)).slice(0, limit);
}
