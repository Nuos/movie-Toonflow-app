/** One authority for local H3 parameters: the bridge reads installed ComfyUI nodes. */
const bridge = 'http://127.0.0.1:10589';
let cached: { at: number; data: Record<string, any> } | undefined;
export function isLocalH3(key: string) { return key.startsWith('comfyui-h3:h3-'); }
async function request(endpoint: string, body?: unknown) {
  const r = await fetch(bridge + endpoint, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const data = await r.json() as any;
  if (!r.ok) throw Error(data.error || '无法读取本地工作流参数');
  return data;
}
export async function localVideoCapabilities() {
  if (!cached || Date.now() - cached.at > 5000) cached = { at: Date.now(), data: await request('/capabilities') };
  return cached.data;
}
export async function resolveLocalVideoParameters(key: string, input: any) {
  return request('/parameters', { ...input, model: key.split(':')[1] });
}
export function promptAspectRatio(prompt: string): string | undefined {
  const values = [...new Set([...prompt.matchAll(/(?:横屏|竖屏|画幅|比例|横版|竖版)?\s*\b(16\s*[:：]\s*9|9\s*[:：]\s*16|1\s*[:：]\s*1|4\s*[:：]\s*3|3\s*[:：]\s*4|21\s*[:：]\s*9|3\s*[:：]\s*2|2\s*[:：]\s*3)\b/g)].map(m => m[1].replace(/\s/g,'').replace('：',':')))];
  return values.length === 1 ? values[0] : undefined;
}
export function alignVideoPrompt(prompt: string, ratio: string, duration: number) {
  const [w,h] = ratio.split(':').map(Number), orientation = w>h?'横屏':w<h?'竖屏':'方形';
  // Dialogue is story data: parameter alignment must never rewrite spoken words.
  const spoken: string[] = [];
  const protectedPrompt = prompt.replace(/<d>[\s\S]*?<\/d>|[“「『][\s\S]*?[”」』]/g, value => { spoken.push(value); return `\uE000${spoken.length - 1}\uE001`; });
  const clean = protectedPrompt.replace(/\d+\s*[:：]\s*\d+\s*(?:横|竖|方)(?:画幅|构图)/g, `${ratio} ${orientation}画幅`).replace(/(?:横屏|竖屏|横版|竖版|方形)\s*\d+\s*[:：]\s*\d+/g, `${orientation}${ratio}`)
    .replace(/\d+\s*[:：]\s*\d+\s*(?:横屏|竖屏|横版|竖版|方形)/g, `${ratio}${orientation}`)
    .replace(/\d+\s*[:：]\s*\d+\s*(?=画幅|构图)/g, `${ratio} `)
    .replace(/((?:画幅|比例)\s*[:：]?\s*)\d+\s*[:：]\s*\d+/g, `$1${ratio}`)
    .replace(/((?:总时长|片段时长|时长)\s*[:：=]?\s*)\d+(?:\.\d+)?\s*秒/g, `$1${duration}秒`);
  return `【实际生成参数】画幅 ${ratio}，时长 ${duration}秒。\n${clean.replace(/^【实际生成参数】[^\n]*\n/, '').replace(/\uE000(\d+)\uE001/g, (_, index) => spoken[Number(index)])}`;
}
