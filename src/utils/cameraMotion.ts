import { shotDurationSchema } from "./shotActionRules";
import { z } from "zod";

export const CAMERA_VERSION = "toonflow-camera/1.1";
export interface CameraMove {
  id: string; name: string; category: string; description: string; intent: string;
  path: string; risk: string; minDuration: number; virtual?: boolean;
}
// Editorial presets: optical intent, not a claim that a generator obeys physical measurements.
export const CAMERA_MOVES: CameraMove[] = [
  { id: "static", name: "固定观察", category: "固定", description: "机位、朝向与焦距保持，主体动作推动画面。", intent: "留白、对峙、细微反应", path: "摄影机固定位置与朝向，焦距保持；画面变化来自主体和环境。", risk: "表演需要足够的可读停留。", minDuration: 2 },
  { id: "push_in", name: "缓推靠近", category: "位移", description: "摄影机向主体前移，前后景出现透视与遮挡变化。", intent: "走近心理、发现关键细节", path: "摄影机沿视线向主体前移，由起始构图靠近到结束构图；保持焦距，保留前后景视差。", risk: "过近可能裁断动作或改变面部比例。", minDuration: 4 },
  { id: "pull_out", name: "后拉揭示", category: "位移", description: "摄影机后退，逐步让环境进入画框。", intent: "揭示处境、距离与孤独", path: "摄影机沿视线后退，由起始主体扩展到结束环境；保持焦距，逐步显露周围空间。", risk: "新增环境必须有可理解的空间关系。", minDuration: 4 },
  { id: "truck_left", name: "向左横移", category: "位移", description: "摄影机向左侧向平移，前景与背景相对滑动。", intent: "越过遮挡、呈现层次", path: "摄影机向画面左侧平移，镜头朝向大致保持；前景、主体、远景形成不同速度的视差。", risk: "横移不是固定机位向左摇摄。", minDuration: 4 },
  { id: "truck_right", name: "向右横移", category: "位移", description: "摄影机向右侧向平移，前景与背景相对滑动。", intent: "揭示关系、伴随行动", path: "摄影机向画面右侧平移，镜头朝向大致保持；从前景遮挡旁移出，抵达结束构图。", risk: "需交代被揭示对象，避免凭空增加人物。", minDuration: 4 },
  { id: "pan_left", name: "向左摇摄", category: "旋转", description: "摄影机位置不变，镜头水平向左转动。", intent: "跟随视线、转移注意", path: "摄影机机位固定，仅水平向左转动朝向，从起始视觉目标摇到结束视觉目标。", risk: "不要同时描述机位侧移或焦距变化。", minDuration: 3 },
  { id: "pan_right", name: "向右摇摄", category: "旋转", description: "摄影机位置不变，镜头水平向右转动。", intent: "沿目光揭示邻近对象", path: "摄影机机位固定，仅水平向右转动朝向，从起始视觉目标摇到结束视觉目标。", risk: "速度过快时难以读到被揭示的信息。", minDuration: 3 },
  { id: "tilt_up", name: "上仰揭示", category: "旋转", description: "机位高度不变，镜头由低向高俯仰。", intent: "从道具到人物、揭示高度", path: "摄影机位置和高度固定，镜头由起始低处目标向上仰至结束高处目标。", risk: "上仰不等于摄影机升高。", minDuration: 3 },
  { id: "tilt_down", name: "下俯揭示", category: "旋转", description: "机位高度不变，镜头由高向低俯仰。", intent: "从面容落到手部或线索", path: "摄影机位置和高度固定，镜头从起始高处目标向下俯至结束低处目标。", risk: "应让观众明确线索属于谁。", minDuration: 3 },
  { id: "tracking", name: "同速跟拍", category: "位移", description: "摄影机沿主体路线前进，保持相对距离。", intent: "追随行动、沉浸体验", path: "摄影机沿主体行进路线同速跟随，主体在画面中的大小大致稳定，背景连续通过。", risk: "必须区分主体走向与摄影机运动。", minDuration: 4 },
  { id: "arc_left", name: "左侧弧移", category: "环绕", description: "围绕主体向左走有限弧线，持续看向主体。", intent: "关系变化、侧面揭示", path: "摄影机以主体为中心向左走小幅弧线并保持对准主体，由正侧关系过渡到结束角度。", risk: "留意轴线；默认小弧度而非完整一周。", minDuration: 5 },
  { id: "arc_right", name: "右侧弧移", category: "环绕", description: "围绕主体向右走有限弧线，持续看向主体。", intent: "情绪转折、空间重排", path: "摄影机以主体为中心向右走小幅弧线并保持对准主体，保留可辨认背景作为空间锚点。", risk: "人物相对位置与视线可能因越轴变得含混。", minDuration: 5 },
  { id: "pedestal_up", name: "垂直升起", category: "升降", description: "摄影机整体升高，朝向大致保持。", intent: "越过遮挡、扩展视野", path: "摄影机整体垂直上升，镜头朝向大致保持，从起始高度升至结束高度，产生空间视差。", risk: "须与原地上仰区分。", minDuration: 4 },
  { id: "pedestal_down", name: "垂直下降", category: "升降", description: "摄影机整体降低，朝向大致保持。", intent: "靠近地面、落到具体行动", path: "摄影机整体垂直下降，镜头朝向大致保持，从起始高度降至结束高度，产生空间视差。", risk: "须明确落点与主体的关系。", minDuration: 4 },
  { id: "crane_reveal", name: "升高后拉", category: "组合", description: "沿连续斜向路径升高并后退。", intent: "从个体延伸到环境全貌", path: "摄影机沿一条连续斜向路径升高并后退，先让主体完整，再在结束构图中揭示其所在环境。", risk: "组合运动需要时间和稳定空间锚点。", minDuration: 7 },
  { id: "zoom_in", name: "定机位变焦", category: "光学", description: "机位固定，焦距变长，视角收窄。", intent: "观察感、光学强调", path: "摄影机位置固定，仅镜头焦距由短变长，视角逐步收窄至结束构图；不描述推轨式视差。", risk: "变焦与推轨产生不同空间关系。", minDuration: 3 },
  { id: "dolly_zoom", name: "滑动变焦", category: "组合", description: "机位后移同时变长焦，主体大小大致稳定。", intent: "空间失衡、认知突变", path: "摄影机后退，同时逐步增加焦距补偿主体大小；主体大小大致保持，背景空间关系明显改变。", risk: "高难度意图，需要看片确认；不能承诺精确光学。", minDuration: 6 },
  { id: "virtual_pass", name: "虚拟穿越", category: "虚拟", description: "以起止视觉锚点连接一次有目的的穿物运动。", intent: "梦境、记忆与超现实揭示", path: "virtual：摄影机沿可理解的连续路径穿越已说明的遮挡物，起始和结束的视觉锚点连接同一叙事信息。", risk: "需注明新视觉逻辑与空间转换理由。", minDuration: 6, virtual: true },
  { id: "fpv_flythrough", name: "FPV 第一人称穿行", category: "穿行", description: "第一人称沿空间通道连续前进，以可见路线连接起止画面。", intent: "沉浸探索、空间揭示、行动临场感", path: "第一人称飞行视角沿已说明的通道前进，连续经过可辨认的空间地标，从起始位置抵达结束位置；穿过门洞等真实开口，保持通道方向与相邻空间关系连贯。", risk: "明确路径、净空、转弯与速度；不是无条件穿透实体。", minDuration: 6 },
  { id: "whip_pan_right", name: "向右快速甩摇", category: "旋转", description: "原地迅速向右旋转朝向，两端先后停稳，中段可有运动模糊。", intent: "快速转移注意、动作接力、甩镜转场素材", path: "机位保持原地，先短暂看清起始主体，再迅速向右甩摇，中段出现方向一致的运动模糊，最后减速停在明确的结束主体；一镜内完成，不自动切换场景。", risk: "需为两端留可读时间；跨场转场仍需剪辑匹配。", minDuration: 3 },
  // Names are mapped from verified author chapters (VhTxVGw0Cms), not viewed footage.
  // These concrete geometries, directions and timings are local editorial presets.
  { id: "push_in_fast", name: "快速推近", category: "位移", description: "摄影机快速接近主体，抵达重点前减速停稳。", intent: "突发发现、紧迫感、重点冲击", path: "摄影机保持焦距，沿可通行的前向路线快速接近已指定主体，背景透视与遮挡随位移改变；靠近结束构图时减速停稳，保留重点可读时间。", risk: "快速接近容易穿过主体或裁掉动作；不能用数字放大代替位移。", minDuration: 3 },
  { id: "macro_dive", name: "虚拟微观深入", category: "虚拟", description: "由可辨认物体进入其已设计的微观尺度空间。", intent: "细节探索、尺度反差、隐藏信息揭示", path: "virtual：从已说明物体的可见细节沿连续视线深入，经过用户指定的尺度层级，落到与原物体有视觉联系的微观空间；各层保留同一纹理或形状锚点，不把跨尺度深入当作普通镜头变焦。", risk: "微观结构必须由用户定义；不能声称真实微距或科学结构准确。", minDuration: 7, virtual: true },
  { id: "cosmic_dive", name: "宇宙至街道虚拟俯冲", category: "虚拟", description: "跨越宇宙、地域与街道层级，落到明确叙事位置。", intent: "宏观到个体、世界建立、尺度对照", path: "virtual：由已设计的宇宙尺度起幅向街道落点连续深入，按用户指定的世界、地域和街区层级连接视觉锚点；在明确街道与主体前减速停稳，保持各层指向同一叙事地点。", risk: "必须提供尺度层级与地点对应；不是光学变焦，也不自动保证真实地理关系。", minDuration: 9, virtual: true },
  { id: "orbit_half", name: "半周环绕", category: "环绕", description: "以主体为中心走约半周，落在其另一侧。", intent: "改变观察关系、揭示背面空间", path: "摄影机以主体为中心沿用户指定方向连续走约半周弧线，保持主体距离大致稳定并持续对准主体；途中展示可辨认的背景地标，最后在另一侧结束构图停稳。", risk: "半周会改变左右与前后关系，须说明连续可见跨轴或重建空间的方法。", minDuration: 7 },
  { id: "orbit_full_fast", name: "快速整周环绕", category: "环绕", description: "围绕主体快速完成一整周，并回到可辨识的起始方位附近。", intent: "空间展示、强调关键瞬间、环绕冲击", path: "摄影机沿用户指定方向快速围绕主体走完整一周，镜头持续朝向主体而非原地自转；背景依次连续通过，经过全部方位后回到起始方位附近减速停稳。", risk: "完整一周容易发生身份漂移和背景跳变；主体时间不会自动冻结。", minDuration: 8 },
  { id: "crane_up_overhead", name: "摇臂升高至俯视", category: "组合", description: "升高机位并逐步下俯，结束时由高处观察主体。", intent: "展开人物布局、建立行动空间", path: "摄影机从起始高度沿清楚的升高路径移动，同时逐步下俯朝向以保留主体；最后在用户指定的高机位俯视构图停稳，不默认向后拉远或转成垂直顶视。", risk: "机位升高与朝向下俯需协调，避免将上仰误作升高。", minDuration: 6 },
  { id: "crane_down_eye", name: "摇臂下降至眼平", category: "组合", description: "由高处下降，并调整朝向落到人物眼平关系。", intent: "由环境进入人物、拉近观察关系", path: "摄影机从已定义的高处沿连续路径下降，同时逐步调整俯仰让主体保持可见；结束时机位抵达主体眼部高度并平视主体，焦距保持。", risk: "需明确人物站位、下降净空及眼平落点；不要穿过屋顶或人体。", minDuration: 6 },
  { id: "zoom_out", name: "定机位变焦拉远", category: "光学", description: "机位固定，焦距变短，取景范围逐步展开。", intent: "从局部揭示环境、扩大观察范围", path: "摄影机位置与朝向保持，仅镜头焦距由长变短，让视角由窄变宽并逐步呈现已定义的结束环境；不加入后退机位产生的视差。", risk: "扩展环境需有依据；变焦拉远不等于后拉推轨。", minDuration: 3 },
  { id: "snap_zoom_in", name: "快速向内冲击变焦", category: "光学", description: "将瞬时冲击变焦编排为向内变焦，快速收窄视角。", intent: "突然强调、发现细节、视觉节拍", path: "摄影机位置与朝向保持，先看清起始画面，再快速增加焦距使视角收窄到已指定重点，随后保持该焦距停留；向内方向为本预设编排，不产生推轨视差。", risk: "原章节名称未指定方向；高速变焦可能错失主体或压缩可读时间。", minDuration: 3 },
  { id: "drone_flyover", name: "高空掠过", category: "位移", description: "在明确高度关系上方连续越过场景地标。", intent: "地理建立、展现场景走向", path: "摄影机在用户指定的高空高度关系上沿主路线前进，连续经过已知地标上方，保持地面朝向与路径连贯，抵达终点后留出辨认环境的时间。", risk: "需说明路线和净空；不要把随机新建筑当作空间展开。", minDuration: 6 },
  { id: "drone_reveal_rise", name: "航拍升高揭示", category: "升降", description: "向上越过已知遮挡，逐步揭示其后的环境。", intent: "地形揭示、建立远近关系", path: "摄影机沿用户指定的上升路线从已知遮挡后升起，以可辨认的前景作为高度参照，随着高度增加呈现遮挡后的目标与远景，最后在明确高度关系上停稳。", risk: "航拍是使用情境，运动机制仍是升高；揭示对象必须事先存在。", minDuration: 6 },
  { id: "drone_orbit", name: "宽半径航拍环绕", category: "环绕", description: "以大范围主体为中心，在较宽半径上走指定弧线。", intent: "呈现建筑全貌、交代地形层次", path: "摄影机以用户指定的建筑或场景中心为锚点，在明确高度关系和宽半径上沿指定方向弧移，持续朝向中心；按照指定结束角度停止，不默认绕满一周。", risk: "需明确中心、角度和背景锚点；宽半径不等于无条件完整环绕。", minDuration: 8 },
  { id: "topdown_rotate", name: "顶视缓慢旋转", category: "旋转", description: "在正上方保持位置，沿朝下的光轴缓慢滚转画面。", intent: "几何构图、空间秩序、主观失衡", path: "摄影机位于目标正上方并垂直向下，机位、俯视轴与焦距保持；仅沿光轴按用户指定方向缓慢滚转，使地面构图在画面内旋转，到明确角度后停止，不沿圆周绕行。", risk: "光轴滚转不是环绕；需指定地面方向参照与结束旋转角度。", minDuration: 5 },
  { id: "drone_dive", name: "高速航拍俯冲", category: "位移", description: "沿已定义的下降通道快速接近低处落点，再减速停稳。", intent: "速度体验、由高到低的行动接力", path: "摄影机沿用户指定的连续下降通道从高处快速俯冲，以可见地标维持方向，在接近低处目标前逐步减速并保持净空；仅穿过真实开口，最后落在明确且可读的构图。", risk: "必须交代通道、障碍和减速空间；穿透实体需另选虚拟摄影。", minDuration: 6 },
  { id: "whip_pan_left", name: "向左快速甩摇", category: "旋转", description: "原地迅速向左旋转朝向，起止画面先后停稳。", intent: "快速注意转移、动作衔接、甩镜转场素材", path: "机位保持原地，先短暂看清起始主体，再迅速向左甩摇，中段出现方向一致的运动模糊，最后减速停在明确的结束主体；一镜内完成，不自动切换场景。", risk: "两端均需可读；跨镜或跨场的衔接仍要另做剪辑。", minDuration: 3 },
  { id: "tracking_front", name: "前方倒退领拍", category: "位移", description: "摄影机在前方朝向行进主体，随主体前进而倒退。", intent: "面对行动者、读清行进中的表演", path: "主体沿已定义路线前进，摄影机保持在主体前方并朝向主体，沿同一路线倒退领拍，速度与主体配合以维持大致距离和主体大小，结束时共同减速。", risk: "摄影机后退不表示主体倒走；必须交代行进路线与可用空间。", minDuration: 5 },
  { id: "tracking_back", name: "后方尾随跟拍", category: "位移", description: "摄影机在主体后方沿其路线前进，保留背面关系。", intent: "跟随探索、保留前方未知信息", path: "主体沿已定义路线向前行进，摄影机位于其后方并朝向其背面，沿同一路线同速前进，保持大致距离，让前方环境随行动依次展开。", risk: "不要无依据绕到正面或让主体突然倒走；保持前方空间连续。", minDuration: 5 },
  { id: "tracking_side", name: "平行侧向跟拍", category: "位移", description: "摄影机在移动主体一侧沿平行路线行进。", intent: "呈现步态、保持行动方向、观察人与环境", path: "主体沿已定义路线行进，摄影机保持在用户指定的同一侧，沿平行路线与主体同速移动并朝向主体，维持侧面关系与大致距离，背景连续经过。", risk: "跟拍侧别与主体屏幕方向需单独说明；不要无因穿过主体换边。", minDuration: 5 },
  { id: "pov_walk", name: "第一人称步行", category: "穿行", description: "从行走者眼部视点沿可通行路线前进。", intent: "主观探索、临场行走、接近目标", path: "摄影机作为行走者的眼部视点沿地面路线前进，保留轻微步行起伏与连续视线，依次经过用户指定的地标和真实开口，最后在可站立的位置停留。", risk: "步行视点不是悬空飞行；不得自动增添与故事无关的身体或持物。", minDuration: 5 },
  { id: "topdown_follow", name: "高空俯视跟随", category: "位移", description: "摄影机从主体上方的高处沿其路线同速跟随。", intent: "观察行动路线、追踪地形关系", path: "主体沿已定义路线移动，摄影机位于其上方高机位并持续俯视，沿与主体对应的路线同速跟随，保持大致高度和相对位置，让地面标记连续通过。", risk: "高处可能看不清细微表情；须明确跟随目标、路线和地面方向参照。", minDuration: 6 },
];
const FOCAL_LENGTH_MOVES = new Set(["zoom_in", "zoom_out", "snap_zoom_in", "dolly_zoom"]);
const WHIP_MOVES = new Set(["whip_pan_left", "whip_pan_right"]);
const RAPID_MOVES = new Set(["push_in_fast", "orbit_full_fast", "snap_zoom_in", "drone_dive", ...WHIP_MOVES]);
const WIDE_ORBIT_MOVES = new Set(["orbit_half", "orbit_full_fast"]);
const ROUTE_MOVES = new Set(["drone_flyover", "drone_reveal_rise", "drone_dive", "pov_walk", "tracking_front", "tracking_back", "tracking_side", "topdown_follow"]);
export const CAMERA_CHOICES = {
  shotSize: ["大远景", "远景", "全景", "中景", "中近景", "近景", "特写", "大特写"],
  angle: ["平视", "低机位仰视", "高机位俯视", "顶视", "过肩", "主观视角", "倾斜构图"],
  lens: ["24mm 广角视觉参考", "35mm 环境叙事参考", "50mm 自然视角参考", "85mm 近景视觉参考", "135mm 远机位长焦参考"],
  speed: ["缓慢，起止平顺", "匀速，结尾停留", "先停留再平稳移动", "快速启动后减速停稳"],
  stability: ["稳定支撑", "轻微手持呼吸", "明显手持晃动"],
  axisSide: ["未标注", "A侧", "B侧", "中性机位"],
  screenDirection: ["无明显位移", "画面左向右", "画面右向左", "朝向镜头", "远离镜头"],
  mode: ["text", "singleImage", "startEndRequired", "reference"],
};
const short = z.string().trim().max(2000).default("");
export const cameraOptionsSchema = z.object({
  narrative: z.string().trim().max(20000).default(""), openingFrame: z.string().trim().max(20000).default(""),
  endingFrame: z.string().trim().max(12000).default(""), subjectAction: z.string().trim().max(12000).default(""),
  purpose: short, shotSize: z.string().trim().max(200).default("中景"), angle: z.string().trim().max(200).default("平视"),
  lens: short, focus: short, lighting: short, duration: z.number().finite().positive().default(10),
  speed: z.string().trim().max(1000).default("缓慢，起止平顺"), amplitude: short,
  axisSide: z.string().trim().max(200).default("未标注"), screenDirection: short, eyeline: short,
  continuity: short, axisReason: short, stability: z.string().trim().max(500).default("稳定支撑"),
  mode: z.enum(["text", "singleImage", "startEndRequired", "reference"]).default("text"),
});
export type CameraOptions = z.infer<typeof cameraOptionsSchema>;
export const CAMERA_TEMPLATES: {id: string; name: string; description: string; motionIds: string[]; options: Partial<CameraOptions>}[] = [
  { id: "compare", name: "同镜三种表达", description: "相同情节，比较固定观察、缓推靠近、横移揭示。", motionIds: ["static", "push_in", "truck_right"], options: { purpose: "保持情节与角色行为，比较观察距离和信息揭示方式。" } },
  { id: "reaction", name: "人物反应", description: "让眼神和动作有停留，比较观察与靠近。", motionIds: ["static", "push_in", "arc_right"], options: { shotSize: "中近景", speed: "先停留再平稳移动", purpose: "让观众读到人物得知信息后的细微反应。", focus: "主要人物的眼睛清晰；焦点随距离平稳调整。" } },
  { id: "reveal", name: "悬念揭示", description: "以明确的开始与结束画面控制新信息出现。", motionIds: ["pan_right", "truck_right", "pull_out"], options: { purpose: "由已知对象引出结束画面中的新信息，保留揭示顺序。", duration: 10 } },
  { id: "journey", name: "行动跟随", description: "以走向和环境连续性维持行动方向。", motionIds: ["tracking", "truck_left", "static"], options: { shotSize: "全景", purpose: "读清主体的行动路线与障碍关系。", screenDirection: "画面左向右", duration: 10 } },
  { id: "space", name: "空间建立", description: "从人到环境，或借助升降建立空间层次。", motionIds: ["pull_out", "pedestal_up", "crane_reveal"], options: { shotSize: "全景", purpose: "交代主体、环境与关键物件的空间关系。", duration: 8 } },
  { id: "clue", name: "细节与线索", description: "用固定特写或俯仰关联人物与道具。", motionIds: ["static", "tilt_down", "push_in"], options: { shotSize: "近景", purpose: "使关键物件及其持有者的因果关系清晰。" } },
  { id: "surreal", name: "心理与虚拟摄影", description: "允许非现实运动，明确视觉锚点与新逻辑。", motionIds: ["dolly_zoom", "arc_left", "virtual_pass"], options: { purpose: "用空间关系变化表现认知转折，保持可读起止锚点。", duration: 8 } },
];
export interface CameraIssue { code: string; severity: "error" | "warning" | "info"; message: string; suggestion: string }
export interface CameraAudit {
  score: number; status: "ready" | "needs_review" | "blocked"; renderedStatus: "unverified";
  issues: CameraIssue[]; checks: {name: string; passed: boolean}[];
}
export interface CameraVariant {
  id: string; name: string; description: string; motionId: string; composition: string; cameraInstruction: string;
  storyboardPrompt: string; imagePrompt: string; endImagePrompt: string; videoPrompt: string; audit: CameraAudit;
}

