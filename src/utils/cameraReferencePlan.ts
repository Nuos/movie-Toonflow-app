/** 只解析可确认的素材编号与旧版具名引用，不根据目录顺序猜测身份。 */
export function linkPromptReferences(prompt: string, entries: any[], selected: any[] = [], storyboardOrder: any[] = []) {
  const issues: string[] = [], automatic: any[] = [];
  const key = (r: any) => `${r.sources}:${r.id}`;
  const aliases = new Map<string, any>();
  for (const m of prompt.matchAll(/@(图\s*\d+)\s*(?:为|是|[:：])\s*([^@\n,，;；。]+)/g)) {
    const label = m[2].trim();
    m[1] = m[1].replace(/\s/g, "");
    let matches = entries.filter(e => e.sources === 'assets' && (e.name === label || ["角色", "场景", "道具"].some(s => e.name + s === label)));
    if (matches.length > 1 && matches.filter(e => e.related).length === 1) matches = matches.filter(e => e.related);
    if (matches.length === 1 && (!aliases.has(m[1]) || aliases.get(m[1]).code === matches[0].code)) aliases.set(m[1], matches[0]);
    else { aliases.delete(m[1]); issues.push(`@${m[1]} 的名称“${label}”无法唯一匹配，请用资产卡片重新引用。`); }
  }
  const normalized = prompt.replace(/@?DR-\d+-[A-Z]+-\d+|@图\s*\d+/g, token => {
    const alias = token.replace(/\s/g, '').slice(1);
    const bound = token.startsWith('@图') ? storyboardOrder[Number(alias.slice(1)) - 1] : undefined;
    const named = aliases.get(alias);
    if (bound && named && key(bound) !== key(named)) {
      issues.push(`${token} 的具名声明与原分镜关联冲突，请先修正引用。`); return token;
    }
    const entry = token.startsWith('@图') ? (named || bound) : entries.find(e => e.code === token.replace(/^@/, ''));
    if (!entry) { issues.push(`引用 ${token} 无法关联当前项目素材，请重新选择资产卡片。`); return token; }
    if (!automatic.some(r => key(r) === key(entry))) automatic.push(entry);
    return token.startsWith('@图') ? `@${entry.code}` : token;
  });
  const references = [...selected];
  for (const ref of automatic) if (!references.some(r => key(r) === key(ref))) references.push({id:ref.id,sources:ref.sources});
  return { prompt: normalized, references, automatic, issues: [...new Set(issues)] };
}

/** 推荐只采用供应商公布的规格，保留所有引用，不为适配工作流丢弃素材。 */
export function recommendCameraParameters(workflows: any[], refs: any[], prompt: string, duration: number, preferredMode?: string) {
  const counts = {image:0,video:0,audio:0};
  for (const r of refs) counts[r.type as keyof typeof counts]++;
  const explicitDuration = prompt.match(/(?:总时长|片段时长|时长|【画面与镜头】\s*)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(?:秒|s\b)/i);
  const wanted = Number(explicitDuration?.[1]) || duration || 10;
  if (!Number.isInteger(wanted) || wanted < 8 || wanted > 15) return {parameters:null, warnings:["原分镜需要重新编排为 8 至 15 个整数秒的完整动作，请先完善分镜和时长。"]};
  const frameMode = preferredMode === 'startEndRequired' || /(?:首帧[\s\S]{0,40}尾帧|首尾帧)/.test(prompt);
  const candidates: any[] = [];
  for (const w of workflows.filter(w => w.available !== false)) for (const m of w.modes) {
    const multi = m.value.startsWith('['), limits = m.referenceLimits || {image:m.maxImages || 0,video:0,audio:0};
    if (refs.length > (w.id.startsWith('comfyui-h3:') ? 12 : 16) || counts.image < (m.minImages || 0) || (multi && !counts.image && !counts.video)) continue;
    if (Object.entries(counts).some(([t,n]) => n > (limits[t] || 0)) || (counts.audio && w.audio === 'none')) continue;
    let score = w.id.startsWith('comfyui-h3:') ? 10 : 0;
    if (/quality/.test(w.id)) score += 5;
    if (refs.length && multi) score += 20;
    if (frameMode && counts.image === 2 && m.value === 'startEndRequired') score += 30;
    if (!refs.length && m.value === 'text') score += 30;
    if (counts.image === 1 && refs[0]?.sources === 'storyboard' && m.value === 'singleImage') score += 25;
    candidates.push({w,m,score});
  }
  candidates.sort((a,b) => b.score - a.score);
  const selected = candidates[0];
  if (!selected) return {parameters:null, warnings:['当前已安装工作流无法容纳这些引用，请检查引用数量、类型或工作流配置。']};
  const {w,m} = selected;
  const resolution = w.defaults?.resolution || w.specifications[0].resolution[0];
  const values = [...new Set<number>(w.specifications.filter((s:any) => s.resolution.includes(resolution)).flatMap((s:any) => s.duration))].sort((a,b)=>a-b);
  const clipDuration = w.parameterCapabilities?.customDuration ? wanted : values.find(n=>n>=wanted && n<=15);
  if (!clipDuration) return {parameters:null, warnings:["当前工作流没有满足完整动作时长的规格，请选择支持 8 至 15 秒的工作流。"]};
  const warnings = clipDuration === wanted ? [] : [`提示词或分镜要求 ${wanted} 秒，当前工作流推荐 ${clipDuration} 秒；请核对节奏和台词。`];
  return {parameters:{workflowId:w.id,mode:m.value,duration:clipDuration,resolution,audio:w.audio === 'required' || (w.audio !== 'none' && (!!counts.audio || /台词|对白|说[：:“]|声音|音效|soundscape/.test(prompt)))},warnings};
}
