import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { CAMERA_MOVES, cameraOptionsSchema } from "./cameraMotion";
import cameraSourceIndex from "../../data/web/camera-source-index.json";

export const CAMERA_SKILL_VERSION = "toonflow-camera-skills/1.0";
export const CAMERA_SKILL_DOMAINS = [
  { id: "shot_size", name: "景别与构图" }, { id: "angle", name: "机位与视角" },
  { id: "movement", name: "主运镜与稳定" }, { id: "optics", name: "光学与焦点" },
  { id: "transition", name: "剪辑与转场" }, { id: "performance", name: "表演与情绪" },
] as const;
export const CAMERA_SKILL_MECHANISMS = [
  { id: "fixed", name: "固定观察", domains: ["movement"] }, { id: "translation", name: "机位平移", domains: ["movement"] },
  { id: "rotation", name: "机位旋转", domains: ["movement"] }, { id: "follow", name: "跟随主体", domains: ["movement"] },
  { id: "orbit", name: "环绕弧移", domains: ["movement"] }, { id: "vertical", name: "机位升降", domains: ["movement"] },
  { id: "combination", name: "组合运动", domains: ["movement"] }, { id: "virtual", name: "虚拟摄影", domains: ["movement"] },
  { id: "flythrough", name: "空间穿行", domains: ["movement"] },
  { id: "stability", name: "稳定与手持", domains: ["movement"] }, { id: "temporal", name: "时间与视点控制", domains: ["movement"] },
  { id: "framing", name: "取景范围", domains: ["shot_size"] }, { id: "viewpoint", name: "视轴与机位", domains: ["angle"] },
  { id: "optical", name: "焦距变化", domains: ["optics"] }, { id: "focus", name: "焦点与景深", domains: ["optics"] },
  { id: "edit", name: "剪辑衔接", domains: ["transition"] }, { id: "acting", name: "可观察表演", domains: ["performance"] },
] as const;
type Domain = typeof CAMERA_SKILL_DOMAINS[number]["id"];
type Mechanism = typeof CAMERA_SKILL_MECHANISMS[number]["id"];
// Zod defaults inside partial objects still materialize absent keys. A skill is
// an exact patch, so strip each default before making the field optional.
const fields = cameraOptionsSchema.shape;
export const cameraSkillOptionsSchema = z.object({
  purpose: fields.purpose.unwrap().optional(), shotSize: fields.shotSize.unwrap().optional(), angle: fields.angle.unwrap().optional(),
  lens: fields.lens.unwrap().optional(), focus: fields.focus.unwrap().optional(), lighting: fields.lighting.unwrap().optional(),
  duration: fields.duration.unwrap().optional(), speed: fields.speed.unwrap().optional(), amplitude: fields.amplitude.unwrap().optional(),
  axisSide: fields.axisSide.unwrap().optional(), screenDirection: fields.screenDirection.unwrap().optional(), eyeline: fields.eyeline.unwrap().optional(),
  continuity: fields.continuity.unwrap().optional(), axisReason: fields.axisReason.unwrap().optional(), stability: fields.stability.unwrap().optional(), mode: fields.mode.unwrap().optional(),
}).strict();
type SkillOptions = z.infer<typeof cameraSkillOptionsSchema>;
type Source = { label: string; url?: string };
type Preference = { favorite: boolean; hidden: boolean; group: string; notes: string };
export interface CameraSkill {
  id: string; builtin: boolean; label: string; domain: Domain; mechanism: Mechanism; motionId: string | null;
  options: SkillOptions; changedFields: string[]; knowledgeOnly: boolean; tags: string[];
  prerequisites: string[]; applicable: string[]; avoid: string[]; inputs: string[]; usage: string;
  combinations: string[]; risks: string[]; sources: Source[];
}
const editorial: Source[] = [{ label: "本地 camera-motion / camera-lighting 技能规则与 Toonflow 摄影应用编排；非影片逐镜结论" }];
const sixMovesSource: Source = { label: "作者描述列名；未验证画面（6 种电影运镜教程）", url: "https://www.youtube.com/watch?v=aoJK13tXJSY" };
const emptyPreference: Preference = { favorite: false, hidden: false, group: "", notes: "" };
const extra = (s: Omit<CameraSkill, "builtin" | "changedFields" | "sources"> & { sources?: Source[] }): CameraSkill => ({ ...s, builtin: true, changedFields: Object.keys(s.options), sources: s.sources || editorial });
const movementNotes: Record<string, { mechanism: Mechanism; prerequisites: string[]; avoid: string[]; inputs: string[]; combinations: string[] }> = {
  static: { mechanism: "fixed", prerequisites: ["主体动作或信息本身足以支撑停留", "确定不随主体移动的背景参照"], avoid: ["把固定机位误写成主体不得移动", "同镜另要求摄影机推拉或明显晃动"], inputs: ["固定构图", "主体动作与停留节点", "焦点目标"], combinations: ["focus_rack", "shot_closeup"] },
  push_in: { mechanism: "translation", prerequisites: ["明确要靠近的主体和结束景别", "有可辨识的前后景关系"], avoid: ["与固定机位变焦混写", "推进后裁掉必须看见的手部或道具"], inputs: ["起始与结束构图", "推进幅度及速度", "保持焦距和对焦目标"], combinations: ["shot_closeup", "focus_deep"] },
  pull_out: { mechanism: "translation", prerequisites: ["结束环境及人物位置已有依据", "明确信息揭示先后"], avoid: ["凭空补出场景或人物", "尚未读清细节就过早远离"], inputs: ["起始主体", "结束环境范围", "揭示顺序与落幅"], combinations: ["shot_full", "focus_deep"] },
  truck_left: { mechanism: "translation", prerequisites: ["前景遮挡、主体、背景的空间关系明确"], avoid: ["将左横移描述为固定机位左摇", "位移后无因越轴"], inputs: ["横移路径", "起止遮挡关系", "主体屏幕方向"], combinations: ["shot_full", "focus_deep"] },
  truck_right: { mechanism: "translation", prerequisites: ["被揭示的对象已经在场景设定中存在"], avoid: ["用转动朝向替代横向位移", "揭示后人物左右关系无法解释"], inputs: ["横移路径", "揭示对象", "结束相对位置"], combinations: ["shot_full", "focus_deep"] },
  pan_left: { mechanism: "rotation", prerequisites: ["两个目标处于可连接的观察空间"], avoid: ["同时要求机位明显左移", "终点目标没有叙事依据"], inputs: ["起始视觉目标", "左侧结束目标", "旋转速度和停留"], combinations: ["focus_deep", "angle_ots"] },
  pan_right: { mechanism: "rotation", prerequisites: ["视线或声音提供向右转移注意的动机"], avoid: ["把摇摄写成横移视差", "提前展示本应最后揭示的信息"], inputs: ["起点与落点", "启动原因", "落点停留"], combinations: ["focus_deep", "angle_ots"] },
  tilt_up: { mechanism: "rotation", prerequisites: ["低处与高处目标在同一可理解空间"], avoid: ["把镜头上仰等同于摄影机升高"], inputs: ["低处起幅", "高处落幅", "机位保持和旋转过程"], combinations: ["focus_deep", "angle_low"] },
  tilt_down: { mechanism: "rotation", prerequisites: ["道具或线索与人物的归属已交代"], avoid: ["向下俯仰同时无意降低机位"], inputs: ["高处起幅", "低处落幅", "线索归属"], combinations: ["shot_closeup", "focus_rack"] },
  tracking: { mechanism: "follow", prerequisites: ["主体有明确的行进路线和动作", "可维持相对机位与距离"], avoid: ["只写跟拍却不说明主体朝向", "无因改变行动屏幕方向"], inputs: ["主体路线与速度", "摄影机相对位置", "环境通过的方向"], combinations: ["shot_full", "handheld_breath"] },
  arc_left: { mechanism: "orbit", prerequisites: ["明确主体中心和小幅弧线终点", "记录起止轴线侧"], avoid: ["无意变成完整 360 度环绕", "人物视线关系因越轴丢失"], inputs: ["弧移方向和幅度", "起止角度", "越轴依据或同侧范围"], combinations: ["shot_closeup", "focus_deep"] },
  arc_right: { mechanism: "orbit", prerequisites: ["背景锚点可以帮助辨认视点变化", "人物相对位置保持可解释"], avoid: ["以人物自转冒充摄影机环绕", "无依据反转对话视线"], inputs: ["右弧路线", "结束背景关系", "轴线和视线"], combinations: ["shot_closeup", "focus_deep"] },
  pedestal_up: { mechanism: "vertical", prerequisites: ["起止摄影机高度与被揭示信息明确"], avoid: ["以原地上仰替代机位升高"], inputs: ["起止高度关系", "镜头朝向", "遮挡如何变化"], combinations: ["shot_full", "focus_deep"] },
  pedestal_down: { mechanism: "vertical", prerequisites: ["落点与主体行动有可见联系"], avoid: ["以原地下俯替代机位降低"], inputs: ["起止高度", "靠近的动作或物体", "结束构图"], combinations: ["shot_closeup", "angle_low"] },
  crane_reveal: { mechanism: "combination", prerequisites: ["整体环境已定义", "时长容纳升高后退和结束停留"], avoid: ["极短镜头堆叠过多揭示", "以缩放冒充空间展开"], inputs: ["连续斜向路径", "主体到环境的揭示顺序", "最终环境范围"], combinations: ["shot_full", "focus_deep"] },
  zoom_in: { mechanism: "optical", prerequisites: ["固定机位可保留所需观察关系"], avoid: ["同时声明推轨视差", "将变焦当作焦点转移"], inputs: ["固定机位", "由宽到窄的取景范围", "焦距变化节奏"], combinations: ["shot_closeup", "focus_deep"] },
  dolly_zoom: { mechanism: "combination", prerequisites: ["主体大小保持与背景变化是清楚的视觉任务", "背景具有可辨认纵深"], avoid: ["承诺模型精确执行物理光学", "同时加入没有用途的环绕"], inputs: ["机位后退", "焦距补偿主体大小", "背景变化与停止位置"], combinations: ["shot_closeup", "angle_dutch"] },
  virtual_pass: { mechanism: "virtual", prerequisites: ["穿越对象和视觉锚点明确", "说明新空间逻辑与叙事联系"], avoid: ["只有炫技而没有可读落点", "未经意图说明就改变人物身份"], inputs: ["穿越路径和对象", "起止锚点", "虚拟空间转换理由"], combinations: ["shot_full", "focus_deep"] },
  fpv_flythrough: { mechanism: "flythrough", prerequisites: ["场景中穿行路线连续可理解", "指定进入、经过和离开的真实开口及空间锚点"], avoid: ["无目的持续翻滚", "速度过快导致落点信息不可读", "未声明虚拟摄影却穿透实体墙面"], inputs: ["单一主路线", "真实开口及避让障碍", "速度变化与落点停留"], combinations: ["shot_full", "focus_deep"] },
  whip_pan_right: { mechanism: "rotation", prerequisites: ["起幅和落幅各有清楚视觉目标", "有足够前后停留供剪辑使用"], avoid: ["把高速模糊当作已经完成转场", "落幅对象无法辨认"], inputs: ["向右甩镜的起止目标", "模糊阶段", "落幅稳定停留"], combinations: ["transition_match", "focus_deep"] },
  push_in_fast: { mechanism: "translation", prerequisites: ["靠近主体的通道明确", "快速变化仍留出反应及落幅停留"], avoid: ["用数字裁切冒充机位推进", "关键动作被高速掠过遮蔽"], inputs: ["快速推进的触发点", "靠近幅度", "减速位置和结束构图"], combinations: ["shot_closeup", "focus_deep"] },
  macro_dive: { mechanism: "virtual", prerequisites: ["宏观到微观的连接对象明确", "指定转化后仍可辨识的视觉锚点"], avoid: ["将虚拟尺度转换承诺为真实微距光学", "无理由更换目标物或材质"], inputs: ["进入物体或表面的视觉位置", "经过的尺度层级", "微观落点及虚拟转换逻辑"], combinations: ["shot_closeup", "focus_reveal"] },
  cosmic_dive: { mechanism: "virtual", prerequisites: ["从宇宙到街道的尺度层级有顺序", "街道落点与故事位置已确定"], avoid: ["把跨尺度生成当作单一真实相机轨道", "落点变成无关城市或人物"], inputs: ["宏观起点", "尺度切换层级与视觉锚点", "街道终点和时间逻辑"], combinations: ["shot_full", "focus_deep"] },
  orbit_half: { mechanism: "orbit", prerequisites: ["明确半周范围和起止角度", "背景锚点帮助观众追踪越轴"], avoid: ["用主体自转替代机位半周运动", "相机跨轴而人物视线无依据反转"], inputs: ["环绕中心与方向", "半周路线", "起止视线及中途空间依据"], combinations: ["shot_full", "focus_deep"] },
  orbit_full_fast: { mechanism: "orbit", prerequisites: ["完整一周的空间与起始落点已定义", "时间能容纳快速环绕和稳定结束"], avoid: ["以快速旋转画面代替绕主体走一周", "人物在转动中换脸、变形或瞬移"], inputs: ["中心与方向", "完整一周的背景连续变化", "起止加减速及停止角度"], combinations: ["shot_full", "focus_deep"] },
  crane_up_overhead: { mechanism: "combination", prerequisites: ["起始高度与结束俯视范围明确", "升高和下俯是相互配合的连续变化"], avoid: ["直接复用升高后拉模板造成路径错误", "结束俯视失去主体位置"], inputs: ["起始机位", "升高过程及朝向调整", "结束俯视关系"], combinations: ["shot_full", "focus_deep"] },
  crane_down_eye: { mechanism: "combination", prerequisites: ["高处起点与眼平终点可连贯衔接", "落幅人物与机位相对距离确定"], avoid: ["只改变俯仰却没有机位下降", "落到人物面前时无意越过视线"], inputs: ["起始高度", "下降及朝向调整路径", "最终眼平景别"], combinations: ["shot_closeup", "focus_deep"] },
  zoom_out: { mechanism: "optical", prerequisites: ["同一固定机位可以显示结束所需环境"], avoid: ["要求后拉轨道视差却选择固定机位变焦", "光学拉远同时无因改变场景布局"], inputs: ["从紧到宽的取景范围", "机位保持", "变焦速度与结束停留"], combinations: ["shot_full", "focus_deep"] },
  snap_zoom_in: { mechanism: "optical", prerequisites: ["冲击强调的目标已建立", "快速变焦后仍有读清目标的停留"], avoid: ["将速度变化误写成机位瞬移", "将作者未说明的方向当作影片实证"], inputs: ["强调目标", "产品预设的拉近方向", "快速变焦及停止范围"], combinations: ["shot_closeup", "angle_dutch"] },
  drone_flyover: { mechanism: "translation", prerequisites: ["飞越地标与空间方向明确", "起止高度关系和终点有依据"], avoid: ["只有航拍一词却没有路径", "沿途生成无关地标"], inputs: ["飞越方向", "地标经过顺序", "起止高度及结束构图"], combinations: ["shot_full", "focus_deep"] },
  drone_reveal_rise: { mechanism: "vertical", prerequisites: ["遮挡与被揭示环境已定义", "升高后的远近关系清楚"], avoid: ["以航拍载具名称替代摄影机运动说明", "开始就完全暴露本应最后揭示的信息"], inputs: ["起始遮挡", "机位上升路线与保持的朝向", "结束环境范围和停留"], combinations: ["shot_full", "focus_deep"] },
  drone_orbit: { mechanism: "orbit", prerequisites: ["环绕中心、较宽半径与角度范围明确", "环境锚点可保持空间连续"], avoid: ["未指定范围就默认一整圈", "把航拍位置变化误当主体转动"], inputs: ["环绕中心", "范围、方向与高度关系", "背景锚点和落幅"], combinations: ["shot_full", "focus_deep"] },
  topdown_rotate: { mechanism: "rotation", prerequisites: ["顶视中心与旋转轴已明确", "记录旋转方向及结束角度"], avoid: ["把沿光轴滚转当成绕主体位移", "旋转导致主体与背景产生无因滑移"], inputs: ["固定顶视机位", "光轴旋转方向与幅度", "中心目标和地面几何锚点"], combinations: ["shot_full", "focus_deep"] },
  drone_dive: { mechanism: "translation", prerequisites: ["下降路径与避让空间已定义", "终点允许减速并稳定停留"], avoid: ["高速俯冲穿越实体却未声明虚拟逻辑", "仅改变俯视角度而没有机位下降"], inputs: ["起始高位", "俯冲路线与避障", "速度、减速段和落幅"], combinations: ["shot_full", "focus_deep"] },
  whip_pan_left: { mechanism: "rotation", prerequisites: ["左右起止目标有清楚关系", "甩摇前后保留可读稳定画面"], avoid: ["把单镜甩摇等同于自动剪辑或换场", "直接复用右甩造成方向不符"], inputs: ["向左起止目标", "快速旋转及模糊阶段", "落幅停留与后续剪辑意图"], combinations: ["transition_match", "focus_deep"] },
  tracking_front: { mechanism: "follow", prerequisites: ["主体前进路径和相机后退空间明确", "人物面向与视线已记录"], avoid: ["误写主体倒退", "相机后退速度使主体尺寸无因骤变"], inputs: ["主体前进方向", "摄影机在前方的距离", "后退路线和对焦"], combinations: ["shot_full", "handheld_breath"] },
  tracking_back: { mechanism: "follow", prerequisites: ["主体前进路线和背向相机关系明确", "环境与人物身份有连续锚点"], avoid: ["跟随中突然转到正面而未说明路径", "未见面部时强求读清细微表情"], inputs: ["后方机位距离", "主体路线", "环境通过方向和终点"], combinations: ["shot_full", "focus_deep"] },
  tracking_side: { mechanism: "follow", prerequisites: ["主体路线与平行摄影机通道明确", "主体屏幕方向保持可解释"], avoid: ["混淆主体横移和摄影机横移", "平行跟随中无意变成弧形环绕"], inputs: ["主体行进方向", "摄影机侧向位置与速度", "前后景视差"], combinations: ["shot_full", "handheld_breath"] },
  topdown_follow: { mechanism: "follow", prerequisites: ["高机位可识别主体路线", "地面空间锚点和跟随中心明确"], avoid: ["主体太小却要求细微面部表演", "把固定顶视画面中的主体移动误判为跟拍"], inputs: ["俯视高度关系", "主体路线", "相机平移跟随与落点"], combinations: ["shot_full", "focus_deep"] },
  pov_walk: { mechanism: "flythrough", prerequisites: ["观察者身份及步行路线有叙事依据", "步行节奏与空间通过速度一致"], avoid: ["将主观步行变成高速飞行", "无意显示不属于观察者的手脚或影像"], inputs: ["第一人称观察目标", "步行路线与高度关系", "轻微视点起伏和停止位置"], combinations: ["handheld_breath", "focus_deep"] },
};

