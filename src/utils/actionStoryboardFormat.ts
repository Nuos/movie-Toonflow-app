import { z } from "zod";
import { shotDurationSchema, validateActionText } from "./shotActionRules";

export const actionShotSchema = z.object({
  sourceBeatIds: z.array(z.string()).min(1),
  duration: shotDurationSchema,
  purpose: z.string().min(8),
  openingFrame: z.string().min(20),
  subjectAction: z.string().min(60),
  endingFrame: z.string().min(20),
  camera: z.string().min(10),
  continuity: z.string().min(10),
  assetIds: z.array(z.number().int().positive()).min(1),
});
export const actionPlanSchema = z.object({ shots: z.array(actionShotSchema).min(1).max(40) });
export type ActionShot = z.infer<typeof actionShotSchema>;
export type ScriptBeat = { id: string; scene: string; text: string; speech: string };

/** Source lines remain authored script data, including unquoted narration. */
export function scriptBeats(script: string): ScriptBeat[] {
  const result: ScriptBeat[] = []; let scene = "";
  for (const text of script.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    if (/^\d+[-－]\d+\s/.test(text)) { scene = text; continue; }
    if (!scene || /^(?:人物|出场人物|场景)[：:]/.test(text) || text.startsWith("#")) continue;
    const speech = !/^[△▲]/.test(text) && /^[^：:]{1,80}[：:]/.test(text) ? text.replace(/^[^：:]+[：:]\s*/, "") : "";
    result.push({ id: `B${result.length + 1}`, scene, text, speech });
  }
  if (!result.length) throw Error("剧本缺少可识别的分场正文，请先补充场次与动作、台词。");
  return result;
}

export function validateActionPlan(raw: unknown, beats: ScriptBeat[], assetIds: number[]) {
  const plan = actionPlanSchema.parse(raw);
  const assigned = plan.shots.flatMap(s => s.sourceBeatIds);
  if (JSON.stringify(assigned) !== JSON.stringify(beats.map(b => b.id))) throw Error("分镜必须按原顺序覆盖全部剧本段落，每段恰好一次；禁止漏台词、漏动作或重复事件。");
  for (const [index, s] of plan.shots.entries()) {
    const source = beats.filter(b => s.sourceBeatIds.includes(b.id));
    if (new Set(source.map(b => b.scene)).size !== 1) throw Error(`第 ${index + 1} 镜跨越场次，请按场景分开。`);
    if (s.assetIds.some(id => !assetIds.includes(id))) throw Error(`第 ${index + 1} 镜引用了本集不存在的资产。`);
    const speechLength = source.reduce((n, b) => n + b.speech.replace(/[\s，。？！、…“”——]/g, "").length, 0);
    if (speechLength > s.duration * 5) throw Error(`第 ${index + 1} 镜台词过密，不能在 ${s.duration} 秒内自然完成，请重排。`);
    validateActionText([s.purpose, s.openingFrame, s.subjectAction, s.endingFrame, s.camera, s.continuity].join("\n"));
    // A concrete settled pose need not contain the literal word “保持”. This is
    // a text completeness check, never evidence of the generated film's ending.
    if (!/最后(?:两|二|2)秒|持续|保持|维持|站稳|站定|跪|坐定|重心落|垂在|停在/.test(s.endingFrame) || !/目光|视线|看向|看着|注视|眼睛|凝视|望向|望着|盯住/.test(s.endingFrame)) throw Error(`第 ${index + 1} 镜缺少可持续的结束姿态和明确视线。`);
  }
  return plan;
}

export function actionDescription(s: ActionShot, beats: ScriptBeat[]) {
  return [["本镜主题", s.purpose], ["原剧情与台词", beats.filter(b => s.sourceBeatIds.includes(b.id)).map(b => b.text).join("\n")],
    ["起始画面", s.openingFrame], ["主体动作", s.subjectAction], ["结束画面", s.endingFrame], ["摄影机", s.camera], ["连续性", s.continuity]]
    .map(([label, value]) => `【${label}】${value}`).join("\n\n");
}

export function storyboardSections(description: string): Record<string, string> {
  return Object.fromEntries([...description.matchAll(/【([^】]+)】([\s\S]*?)(?=【|$)/g)].map(m => [m[1], m[2].trim()]));
}

