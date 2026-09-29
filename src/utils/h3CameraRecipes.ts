// Adapted summaries of Loop Forge's MIT-licensed minimaxh3-shots-skills.
// Source revision and licence: docs/third-party/h3-shots-LICENSE.
// "source_reported" records the author's observations, never local render validation.
export const H3_CAMERA_SOURCE = {
  repository: "https://github.com/Nuos/minimaxh3-shots-skills",
  commit: "8609642953b083891129569b09ecbcc54adbaaa2",
  author: "Loop Forge",
  license: "MIT",
  sourceEvidence: "source_reported" as const,
  localRendered: false as const,
};

export interface H3CameraRecipe {
  id: string;
  name: string;
  primitives: readonly string[];
  opening: string;
  requirements: readonly string[];
  instruction: string;
  limitations: readonly string[];
  sourceEvidence: "source_reported";
  localRendered: false;
  sourceReportedStatus: string;
  sourceUrl: string;
  /** Related core moves, not permission to replace their direction or geometry. */
  motionIds: readonly string[];
  selectionPolicy: "conditional" | "explicit_only";
}

type RecipeInput = Omit<H3CameraRecipe, "sourceUrl" | "sourceEvidence" | "localRendered">;
function recipe(input: RecipeInput): H3CameraRecipe {
  return {
    ...input,
    sourceEvidence: "source_reported", localRendered: false,
    sourceUrl: `${H3_CAMERA_SOURCE.repository}/blob/${H3_CAMERA_SOURCE.commit}/.claude/skills/h3-camera-shots/shots/${input.id}.md`,
  };
}

