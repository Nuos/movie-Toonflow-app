# Toonflow 分镜、分镜图与视频提示词：运镜研究与实作建议

研究日期：2026-09-21（使用者所在时区）。范围：主流生成模型官方指南、本机 ai-modulecm 运镜资料、可直接落地的选项／模板／审计设计。此报告未生成或观看任何产品新视频，因此所有生成效果均为未验证。以下产品结构、规则代码和示例是本次设计建议，不是供应商 API 规范或官方认证配方。

## 1. 最重要的产品决策

同一个分镜应保留同一个剧情事件，向用户展示 3–5 个运镜候选，而非把多种运镜串进一条提示词。每个候选有自己的叙事用途、起止画面、静态图提示词、视频提示词和检查项。用户选中的候选才写入当前生产配置；其余候选继续保存，便于对照和回退。

把「景别／角度」「位置运动／旋转」「焦距」「焦点」「稳定性」分开。推轨与变焦、摇摄与横移、俯仰与升降各自改变不同量，不能互作同义词。手持是稳定性／承载风格，转焦是焦点变化，可与主运镜组合。首批界面可用预设卡片降低填表负担，进阶栏再展开控制量。

分镜图只描述某一时刻可见的画面。视频提示词再描述时间变化；I2V 用已有图像提供外观与构图，文字集中表达主体、环境与摄影机运动。这与 Runway 和 Google 的官方图生视频建议一致。[Runway Gen-4 提示指南](https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide)、[Google 视频最佳实践](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/best-practice)。

## 2. 已核验的来源及支撑范围

### 官方网页