export function defaultCameraOptions(board: {videoDesc?: string | null; prompt?: string | null; duration?: string | number | null}, project?: {mode?: string | null; artStyle?: string | null}): CameraOptions {
  let mode = project?.mode || "text";
  try { const parsed = JSON.parse(mode); mode = typeof parsed === "string" ? parsed : "reference"; } catch {}
  if (!["text", "singleImage", "startEndRequired", "reference"].includes(mode)) mode = mode.startsWith("[") ? "reference" : mode === "endFrameOptional" ? "startEndRequired" : "singleImage";
  const duration = Number(board.duration);
  const narrative = board.videoDesc || "";
  const size = narrative.match(/(?:^|[。；\n])\s*景别[：:]\s*(大远景|大特写|中近景|远景|全景|中景|近景|特写)(?=[。；\n]|$)/u)?.[1];
  const openingFrame = /^(?:null|undefined)$/i.test((board.prompt || "").trim()) ? "" : board.prompt || "";
  const sections = Object.fromEntries([...narrative.matchAll(/【([^】]+)】([\s\S]*?)(?=【|$)/g)].map(match => [match[1], match[2].trim()]));
  return cameraOptionsSchema.parse({ narrative, openingFrame: sections["起始画面"] || openingFrame,
    purpose: sections["本镜主题"] || "", subjectAction: sections["主体动作"] || "",
    endingFrame: sections["结束画面"] || "", continuity: sections["连续性"] || "", shotSize: size || "中景", duration: Number.isFinite(duration) && duration > 0 ? duration : 10, mode });
}