const additionalSkills: CameraSkill[] = [
  extra({ id: "shot_full", label: "全景与行动空间", domain: "shot_size", mechanism: "framing", motionId: null, options: { shotSize: "全景" }, knowledgeOnly: false, tags: ["空间建立", "身体动作", "人物关系"], prerequisites: ["主角、障碍与关键物件位置清楚"], applicable: ["需要看完整动作和人物路线", "建立场景空间关系"], avoid: ["需要读清极细微眼神却仍停在远处"], inputs: ["主体大小", "行动范围", "关键物件的位置"], usage: "在首帧写清主体全身及必要环境；选全景后继续单独设置主运镜，不把全景当焦距数值。", combinations: ["tracking", "pull_out", "focus_deep"], risks: ["取景过大可能使动作细节和道具失去辨识度。"] }),
  extra({ id: "shot_closeup", label: "特写与反应可读性", domain: "shot_size", mechanism: "framing", motionId: null, options: { shotSize: "特写" }, knowledgeOnly: false, tags: ["反应", "细节", "线索"], prerequisites: ["说明要看清的面部或物件", "已交代物件归属"], applicable: ["眼神变化、手部因果或重要细节"], avoid: ["关键动作需要全身信息", "未建立对象就给无法辨认的局部"], inputs: ["特写对象", "焦点目标", "反应停留"], usage: "首帧仅描述这一瞬间的局部范围；视频另写可观察的动作节点及足够停留。", combinations: ["static", "push_in", "focus_rack"], risks: ["裁切可能隐藏动作原因；近距离广角可能改变面部比例。"] }),
  extra({ id: "angle_ots", label: "过肩与对话关系", domain: "angle", mechanism: "viewpoint", motionId: null, options: { angle: "过肩" }, knowledgeOnly: false, tags: ["对话", "视线匹配", "人物关系"], prerequisites: ["两人的相对站位与轴线已记录"], applicable: ["将观察者与被观察者放在同一空间关系中"], avoid: ["肩部遮住关键表演", "反打没有一致的视线依据"], inputs: ["前景肩部属于谁", "后景观察对象", "轴线侧和视线目标"], usage: "首帧写清谁的肩部在前景、谁的脸在后景；不要只写 OTS 而省略身份与位置。", combinations: ["static", "focus_rack", "shot_closeup"], risks: ["前景人物可能在生成时错误增生或换位。"] }),
  extra({ id: "angle_low", label: "低机位仰视", domain: "angle", mechanism: "viewpoint", motionId: null, options: { angle: "低机位仰视" }, knowledgeOnly: false, tags: ["高度关系", "视点", "空间压迫"], prerequisites: ["机位高度和仰望目标有依据"], applicable: ["强调高度或角色视点", "与地面动作建立关系"], avoid: ["将低机位当作固定的强大情绪按钮"], inputs: ["机位相对高度", "人物与背景高度关系", "面部比例要求"], usage: "写明摄影机低于何处、看向何处；仰视角度与上仰运动分开设置。", combinations: ["static", "tilt_up", "pedestal_up"], risks: ["过近的广角与大仰角可能造成非预期变形。"] }),
  extra({ id: "angle_dutch", label: "荷兰角倾斜构图", domain: "angle", mechanism: "viewpoint", motionId: null, options: { angle: "倾斜构图" }, knowledgeOnly: false, tags: ["失衡", "主观感受", "构图"], prerequisites: ["说明倾斜的视觉目的及保持方式"], applicable: ["有意表现失衡、认知变化或风格化视点"], avoid: ["把倾斜构图自动视为摄影机持续滚转"], inputs: ["倾斜方向", "参考地平线", "与前后镜的关系"], usage: "首帧描述地平线或垂直线的倾斜关系；若机位不转动，另选固定主运镜。", combinations: ["static", "dolly_zoom"], risks: ["倾斜会改变空间读法；需要前后镜的视觉依据。"], sources: [...editorial, sixMovesSource] }),
  extra({ id: "focus_rack", label: "转焦与注意力揭示", domain: "optics", mechanism: "focus", motionId: null, options: { focus: "焦点从已指定的前景目标平稳转移到后景目标；在各自清晰时短暂停留。" }, knowledgeOnly: false, tags: ["线索", "注意力", "前后景"], prerequisites: ["两个焦点目标及其前后关系明确"], applicable: ["同一构图内改变观众注意的对象"], avoid: ["把转焦写成变焦或摄影机移动", "未指定目标只写电影感虚化"], inputs: ["从何物到何物", "何时转焦", "揭示什么"], usage: "应用后将焦点字段中的前景/后景目标替换为本镜具体对象；首尾帧分别写各自静态清晰目标。", combinations: ["static", "angle_ots", "shot_closeup"], risks: ["生成片可能以主体变形代替焦点转移，必须观看中间过程。"] }),
  extra({ id: "focus_deep", label: "深焦与空间层次", domain: "optics", mechanism: "focus", motionId: null, options: { focus: "前景、主体与背景的关键叙事元素均保持可辨识，层次清楚。" }, knowledgeOnly: false, tags: ["空间", "多层信息", "观察"], prerequisites: ["分清各层真正需要辨认的元素"], applicable: ["同时观察人物与环境关系"], avoid: ["画面全部堆满等强度的信息"], inputs: ["前中后景目标", "主次关系", "曝光和光线依据"], usage: "用可辨识的前中后景元素描述景深意图，不以某个焦距单值保证景深。", combinations: ["shot_full", "truck_right", "static"], risks: ["复杂细节可能争夺注意力；实际景深需看片确认。"] }),
  extra({ id: "handheld_breath", label: "轻微手持呼吸", domain: "movement", mechanism: "stability", motionId: null, options: { stability: "轻微手持呼吸" }, knowledgeOnly: false, tags: ["稳定方式", "临场感", "表演"], prerequisites: ["已有主运动或固定站位的选择"], applicable: ["允许轻微视点呼吸且仍需读清人物"], avoid: ["用随机大幅晃动代替主运动设计"], inputs: ["手持强度", "稳定落点", "需保持可读的动作"], usage: "仅修改稳定方式；保留已经选择的主运镜、主体动作和轴线。", combinations: ["tracking", "static", "shot_closeup"], risks: ["抖动过强会遮蔽细微表演或妨碍连续性判断。"] }),
  extra({ id: "bullet_time", label: "子弹时间：时间与环绕分离", domain: "movement", mechanism: "temporal", motionId: null, options: {}, knowledgeOnly: true, tags: ["时间冻结", "虚拟摄影", "多视点"], prerequisites: ["主体冻结或极慢速的时间规则明确", "环绕视点的连续空间有依据", "生成或后期工具支持独立的时间与视点控制"], applicable: ["在动作关键瞬间观察空间和因果"], avoid: ["把一般弧移当成已经实现子弹时间", "默认所有模型都支持主体冻结而摄影机独立绕行"], inputs: ["冻结瞬间与主体姿态", "主体/环境各自时间速度", "视点路径、起止角度和运动连续性", "适用模型或后期方案"], usage: "先分别编写主体时间规则与摄影机路径；此条为学习指南，不直接替换现有主运动。用测试片验证冻结稳定性和视点连贯性。", combinations: ["arc_left", "arc_right", "focus_deep"], risks: ["人物变形、时间规则混乱与伪环绕；目前不承诺一键生成。"], sources: [...editorial, sixMovesSource] }),
  extra({ id: "transition_match", label: "动作匹配剪辑", domain: "transition", mechanism: "edit", motionId: null, options: {}, knowledgeOnly: true, tags: ["动作衔接", "剪辑点", "连续性"], prerequisites: ["前后两镜的动作阶段和道具归属明确"], applicable: ["在一次动作内切换机位而保持因果连续"], avoid: ["动作无因重复、换手或瞬间完成"], inputs: ["出镜动作阶段", "入镜动作阶段", "屏幕方向与轴线", "可剪辑的时间重叠"], usage: "分别准备前镜结束和后镜开始的动作重叠，再在剪辑中选择切点。此条只作双镜衔接指南，不注入单镜主运动。", combinations: ["static", "tracking", "shot_closeup"], risks: ["提示词描述匹配不等于素材已实现匹配；须观看两个镜头并检查切点。"] }),
  extra({ id: "performance_emotion", label: "面部表情的可读表演节点", domain: "performance", mechanism: "acting", motionId: null, options: {}, knowledgeOnly: true, tags: ["面部表情", "近景", "表演可读性"], prerequisites: ["人物情境、目标与情绪强度已明确", "足够近的取景与清晰眼部焦点", "保留反应停留时间"], applicable: ["需要读到角色得知信息后的情绪变化"], avoid: ["只写悲伤或愤怒而没有可见动作", "用快速运镜吞掉微表情", "直接替写或改变角色行为"], inputs: ["可观察表演节点，如停顿、避开目光、下颌绷紧", "焦点与景别", "动作前后停留", "情绪变化的剧情依据"], usage: "由编剧或用户确认表演节点，再检查景别、焦点和停留是否足够。此条只作学习与审计指南，不自动覆盖主体动作。", combinations: ["shot_closeup", "static", "push_in"], risks: ["模型可能夸张表情或改变人物身份，需观看成片核对。"], sources: [...editorial, { label: "标题为 10 种面部表情教程；属表演参考，非运镜教程，未验证画面", url: "https://www.youtube.com/watch?v=w0aTsyzpJko" }] }),
  extra({ id: "lens_fisheye", label: "鱼眼监控视角", domain: "optics", mechanism: "optical", motionId: null, options: { lens: "鱼眼宽视野视觉参考：边缘直线呈明显弯曲，中心主体与空间关系仍可辨识。" }, knowledgeOnly: false, tags: ["鱼眼", "监控感", "光学外观"], prerequisites: ["明确鱼眼外观是有意选择", "主体在宽视野中的位置已确定"], applicable: ["用宽视野与边缘畸变建立监控或风格化观察感"], avoid: ["将鱼眼外观当成移动路径", "要求边缘几何完全无畸变却同时选择鱼眼"], inputs: ["需要保留的主体比例", "边缘弯曲的视觉意图", "相机视角与主运动另行指定"], usage: "只修改镜头视觉外观，另选固定或移动摄影机。鱼眼提示不保证某个真实镜头型号或精确投影几何，需检查成片边缘和主体比例。", combinations: ["static", "angle_low", "focus_deep"], risks: ["主体边缘变形可能影响身份与关键物件辨识。"] }),
  extra({ id: "focus_reveal", label: "由虚到实的对焦揭示", domain: "optics", mechanism: "focus", motionId: null, options: { focus: "对焦揭示：已指定主体由虚焦变为清晰。" }, knowledgeOnly: false, tags: ["对焦", "信息揭示", "由虚到实"], prerequisites: ["明确最终清晰的具体对象", "同一对象的位置与身份在虚实变化中连续"], applicable: ["先保留形状印象，再揭示对象身份或细节"], avoid: ["把合焦写成变焦推进", "对象在虚焦时被替换或改变外观"], inputs: ["具体对焦对象", "起始虚焦状态", "变清晰的时机及停留"], usage: "将焦点字段的『已指定主体』替换为本镜具体对象。首图只表现该对象虚焦的瞬间，尾图只表现清晰状态；视频保留合焦过程。", combinations: ["static", "shot_closeup", "lens_fisheye"], risks: ["画面变清楚可能通过换物或重绘实现，需检查对象连续性和中间过程。"] }),
  extra({ id: "angle_selfie_reference", label: "自拍视角：几何待画面核验", domain: "angle", mechanism: "viewpoint", motionId: null, options: {}, knowledgeOnly: true, tags: ["自拍", "作者命名", "待核验"], prerequisites: ["先确认作者所谓『自拍死亡视角』的实际机位与持机关系", "确定是否显示手臂、设备及观察者视线"], applicable: ["作为自拍视角方案的待核验资料入口"], avoid: ["仅凭章节名称推断固定高度、角度或运动路径", "将作者名称当作标准摄影术语"], inputs: ["持机者与主体关系", "相机相对面部高度和距离", "镜头视线与主运动", "原片画面或可靠文字依据"], usage: "本条记录作者章节名称及待确认问题，不直接修改机位或角色动作。取得画面依据后，再选择已有机位与主运动字段形成具体方案。", combinations: ["pov_walk", "handheld_breath", "shot_closeup"], risks: ["未核验精确几何；不得宣称已复现原片自拍效果。"] }),
];