export const H3_CAMERA_RECIPES: readonly H3CameraRecipe[] = [
  recipe({
    id: "crash-zoom-in", name: "冲击式快速变焦拉近", primitives: ["Zoom In"],
    opening: "较宽起幅留出放大范围，终点是已定义的紧特写。",
    requirements: ["已有明确的强调对象", "剧情允许短促视觉冲击", "起止均有可读停留"],
    instruction: "先保持起始画面，再以大幅度、快速变焦拉近已确定的目标。摄影机位置固定，在既有反应继续前停稳于特写构图。",
    limitations: ["机位不前进，不出现推轨式前景通过。", "作者未能精确控制冲击发生的毫秒或时刻；不能承诺定时。"],
    sourceReportedStatus: "verified", motionIds: ["snap_zoom_in"], selectionPolicy: "conditional",
  }),
  recipe({
    id: "super-dolly-in", name: "长距离快速推轨", primitives: ["Push In"],
    opening: "大远景，主体在纵深尽头较小；已有近前景分布在镜头将经过的位置。",
    requirements: ["故事已定义可通行纵深路线", "已有可经过的近前景", "紧特写终点及快速接近有叙事依据"],
    instruction: "沿已建立的空间向主体快速推进。既有近处物体从画框边缘掠过，地面和中景连续通过，最后停稳于指定的特写构图。",
    limitations: ["不能为展示视差自动增加树木、走廊或障碍物。", "近前景不足时不能把普通变焦宣称为长距离推轨。"],
    sourceReportedStatus: "verified", motionIds: ["push_in_fast"], selectionPolicy: "conditional",
  }),
  recipe({
    id: "dolly-zoom", name: "推近并变焦拉远的滑动变焦", primitives: ["Push In", "Zoom Out"],
    opening: "按结束时的主体大小和位置起幅；不靠远景起幅制造推进范围。",
    requirements: ["明确要求前推加反向变焦这一方向", "主体大小与位置保持", "背景有已定义的纵深和可辨认结构"],
    instruction: "摄影机向前推进，同时以匹配的速度变焦拉远。保持主体在画面中的大小和位置不变，使既有背景显得后退、展开，纵深感增强。",
    limitations: ["这是前推方向，不对应 Toonflow 的 dolly_zoom；该内建项是后拉加变焦拉近。", "作者报告主体锁定不稳定；锁定与背景变化需分别观看核验。"],
    sourceReportedStatus: "verified-unreliable", motionIds: [], selectionPolicy: "explicit_only",
  }),
  recipe({
    id: "dolly-zoom-telephoto", name: "后拉并变焦拉近的滑动变焦", primitives: ["Pull Out", "Zoom In"],
    opening: "按主体需要保持的大小与位置起幅，背景纵深结构清楚。",
    requirements: ["后拉与变长焦方向已确定", "主体大小和画内位置保持", "背景有可辨认的纵深关系"],
    instruction: "摄影机向后拉远，同时以匹配的速度变焦拉近。保持主体在画面中的大小和位置稳定，使既有背景显得更近、更平，空间纵深受到压缩。",
    limitations: ["这是 Toonflow dolly_zoom 的对应方向，不得改为 Push In + Zoom Out。", "作者的该方向测试曾丢失身份参考图，证据较弱；未证明接身份图时可靠。"],
    sourceReportedStatus: "rendered-weak-evidence", motionIds: ["dolly_zoom"], selectionPolicy: "conditional",
  }),
  recipe({
    id: "yoyo-zoom", name: "拉远、停留、冲回的往返变焦", primitives: ["Zoom Out", "Zoom In"],
    opening: "紧特写，返程回到相同对象与构图。",
    requirements: ["用户或分镜明确需要往返光学变化", "已有拉远后可展示的环境", "时长可容纳拉远、停留、冲回三阶段"],
    instruction: "从指定特写开始，加速变焦拉远以揭示既有环境，保持拉远后的画面，再以短促的快速变焦回到同一特写。全程保持摄影机位置固定。",
    limitations: ["不能把单次 zoom_in 或 zoom_out 自动扩展成往返组合。", "作者仅报告形态部分成功，远近比例及停留比例不受精确控制。", "192 帧是来源工作流观察，不是本产品自动设置。"],
    sourceReportedStatus: "verified-partial", motionIds: ["zoom_out", "snap_zoom_in"], selectionPolicy: "explicit_only",
  }),
  recipe({
    id: "eyes-in", name: "缓慢推进至眼部细节", primitives: ["Push In"],
    opening: "明确面部与目标眼的位置，并留出接近至细节的空间。",
    requirements: ["故事明确要求眼部或已有结构细节占满画面", "指定具体终点", "主体表演在裁切前保持可读"],
    instruction: "朝已确定的面部或细节缓慢推进，直到明确指定的眼睛或结构特征充满画面。终点落在该细节，不停留于普通面部特写。",
    limitations: ["普通推近不得自动变成钻眼；无生命物体不能虚构眼睛。", "作者关于极近终点自动扩大起幅的观察仅为单例，不能依赖。"],
    sourceReportedStatus: "verified", motionIds: ["push_in"], selectionPolicy: "explicit_only",
  }),
  recipe({
    id: "whip-pan", name: "有起止目标的甩摇", primitives: ["Pan Left or Pan Right"],
    opening: "先看清起始对象，另一个已存在的目标处于指定方向的可连接空间。",
    requirements: ["起点与落点对象已经存在", "左右方向明确", "落点停稳，不自动返回原对象"],
    instruction: "从已确定的起始目标出发，沿已选方向快速甩摇至已确定的终点目标，并停稳形成清晰落幅。快速水平转动期间，中间空间可以出现运动模糊；镜头结束于终点目标。",
    limitations: ["不能为套原例新增第二个人或第二张参考图。", "来源主要测试右向；左向是文档方向扩展，未由该来源看片验证。", "单镜甩摇不自动形成换场剪辑。"],
    sourceReportedStatus: "verified-right-direction", motionIds: ["whip_pan_right", "whip_pan_left"], selectionPolicy: "conditional",
  }),
  recipe({
    id: "orbit-360", name: "完整一周环绕", primitives: ["Arc Shot"],
    opening: "主体和背景地标可辨，终点返回起始方位附近。",
    requirements: ["明确要求完整一周而非小弧移", "原故事允许主体停留原地，不适用于必须持续位移的行动", "周围空间已经建立", "具备跨轴的连续视觉依据"],
    instruction: "以大幅度、快速弧线运动环绕既有主体，完成可辨认的完整一周，并回到起始侧。主体保持在原地，保留其已有的自然动作。",
    limitations: ["不能把 arc_left、arc_right 或有限航拍弧移扩成整周。", "来源未指定环绕左右；具体方向仍服从已选方案。", "作者返回背景并不完全一致，不能承诺无缝循环或子弹时间。"],
    sourceReportedStatus: "verified", motionIds: ["orbit_full_fast"], selectionPolicy: "conditional",
  }),
  recipe({
    id: "crane-rise", name: "跟随跑动并升到头顶俯视", primitives: ["Tracking Shot", "Pedestal Up", "Tilt Down"],
    opening: "在既有跑动主体旁的低机位起幅，终点为高处俯视。",
    requirements: ["原故事已经有跑动与行进路线", "允许跟随、升高和下俯协同", "主体与地面方向保持清楚"],
    instruction: "跟随主体在原故事中已有的跑动，从既定低机位升高，同时向下俯仰至头顶俯视。升高、跟随和下俯形成一次连贯运动，主体动作始终清楚可辨。",
    limitations: ["原配方含跑动，不得给静止人物添加跑步。", "与 crane_up_overhead 只在升高下俯部分相近；已选原方案无跟跑时不得增添跟跑。", "不要把载具或机架名称写入音景引出设备声。"],
    sourceReportedStatus: "verified", motionIds: ["crane_up_overhead"], selectionPolicy: "conditional",
  }),
  recipe({
    id: "aerial-pullback", name: "升高后拉揭示全貌", primitives: ["Pull Out", "Pedestal Up"],
    opening: "相对较紧地观察主体，结束时环境占更大范围。",
    requirements: ["完整环境已在故事中定义", "具备后退与升高路线", "结束仍能辨认主体与地点关系"],
    instruction: "沿连续路径一边后拉、一边升高摄影机。下方主体逐渐变小，既有环境逐步展开，最后停稳于计划中的宽景构图。",
    limitations: ["后退位移不是 Zoom Out；已选缓慢路线不得仅因来源配方改为高速。", "不为补充反应而添加人物抬头或新行为。"],
    sourceReportedStatus: "verified", motionIds: ["crane_reveal"], selectionPolicy: "conditional",
  }),
  recipe({
    id: "handheld", name: "跑动中的强烈手持跟拍", primitives: ["Shake Strongly", "Tracking Shot"],
    opening: "主体及其已有快速行动可读，跟拍侧别和路径明确。",
    requirements: ["故事已有跑动、追逐或同等运动依据", "允许强烈手持而非轻微呼吸", "关键动作在晃动中仍有可读落点"],
    instruction: "在主体侧面跟随其已有的快速运动，采用由该运动带动的明显手持晃动。构图随运动产生偏移并恢复，同时保持指定动作和运动方向清楚可辨。",
    limitations: ["不等于 handheld_breath；不得将轻微手持升级成强晃动。", "不能自动增加跑步、追逐或回头动作；主体尺寸不保证锁定。"],
    sourceReportedStatus: "verified", motionIds: ["tracking", "tracking_side"], selectionPolicy: "conditional",
  }),
  recipe({
    id: "dutch-angle", name: "滚转至荷兰角并保持", primitives: ["Roll Counterclockwise or Roll Clockwise"],
    opening: "场景有可辨认地平线、门框或垂直参照。",
    requirements: ["明确需要从起角滚转到倾斜角", "方向与结束倾角有依据", "结束后保持而非持续旋转"],
    instruction: "沿指定方向绕镜头光轴滚转至目标倾斜构图，然后保持该倾角。利用既有地平线或垂直线条，使角度变化清楚可辨。",
    limitations: ["来源配方包含一次滚转，不等于静态 angle_dutch，也不等于顶视 topdown_rotate。", "默认逆时针曾由来源测试；反向未有同等验证。"],
    sourceReportedStatus: "verified-counterclockwise", motionIds: [], selectionPolicy: "explicit_only",
  }),
  recipe({
    id: "snorricam", name: "主体画内锁定的随身视点", primitives: [],
    opening: "按终点大小起幅，脸或主体关键部位位于固定画内位置。",
    requirements: ["故事已有持续行走或自主移动", "明确要求主体中心与尺寸锁定", "背景变化来自原有路线，不添加转身"],
    instruction: "在主体已有的向前行进中，使其主要面部或识别特征在画面内保持固定大小和位置，既有背景在其后方摇摆变化。只描述这一可见关系，不写随身固定机架的名称。",
    limitations: ["不等于普通 tracking_front；普通领拍不保证主体位置和尺寸锁定。", "不得给静态物体添加行走、呼吸或自主移动。", "不为制造背景变化而新增转弯；设备名可能被画进场景。"],
    sourceReportedStatus: "verified", motionIds: [], selectionPolicy: "explicit_only",
  }),
  recipe({
    id: "rack-focus", name: "同构图内前后景转焦", primitives: ["Static Shot"],
    opening: "同一画框内已有两个不同深度的焦点目标，近处清晰、远处虚焦。",
    requirements: ["既有两个深度层的具体对象", "转移注意有剧情依据", "固定机位与构图不变"],
    instruction: "摄影机保持静止，让既有的近、远两个深度层同时留在画面内。将焦点从指定近处目标转移到指定远处目标，使近处目标逐渐虚化、远处目标逐渐清晰。",
    limitations: ["来源原例是三个人和三张身份图；通用技法只需两层既有目标，不得复制新增人物或素材。", "若已选移动主运镜，不得由该固定版本强行改成静止。"],
    sourceReportedStatus: "verified", motionIds: ["static"], selectionPolicy: "conditional",
  }),
  recipe({
    id: "split-screen", name: "逐次出现的三联分屏", primitives: [],
    opening: "用户已明确要求三等分竖屏布局；各角度观察同一已有动作。",
    requirements: ["明确授权三联分屏，不能自动新增多面板", "同一动作可从三角度辨认", "时长可容纳逐次揭示与共同播放"],
    instruction: "仅在明确要求三联分屏时，使用三块等宽竖向画面，以细窄间隔分开。按指定顺序呈现各自已有的视角，再同步展示同一连续动作；主体继续动作时，各画面的摄影机均保持固定。",
    limitations: ["不能把普通 [Shot 1]、[Shot 2] 镜头序列变成同时播放的三联画。", "作者仅验证布局与部分顺序，具体出现时刻不可承诺。", "192 帧是来源观察，不自动改变轨道时长或生成参数。"],
    sourceReportedStatus: "verified-layout-only", motionIds: [], selectionPolicy: "explicit_only",
  }),
];

