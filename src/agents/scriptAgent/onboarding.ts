export function isPlanningStart(text: string) {
  return ["开始", "开始剧本规划", "查看改编准备情况"].includes(text.trim());
}

export function planningGuide(projectName: string, chapters: { chapterIndex?: number | null; eventState?: number | null; event?: string | null }[], hasPlan: boolean) {
  const ready = chapters.filter(chapter => chapter.eventState === 1 && chapter.event?.trim()).length;
  const source = chapters.length
    ? `已导入 ${chapters.length} 章，其中 ${ready} 章已完成事件分析。${ready < chapters.length ? "请先在“小说原文”中完成其余章节的事件分析，再生成故事骨架。" : "原文准备就绪。"}`
    : "尚未导入小说章节。请先到“小说原文”导入文本并完成事件分析，再回到这里。";
  return `【${projectName} · 剧本规划】\n${source}\n\n${hasPlan ? "已有改编成果。你可以指定继续哪个阶段，或明确提出修改要求；查看准备情况不会覆盖已有内容。" : "接下来先确认改编需求，再生成故事骨架 → 改编策略 → 分集剧本；前两阶段确认通过后再继续。"}\n\n请说明：\n1. 计划几集、每集多长；\n2. 改编哪些章节；\n3. 横屏或竖屏、故事风格；\n4. 是否设置付费点（也可选不设置）。\n\n如果还没想好，可以说“请根据原文推荐改编方案”。本入口只进行文本规划，不会提交图片或视频生成。`;
}

export function scriptErrorMessage(error: unknown, agentType: "scriptAgent" | "productionAgent" = "scriptAgent") {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|403|密钥|API.?key|Unauthorized/i.test(message)) return "文本 AI 身份验证失败，请检查设置中的文本模型配置后重试。";
  if (/\b402\b|insufficient.?balance|余额不足/i.test(message)) return "文本 AI 服务余额不足，请补充当前模型服务账号余额后重试；已保存的项目内容仍然保留。";
  if (/429|quota|balance|余额|限流/i.test(message)) return "文本 AI 暂时受限或额度不足，请检查服务额度，稍后重试。";
  if (/timeout|timed out|fetch failed|ECONN|ENOTFOUND|网络/i.test(message)) return "文本 AI 连接失败或超时，请检查网络与模型服务后重试。";
  if (/model|模型|provider|供应商/i.test(message)) return "模型加载或配置异常，请检查文本模型设置及本地辅助模型；已保存的项目内容仍然保留。";
  return `本次${agentType === "scriptAgent" ? "剧本" : "制作"}处理未完成，已保存的内容仍然保留。请稍后重试；若持续失败，请查看后台日志中的 [${agentType}] 记录。`;
}