const cameraCue = /运镜|镜头(?:缓慢|快速)?(?:推|拉|摇|移|环绕)|摄影机|摄像机|camera\s+(?:moves|pans|tilts|dollies|orbits|tracks|rolls)|\bdolly\s+(?:in|out|zoom|shot|toward|back)|pan(?:ning)?\s+(?:left|right)|zoom\s+(?:in|out)/iu;
const dynamicImageCue = /运镜|镜头(?:缓慢|快速)?(?:推|拉|摇|移|环绕)|摄影机(?:前移|后退|移动|旋转|俯冲|环绕)|摄像机(?:前移|后退|移动)|(?:然后|随后|接着|慢慢)|逐渐(?:移动|走|抬|转|推|拉)|\d+(?:\.\d+)?\s*(?:秒|seconds?)|camera\s+(?:moves|pans|tilts|dollies|orbits|tracks|rolls)|\bdolly\s+(?:in|out|zoom|shot|toward|back)|zoom\s+(?:in|out)/iu;
export function auditCameraPlan(raw: CameraOptions, motionId: string, previous?: CameraOptions): CameraAudit {
  const o = cameraOptionsSchema.parse(raw), move = CAMERA_MOVES.find(m => m.id === motionId);
  if (!move) throw new Error("未知运镜方案");
  const issues: CameraIssue[] = [];
  const add = (code: string, severity: CameraIssue["severity"], message: string, suggestion: string) => issues.push({code, severity, message, suggestion});
  if (!o.narrative) add("narrative_missing", "error", "缺少本镜的情节信息。", "填写本镜必须保留的事件、台词或叙事信息。");
  if (!o.openingFrame) add("opening_missing", "error", "首帧缺少可见的静态画面。", "写明主体、姿态、环境与构图；图片提示词只描述这一瞬间。");
  if (!shotDurationSchema.safeParse(o.duration).success) add("action_duration", "error", "每镜须为 8 至 15 个整数秒。", "请将同一任务的短动作合并，并为完整动作留足时间。");
  if (!o.purpose) add("purpose_missing", "error", "请写明本镜人物要完成的任务与可见结果。", "主题需要对应人物行动，不能只有运镜名称。");
  if (!o.endingFrame) add("action_ending_missing", "error", "请补充人物动作完成后的明确结束姿态。", "写清手脚支撑、目光目标与最后两秒持续状态。");
  if (!o.subjectAction) add("action_missing", "error", "尚未单独说明主体动作。", "写出可观察动作；若不移动，可填写保持站位、只抬眼或呼吸。");
  if (!o.endingFrame && motionId !== "static") add("ending_missing", "warning", "运动缺少明确的结束构图。", "补充停止时可见的主体大小、位置和被揭示对象。");
  if (o.mode === "startEndRequired" && !o.endingFrame) add("end_reference_missing", "error", "首尾帧模式缺少尾帧描述。", "补充尾帧并在生成页面选择实际首帧与尾帧图片。");
  if (o.duration < move.minDuration) add("duration_short", "warning", `${o.duration} 秒低于此模板建议的 ${move.minDuration} 秒。`, "减小运动幅度或增加停留时间；建议值不是模型硬限制。");
  if (!o.focus) add("focus_missing", "warning", "焦点目标未说明。", "指定面部、手部或道具；焦点转移需写明从谁到谁。");
  if (!o.continuity) add("continuity_missing", "warning", "尚未记录角色、道具或空间的一致性锚点。", "补充服装、持物手、人物相对位置或光源方向。");
  if (cameraCue.test(o.narrative)) add("source_camera_cue", "warning", "情节描述仍含运镜指令，可能与候选方案竞争。", "将摄影指令移到镜头设置，保留事件、动作和台词。");
  if (dynamicImageCue.test(o.openingFrame) || dynamicImageCue.test(o.endingFrame)) add("image_has_timeline", "warning", "首帧或尾帧描述含时间过程或运镜词。", "改写为静态可见状态；运动过程保留在视频提示词。");
  if (move.virtual && (!o.axisReason || !o.openingFrame || !o.endingFrame)) add("virtual_anchors", "warning", "虚拟路径与尺度转换需要视觉锚点和转换理由。", "补充经过的对象或尺度层级、两端画面和新的视觉逻辑；允许有意打破物理连续性。");
  if (move.category === "环绕" && o.axisSide === "未标注" && !o.axisReason) add("axis_unspecified", "warning", "弧移尚未记录轴线依据。", "标记 A/B 侧或中性机位；若跨轴，说明连续可见跨越或重新建立空间的方法。");
  if (WIDE_ORBIT_MOVES.has(motionId) && !o.axisReason) add("wide_orbit_axis", "warning", "半周或整周环绕会经过多个轴线侧，单个侧别不能说明整个过程。", "在空间转换依据中写明连续可见的跨越、背景地标与落幅方向；允许有意越轴。");
  if ((move.category === "环绕" || motionId === "topdown_rotate") && !o.amplitude) add("rotation_extent_missing", "warning", "旋转或环绕尚未明确方向与停止范围。", "填写左/右或顺/逆时针、有限弧度或整周，以及结束朝向；区分机位绕行和原地沿光轴滚转。");
  if (motionId === "static" && o.stability === "明显手持晃动") add("static_handheld", "warning", "固定观察与明显手持晃动存在冲突。", "改用稳定支撑，或明确只保持站位而允许手持朝向变化。");
  if (motionId === "fpv_flythrough" && !o.amplitude) add("fpv_route_missing", "warning", "第一人称穿行尚未说明通道与路线。", "在运动幅度中补充经过的门洞、地标、转弯、净空与结束位置；穿透实体请改用虚拟穿越。");
  if (ROUTE_MOVES.has(motionId) && !o.amplitude) add("movement_route_missing", "warning", "当前路径缺少经过位置、相对关系或停止位置。", "在幅度与停止位置中补充主体路线、摄影机相对位置、地标及净空；镜头方向与主体方向分别说明。");
  if (motionId === "topdown_rotate" && o.angle !== "顶视") add("topdown_view_conflict", "warning", "顶视滚转需要朝正下方的起始机位，当前角度设置不同。", "将机位设为顶视并补充地面方向参照；若要升到顶视，可另用升高至俯视方案。");
  if (WHIP_MOVES.has(motionId) && /缓慢|慢速|slow/iu.test(o.speed)) add("whip_speed_conflict", "warning", "快速甩摇与当前慢速节奏不一致。", "选择快速启动后减速停稳，并为起止主体留出可读停留。");
  if (RAPID_MOVES.has(motionId) && !WHIP_MOVES.has(motionId) && /缓慢|慢速|slow/iu.test(o.speed)) add("rapid_speed_conflict", "warning", "所选快速运动与当前慢速节奏不一致。", "改选快速启动后减速停稳，或使用相应的普通速度运镜；补充启动和停止阶段。");
  if ((RAPID_MOVES.has(motionId) || /快速|高速|极速|rapid|fast/iu.test(o.speed)) && /眼神|细微|微妙/.test(o.purpose + o.subjectAction)) add("readability", "warning", "快速摄影可能缩短细微表演的可读时间。", "先停留读清反应，再移动或减小幅度。");
  if (/特写/.test(o.shotSize) && /24mm/.test(o.lens)) add("wide_closeup", "warning", "广角特写可能需要很近的机位并改变面部比例。", "明确这是有意的透视，或后退机位并重新选取景范围。");
  if (previous) {
    if (previous.axisSide !== "未标注" && o.axisSide !== "未标注" && previous.axisSide !== "中性机位" && o.axisSide !== "中性机位" && previous.axisSide !== o.axisSide && !o.axisReason) add("axis_crossing", "warning", "相邻镜头的轴线侧改变，未记录过渡依据。", "增加中性镜头、连续可见跨越或重新建立空间，或说明有意越轴的目的。");
    if (previous.screenDirection && o.screenDirection && previous.screenDirection !== o.screenDirection && /左向右|右向左/.test(previous.screenDirection) && /左向右|右向左/.test(o.screenDirection) && !o.axisReason) add("direction_reversal", "warning", "相邻镜头屏幕方向反转。", "核对主体是否掉头，或交代换轴与空间转换。");
    if (previous.continuity && o.continuity && previous.continuity !== o.continuity) add("continuity_changed", "info", "相邻镜头的一致性记录不同，需人工核对。", "比较持物手、服装、人物位置和光源是否有事件依据。");
  }
  const penalties = issues.reduce((sum, i) => sum + (i.severity === "error" ? 25 : i.severity === "warning" ? 7 : 0), 0);
  return { score: Math.max(0, 100 - penalties), status: issues.some(i => i.severity === "error") ? "blocked" : issues.some(i => i.severity === "warning") ? "needs_review" : "ready", renderedStatus: "unverified", issues,
    checks: [{name: "情节与首帧完整", passed: !!(o.narrative && o.openingFrame)}, {name: "摄影机与主体动作分开", passed: !!o.subjectAction && !cameraCue.test(o.narrative)}, {name: "静态图不含时间过程", passed: !dynamicImageCue.test(o.openingFrame + o.endingFrame)}, {name: "运动终点可读", passed: motionId === "static" || !!o.endingFrame}, {name: "连续性已记录", passed: !!o.continuity}, {name: "成片运动已观看验证", passed: false}] };
}