/** Prompt clauses only: no media calls, generation parameters or reference mutations. */
export function h3CameraGenerationRules(model?: string): string {
  if (!/h3/i.test(model || "")) return "";
  const summaries = H3_CAMERA_RECIPES.map(item => `${item.id}：${item.primitives.join(" + ") || "描述可见结果"}。${item.selectionPolicy === "explicit_only" ? "仅在明确要求此效果时使用。" : "满足条件才可自动选用。"}前提：${item.requirements.join("；")}。起幅：${item.opening} ${item.instruction}`).join("\n");
  return `【H3 摄影配方适配】
来源：Loop Forge / Nuos minimaxh3-shots-skills，固定版本 ${H3_CAMERA_SOURCE.commit}。15 个配方归纳于作者的人类主体、特定参考模式与工作流测试；sourceEvidence=source_reported，localRendered=false。本项目未生成或观看对应样片，不把来源自报通过当作本地验证。
配方只负责每个 [Shot N] 的摄影句。正文默认简体中文，保留本次真实输入模式、模型专用字段名、引用标记和对白含义，中文对白统一使用简体字，不能强制改成 Ref2VA，也不能在每镜重复六段参考模式结构。身份参考、真实首尾帧和环境参考按实际用途处理；不增加、删除、重新排序图片，不虚构 <Picture N> 或 <Subject N>。
已采用的逐镜摄影方案优先于配方。严格保留原主运动、方向、构图、焦点、时长与事件；motionIds 仅为相近关联，不能据此把单次动作变往返、有限弧移变整周、静态荷兰角变滚转、轻微手持变强抖动、普通领拍变主体锁定。Toonflow 的 dolly_zoom 明确对应 dolly-zoom-telephoto：Pull Out + Zoom In，绝不可反转为 Push In + Zoom Out。该 telephoto 来源证据较弱，身份参考条件下未获同等验证。
未采用方案时，先检查已有故事是否满足配方前提，再选一个相容主运动或 static。不得为了配方新增跑步、转身、额外人物、眼部终点、障碍物、多面板或参考素材；不满足条件就选更简单的既有镜头。快速推轨需要已有近前景，甩摇需要 FROM 与 TO，转焦需要两层既有焦点目标。
以正确运动动词、起落几何与可观察结果表达摄影。幅度和速度只在效果需要时说明，不无脑叠加 large 与 fast；品牌、机身和焦段不能替代构图与路径。人物保持与原动作相容的自然呼吸或眨眼，不要求僵硬冻结；不给无生命物体添加呼吸，也不因此新增表演事件。不能仅因摄影术语自动增加设备、机架或设备声；保留剧情明确已有的相机道具、片场设备与声音。
来源的 bullet time 尝试未成功，只记录限制，不能把它列为已验证能力或把自然环绕当成主体时间冻结。原文 20 steps、124/192 frames、背景参考影响等均是特定工作流观察，不是普适硬参数；不要修改步数、帧数、采样器、时长或参考模式。保留用户要求的总时长与动作顺序，但不承诺模型能精确兑现毫秒级事件；是否成功须观看成片。往返变焦的比例、分屏时序与滑动变焦的主体锁定仍有限制。
以下是条件化的摄影句候选，不要把本清单或教学说明输出到最终视频提示词：
${summaries}`;
}
