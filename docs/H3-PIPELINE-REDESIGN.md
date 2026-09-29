# H3 结构化生成链路

状态：实施中，尚未部署或完成成片验证。2026-09-27。

## 设计依据与决定

用户明确：具体时长依据具体 ComfyUI 工作流，不使用官方推荐范围统一截断。效率、资源消耗、质量均用实际工作流对照验证；改进工作流可以优于官方推荐。

- MiniMax 官方协议固定到 `d21241f0a4b3acbb34c97dae47fa417b7065e438`，基础三字段与 Ref2VA 六字段；编号和时间由程序编译，内容由项目文本模型规划。
- Comfy-Org/docs 固定到 `968ac74b4c0347a7e5a432a28686c11d80d892bc`，参考分工、原生音视频采样与 Turbo 可选路径。
- Larryvrh/ComfyUI-MiniMax-H3-Turbo 固定到 `4274783a23afcfdbea3b4876cb79effd6c510785`，LoRA 与采样器、量化兼容性、音频双时间表是整体组合，不能仅替换步数。
- loopforge0/minimaxh3-shots-skills 固定到 `8609642953b083891129569b09ecbcc54adbaaa2`，作为摄影配方和局限的经验来源，不等同所有本地工作流验证。
- 原始来源、文件哈希保存于 `local/h3-pipeline-v1/research/sources.json`；官方上下文 IR 服务未开源，因此本项目实现可审查的结构化计划与编译器，不宣称复刻官方内部实现。

## 数据与职责

结构化计划分别保存主体身份、空间关系、动作阶段、摄影与声音时间线。中文用于原生界面，英文内容字段用于官方 H3 编译；中文原台词保持原文。模型不能手写 `<Subject N>`、`<Picture N>`、`[Shot N]` 和 `(Sx)`。

参考清单保存文件哈希、媒体编号、真实类型、布局和时长；职责绑定独立记录身份、环境、道具、动作、摄影、首帧、尾帧、声线与声音。四视图保持独立，不能隐式当作单人参考或首帧。视频音轨不得自动启用，须作为明确音频素材绑定。

版本记录保存来源快照、原计划、精确字段问题、局部补丁及依据、编译版本、工作流配置和成片证据。补丁必须满足旧值匹配并局限于报告的字段；台词、身份和技术配置不能在语义修正中被悄悄替换。

原生表格、面板和轨道由同一结构化计划派生，编译文字不是第二份可独立漂移的数据源。历史内容保留，新计划采用需事务与过期检查。

## 验证设计

第一集已有视频保留作历史基线，但旧试片分辨率、随机种子和参考不同，不能作为严格因果 A/B。新实验固定素材哈希、种子、尺寸和目标内容，分别改变工作流、分镜计划、编译器版本；保存提交图、真实帧数、耗时、显存和音轨。文件技术检测与内容评估分开，格式通过不等于视频合格。

## 成熟实现对照

进一步阅读并保存 [ArcReel](https://github.com/ArcReel/ArcReel/tree/699675495451a757d69b6f9fbf57d4967925acd5) 的 `lib/reference_video/request_projection.py`、`execution_checkpoint.py`、`prompt_render.py`：

- 当前请求投影与不可变执行快照分开；提交时重新确认实际能力与素材，而不是信任早期预览。
- 提示词中的编号必须与实际发送顺序共用一个结果；声音编号独立于图片编号。
- 可机械生成的绑定与声音声明由程序生成；文本作者只负责内容。

本项目据此建立 manifest、workflow fingerprint、plan/prompt hash、版本来源快照与提交前检查；未复制其厂商模板或自由文本解析器，因为 H3 使用不同官方协议。

## 本机候选工作流（待成片筛选）

| 工作流 | 模型族 | 采样 | LoRA / 参考策略 | 评估职责 |
|---|---|---|---|---|
| h3-standard / h3-quality | FL2VA int8 convrot | res_multistep + simple，20 / 25 步 | 无 Turbo | 首尾帧基础对照 |
| h3-turbo / h3-fast-sol | FL2VA int8 convrot | 8 步；后者加 Sol attention | FL2V 8-step LoRA | 加速对照，不能默认等质 |
| h3-reference / h3-reference-quality | Ref2VA int8 convrot | res_multistep + simple，20 / 25 步 | match / max 参考尺寸 | 身份与动作基础对照 |
| h3-reference-turbo | Ref2VA int8 convrot | res_multistep + simple，4 步 | Ref2V 4-step LoRA，match | 速度与质量对照 |
| h3-reference-trt | Ref2VA int8 convrot | euler + simple，4 步 | Ref2V LoRA + TensorRT VAE 模板 | 整体工作流加速对照 |

实际采样图和安装节点能力由桥接 `/workflows` 读取并形成 fingerprint。当前本地节点暴露约 150 秒范围；这表示节点可接受输入，不代表已验证该长度的质量或内存需求。新增更长/更短或不同帧率工作流应携带自己的能力配置和证据，不能由官方 4–15 秒建议强制截断。

## 当前验证证据

- 六项纯函数测试：协议顺序、素材/说话者编号、四视图拒绝、局部补丁与前置值、时轴冲突、30 秒工作流能力。
- 隔离数据库集成：权限、草稿隔离、过期来源、事务采用、旧内容保留、统一投影、修订与提交前检查。
- 三项本地桥接测试：编译文本不被重写、30 秒节点参数、尾帧绑定、TRT 实际模板读取。
- 原生工作台实际打开 H3 结构化计划窗口；七条轨道及历史图片选择可见。
- 第一集第 3 镜规划和局部修正已产生版本，但本轮真实视频尚未提交；不能据此宣称质量改善。
- 全量 TypeScript 仍有 `tests/text-generation-unlimited.integration.ts` 三处原有隐式 any，新增模块检查未报告错误（最终仍需复查）。