export const CAMERA_SOURCE_INDEX = cameraSourceIndex.sources;
function chapterSources(skillId: string): Source[] {
  return cameraSourceIndex.sources.flatMap(source => source.entries.filter(entry => entry.skillIds.includes(skillId)).map(entry => {
    const seconds = entry.timestamp.split(":").reduce((total, value) => total * 60 + Number(value), 0);
    return { label: `作者章节 ${entry.index} · ${entry.timestamp} ${entry.title}；未验证画面。${entry.notes}`, url: `${source.url}&t=${seconds}` };
  }));
}
export function builtinCameraSkills(): CameraSkill[] {
  const moves = CAMERA_MOVES.map(move => {
    const notes = movementNotes[move.id];
    if (!notes) throw new Error(`内建运镜 ${move.id} 缺少技能分类，请补充后发布`);
    const fastMoves = new Set(["whip_pan_right", "whip_pan_left", "push_in_fast", "orbit_full_fast", "snap_zoom_in", "drone_dive"]);
    const options: SkillOptions = move.id === "static" ? { stability: "稳定支撑" } : fastMoves.has(move.id) ? { speed: "快速启动后减速停稳" } : move.id === "fpv_flythrough" ? { angle: "主观视角", speed: "匀速，结尾停留" } : move.id === "pov_walk" ? { angle: "主观视角", stability: "轻微手持呼吸", speed: "匀速，结尾停留" } : move.id === "topdown_rotate" ? { angle: "顶视", speed: "缓慢，起止平顺" } : move.id === "topdown_follow" ? { angle: "高机位俯视", speed: "匀速，结尾停留" } : { speed: "缓慢，起止平顺" };
    return extra({ id: move.id, label: move.name, domain: notes.mechanism === "optical" ? "optics" : "movement", mechanism: notes.mechanism, motionId: move.id, options, knowledgeOnly: false,
      tags: move.intent.split(/[、，,]/).filter(Boolean), prerequisites: [...notes.prerequisites, `模板建议为主要运动及信息停留预留约 ${move.minDuration} 秒以上，按实际幅度调整；采用技能不会自动改变时长。`], applicable: [move.intent], avoid: notes.avoid, inputs: notes.inputs,
      usage: `摄影机：${move.path}\n分别填写起始画面、结束画面与主体动作；结合本镜时长描述启动、运动和停留。摄影参数属于生成意图，不能代替成片验证。`,
      combinations: notes.combinations, risks: [move.risk], sources: ["dolly_zoom", "crane_reveal", "fpv_flythrough", "whip_pan_right"].includes(move.id) ? [...editorial, sixMovesSource] : editorial });
  });
  return [...moves, ...additionalSkills].map(s => structuredClone({ ...s, sources: [...s.sources, ...chapterSources(s.id)] }));
}

