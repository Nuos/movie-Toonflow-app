# MiniMax H3 镜头配方整合研究

调研日期：2026-09-21（使用者时区）。使用者指定来源：[Nuos/minimaxh3-shots-skills](https://github.com/Nuos/minimaxh3-shots-skills)。本次阅读 GitHub README、两份技能、配方及规则原文，并核对现有 Toonflow 提示词模组；没有运行上游生成脚本、观看示例成片或进行本地 H3 推理。

## 来源与版本

- 固定提交：[`8609642953b083891129569b09ecbcc54adbaaa2`](https://github.com/Nuos/minimaxh3-shots-skills/tree/8609642953b083891129569b09ecbcc54adbaaa2)。Nuos 是 [loopforge0/minimaxh3-shots-skills](https://github.com/loopforge0/minimaxh3-shots-skills) 的 fork。
- 共读文本副本：`/tmp/toonflow-minimaxh3-shots-research`。这是本次研究用的临时程式与文件副本，不是模型安装。
- 本机已安装官方格式技能：`/home/ubuntu/.codex/skills/h3-prompt-writing/`；远端 [MiniMax 官方 SKILL](https://github.com/MiniMax-AI/MiniMax-H3/blob/main/.claude/skills/h3-prompt-writing/SKILL.md) 亦已阅读核对。
- [来源 LICENSE](https://github.com/Nuos/minimaxh3-shots-skills/blob/8609642953b083891129569b09ecbcc54adbaaa2/LICENSE) 是 MIT，版权标示为 `Copyright (c) 2026 Loop Forge`。移植 substantial 配方或程式内容时保留该版权及许可全文，并保留固定提交和档案来源。
- [upstream.md](https://github.com/Nuos/minimaxh3-shots-skills/blob/8609642953b083891129569b09ecbcc54adbaaa2/.claude/skills/h3-camera-shots/references/upstream.md) 明确将 MiniMax 官方格式文件列为另外的上游材料，未随专案 vendoring。不能因配方库是 MIT，就把所有 MiniMax 上游文件也宣称为同一许可。

README 的「14 种」指命名镜头系列；实际 `shots/` 内有 **15 个可解析 JSON 配方**，因滑动变焦分为两个相反方向。`bullet-time.md` 是失败记录，没有可编译 JSON 配方。资料数量不是 15 种新运镜，更不是全部可靠成功的保证。[配方索引](https://github.com/Nuos/minimaxh3-shots-skills/blob/8609642953b083891129569b09ecbcc54adbaaa2/.claude/skills/h3-camera-shots/shots/INDEX.md)

## 与 ai-modulecm 的分工

| 来源 | 最适合补充的内容 | 证据范围 |
| --- | --- | --- |
| 本地 ai-modulecm 基础摄影教材 | 机位、朝向、景别、几何差异、叙事动机、相邻镜连续性、文字与画面审计 | 本机教材含理想几何示意、来源案例与待执行工作流；不能把教材完成等同模型验收。 |
| Nuos / Loop Forge H3 配方库 | 指定 H3 镜头的摄影语句、起幅要求、主体与前景条件、失败诊断、少量实验的边界 | 作者以特定人类主体、Ref2VA 工作流记录判读；反向、非人主体及不同环境常为推导或弱证据。 |
| MiniMax 官方 H3 格式技能 | 输入模式、顶层栏位顺序、参考标签、镜号、说话者及对白格式 | 格式规则；不代表每个复杂效果已在 Toonflow 上成功生成。 |

整合顺序应为：保留剧情与实际素材 → 决定输入模式和格式 → 确认采用的摄影方案 → 在条件相符时编写 H3 摄影语句 → 文字审计 → 生成后另看片。H3 配方增加模型表达层，不取代既有分镜或通用摄影分类。

## 可落到 cameraPromptGeneration.ts 的规则

来源：[h3-camera-shots](https://github.com/Nuos/minimaxh3-shots-skills/blob/8609642953b083891129569b09ecbcc54adbaaa2/.claude/skills/h3-camera-shots/SKILL.md)、[camera-grammar](https://github.com/Nuos/minimaxh3-shots-skills/blob/8609642953b083891129569b09ecbcc54adbaaa2/.claude/skills/h3-camera-shots/references/camera-grammar.md)。以下是对 Toonflow 的实作建议，不是逐字移植。

1. **仅 H3 启用配方层。** 通用的 40 种运镜与 54 项技能仍供逐镜选型；H3 配方只在模型属 H3 时追加表达规则，不把 H3 专用栏位、参数或经验发送给其他模型。
2. **已采用方案优先。** `selectionMode=applied_video` 的方向、起止画面、焦点、时长、主体动作与连续性保留。配方不能以自己的预设取代这些条件。`auto` 才按剧情和素材选择；没有足够条件时采用较简单的摄影语句，不杜撰前景、人物或动作。
3. **将摄影机动作写进本镜句子。** 用动作类型、必要的幅度与速度，以及观众可见的结果表述。不要只在结尾堆电影名词，也不要把整份六段模板塞进每个 `[Shot n]`。
4. **先核对起幅和终点。** 推近或冲击变焦需要原构图留有收紧空间；后拉需要能被揭示的环境；尺寸锁定的滑动变焦需要起终主体尺寸一致。来源「open at whichever end ... largest」的标题措辞与其后部分例句不一致，实作应按明确的起终几何，不照抄该口号。
5. **位移要有可辨识的空间线索。** 强推近的配方依靠近前景掠过与远近视差，缺少这些条件时不能宣称必然看起来不同于变焦。前景必须来自既有场景或使用者明确设定。
6. **来源方向不能反转使用者意图。** 现有 `dolly_zoom` 后退＋拉近变焦对应 `dolly-zoom-telephoto`，不是来源另一个前进＋拉远变焦版本。左右甩摇可保留现有方向，但来源只测过其预设方向。
7. **主体自然状态与摄影机固定分开。** 避免把固定机位编成角色全身冻结；但不自动替人加新表演，也不替静物加呼吸。来源脚本预设的人物性别、步行、奔跑、转头等都不能直接注入本镜。
8. **已有动作才可使用相应复合配方。** 原配方的摇臂与强手持含跑步，身体锁定视角含步行；条件不符时只取兼容的摄影部分，或不用该配方。分屏、来回变焦、钻眼特写不能因为库内存在就自动新增。
9. **把经验保留为适用条件，不升级为硬能力。** 作者提到的步数、帧数、精度、背景参考对运动的影响，只能作特定工作流的排查依据，不修改本次实际素材、模型参数或时长。

有用的资料契约可保留 `sourceCommit / sourceFile / sourceStatus / primitives / openingRequirement / subjectRequirement / destinationRequirement / compatibleMotionIds / exclusions / localRenderStatus`。来源状态与本地验收状态应分开；`sourceStatus=verified` 不能显示成本机已验收。

## 15 个配方与当前资料库的映射

以下档名均位于固定提交的 [shots 目录](https://github.com/Nuos/minimaxh3-shots-skills/tree/8609642953b083891129569b09ecbcc54adbaaa2/.claude/skills/h3-camera-shots/shots)。表中几何为摘要与整合判断；实际 `shot_line` 在各档的第一个 JSON 区块，可解析为资料，不需执行上游 Python。

| 精确档名 | 核心摄影关系 | 可关联的现有项目 | 起幅、主体与排除条件 |
| --- | --- | --- | --- |
| `crash-zoom-in.md` | 固定机位快速向内变焦 | `snap_zoom_in` | 起幅较宽且有明确终点；不可增加推轨视差。 |
| `super-dolly-in.md` | 大幅快速推进，近前景掠出画面 | `push_in_fast`，条件式 | 须有极宽起幅、通道与近中远景；无前景时不把配方效果当成已成立。 |
| `dolly-zoom.md` | 前进＋反向拉远变焦，主体尺寸固定 | 没有方向完全一致的既有 `dolly_zoom` | 只在使用者指定此前进方向时选用；不可替换现有后退方案。作者标为仍不可靠。 |
| `dolly-zoom-telephoto.md` | 后退＋反向拉近变焦，主体尺寸固定 | `dolly_zoom` | 起终尺寸与位置保持，背景有深度；作者标为弱证据，未完成带身份图的该方向验收。 |
| `yoyo-zoom.md` | 拉远、停留、回到相同近景 | 没有单向运镜的等价映射 | 需明确三阶段意图；不把 `zoom_out` 自动变成返回动作。作者仍有比例问题。 |
| `eyes-in.md` | 持续推进到眼部或明确细节充满画面 | `push_in` 只可作条件性关联 | 本镜本来就要求该极端细节终点；普通脸部近景不授权钻入眼睛。静物须有自己的细节目标。 |
| `whip-pan.md` | 从已知 A 快速摇到已知 B 并停稳 | `whip_pan_right`、`whip_pan_left` | 必须有起终对象与位置；不新增第二人物、图片或剪接。左向是来源未实测的镜像。 |
| `orbit-360.md` | 完整环绕并回到正面附近 | `orbit_full_fast` | 既有主体、可理解的背景和全周路径；不把来源转头动作加给角色，也不冻结时间。 |
| `crane-rise.md` | 跟随＋升高＋俯拍 | `crane_up_overhead`，部分相容 | 原例主体跑动；没有跑步时不得整段使用其 `motion=run`，只保留原方案授权的升高与下俯。 |
| `aerial-pullback.md` | 后退＋升高以展开场景 | `crane_reveal` | 起幅较近，外部环境须已有依据；不擅自把已采用慢速改成来源快速。 |
| `handheld.md` | 强烈晃动的行进跟拍 | 与 `tracking` 等有条件关联 | 不等于 `handheld_breath` 轻微呼吸；原例跑步和强晃动都需本镜授权。 |
| `dutch-angle.md` | 动态滚转后保持倾角 | 与 `angle_dutch` 只有概念关联 | 静态倾斜不能自动变成动态滚转；顶视旋转亦不能直接当作来源构图。 |
| `snorricam.md` | 行进时脸部保持中央与同尺寸，背景晃动 | 无精确既有运镜映射 | 不等同 `tracking_front`；需要主体自身行进，不能命名并生成穿戴摄影设备。 |
| `rack-focus.md` | 固定构图内从近焦点转到远焦点 | `focus_rack` | 通用条件是已有两个深度层；来源三人物、三图片只是该案例，不可复制为必须新增的素材。 |
| `split-screen.md` | 同一动作的三个并列视角依次出现 | 无既有主运镜映射 | 是画面布局和时序；须用户明确要求，不增加故事镜数或擅自切镜。作者只确认布局，未确认精准时间。 |

来源对部分非人主体、相反方向和参数的延伸是推论，应保留标记。[subjects](https://github.com/Nuos/minimaxh3-shots-skills/blob/8609642953b083891129569b09ecbcc54adbaaa2/.claude/skills/h3-camera-shots/references/subjects.md)、[direction](https://github.com/Nuos/minimaxh3-shots-skills/blob/8609642953b083891129569b09ecbcc54adbaaa2/.claude/skills/h3-camera-shots/references/direction.md)

## 可落到 promptStandards.ts 的格式与保全要求

格式依 [MiniMax 官方技能](https://github.com/MiniMax-AI/MiniMax-H3/blob/main/.claude/skills/h3-prompt-writing/SKILL.md)，配方库自己的 [scaffold](https://github.com/Nuos/minimaxh3-shots-skills/blob/8609642953b083891129569b09ecbcc54adbaaa2/.claude/skills/h3-camera-shots/references/scaffold.md) 只提供特定 Ref2VA 示例。

| 接入点 | 应实作的行为 | 要避免的破坏 |
| --- | --- | --- |
| `parseH3` / 模型模式识别 | 分清基础模式三栏与全参考模式六栏，保留栏位顺序和已有正文 | 只因单词出现而把普通文字当完整 H3；把 Ref2VA 六栏硬塞给所有模式。 |
| `compileVideos` 正文 | 以完整有序的 `[Shot 1]…[Shot N]` 编写摄影语句，维持台词与故事 | 把完整新文件包入第一镜、遗漏其他镜，或套用摄影库范例故事。 |
| `compileVideos` 语言 | H3 叙述使用英文；原语言对白、歌词与画内文字保留 | 将中文台词全部翻成英文，或把摄影规则清单当模型的最终叙事。 |
| 参考编号 | 仅使用本次真实输入的 `Picture / Video / Audio` 顺序；主体标签与素材角色一致 | 照抄配方 `<Picture 1>`、`<Subject 2>` 等预设，或重新排序实际输入。 |
| 首尾帧 / 身份参考 | 按本次图片的真实角色编写：首帧从图开始，首尾模式描述两图间路径，身份参考保身份 | 把来源的「身份图不是首帧」误套到真实首帧模式，或把身份图锁成所有镜头的构图。 |
| 声音与配乐 | 保留已有 `overall_soundscape`、`non_diegetic_music` 和逐镜对白；空缺才用适当无配乐预设 | 因来源预设 `N/A` 清除使用者配乐，或在声音栏加入无意义的镜头、机身和器材描述。 |
| 时长与采用约束 | 保留总时长、各镜时长与事件先后；精准时点仍是生成意图 | 根据作者少量时间失准的观察删掉正式格式需要的时间标记，或承诺精准到帧。 |

三个基础栏位依序为 `integrated_multimodal_description`、`overall_soundscape`、`non_diegetic_music`。全参考模式依序为 `subject_definitions`、`summary`、`retention_analysis`、`detailed_description`、`overall_soundscape`、`non_diegetic_music`。身份参考、首尾帧和视频续写要根据实际任务选关系；不要一律写成 `[reference generation]`。

来源主张不加背景参考有助于其测试中的运动量，但也承认环境可能漂移。对 Toonflow，这应是使用者可理解的取舍；**不能自动删除用户已选的背景素材**。[conditioning](https://github.com/Nuos/minimaxh3-shots-skills/blob/8609642953b083891129569b09ecbcc54adbaaa2/.claude/skills/h3-shot-iteration/references/conditioning.md)

## 审计与验证应分开

来源 [h3-shot-iteration](https://github.com/Nuos/minimaxh3-shots-skills/blob/8609642953b083891129569b09ecbcc54adbaaa2/.claude/skills/h3-shot-iteration/SKILL.md) 建议先排查执行与输入，再检查摄影。对本项目的可实作检查：

- **文字阶段**：模式栏位正确、镜号完整、原台词保留、素材标签可解析、已采用运镜方向不变、角色动作不被范例覆写、起止构图符合路径、镜头词未错放进声音栏。
- **输入阶段**：仅记录实际选定图片／音视频；若实际生成工作流另有 ComfyUI 节点，再于该层核对参考图连线与空白图，不假称文字模组已检查图片。
- **成片阶段**：由完整影片核对主体比例、背景变化、近前景视差、转焦过程与身份。数值追踪只是证据，不能代替观看；首尾图也不能代替中途过程。
- **迭代阶段**：如有真实推理，固定其他条件与种子，逐次记录单一改动及它否定了什么。没有渲染时只记录文字规则／程式测试通过。

来源对步数、帧数和解析度的建议见 [settings](https://github.com/Nuos/minimaxh3-shots-skills/blob/8609642953b083891129569b09ecbcc54adbaaa2/.claude/skills/h3-camera-shots/references/settings.md)。这些是作者特定节点、权重精度与素材下的观察；本次没有将其当作所有 H3 API 的强制范围，也不自动变更使用者的模型设定。

`bullet-time.md` 记录作者放弃的尝试，可以支持「该配方库没有已确认方案」，不能推论所有模型永远不可能实现。保留现有学习型条目，不把普通环绕标成子弹时间成功。[来源失败记录](https://github.com/Nuos/minimaxh3-shots-skills/blob/8609642953b083891129569b09ecbcc54adbaaa2/.claude/skills/h3-camera-shots/shots/bullet-time.md)

建议最小程式验证包括：非 H3 不注入专用规则；既有 `dolly_zoom` 方向保留；已采用方案优先于自动选型；缺第二目标时不新增人物；固定荷兰角不被改成滚转；首尾帧角色不被改成身份参考；多镜原台词与有意配乐完整保留；来源 status 不等同本地推理成功。这些验证完成也不等于成片验收。