| 来源 | 本次采用的有限结论 | 产品使用方式 |
|---|---|---|
| [Runway Gen-4 Video Prompting Guide](https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide) | 从简洁动作开始迭代；把主体、场景、摄影机运动分开；图像已有内容不必大量重述；避免短片承载过多事件 | 提供精简 I2V 模板及复杂度提示，不把每秒时间码强加给所有模型 |
| [Runway Camera Terms, Prompts & Examples](https://help.runwayml.com/hc/en-us/articles/47313504791059-Camera-Terms-Prompts-Examples) | 官方按景别、机位、构图、运镜提供术语与 Gen-4.5 示例 | 作为选项名称和来源跳转；不抄录第三方示例或宣称本机已测 |
| [Google Video Generation Prompt Guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/video-gen-prompt-guide) | 区分 pan、tilt、dolly、truck、pedestal、zoom、crane、arc 等；高阶视角与光学效果的可靠性因提示与场景而异 | 运镜库保留 advanced 标记及结果核查，不以名称等同精确控制能力 |
| [Google Best Practices](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/best-practice) | 短视频聚焦单一场景；I2V 的原图承担外观、光线、风格，文字主要描述运动 | 把首帧准备与动态编排分成两个编辑区 |
| [MiniMax H3 基础提示词指南，固定版本](https://github.com/MiniMax-AI/MiniMax-H3/blob/d21241f0a4b3acbb34c97dae47fa417b7065e438/skills/h3-prompt-writing/references/base-en.txt) | 本机 ai-modulecm 的 H3 说明指向此固定官方底本；已核验该页可读 | H3 模板可作可选编译器，不能把 H3 字段与标签强加给通用模型 |

注意：Runway 术语页的个别示例文字与标题可能不完全对应；例如 zoom 行正文也出现 pull back。资料库应采术语定义和可观察的几何差异，不从单一示例的所有措辞推导硬规则。

### 本机可复用材料

已查找 /home/ubuntu/workspace/project 及其父目录、github、ai-modulecm；未找到额外适用的 AGENTS.md。遵循本次使用者提供的长期规则，研究没有下载模型或操作密钥。

基础路径：`/home/ubuntu/workspace/project/github/ai-modulecm`。

| 文件／目录 | 可复用内容与限制 |
|---|---|
| `docs/cookbook/camera-motion/basic-camera-movements/README.md` | 十二篇内容入口：机位、pan、tilt、dolly、truck/tracking、pedestal/boom、arc/orbit、zoom、dolly zoom、focus、speed、combination。明确区分几何／页面检查与实际生成验收 |
| `docs/cookbook/camera-motion/basic-camera-movements/articles/01-viewpoint.md` 至 `12-combination.md` | 每类有构成模块、起止状态、混淆对照、情景与失败信号。最适合转成 explain、useCases、requirements、reviewChecks |
| `docs/cookbook/camera-motion/basic-camera-movements/tools/content.py`、`enrichment.py` | 结构化教材源；可提取少量术语与例子作资料迁移，勿直接引入全部构建系统 |
| `docs/cookbook/camera-motion/basic-camera-movements/tools/engine.js`、`model.py` | 可作未来运镜示意参考；输出是针孔模型的几何示意，不能当生成视频预览 |
| `docs/cookbook/camera-motion/basic-camera-movements/articles/12-combination.md` | 同镜连续运动 vs 剪辑切镜、坐标／动作／遮挡／焦点协同、头中尾与关键时刻验收、约束冲突 |
| `docs/cookbook/minimax-h3-shot-prompt-series/articles/04-camera-movement-and-intent.md` | 运镜 × 剧情触发 × 停止条件 × 失败信号，包含可观察的推拉／横移／转焦判断 |
| `docs/cookbook/minimax-h3-storyboard-production-kit-v1.0.0-20260917-0503/skills/h3-storyboard-to-prompts/assets/templates/patterns/09-keyframe-preparation.md` | 分镜裁片转正式首帧：构图、身份、服装、场景参考的责任分离；最终画面移除非预期规划框线 |
| 同上 `assets/templates/acceptance-sheet.template.md` | PASS／FAIL／NOT_EVALUATED、具体证据、偏差时间、下一次只改什么。只抽帧时时序及音频维持未评估 |
| `/home/ubuntu/.codex/skills/camera-motion/SKILL.md` 及 `references/motion.md` | 主运镜、轴线、屏幕方向、视线、持物状态；未看成片必须 unverified；virtual/morph/teleport 可以有意破坏物理与连续性 |
| `/home/ubuntu/.codex/skills/camera-lighting/SKILL.md` 及 `references/photography.md` | 景别服务可读信息；摄影机位置影响透视；焦距数字是视觉意图；同场光源与外观连续 |

本机教材中多份 H3 工作流状态仍为未推理、待验收，不能把作者范例／原创工程数量当作本机成功率。

## 3. 建议的首批选项库

下表是以本机教程和摄影技能为依据的产品编排。英语片段为本次原创，花括号须在发送前填实。

| ID | 中文 | 改变什么／适用任务 | 提示词动作片段 | 核查线索 |
|---|---|---|---|---|
| static | 固定观察 | 让表演、等待、冲突在同一框内成立 | The camera holds its position, orientation and focal length while {action}. | 背景稳定；人物仍可运动 |
| dolly_in | 缓推靠近 | 让反应或细节逐渐可读 | The camera slowly moves closer to {subject}, settling at {endFraming}. | 遮挡／前后景比例有合理变化 |
| dolly_out | 拉远揭示 | 显露环境、距离或事件后果 | The camera retreats from {subject} to reveal {revealTarget}. | 新环境逐渐出现，主体不凭空缩小 |
| pan_left/right | 原地左／右摇 | 跟随视线、转交注意力 | From a fixed position, the camera pivots {direction} from {A} to {B}. | 是朝向变化，没有凭空侧移 |
| tilt_up/down | 上仰／下俯 | 手到脸、物件到持有者等上下揭示 | The camera tilts {direction} from {A} to {B}, then holds. | 机位未升降，终点信息可读 |
| truck_left/right | 左／右横移 | 绕过前景遮挡、显示层次 | The camera moves sideways {direction}; {nearObject} slides faster than {farObject}. | 前景与远景有不同滑动，实体保持不透明 |
| follow | 跟随移动 | 伴随人物走向目标 | The camera follows {subject} at walking speed, maintaining {relativePosition}. | 人与相机路径分开，屏幕方向一致 |
| lead | 后退迎拍 | 看人物迎面行动及表情 | The camera travels backward ahead of {subject}, maintaining {framing}. | 主体距离可控、道路方向清楚 |
| pedestal_up/down | 垂直升／降 | 保留视角关系，跟随站起或垂直动作 | The camera rises vertically with {subject}, keeping a level perspective. | 相机高度变，不能只俯仰代替 |
| crane_reveal | 摇臂升起揭示 | 从局部到整体、建立空间 | The camera rises and pulls back to reveal {environment}, then settles. | 路径、视野拓展和终点均明确 |
| arc_left/right | 小幅弧移 | 显示物体侧面或人物关系重排 | The camera arcs {direction} around {subject} until {newSide} is visible. | 角度改变且身份／形状稳定 |
| orbit | 环绕 | 有动机的全方位展示 | The camera circles {subject}, keeping {anchor} readable throughout. | 高复杂度：检查中途、遮挡与跨轴 |
| zoom_in/out | 光学推／拉 | 固定机位时收紧／放宽画框 | The viewpoint stays fixed as the lens zooms {direction} toward {endFraming}. | 不应要求用变焦看见物体背面 |
| dolly_zoom | 移动变焦 | 主体近似等大、空间感发生变化 | The camera moves backward as the lens zooms in, keeping {subject} nearly the same size. | 主体尺度与背景透视共同检查 |
| whip_pan | 甩摇 | 快速注意力转移或有意过渡 | The camera whips from {A} to {B}, then settles long enough to read {detail}. | 末端有辨认时间；不要全程模糊 |
| virtual_reveal | 虚拟穿越／变形 | 超现实揭示，明确视觉逻辑 | The virtual camera passes through {surface}, preserving {visualAnchor}, and arrives at {destination}. | 显式 virtual；不是物理违规阻挡 |

独立附加选项：焦点 `locked / follow / rack`；稳定性 `locked / smooth / handheld_subtle / handheld_strong`；速度 `slow / moderate / fast / accelerating / decelerating`；幅度 `small / medium / large`；景别 `ECU / CU / MCU / MS / MLS / FS / WS / EWS`；角度 `eye / low / high / overhead / dutch / over_shoulder / POV`。焦距与深景深应是意图栏，不显示为摄影测量值。

## 4. 最小资料契约

此结构供实作选择，不要求一次暴露全部 UI 栏位。

```ts
type CameraVariant = {
  id: string;
  label: string;
  intent: string;             // 观众何时得到哪条新信息
  motionId: string;
  direction?: string;
  speed: string;
  amplitude: string;
  shotSize: string;
  angle: string;
  lensIntent?: string;
  focus: { mode: string; from?: string; to?: string; trigger?: string };
  stability: string;
  durationSeconds?: number;
  startFrame: string;
  endFrame: string;
  trigger?: string;           // 人物接稳道具后等
  subjectAction: string;
  environmentAction?: string;
  invariants: string[];       // 人物身份、物件持有、光源、衣服等
  continuity?: {
    axisSide?: string;
    screenDirection?: string;
    eyeline?: string;
    propState?: string;
    crossingStrategy?: string;
  };
  mode: 'physical' | 'virtual' | 'morph' | 'teleport';
  imagePrompt: string;
  videoPrompt: string;
  providerProfile: 'generic' | 'runway_i2v' | 'veo_i2v' | 'h3';
  sourceIds: string[];
};
```

建议版本化：`cameraDesign.version`、`selectedVariantId`、`variants[]`、`audit.schemaVersion`。保存的是当前快照；模板日后更新不得悄悄改写用户已批准的分镜。

## 5. 同一分镜的四种表达（原创示例）

事件：女子站在窗边打开信封，读到落款，视线停住，将信攥紧。房门在她身后，走廊传来脚步声。所有方案保留人物、服装、持信手、光源和事件顺序。不同候选可能需要不同首帧构图；不能无条件共用一张图。

| 候选 | 叙事重点 | 首帧图像描述 | 视频表达 |
|---|---|---|---|
| A 固定中景 | 让手、脸和沉默一起被看见 | 女子窗边腰部以上，信封刚打开，双手完整，房门在右后方，窗光从世界左侧照入 | Locked medium shot. The woman unfolds the letter, reads the signature, stops moving her eyes, and tightens her grip. The framing holds as footsteps approach beyond the doorway. |
| B 慢推近景 | 认出落款后才接近反应 | 同样中景起点，眼神和信件均可读，预留推近后手部空间 | Begin with a brief hold. After her eyes stop at the signature, the camera slowly moves closer, ending in a medium close-up with her hands still visible. Hold on her restrained reaction. |
| C 小幅横移 | 脚步声引导门口信息 | 女子位于右侧，近处窗框遮住一部分房门，起点不要提前露出来人 | After the footsteps, the camera trucks slightly right, allowing the foreground window frame to slide aside and reveal the open doorway. The woman stays still and keeps the letter in the same hand. Settle once the doorway is readable. |
| D 固定转焦 | 从落款转向她的决定 | 信纸在前景，下半部可辨；女子眼睛在中景，两者都在框内，纸为最清晰对象 | The camera holds its position. Focus shifts once from the letter in the foreground to the woman's eyes as she lifts her gaze. The letter stays in place and her eyes remain sharp during the final hold. |

这些是可选完整方案，生成时只使用其中一个。选 C 时若人物或门口在首帧被遮住，需额外角色／场景参考或接受新显露内容不确定性；提示词不能凭空提供稳定身份。

## 6. 模板及编译规则

**静态首帧模板（通用）**

```text
{mediumAndStyle}. {shotSize}, {angle}, {lensIntent}.
{subjectIdentityAndWardrobe}. {preciseStartStateAndPropOwnership}.
{foregroundMidgroundBackground}. {compositionAndRequiredVisibleElements}.
{focusPlaneAndDepth}. {lightSourceAndDirection}. {aspectRatio}.
```

这里的 startState 可以是「手已放在门把上、门仍关闭」，不要同时写开门前／开门后。开始、途中、结束三幅图是同一镜头的状态板，只有明确 cut 才算三个镜头。规划用箭头、编号、画格线只放在分镜展示层；输入视频模型的正式首帧应是单格完整画面。

**I2V 动态模板（通用／Runway／Veo 精简）**

```text
{subjectAction}. {cameraActionWithDirectionAndSpeed}.
{triggerAndRevealOrder}. End with {endFrameAndHold}.
{essentialVisibleInvariants}. {environmentAction}.
```

尽量使用肯定的可见描述。保留必要的不变条件，但勿重复整篇人物肖像。多人物用「左侧人物／窗边女子」消歧。数值时间为构图意图，不保证模型精准执行。

**T2V 模板**：先补全场景、人物身份、外观、光源和起始构图，再接 I2V 动态段。禁止把整篇 I2V 短文不加场景资讯直接当作所有 T2V 提示词。

**H3 模板**：先识别 t2va／i2va／fl2va／l2va／ref2va 及实际参考素材，再依固定官方规则编译。基础模式的三字段与全参考模式的六字段分开。不要自造 Picture 标签或把 `{{placeholder}}` 发往模型。H3 复杂编译可以第二阶段实作；第一阶段 generic 模板就能完整满足运镜候选需求。

## 7. 可解释审计规则（产品建议）

审计物件应包含 `ruleId / severity / field / evidence / explanation / suggestion / phase / status`。表述用「为什么影响可读性」和「下一步改什么」，不要只给黑盒总分。文字计划检查与成片验收分开：`plan_ready` 不等于 `render_passed`。

| 规则 ID | 触发条件 | 级别／建议 |
|---|---|---|
| CAM001 missing_intent | 移动镜头没有观看任务／揭示目标 | info：补充新信息与停止条件，不禁止纯风格运动 |
| CAM002 missing_end_state | 运动缺起点或终点 | warning：明确起终景别、对象与保留元素 |
| CAM003 conflicting_controls | 同一阶段要求相机完全固定又横移／推轨 | error：删除矛盾或分阶段；固定焦距不是固定机位 |
| CAM004 move_stack | 单一短镜有多个主运镜而无阶段／触发 | warning：选一个主运镜或分两段；不能按词数误判合法 dolly zoom |
| CAM005 zoom_reveal | 固定机位 zoom 却要求看见遮挡物背面 | warning：改横移／弧移，或重写为放大已有细节 |
| CAM006 focus_target | rack focus 没有 from/to，或起始图未容纳两焦点对象 | warning：补前后景关系；未看图时第二项为待核查 |
| CAM007 action_confusion | 主体往右／相机往右混写，或跟拍未写相对位置 | warning：分离两条路径与屏幕方向 |
| CAM008 prompt_role | 静态首帧 prompt 出现多时段切镜／完整运动序列 | warning：提取当前瞬间，运动挪到视频栏；不能删掉静态姿势动词 |
| CAM009 temporal_overload | 很短时长配多场景、过多独立动作或连续揭示 | warning：按事件完成需要调整；阈值是可调启发式，不当模型硬限制 |
| CAM010 continuity | 邻镜屏幕方向／持物手／视线／同场光源有冲突且未声明原因 | warning：提供前后字段差异；越轴有中性镜头／可见跨越／重建空间可放行 |
| CAM011 reference_gap | I2V 无首帧／FL2V 缺首末帧／参考标签未绑定真实素材 | error：按选定 provider 和 mode 核对，不猜测已上传素材 |
| CAM012 crop_readability | 关键双手／道具需要中景，却选 ECU 或横幅直接转竖幅 | warning：提示检查画面边界，未看图不能宣称实际裁切失败 |
| CAM013 geometry_conflict | 固定焦距＋主体距离变＋严格等大且无合理主体补偿 | warning：放宽等大、改路径、或明确 dolly zoom；只在字段齐全时判定 |
| CAM014 placeholder | 待发送 prompt 含未填 placeholder／孤立标签 | error：定位缺失值，禁止把模板直接送往生成 |
| CAM015 virtual_intent | 物理不可能但已标 virtual/morph/teleport | info：要求视觉锚点及新逻辑，不能用物理不可行阻挡创作 |
| CAM016 evidence_gate | 无视频、只读 prompt 或只看到首末帧却要求成片通过 | `not_evaluated`：相应运镜／时序项不评分，不用高总分掩盖缺证据 |

纯规则审计应 deterministic、即时、无 API 开销。语义／故事动机评估可另外透过已配置 DeepSeek 执行，返回建议及字段引用，不能覆盖用户原稿。AI 的推测与字段明确冲突分开显示。若来源素材／模型输入模式未知，输出 unknown，不当 missing/error。

### 成片验收最小表

| 维度 | 可观察的证据 | 无视频时 |
|---|---|---|
| 运镜实现 | 起／中／末的前后景视差、朝向、遮挡、尺度，附时间位置 | NOT_EVALUATED |
| 主体／道具连续 | 人物身份、衣服、持有者、物件数量、开始到结果的因果 | NOT_EVALUATED |
| 可读性 | 眼睛／手／物件是否在正确时间清楚可见、末端是否有停留 | NOT_EVALUATED |
| 镜头衔接 | 实际切点、方向、视线、动作与光源连续 | NOT_EVALUATED |
| 音画 | 对白、声源、嘴部与动作时间关系 | NOT_EVALUATED |

人物在画面中变大，可能是人走近、zoom、dolly 或数字缩放；仅凭人物框变大不能给「推轨通过」。帧差大也可能只是主体动作，不能给「镜头运动通过」。即使看完整片，单目图像也不直接证明毫米级焦距或三维轨迹精度。

## 8. 建议实作顺序

1. 增加版本化 cameraDesign，预设库、可编辑候选、选择／复制／回退；现有分镜不填新字段也能正常运行。
2. 分镜页提供方案卡；分镜图页读取该方案的首帧构图；视频提示词页读取同一方案的运动。三处共享一份选择状态，避免彼此漂移。
3. 完成纯本地 deterministic 模板编译及审计；留一键「应用到图像提示词／视频提示词」，应用前展示差异并保留原文。
4. 新增按候选的规则结果和来源说明；所有未实际看过视频的成片维度显示「待验收」。
5. 之后再接语义模型、模型专属 prompt compiler 和真实视频验收，沿用同一字段，不把第一版提示词审计冒充生成效果验收。

第一批必要验证：旧资料兼容；同分镜候选切换后两种 prompt 来自同一候选；前端修改保存与回读；非法值／过长文本／未知 preset 处理；模板 placeholder 不泄漏；合法组合不被误判；未看视频保持未评估；切换 aspect ratio 或参考图后审计能重新计算。