export function compileCameraVariant(raw: CameraOptions, motionId: string): CameraVariant {
  const o = cameraOptionsSchema.parse(raw), move = CAMERA_MOVES.find(m => m.id === motionId);
  if (!move) throw new Error("未知运镜方案");
  const optical = [`${o.shotSize || "按首帧构图"}，${o.angle || "按首帧机位"}`, o.lens ? `焦距仅作全画幅等效视觉参考：${o.lens}` : "", o.lighting ? `光线：${o.lighting}` : ""].filter(Boolean).join("；");
  // Keep the two focal states, while leaving transition timing in the video.
  const focusReveal = o.focus.match(/^对焦揭示[：:]\s*(.+?)(?:由|从)(?:虚焦|失焦|模糊)(?:逐渐|平稳)?(?:变为|转为|到|至)清晰(?:[。；]|$)/u);
  const rack = o.focus.match(/(?:从|由)(.+?)(?:转移到|转焦(?:到|至)|移焦(?:到|至)|切换(?:到|至)|移(?:到|至)|到|至)([^，。；,;.]+)/u)
    || o.focus.match(/from\s+(.+?)\s+to\s+([^,.;]+)/iu);
  const stillFocus = (end: boolean) => focusReveal ? `${focusReveal[1].trim()}${end ? "清晰，焦点落在该主体。" : "处于虚焦状态，仅保留可辨认的轮廓与色块。"}`
    : rack ? `${rack[end ? 2 : 1].trim()}清晰，景深与此帧构图一致。`
    : o.focus.split(/[，。；,;.]/u).filter(part => !/随距离|随主体|调整|转移|移焦|转焦|切换|rack|follow|track/iu.test(part)).join("；");
  const staticFocus = stillFocus(false);
  const composition = `${o.openingFrame}\n${optical}${staticFocus ? `；焦点：${staticFocus}` : ""}`;
  const still = (frame: string, end = false) => {
    // The ending description owns its framing. A push may end in a close-up even
    // when the opening setting is wide. Optical intent remains explicitly a reference.
    const endOptical = ["景别与角度以结束画面的静态描述为准。", o.lens ? `焦距视觉参考：${o.lens}${FOCAL_LENGTH_MOVES.has(motionId) ? "（起始参考；尾帧采用变焦后的视角）" : ""}` : "", o.lighting ? `光线：${o.lighting}` : ""].filter(Boolean).join("；");
    const focus = stillFocus(end);
    return ["单张分镜画面，单一瞬间。", frame || "请先补充静态画面描述。", end ? endOptical : optical, focus ? `焦点与景深：${focus}` : "", o.continuity ? `外观与空间锚点：${o.continuity}` : "", "保持角色身份、服饰与物件归属清晰；画面不叠加文字或运镜箭头。"].filter(Boolean).join("\n");
  };
  const cameraInstruction = [move.path, motionId === "static" ? `稳定方式：${o.stability}；摄影机持续保持。` : `节奏：${o.speed}；稳定方式：${o.stability}。`, motionId !== "static" && o.amplitude ? `幅度与停止位置：${o.amplitude}` : "", motionId === "static" ? `总时长 ${o.duration} 秒，保留主体动作及反应的可读停留。` : `总时长 ${o.duration} 秒，先建立起始画面，完成主要运动后让结束信息清晰停留。`, o.axisSide !== "未标注" ? `轴线：${o.axisSide}。` : "", o.axisReason ? `空间转换依据：${o.axisReason}` : ""].filter(Boolean).join("\n");
  const videoPrompt = [
    `【本镜情节】${o.narrative.replace(/(^|[。；\n])(?:运镜|镜头运动)[：:][^。；\n]*(?:[。；]|$)/gu, "$1")}`,
    `【叙事目的】${o.purpose || move.intent}`,
    `【起始画面】${o.openingFrame}`,
    `【镜头与运镜】${optical}\n${cameraInstruction}`,
    `【主体动作】${o.subjectAction || o.narrative.replace(/(^|[。；\n])(?:运镜|镜头运动)[：:][^。；\n]*(?:[。；]|$)/gu, "$1")}${o.screenDirection ? `\n主体屏幕方向：${o.screenDirection}。` : ""}${o.eyeline ? `\n视线目标：${o.eyeline}。` : ""}`,
    o.focus ? `【焦点】${o.focus}` : "",
    `【结束画面】${o.endingFrame || "请补充动作完成后的双手位置、身体支撑和目光目标。"}最后两秒维持这个动作结果，呼吸自然，视线持续指向已经明确的目标，不再启动新的动作或无目的地转头。`,
    `【连续性】${o.continuity || "保留原人物、道具归属、时间与场景关系。"}`,
    o.mode === "singleImage" ? "【参考方式】在生成页面选定的图片作为首帧；从该画面自然开始，描述摄影机与主体各自的变化。" : o.mode === "startEndRequired" ? "【参考方式】需在生成页面按顺序选择真实首帧与尾帧图片；运动从首帧连续过渡到尾帧。" : o.mode === "reference" ? "【参考方式】按生成页面实际选择的参考素材保留身份与外观；不虚构素材编号。" : "",
  ].filter(Boolean).join("\n\n").replace(/。{2,}/g, "。");
  return { id: motionId, name: move.name, description: `${move.description} 叙事用途：${move.intent}。`, motionId, composition, cameraInstruction,
    storyboardPrompt: [`${o.narrative}`, `景别/机位：${optical}`, `摄影机：${cameraInstruction}`, `主体动作：${o.subjectAction || o.narrative.replace(/(^|[。；\n])(?:运镜|镜头运动)[：:][^。；\n]*(?:[。；]|$)/gu, "$1")}`, `起幅：${o.openingFrame}`, `落幅：${o.endingFrame || "保持本镜主体与动作结果"}`, `叙事目的：${o.purpose || move.intent}`, o.eyeline ? `视线：${o.eyeline}` : "", o.screenDirection ? `主体走向：${o.screenDirection}` : "", o.continuity ? `连续性：${o.continuity}` : ""].filter(Boolean).join("\n"),
    imagePrompt: still(o.openingFrame), endImagePrompt: o.endingFrame ? still(o.endingFrame, true) : "", videoPrompt, audit: auditCameraPlan(o, motionId) };
}