/** Recover the current native plan without reassigning its source beats or assets. */
export function currentActionPlan(boards: {duration: unknown; videoDesc?: string | null; assetIds: number[]}[], beats: ScriptBeat[]) {
  const shots = boards.map(b => {
    const s = storyboardSections(b.videoDesc || "");
    const sourceBeatIds = beats.filter(beat => (s["原剧情与台词"] || "").split(/\r?\n/).includes(beat.text)).map(beat => beat.id);
    return {sourceBeatIds,duration:Number(b.duration),purpose:s["本镜主题"],openingFrame:s["起始画面"],subjectAction:s["主体动作"],endingFrame:s["结束画面"],camera:s["摄影机"],continuity:s["连续性"],assetIds:b.assetIds};
  });
  return validateActionPlan({shots},beats,[...new Set(boards.flatMap(b=>b.assetIds))]);
}

export function validateActionRefinement(plan: z.infer<typeof actionPlanSchema>, previous: z.infer<typeof actionPlanSchema>) {
  if(plan.shots.length!==previous.shots.length)throw Error("校正现有分镜不能改变镜头数量");
  plan.shots.forEach((shot,index)=>{
    const before=previous.shots[index];
    if(shot.duration!==before.duration || JSON.stringify(shot.sourceBeatIds)!==JSON.stringify(before.sourceBeatIds) || JSON.stringify([...shot.assetIds].sort((a,b)=>a-b))!==JSON.stringify([...before.assetIds].sort((a,b)=>a-b)))throw Error(`校正第 ${index+1} 镜必须保留时长、原剧情段落及资产绑定`);
    if(/(?:近景|特写)/.test(shot.camera) && /全身|双脚|脚底/.test(shot.camera) && /固定/.test(shot.camera))throw Error(`第 ${index+1} 镜固定近景与全身可见要求冲突，请按动作所需可见范围修正摄影描述`);
  });
}

/** This exact factual summary is derived metadata; other director prose stays authored. */
export function synchronizeShotCount(plan: unknown, boards: {duration?: unknown}[]) {
  if(typeof plan!=="string")return plan;
  const duration=boards.reduce((sum,b)=>sum+Number(b.duration),0);
  if(!Number.isFinite(duration))return plan;
  return plan.replace(/本集\s*\d+\s*镜\s*[\/／]\s*\d+(?:\.\d+)?\s*秒/g,`本集 ${boards.length} 镜 / ${duration} 秒`);
}

/** The table is a view of saved panels: no second, independently stale shot list. */
export function renderActionTable(boards: { id?: number; duration?: unknown; videoDesc?: string | null; prompt?: string | null }[]) {
  const cell = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "&#124;").replace(/\r?\n/g, "<br>");
  let start = 0;
  const rows = boards.map((b, index) => {
    const s = storyboardSections(b.videoDesc || ""), duration = Number(b.duration), end = start + duration;
    const row = [index + 1, `${start}–${end}秒（${duration}秒）`, s["本镜主题"], s["起始画面"] || b.prompt, s["主体动作"], s["结束画面"], s["摄影机"], s["原剧情与台词"] || s["台词与声音"], s["连续性"]];
    start = end; return `| ${row.map(cell).join(" | ")} |`;
  });
  return `### 完整动作分镜表\n\n本表与分镜面板共用已保存内容；修改镜头后刷新同步。共 ${boards.length} 镜，${start} 秒。\n\n| 镜号 | 时间 | 本镜主题 | 起始画面 | 完整动作 | 结束状态 | 摄影机 | 原剧情与台词 | 连续性 |\n|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}`;
}

/** Preserve the native model's camera description in the image-generation input. */
export function actionOpeningPrompt(shot: {openingFrame:string;camera:string}) {
  return `${shot.openingFrame}\n\n【首帧摄影依据】${shot.camera}\n仅绘制单一静态第一帧；摄影描述中的后续运镜和动作不在静帧内展开。`;
}

const correctionSchema = z.object({corrections:z.array(z.object({
  shot:z.number().int().positive(),
  patch:actionShotSchema.pick({purpose:true,openingFrame:true,subjectAction:true,endingFrame:true,camera:true,continuity:true}).partial().strict().refine(p=>Object.keys(p).length>0,"修正字段不能为空"),
}).strict()).min(1)}).strict();
/** Model-authored patches may only change the reviewed shots; source assignments stay immutable. */
export function applyActionCorrections(plan:ActionShot[] , raw:unknown, allowedShots:number[]) {
  const {corrections}=correctionSchema.parse(raw),seen=new Set<number>();
  const shots=plan.map(s=>({...s}));
  for(const item of corrections){
    if(!allowedShots.includes(item.shot)||!shots[item.shot-1]||seen.has(item.shot))throw Error("修正引用了未指出问题的镜头或重复镜号");
    seen.add(item.shot);shots[item.shot-1]={...shots[item.shot-1],...item.patch};
  }
  return {shots};
}
