import { z } from "zod";

export const shotDurationSchema = z.number().int("镜头时长必须使用整数秒").min(8, "每镜至少 8 秒，请合并同一动作的碎镜").max(15, "每镜最多 15 秒，请按完整动作单元重新编排");

export const SHOT_ACTION_RULES = `【完整动作镜头规则：优先于旧模板中的碎镜示例】
每一个分镜都是一个明确的叙事任务和完整动作单元，时长只能为 8 至 15 个整数秒。一个分镜对应一个独立视频片段，默认连续拍摄，不在片段内再插入碎镜。短小的抬眼、握拳、迈步应并入同一目的的连续动作；只有叙事任务、地点或独立事件改变才新建分镜。禁止因为台词超过二十字就切镜。超过十五秒才能完成的动作在自然的完成状态分段，不能加速、截断台词或跳过过程。
每镜必须写出：本镜主题（人物试图完成什么及可见结果）、起始姿态与空间位置、完整动作过程、结束姿态与持续状态。动作过程必须明确谁、哪只手或脚、接触什么、朝哪里移动、如何转移重心、物体如何随动作变化；重物与地面保持真实接触并表现阻力；人物先把重心转移到可靠支撑后再松手，不在悬空或无支撑姿态下停留。只细化原动作，不添加新剧情。按启动、持续执行、完成三个自然阶段安排时间，时间标记只能用整数秒，阶段是连续表演而非切镜。根据动作重量、距离、对白和呼吸留足时间，不能用机械慢动作拖满时长。
结尾至少留两秒展示动作结果：具体写清双手位置、身体支撑、目光目标及持续呼吸；人物保持有目的的注意与自然表演。禁止无剧情依据地在最后突然恍惚、茫然、发呆、六神无主、不知所措、四处乱看或重新启动动作；禁止用这些状态填充剩余时间。动作中允许有因果依据的受力与失衡，恢复后的结尾姿态必须明确。
全部描述使用完整简体中文句子，禁止用“同上”“略”“依原情节”“按原分镜”“做相应动作”“等等”替代实际内容；禁止用景别、运镜、旁白的英文缩写或动作箭头速记。写全角色名称，分别描述人物运动和摄影机运动。模型要求的字段名、[Shot N]、<Picture N>、<Subject N>、<Audio N> 和声音标签属于协议，必须保留。原台词逐字保留，包括原文停顿；不能把原台词中的省略号当作可省略描述的许可。
视频正文不能只写主题概括、摄影术语或参考图关系。图片提示词仅描述明确的起始瞬间；视频提示词负责从这个起点完成完整动作。多参考素材用于身份、服装和场景一致性，不等于冻结人物动作。`;

/** Reject definite formatting omissions; semantic action quality still needs review. */
export function validateActionText(text: string) {
  // Keyframe protocol lines format integral endpoints with two decimals; they are not action timing.
  const withoutAlignment = text
    .replace(/^For the target video, at 0\.00 seconds into the target video, <Picture 1> \(from \[Shot 1\]\) is fully referenced\.[ \t]*$/gm, "")
    .replace(/^How the reference pictures align with the target video — Picture 1 \(from Shot 1\) aligns with the 0\.00-second mark of the target video; Picture 2 \(from Shot \d+\) aligns with the \d+\.00-second mark of the target video\.[ \t]*$/gm, "")
    .replace(/^How the reference pictures align with the target video — <Picture 1> \(from \[Shot \d+\]\) aligns with the \d+\.00-second mark of the target video\.[ \t]*$/gm, "");
  const prose = withoutAlignment.replace(/<d>[\s\S]*?<\/d>/g, "").replace(/[“「『][\s\S]*?[”」』]/g, "");
  if (/\d+\.\d+\s*(?:秒|s\b|seconds?\b|-second)|\b\d{2}:\d{2}\.\d+|\d+\.\d+\s*(?:至|到|[~～—–-])\s*\d+(?:\.\d+)?\s*(?:秒|s\b)/i.test(prose)) throw Error("动作时间请使用整数秒，禁止小数秒时间标记");
  if (/(?:同上|依原情节|按原分镜|做相应动作|此处省略|等等)|(?:^|[：:；;\n])\s*略\s*(?:$|[。；\n])/.test(prose)) throw Error("人物动作描述不完整，请展开简略词并写清动作起点、过程与结束状态");
  if (/[→⇒]/.test(prose)) throw Error("请用完整句子写明动作的起点、过程与结果，不使用动作箭头速记");
  if (/\b(?:CU|ECU|MS|MCU|WS|LS|ELS|FS|OTS|POV|VO|OS|BGM)\b/.test(prose)) throw Error("请将景别、视角、旁白和声音缩写写成完整中文描述");
}

export function validatePromptReferences(text: string, counts: { Picture: number; Audio: number; Video: number }) {
  for (const match of text.matchAll(/<(Picture|Audio|Video)\s+(\d+)>/g)) {
    const type = match[1] as keyof typeof counts, n = Number(match[2]);
    if (n < 1 || n > counts[type]) throw Error(`提示词引用了未提供的 <${type} ${n}>，未保存该输出。声线文字说明不是音频文件，请重新生成。`);
  }
}