const textList = z.array(z.string().trim().min(1).max(600)).max(16).default([]);
const idSchema = z.string().trim().min(1).max(100).regex(/^[a-z0-9][a-z0-9_:-]*$/);
const customId = z.string().regex(/^custom:[0-9a-f-]{36}$/);
const sourceSchema = z.object({ label: z.string().trim().min(1).max(300), url: z.url().max(2000).refine(v => /^https?:\/\//i.test(v), "来源链接仅支持 http/https").optional() }).strict();
export const saveCameraSkillSchema = z.object({
  id: customId.optional(), label: z.string().trim().min(1).max(100), motionId: z.string().max(80).refine(id => CAMERA_MOVES.some(m => m.id === id), "请选择已存在的主运镜"),
  domain: z.enum(["shot_size", "angle", "movement", "optics"]).optional(), mechanism: z.string().max(80).optional(),
  options: cameraSkillOptionsSchema.default({}), tags: z.array(z.string().trim().min(1).max(40)).max(16).default([]),
  prerequisites: textList, applicable: textList, avoid: textList, inputs: textList,
  usage: z.string().trim().max(6000).default(""), combinations: z.array(idSchema).max(12).default([]), risks: textList,
  sources: z.array(sourceSchema).max(8).default([]),
}).strict();
export const cameraSkillPreferenceSchema = z.object({ id: idSchema, favorite: z.boolean().optional(), hidden: z.boolean().optional(), group: z.string().trim().max(80).optional(), notes: z.string().trim().max(5000).optional() }).strict()
  .refine(v => [v.favorite, v.hidden, v.group, v.notes].some(x => x !== undefined), "至少提供一项偏好");
export const deleteCameraSkillSchema = z.object({ id: customId }).strict();
type Settings = { custom: Record<string, CameraSkill>; preferences: Record<string, Preference> };
let ready: Promise<void> | undefined;
export function ensureCameraSkills() {
  return ready ??= (async () => {
    if (!(await db.schema.hasTable("o_cameraSkillSettings"))) await db.schema.createTable("o_cameraSkillSettings", t => { t.bigInteger("userId").primary(); t.text("data").notNullable(); t.bigInteger("updatedAt").notNullable(); });
  })().catch(e => { ready = undefined; throw e; });
}
function owner(userId: number) { if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("请先登录后管理个人摄影技能库"); }
async function readSettings(connection: any, userId: number): Promise<Settings> {
  const row = await connection("o_cameraSkillSettings").where({ userId }).first();
  if (!row) return { custom: {}, preferences: {} };
  const data = JSON.parse(row.data);
  if (!data || typeof data.custom !== "object" || typeof data.preferences !== "object") throw new Error("摄影技能设置格式异常，请保留数据并检查修复");
  return data;
}
function mergedSkills(settings: Settings) { return [...builtinCameraSkills(), ...Object.values(settings.custom)].map(skill => ({ ...skill, ...emptyPreference, ...settings.preferences[skill.id] })); }
function findSkill(settings: Settings, id: string) { const skill = mergedSkills(settings).find(s => s.id === id); if (!skill) throw new Error("技能不存在或不属于当前用户"); return skill; }
async function updateSettings<T>(userId: number, fn: (settings: Settings) => T) {
  owner(userId); await ensureCameraSkills();
  return db.transaction(async trx => {
    const settings = await readSettings(trx, userId), result = fn(settings);
    await trx("o_cameraSkillSettings").insert({ userId, data: JSON.stringify(settings), updatedAt: Date.now() }).onConflict("userId").merge();
    return result;
  });
}
export async function listCameraSkills(userId: number) {
  owner(userId); await ensureCameraSkills();
  const skills = mergedSkills(await readSettings(db, userId));
  return { version: CAMERA_SKILL_VERSION, skills, groups: [...new Set(skills.map(s => s.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")), domains: CAMERA_SKILL_DOMAINS, mechanisms: CAMERA_SKILL_MECHANISMS };
}
export async function saveCameraSkill(userId: number, raw: unknown) {
  const input = saveCameraSkillSchema.parse(raw);
  return updateSettings(userId, settings => {
    if (input.id && !settings.custom[input.id]) throw new Error("自订技能不存在或不属于当前用户；内建技能请使用收藏、备注或另存自订模板");
    const id = input.id || `custom:${randomUUID()}`;
    const movementMechanism = movementNotes[input.motionId].mechanism;
    const domain = input.domain || (movementMechanism === "optical" ? "optics" : "movement");
    const defaultMechanism = domain === "movement" || movementMechanism === "optical" && domain === "optics" ? movementMechanism : domain === "shot_size" ? "framing" : domain === "angle" ? "viewpoint" : "focus";
    const mechanism = input.mechanism || defaultMechanism;
    const definition = CAMERA_SKILL_MECHANISMS.find(m => m.id === mechanism);
    if (!definition || !(definition.domains as readonly string[]).includes(domain)) throw new Error("次级技法类型不属于所选主分类");
    if (domain === "movement" && mechanism !== movementNotes[input.motionId].mechanism) throw new Error("主运镜与次级运动类型不一致");
    const combinations = [...new Set(input.combinations)];
    for (const ref of combinations) { if (ref === id) throw new Error("组合技法不能引用自身"); findSkill(settings, ref); }
    const skill: CameraSkill = { ...input, id, domain, builtin: false, mechanism: mechanism as Mechanism, motionId: input.motionId, changedFields: Object.keys(input.options), knowledgeOnly: false, combinations };
    settings.custom[id] = skill;
    return findSkill(settings, id);
  });
}
export async function setCameraSkillPreference(userId: number, raw: unknown) {
  const { id, ...input } = cameraSkillPreferenceSchema.parse(raw);
  return updateSettings(userId, settings => {
    findSkill(settings, id);
    settings.preferences[id] = { ...emptyPreference, ...settings.preferences[id], ...input };
    return findSkill(settings, id);
  });
}
export async function deleteCameraSkill(userId: number, raw: unknown) {
  const { id } = deleteCameraSkillSchema.parse(raw);
  return updateSettings(userId, settings => {
    if (!settings.custom[id]) throw new Error("只能删除当前用户创建的自订模板，内建技法不能删除");
    if (Object.values(settings.custom).some(s => s.id !== id && s.combinations.includes(id))) throw new Error("此技能仍被其他自订模板作为组合技法引用，请先移除引用");
    delete settings.custom[id]; delete settings.preferences[id];
    return { id, deleted: true };
  });
}
