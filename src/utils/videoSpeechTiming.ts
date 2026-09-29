/** Prompt preflight only. These ranges are intended delivery, never observed speech. */
export interface SpeechWindow { start: number; end: number; speaker: string; text: string }

/** Source-derived timing hints. Never writes or invents video prompt prose. */
export function sourceSpeechBudget(narrative: string, duration: number | null) {
  const source = narrative.match(/【原剧情与台词】([\s\S]*?)(?=【|$)/)?.[1];
  if (!source) return null;
  const lines = source.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!/^[△▲]/.test(s));
  const utterances = lines.flatMap(line=>{
    const match = line.match(/^([^：:]{1,80})[：:]\s*(.+)$/);
    if (!match) return [];
    const text = match[2], units = (text.match(/[\p{Script=Han}\d]/gu)||[]).length;
    if (!units) return [];
    const pauses = (text.match(/…+|\.{3,}|——/g)||[]).length;
    return [{speaker:match[1],text,minimumSeconds:Math.max(1,Math.ceil(units/5)),preferredSeconds:Math.max(1,Math.ceil(units/4+pauses/2))}];
  });
  if (!utterances.length) return null;
  const minimumSeconds=utterances.reduce((n,u)=>n+u.minimumSeconds,0),preferredSeconds=utterances.reduce((n,u)=>n+u.preferredSeconds,0);
  return {utterances,minimumSeconds,preferredSeconds,
    latestPreferredSpeechStart:duration!==null&&preferredSeconds<=duration?duration-preferredSeconds:null,
    minimumFits:duration!==null&&minimumSeconds<=duration,
    note:"声音预算是文本估算，不能证明成片语速自然。先安排完整发声，再调整非硬性动作阶段边界；事件顺序、原话、总时长与已采用摄影约束保持。画外旁白可以与动作并行；对白要留出符合表演条件的时段。"};
}

export function validateVideoSpeechTiming(body: string, duration: number): SpeechWindow[] {
  const windows: SpeechWindow[] = [];
  for (const paragraph of body.split(/\n\s*\n/)) {
    const utterances = [...paragraph.matchAll(/<d>\s*\[([^\]]+)\]\s*([\s\S]*?)<\/d>/g)];
    if (!utterances.length) continue;
    if (utterances.length !== 1) throw Error("每句声音须独立成段，分别给出整数秒起止时间与 (S1) 等说话人编号；不能把多句长旁白放入同一未分配的时间段");
    const prefix = paragraph.slice(0, utterances[0].index);
    const range = prefix.match(/^\s*第?\s*(\d+)\s*(?:至|到|[-—–])\s*(\d+)\s*秒[，,:：\s]/);
    const speaker = prefix.match(/[（(](S[1-9]\d*)[）)]/);
    if (!range || !speaker) throw Error("每句 <d> 台词须独立成段，以‘第 0 至 6 秒，’这样的时间范围开头，并在台词前写说话人 (S1)；表演与声线说明必须在 <d> 外");
    if(paragraph.slice(utterances[0].index!+utterances[0][0].length).trim())throw Error("声音段须在 </d> 结束，不在同一段接写‘话音未落’等动作说明；后续动作另起空行成段，避免说明被误作续说台词。这是提示词格式预检，不保证实际声音正确");
    const start = Number(range[1]), end = Number(range[2]), text = utterances[0][2].trim();
    if (!(start < end && end <= duration)) throw Error(`声音时间 ${start} 至 ${end} 秒超出本镜 ${duration} 秒或区间无效`);
    // A conservative production preflight for Mandarin, not a universal speech metric.
    const chinese = (text.match(/\p{Script=Han}/gu) || []).length;
    const digits = (text.match(/\d/g) || []).length;
    if (chinese > 0 && (chinese + digits) / (end - start) > 5) throw Error(`台词“${text}”仅分配 ${end-start} 秒，至少需要 ${Math.ceil((chinese+digits)/5)} 秒才符合当前中文语音预检上限每秒 5 字；请重排动作阶段、提前完成说话前的动作并延长声音区间，保持事件顺序、原话与镜头总时长，不继续沿用本次过短区间`);
    if (windows.some(w => start < w.end && end > w.start)) throw Error("对白与旁白时间重叠；当前生成流程要求逐句留出独立声音区间，不通过叠加或加速解决时长不足");
    windows.push({start,end,speaker:speaker[1],text});
  }
  if ((body.match(/<d>/g) || []).length !== windows.length) throw Error("声音标签格式不完整；使用 <d>[中文] 原台词</d>，不要将表演说明放入台词标签");
  return windows;
}
