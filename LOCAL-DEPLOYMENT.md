# Toonflow 本地部署与运行

项目：`https://github.com/Nuos/movie-Toonflow-app`，版本1.1.8，下载提交 `e03cf590eb0cab63534a4040db9acb4ec95b42a6`。

安装目录：`/home/ubuntu/workspace/project/nuos/movie-Toonflow-app`。

打开 **http://127.0.0.1:10588**，无需填写账号或密码，自动以本地 `admin` 身份进入项目列表。服务仅监听本机回环地址。systemd 用户服务已启用，且 `Linger=yes`，支持开机启动及退出桌面后继续运行。

## 本地组件

| 组件 | 地址/位置 | 作用 |
|---|---|---|
| Toonflow | `127.0.0.1:10588` | 网页、项目、剧本、资产、分镜、工作台 |
| ComfyUI 桥接 | `127.0.0.1:10589` | Toonflow 图片/视频供应商，保存任务与生成记录 |
| 文本 GPU 调度网关 | `127.0.0.1:10590/v1` | OpenAI 兼容聊天、流式输出、工具调用 |
| llama.cpp 路由 | `127.0.0.1:10591` | 按需加载已下载模型；内部接口有本地密钥 |
| 现有 ComfyUI | `127.0.0.1:8188` | Z-Image 与 MiniMax H3 工作流执行 |
| 文本模型权重 | `/home/ubuntu/llmspace/LLM-Model/Playtime-AI/models/unsloth` | 各模型仓库子目录中的量化权重 |
| 文本运行与评估 | `/home/ubuntu/llmspace/text-models` | 运行程序、固定测试集、原始结果；models下仅保留兼容链接 |
| 数据库 | `data/db2.sqlite` | 本机 SQLite 数据库，无需单独安装数据库服务 |
| 生成素材 | `data/oss` | Toonflow 最终保存的图片、视频 |
| 工作流记录 | `local/runs/<任务ID>` | 原始请求、实际图、提示词、ComfyUI history、输出 |

内部路由的密钥位于 `/home/ubuntu/llmspace/text-models/router.key`，程序自动读取，不需要填写云端 API Key。Toonflow 中选“本地文本模型 · RTX 5090”与“本地 ComfyUI · MiniMax H3”。

## 功能与运行条件

项目提供小说/故事整理、剧本生成、角色/场景/道具资产管理、导演计划、分镜表与分镜面板、图片与视频生成、结果版本选择及下载。AI Agent 和记忆检索用于辅助编剧和生产流程，结果仍需要人工检查连续性、台词和镜头质量。

本次使用 Node.js24、Yarn1.22、SQLite；网页资源已随仓库提供，不需要安装 Electron 图形客户端。安装源码依赖时跳过了 Electron 二进制下载。文本服务使用 llama.cpp b10991 CUDA12.8；评估 Python 环境独立于 ComfyUI，避免改变已有 PyTorch 依赖。

本机实测硬件为 Ryzen9 9950X、128GB 内存、RTX5090 32GB。Toonflow 网页本身不需要高端显卡，资源主要消耗在本地模型推理。本次配置只代表这台机器的验证结果，不把未经测试的低配置称作最低要求。

四款 Q4_K_M 文本权重合计约59.3GB；程序、下载暂存、数据库和生成素材另占空间。H3 权重沿用已有 ComfyUI 安装，不重复下载；其文本编码器不是通用聊天模型，不能替代这次部署的文本模型。

## 模型使用

- 文本：Qwen3.5 9B、Qwen3.5 27B、Qwen3 30B-A3B Instruct、GLM-4.7-Flash；同一时刻加载一个，32K上下文，空闲60秒后休眠释放模型内存。当前前两款已下载、校验并实测；后两款由后台服务继续下载，完成后自动评估。尚未下载完成的模型暂不能调用。最新状态见 http://127.0.0.1:10588/model-comparison.html。
- 2026-09-15 验收时编剧与生产 Agent 使用 Qwen3.5 27B，通用辅助使用9B（2026-09-19 已切换 Codex，见下文），温度0.2、最大输出4096、关闭思考模式。13项固定工作流基线中27B通过11项，9B通过7项；9B思考模式补测仍有长时间不输出正文的情况，未作为默认。
- 图片：Z-Image Turbo，本地1K文生图。当前适配器不提供参考图编辑；带参考图的图片请求会明确报错。
- 视频：H3 Turbo8步、标准20步、Ref2VA Turbo4步及标准20步。基础标准20步首尾帧已实测，Ref2VA标准20步尚未实测。Turbo适合快速验证。
- 基础视频支持文本、单图首帧、首尾帧；多参考档在 Toonflow 界面支持图片与音频参考。原始 H3 路由支持视频参考，但当前上游视频类型转换还未适配，因此没有在界面声明视频参考能力。
- `preview` 为608×352，`768p` 为1344×768；竖屏交换宽高。帧数按照17k+5向上对齐，24fps下5秒档实际124帧，约5.17秒。
- H3 联合生成视频与音频，支持音频开关；这不等于独立 TTS 配音服务。Toonflow 的独立 TTS 配音项仍需另配对应模型或供应商。

文本网关和媒体桥接共享 GPU 锁：文本等待 ComfyUI 队列清空后释放 ComfyUI 缓存再推理；媒体提交前等待文本请求结束并卸载文本模型。直接从 ComfyUI 原生页面运行的外部工作流不经过该锁，手动混用时先运行 `python3 /home/ubuntu/llmspace/text-models/modelsctl.py unload`。

## 启停与诊断

```bash
systemctl --user status llmspace-toonflow.service llmspace-toonflow-h3.service llmspace-text-models.service llmspace-text-gateway.service
systemctl --user start llmspace-toonflow.service llmspace-toonflow-h3.service llmspace-text-models.service llmspace-text-gateway.service
systemctl --user stop llmspace-toonflow.service llmspace-toonflow-h3.service llmspace-text-gateway.service llmspace-text-models.service
python3 /home/ubuntu/llmspace/text-models/modelsctl.py status
systemctl --user status llmspace-text-download.service llmspace-text-evaluation.service
tail -n 5 /home/ubuntu/llmspace/text-models/logs/download-ranges.log
tail -n 5 /home/ubuntu/llmspace/text-models/logs/evaluate-remaining.log
```

下载和评估已交给独立的 systemd 用户服务，退出当前对话不影响运行。长任务执行期间显示 `activating (start)` 属正常状态；全部完成后为 `active (exited)`。下载按固定版本续传并核对SHA-256，评估逐款进行，完成一款即更新比较报告。下载服务不占GPU，评估与媒体任务共用GPU锁。

停止以上服务不会主动停止原有 ComfyUI 用户服务。请在生成完成后重启 Toonflow：上游后台视频任务没有完整的进程重启恢复机制；桥接层仍会保留 ComfyUI prompt_id 和素材，排查时先查询记录，不要盲目重复提交。

日志：`local/logs/toonflow.log`、`local/logs/h3-bridge.log`；文本服务日志位于 `/home/ubuntu/llmspace/text-models/logs/`。

```bash
cd /home/ubuntu/workspace/project/nuos/movie-Toonflow-app
npm run lint
npm run build
/home/ubuntu/llmspace/comfyui/.venv/bin/python local/test_bridge.py
/home/ubuntu/llmspace/comfyui/.venv/bin/python local/verify_media.py
./node_modules/.bin/tsx local/check-agent-guard.ts
./node_modules/.bin/tsx local/check-agent-guard-integration.ts
./node_modules/.bin/tsx local/check-director-tools.ts
```

更新源码前先保存本地改动及 `data`。本次改动包括本地供应商、H3桥接、监听地址、视频成功状态映射、音频MIME、提示词的模式/时长/参考信息、导演工具范围和本地Agent循环保护；不能直接用上游文件覆盖。

## 已有验收材料

测试项目“本地 H3 联调测试 · 溪流”保存了测试剧本、首帧图片、多个已生成视频及选中版本。`local/media-verification.json` 记录完整解码、尺寸、帧数和音频检查；`local/text-sdk-verification.json` 记录实际 Toonflow SDK 工具调用与流式文本测试；`local/text-h3-e2e.json` 记录文本到视频的完整链路。浏览器已确认能解码播放已生成视频。

新增首尾帧测试由桥接API直接提交，使用现有视频抽取的首尾画面：基础标准20步、5秒档、608×352、124帧，输出无音轨；记录为 `local/firstlast-standard-test.json`。这项测试不新增 Toonflow 工作台轨道。桥接耗时包含模型加载、排队和轮询间隔，不能直接作为纯采样速度比较。

真实页面测试发现9B导演规划越阶段、重复读工具。现已按仓库导演角色规范，将该角色限制为一次剧本读取，然后输出计划；本地模型另有重复循环检测及32轮上限。SDK普通与流式集成测试均验证第三次相同工具结果时终止。27B重新测试完成了导演计划保存和决策层收尾，实际分镜、轨道、视频均未改变。证据为 `local/agent-qwen9b-failure.json`、`local/agent-qwen27b-verification.json`。这说明当前简单规划可运行，并不代表所有复杂Agent流程已经全面验收。

原始评估协议：`/home/ubuntu/llmspace/text-models/EVALUATION-PROTOCOL.md`。结构约束测试分数不等于剧作审美评分，不保证长篇小说自动成片无需人工审校。

## 2026-09-19 更新与免密部署

已从 origin 拉取所有分支和标签并补齐完整 Git 历史（894 个提交，非浅克隆）。远端 master 与本地 HEAD 均为 `e03cf590eb0cab63534a4040db9acb4ec95b42a6`，无新增上游提交。本地原有模型适配、项目、素材保留。

免密开关由 `~/.config/systemd/user/llmspace-toonflow.service.d/passwordless.conf` 中的 `TOONFLOW_PASSWORDLESS=1` 控制。首页动态注入正常 JWT 会话，免去填写账号和密码。登录 API 同时接受空请求或只填写已有账号；不创建未知账号。业务 API 仍校验 JWT。关闭开关并重启服务后，恢复原有密码验证；数据库密码未修改。

验收通过：TypeScript 检查、生产构建、生产依赖检查、空请求与空字段登录、已有账号免密登录、未知账号拒绝、业务 API 读取两个原有项目、未带 token 拒绝、首页 no-store、本地文本网关四款模型列表、H3 桥接与 ComfyUI 健康检查。浏览器直接打开首页已确认进入“我的项目”。本次未重新执行视频生成或付费云端调用。

验收记录：`local/deployment-verification-20260919.json`。
更新前备份：`/home/ubuntu/llmspace/backups/toonflow-20260919/`，包含源码与数据工作区归档、SQLite 在线一致性备份及原 systemd 服务配置；不重复备份模型权重和 node_modules。

## 2026-09-19 Codex Agent

剧本、生产及其所有子角色、通用 AI 共 16 项，已设置为 `codex:codex-default`。使用本机官方 Codex CLI 的 ChatGPT 登录状态，无需填写 API Key；当前默认模型实测为 `gpt-6-astra`，推理强度 medium。后续修改本机 Codex 默认模型后，新 Agent 调用跟随使用。图片、视频供应商及 TTS 配置未变；原本地文本供应商仍可手动选择。

适配器 `src/utils/codexModel.ts` 通过官方 App Server 协议启动临时会话，把 Toonflow 工具注册为 dynamicTools；工具请求交给 Toonflow 执行，结果返回原 Codex 会话继续推理。支持文本、图片输入、JSON 输出约束与实时文本流；非图片文件附件会明确报错。跨次对话由 Toonflow 的历史记录恢复。当前不报告精确 token 统计，也不映射 Toonflow 的 temperature/maxOutputTokens 限制；Codex 配置中的输出参数生效。

运行参数：`local/codex-config.json`；固定工作目录 `local/codex-workspace`；CLI 路径默认 `/usr/lib/chatgpt/resources/codex`，可由 `TOONFLOW_CODEX_BIN` 修改。该集成关闭个人 MCP、插件和 Shell 等工具，仅把 Toonflow 原生工具用于项目操作。账号认证仍由 Codex 本机维护；额度和登录失效会影响 Agent 使用。

验收：`local/check-codex.ts` 验证普通回复、流式工具调用及结果回传；`local/codex-verification.json` 保存结果。正式 systemd 服务的供应商模型测试结果见 `local/codex-service-verification.json`。测试使用只读样例工具，不修改原有影片数据。

切换前备份：`local/backups/before-codex-20260919.sqlite` 与 `local/backups/agent-config-before-codex-20260919.json`。回退模型配置时优先仅恢复 JSON 中的 Agent 配置，不整库覆盖新项目数据。

参考：[官方 Codex App Server 文档](https://learn.chatgpt.com/docs/app-server)。

## 2026-09-19 GPT Image 2.5

两个已有项目的默认图片模型已设为 `openai:gpt-image-2.5-sunburst`（Sunburst），OpenAI 供应商已启用，并提供 Flare 作为可选项。新建项目时可在图片模型选择器中选择这两款模型。

`src/utils/openaiImage.ts` 实现文生图 `/images/generations` 与多参考图编辑 `/images/edits`；保留项目宽高比和 1K/2K/4K 档位，映射为符合模型尺寸限制的分辨率，质量 auto，输出 PNG。模型请求严格使用对应 GPT Image 2.5 标识。

当前未配置 OpenAI API Key，因此尚不能实际出图。请在 Toonflow 设置 → 供应商 → OpenAI标准接口中填写 API密钥，地址为 `https://api.openai.com/v1`；也支持后端 `OPENAI_API_KEY` 环境变量。Codex 的 ChatGPT 登录不作为此 API 的凭证。

已通过 TypeScript、生产构建及本地模拟服务测试：15种尺寸、文生图/参考图请求、缺少凭证时的明确错误。未执行真实图片生成，未验证当前账号的模型权限。原图模型配置备份：`local/backups/image-models-before-gpt25.json`。

## 2026-09-19 改接 Codex 内置出图（当前配置）

当前三个项目图片模型已改为 `codex:codex-image`，使用本机 ChatGPT 登录与 Codex 内置图片生成，不再经 OpenAI 图片 API。UI 名称为“Codex 内置出图（ChatGPT 额度）”，不标为 GPT Image 2.5；具体模型由 Codex 内置服务控制。

原图保存目录由 `local/codex-image.json` 的 `outputDirectory` 指定，当前为 `/home/ubuntu/workspace/project/nuos/movie-Toonflow-app/data/oss/codex-generated`。每次生成保存唯一命名 PNG 和元数据 JSON，并由 Toonflow 另存至对应项目资产路径、更新数据库及缩略图。Codex 默认生成目录可能仍保留源文件。1K/2K/4K 与宽高比作为生成提示传入，实际像素以元数据为准，不保证精确尺寸。

实现：`src/utils/codexImage.ts`；仅图像会话启用内置出图工具，文本 Agent 配置不变。15分钟超时，错误返回原始可读原因，无自动重复提交。API Key 保留在原供应商中，不用于此出图链路。

真实出图测试：`local/codex-image-verification.json`，生成 PNG 1672×941。项目配置备份：`local/backups/image-models-before-codex.json`。此前 OpenAI API 真实测试因为余额不足失败；该问题未被标为已充值或已解决，而是改用已授权的 Codex 路径。

正式资产验收通过：周衡（assetId=1）已通过 `/api/assetsGenerate/generateAssets` 真实生成，用时60.44秒，状态已完成，缩略图 HTTP 200，浏览器已确认图片显示。记录：`local/codex-asset-live-verification.json`。


## 2026-09-20 目录迁移（当前生效）

项目根目录现为 `/home/ubuntu/workspace/project/nuos/movie-Toonflow-app`，源码、Git 历史、本地修改、依赖、数据库、素材、生成记录、测试及部署资料均已迁入。旧根目录 `/home/ubuntu/llmspace/movie-Toonflow-app` 仅为指向新目录的兼容软链接，不另存项目副本。

Toonflow 与 H3 桥接的 systemd 工作目录、日志路径、服务文件链接、Codex 图片输出目录、内部素材链接、外部模型比较报告写入路径、部署脚本副本及 Codex 保存的工作区路径均已更新。原地址 http://127.0.0.1:10588 和开机启动继续生效。

《江雪》的专属 ComfyUI 项目、输入及输出已归入 `tests/poetry/toonflow-jiang-xue-20260916/comfyui`；共享 ComfyUI 输入/输出命名空间和旧项目入口保留兼容链接。共享 ComfyUI 运行环境、路由程序和文本推理服务继续使用原有安装。

内置 MiniLM fp16 ONNX 模型已依照统一模型存储规则实际移至 `/home/ubuntu/llmspace/LLM-Model/Playtime-AI/models/sentence-transformers/all-MiniLM-L6-v2/toonflow-onnx-fp16`；`data/models/all-MiniLM-L6-v2` 为加载链接。Git 工作区会显示原模型文件删除与同名目录链接新增，这是存储迁移的预期差异；权重已完整保留并通过 SHA-256 核验，未下载重复副本。

迁移前备份：`/home/ubuntu/llmspace/backups/toonflow-migration-20260920T092056Z`。包含项目归档（含 Git 和全部业务数据，不重复打包 node_modules、模型权重）、外置江雪数据归档、SQLite 一致性备份、修改前配置、完整文件清单和归档校验值。历史日志、既有备份及一条历史失败任务的错误信息保持原貌，历史路径仍可由兼容链接解析。

验收：19,050 个常规文件核对通过（路径替换按预期内容验证，日志原文前缀保留）；Git 索引条目不变；数据库完整性正常且全部表行数不变；3 个项目正常读取；21 张已生成图片及 7 个视频通过 HTTP 读取并与本地原文件逐字节一致。首页、H3 桥接、文本网关、ComfyUI、江雪报告均返回 HTTP 200；TypeScript 检查、11 项桥接测试、384 维嵌入模型加载通过。本次未重新生成付费图片或视频。

详细记录：`local/migration-20260920.json`、`local/migration-verification-20260920.json`。

路径层级复核后确认，`nuos` 是仓库所有者目录，仓库目录必须保留为 `movie-Toonflow-app`。项目已从误设为 `nuos` 目录本身纠正到 `/home/ubuntu/workspace/project/nuos/movie-Toonflow-app`；服务、Codex 工作区、输出目录、内部链接和外置测试资料路径已再次同步。纠正前配置与数据库快照位于 `/home/ubuntu/llmspace/backups/toonflow-path-correction-20260920T094000Z`，复核记录为 `local/path-correction-verification-20260920.json`。

## 2026-09-21 全系统模型配置（当前生效）

- 文字：16项文本功能全部绑定 DeepSeek。通用文本使用 `deepseek-flash`；剧本、故事骨架、改编策略、监督、导演规划、分镜等使用 `deepseek-v4-pro` 并默认开启高强度推理。高级配置已启用，简易配置的三个入口也同步绑定。
- 密钥：后端每次从 `/home/ubuntu/.config/llm/deepseek.env` 读取，只允许 DeepSeek 官方域名；未复制到数据库、网页、供应商模板或文档。官方模型列表、结构化输出、推理工具往返、流式工具往返均通过。`local/deepseek-live-20260921.json` 保存脱敏结果。验证脚本当时的关闭数据库写法报错，发生在全部调用成功和结果落盘之后；已修正，不重复请求。
- 生图：`comfyui-h3:qwen-image-2.1-quality`，默认原生2K、Euler50步、引导强度1、simple调度，直接输出无损图像。方图2048×2048，横图2560×1440，竖图1440×2560。复用本机Qwen Image 2.1八位整数模型、Qwen3-VL 8B八位整数编码器与十六位变分自动编码器。支持参考图编辑：保留首张参考图比例和原始细节，超大输入按所选像素面积等比例缩小；不把编辑输出强制拉伸为项目比例。4K不冒充已验证规格。
- 视频：新项目默认 `h3-quality`，原生1344×768、25步、支持文本/首帧/首尾帧；现有多参考项目使用 `h3-reference-quality`，25步并保留参考图细节。横竖方向随项目设置。默认选项首先显示768p，保留小尺寸预览选项。
- 视频加速选项：`h3-fast-sol` 为八步稀疏注意力；`h3-reference-trt` 为四步多参考与TensorRT变分自动编码器。来自今天已有测试规格，不将速度排名冒充画质排名。多参考模型可传9张图片、3段视频、3段音频，总计不超过12项；单条与批量视频接口已保留视频参考的媒体类型。
- 提示词：新增四款视频档均绑定对应的H3基础或多参考提示词模板。H3生成音视频并可关闭成片音轨；独立语音配音项仍是上游禁用功能，未冒充已配置独立配音。
- 现有项目及新建项目的图片模型、2K画质、视频模型默认值均已同步；旧供应商配置保留，启用供应商仅为DeepSeek与本地ComfyUI。现有作品和分镜未重新生成或替换。
- 本地记忆检索继续使用已安装的384维编码模型，实际调用正常，权重沿用默认模型根目录下的原有实体。
- 启动服务及开机设置沿用原systemd服务，无新增监听端口或模型下载。

### 本次验证范围及中止记录

复用总台账2.0.0及其中Qwen、H3 Native、H3 Easy已有性能和品质记录。此次误扩大了媒体测试范围，已生成3张独立验证图；用户指出重复测试后立即停止两个调用脚本，中断本轮视频并取消参考图编辑队列。没有完成新的视频验收，也不声称参考图编辑经本次端到端验证。输出保存在单独验证目录，没有替换用户项目资产。后续配置任务只核对现有文档、模型绑定、请求转换与服务状态；不再自行提交媒体生成测试。两个媒体测试脚本已增加显式启动参数保护。

只读检查：`python3 local/check-configuration.py`。此脚本不调用生成接口。

配置记录：`local/configuration-20260921.json`。
回退备份：`local/backups/model-config-20260921-064718/`（数据库、供应商及修改前代码；不重复存储模型）。


## 2026-09-22 本地人物声线、环境音与影视配乐（当前生效）

人物默认声线已由早期 11 个文字描述扩充为 46 份实际中文音频（男声 15、女声 30、中性声 1），覆盖不同年龄、气质和性格。另加入 16 项环境、自然、虫鸟及动物音效，以及 19 项影视器乐及戏曲配乐（其中中国戏曲 9 项），包含古筝、二胡、唢呐、钢琴、弦乐、长笛、鲁特琴和管弦乐。

项目菜单“声音与影视配乐”支持分类搜索、性别年龄筛选、试听及完整音轨下载；人物/场景/道具面板可直接选择声音并自动保存关联。全部 81 项已导入两个已有项目的原生音频资产中心，新项目首次浏览音频资产时自动导入。音频实际存放于 `data/oss/library/audio`，多项目复用文件；原始音轨、来源与署名说明保留。既有人物的声线设定没有被自动覆盖。

角色及分镜提示词继续使用当前声线描述，实际参考音频优先。衍生角色默认继承主角色，单独绑定时覆盖。支持音频参考的单条/批量视频请求会引用本地文件；关闭声音或不支持音频参考的模式不会发送音频。配乐提供后期使用的完整文件，不自动修改现有成片。

46 份声线使用本机 Qwen3-TTS 生成；权重按统一规则存放于 `/home/ubuntu/llmspace/LLM-Model/Playtime-AI/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`。未改动 ComfyUI 工作流。外部素材逐项保留 CC0/CC BY/CC BY-SA 许可和署名；唢呐现场录音及来源 MP3 预览版本已明确标注。

验证通过：66 份文件解码与校验值、本地完整音轨及 19 个短试听 HTTP 读取、人物面板下拉与原生资产选择器、声音库筛选和播放、隔离项目保存、继承覆盖、跨项目隔离、重复导入、共享文件保护与修复、单条/批量视频模拟引用、类型检查及生产构建。正式服务已重启生效，未重新生成用户影片。

使用、来源、维护和完整清单见 [docs/SOUND-LIBRARY.md](docs/SOUND-LIBRARY.md)。核验记录：`local/sound-library-audio-validation.json`、`local/sound-library-live-verification.json`。修改前备份：`local/backups/audio-library-20260922T055356Z/`。更早的文字预设备份仍保留在 `local/backups/character-voices-20260922T051545Z/`。

## 2026-09-22 运镜进入视频提示词生成（当前生效）

视频工作台的提示词编辑区已加入「运镜与镜头」。原生单个与批量「生成提示词」现在读取完整有序分镜、40 种运镜、54 项技能和 7 个叙事模板：有效的已采用方案作为摄影约束，未采用的分镜按情节逐镜自动设计，包括适合停留时采用固定机位。未采用候选、收藏与个人笔记不会被当成硬约束。多镜输出缺镜、错序或重号会拒绝保存，保留原提示词。

支持同镜多方案对比、分镜/首帧图/尾帧图/视频提示词、轴线与起落构图规则审计、收藏/分组/笔记、自定义技能模板。新参考影片的 40 个公开描述章节可检索、跳到来源时间与关联技能；素材始终按实际引用顺序，不生成虚构编号。手动修改分镜、时长或轨道后，失效摄影方案不会自动覆盖新内容。

结合 `Nuos/minimaxh3-shots-skills` 固定提交 `8609642953b083891129569b09ecbcc54adbaaa2` 的 15 个配方，只在 H3 提示词生成时注入。保留既有运镜方向，按真实故事条件使用组合镜头；不擅自新增跑步、人物、分屏或参考图，也不修改模型步数、帧数和采样参数。技能库内可搜索「H3 生成配方」。MIT 许可与作者归属保存在 `docs/third-party/h3-shots-LICENSE`。

同时修复视频标准化时固定构图与动态运镜冲突、缺少资产时整份 H3 输出被嵌入主体字段、已有配乐被清空、紧凑镜号被重复包装等问题；保留模型字段、声线、台词及未修改镜头内容。

验收：52 项单元测试、运镜保存/分类/原生生成路由整合测试、提示词与声线回归、TypeScript 与生产构建通过。真实 DeepSeek 文字调用在私有临时项目中验证，未生成图片或视频；本机成片效果仍未验证。正式服务已重启，原生入口、技能管理、影片章节与 H3 配方搜索已在浏览器确认；19 个用户分镜与 19 条视频轨道的内容、提示词、时长和媒体路径与部署前一致。

说明：`docs/CAMERA-STUDIO.md`。记录：`local/camera-studio-verification.json`、`local/camera-studio-live-verification.json`、`local/camera-generation-live-verification.json`。部署前代码及一致性数据库备份：`local/backups/camera-studio-20260922T062921Z/`；代码回退勿覆盖用户当前数据库。

### 中国戏曲补充

本次新增京剧 5 项、豫剧 1 项、歌仔戏 2 项实际音频，并把原有京剧唢呐过场归入“中国戏曲”。剧种及唱段/器乐/锣鼓筛选已启用，原有声线、自然音效及器乐配乐保留。新增文件已验证解码、校验值、全长与短试听读取，两个项目各新增 8 项资产，回归测试通过。未重启模型服务或生成任何新视频。

黄梅戏源站访问受限，尚未取得音频，未冒充已入库；两个候选来源单独记录在 `data/audio-library/pending-sounds.json`。可访问来源或本地文件到位后再补齐。核验：`local/opera-library-verification.json`；补充前备份：`local/backups/opera-library-20260922T063606Z/`。


### 女性声线第二批补充

新增 15 份女声试听，女性声线总计 30 种，人物声线总计 46 种，整个声音库总计 81 项。新增软糯女童、伶俐女童、倔强少女、空灵少女、甜美邻家、清雅闺秀、磁性低音、冷峻御姐、伶牙俐齿、神秘女声、温厚母亲、质朴大姐、端庄贵妇、严厉长辈、轻缓老妪。全部使用已有本地模型生成，无新增模型下载。

两项目分别新增 15 项音频资产，重复导入为 0；原有角色声线及绑定与备份一致。新增 15 份 WAV 解码、时长、有效音量、校验值通过，原有 66 项音频保持不变。正式服务 81 项音频均可读取且校验值一致；页面显示 30 款女性声线，儿童和老年筛选通过，新增磁性低音试听播放完成。类型检查、人物声线单元测试、两个隔离集成测试和生产构建通过；视频引用采用模拟调用验证，没有重新生成影片。Toonflow 服务已重启生效。

记录：`local/female-voices-verification.json`、`local/female-voices-live-verification.json`；备份：`local/backups/female-voices-20260922T065137Z/`。

## 2026-09-22 运镜示意与独立视频切片（已部署）

运镜面板新增简化场景的摄影变化示意，并接入现有 ComfyUI 视频工作流，用单个分镜的运镜设置生成独立切片。示意展示不是模型渲染，不代表当前分镜效果或成片质量验收。准备预览只编译提示词、核对参数与参考素材并保存准备记录，不调用文本或媒体模型；只有使用者明确确认并点击生成才提交视频任务。

工作流目录读取当前启用供应商的实际视频模型及 `mode/audio/durationResolutionMap`。当前为 `comfyui-h3` 的 8 个选项：`h3-quality`、`h3-reference-quality`、`h3-fast-sol`、`h3-reference-trt`、`h3-turbo`、`h3-standard`、`h3-reference-turbo`、`h3-reference`。沿用既有 5/8/10 秒、768p/preview 与横竖屏规格；基础档提供文字、单图首帧和首尾帧，多参考档提供最多 9 图、3 视频、3 音频且合计不超过 12 项。未下载模型、创建新 ComfyUI 图、改变既有步数或提供目录之外的分辨率。名义时长仍由 H3 按 24fps、17k+5 帧对齐。

新记录存于 `o_cameraClipDraft` 与 `o_cameraClip`，输出为 `data/oss/<projectId>/camera-clips/<requestId>.mp4`，私有请求快照为 `data/reproduction/camera-clips/<requestId>/request.json`。后者含生成参数及可能的 base64 参考内容，不公开到网页。切片历史不修改原分镜、图片提示词、`o_videoTrack.prompt/videoId/duration` 或原视频版本；提示词采用、原生单个/批量生成、草稿备份与回填继续使用既有流程。

准备令牌有效 30 分钟且只允许一次提交；稳定请求 UUID 用于数据库与 H3 桥接幂等。分镜、声线、目录参数或参考文件变化后必须重新准备。重开页面或服务重启后，历史查询可按原 UUID 读取 `127.0.0.1:10589` 已有任务，并取回已完成输出；不会为恢复新建渲染。连接、提交或落盘结果未知时保留 `uncertain`，先核对原任务，不自动换 UUID 重试。当前没有切片取消接口；关闭页面不等于取消生成。

新增 API：`GET /api/cameraStudio/clipWorkflows`，以及 `POST /api/cameraStudio/clipContext`、`clipPreview`、`clipGenerate`、`clipList`。接口检查当前账号项目所有权；切片历史最多显示本镜最近 100 条。现有 `/oss` 仍沿用原静态素材服务；恢复下载受 512 MiB 上限约束。

已完成构建、服务重启和正式网页验收：原生视频提示词弹窗可打开运镜效果面板并读取 8 个现有 H3 选项；新增中文助手在素材、分镜和自定义图像编辑器中可打开，人物提示词已通过真实 DeepSeek 转中文、预览、回填及取消保存检查。原项目、19 条分镜、19 条视频轨道、既有视频和资产与部署前快照一致。独立切片的两个 H.264 测试夹具已在隔离页面生成、重载历史、解码和同步播放；它们不是 AI 成片，不代表真实 H3 运镜质量已验证。正式 ComfyUI 桥接健康，队列为空，本轮未提交真实媒体任务。

验收记录：`local/camera-showcase-live-verification.json`、`local/camera-showcase-ui-verification.json`；真实中文文字测试：`local/camera-generation-live-verification.json`。部署备份路径记录在 `local/camera-showcase-backup-path.txt`。

回归命令（项目根目录）：

```bash
npm run lint
npx tsx --test tests/camera-motion.test.ts tests/camera-prompt-generation.test.ts tests/h3-camera-recipes.test.ts
npx tsx tests/camera-prompt-generation.integration.ts
npx tsx tests/camera-clips.integration.ts
node tests/camera-video-controls.browser.cjs
```

上述整合测试使用隔离 SQLite 与模拟推理；切片测试仅用 FFmpeg 制作空白视频文件夹具，不调用真实 ComfyUI。浏览器 harness 需要本机 Playwright/Chrome，不能替代正式页面验收。完整操作与限制见 [docs/CAMERA-STUDIO.md](docs/CAMERA-STUDIO.md)，桥接状态、真实工作流来源与恢复限制见 [切片接入调查](docs/research/camera-clip-workflow-integration.md)。

## 默认简体中文与原生 AI 辅助

人物定妆照、角色／场景／道具图、分镜及单个／批量视频提示词的文字生成统一默认简体中文。H3 字段名、参考标记和模型参数保持不变；中文台词、专名与画内文字统一使用简体字，保留原意与顺序。原有“智能生成”“AI 润色”“生成提示词”和批量按钮保留。

新增素材描述、素材图像提示词、自定义图像节点、分镜图提示词和分镜描述共 5 个“AI 辅助 · 简体中文”入口。可生成文字或只转换语言，先预览，再由用户采用到原编辑框；仍须通过原页面保存。接口为 `POST /api/promptStandards/assist`，仅调用已配置的文字模型，不保存原表、不生成媒体；输入限制为原文 30000 字、上下文 15000 字，服务等待上限 90 秒。关闭或取消不会回填，原编辑目标或文字改变时禁止覆盖。

前端入口由 `scripts/install-prompt-ai-controls.cjs` 精确安装，支持重复执行且遇到上游结构变化先报错；重换前端包后需要重新执行，并检查全部内联 JavaScript 解析及实际入口。回归：`tests/prompt-assist.integration.ts`、`tests/prompt-language.integration.ts`。

## 全项目简体中文规则（2026-09-22）

界面语言固定为简体中文，刷新时会将旧的语言偏好更新为 `zh-CN`。覆盖人物资料、剧本、分镜、图像和视频提示词、代理回复及工具写入内容。文本模型同时接收中文规则和输出转换；内容接口在保存、读取时统一字形；图像及视频提交前也统一提示词字形。转换使用固定版本 `opencc-js@1.4.2`，不发送额外网络请求。中文台词保留原意和顺序，繁体字转换为简体字；JSON 键、工具名称、模型标识、引用编号、文件路径和密钥不参与转换。

安装脚本 `node scripts/install-simplified-chinese.cjs` 支持重复执行；前端重新替换后应先恢复原有扩展入口，再执行此脚本。语言规则同时写入项目 `AGENTS.md`。旧版多语言依赖、兼容标识和许可证作为程序与来源资料保留，不会成为可选界面语言。

部署前已备份数据库和页面，位置见 `local/simplified-chinese-backup-path.txt`。数据库只读审计未发现待转换的繁体内容，没有迁移或改写任何项目记录；研究文档已统一简体中文。审计结果见 `local/simplified-chinese-audit.json`。新增回归覆盖跨块流式文本、真实 AI SDK 工具调用、中文专名、模型字段、资源路径、接口保存读取以及登录字段隔离。

最终验证：59 项单元测试与 9 组集成回归通过，TypeScript 检查和构建通过；正式面板的语言选项、原项目打开、19 个分镜及 8 项现有视频工作流选项已在浏览器核对。真实 DeepSeek 文本请求通过人物提示词、双镜头视频提示词及繁体台词转换验证。原项目、素材、分镜、轨道、图片和视频记录与备份逐行一致；没有提交新的媒体任务。最终记录：`local/simplified-chinese-verification.json`。

## 2026-09-23：分镜提示词编辑与素材目录

服务已加入分镜自动提示词、编辑和 AI 辅助、资产编号选择、媒体预览及侧栏收放。剧目媒体写入统一经过 `productionStorage`；固定目录和兼容规则见 `docs/PRODUCTION-CATALOG.md`。已迁移 2 部剧的 58 个现有文件，逐项 SHA-256 与 HTTP 访问校验通过，原项目/剧本/分镜/素材/视频记录数不变。

验收文件：`local/camera-editor-live-verification.json`、`local/production-media-verification.json`；集成测试使用独立数据库与模拟媒体提供商，真实 DeepSeek 验收只调用文本接口。

### 分镜同步与资产卡片修复

静态页面已更新，刷新运镜工作台即可载入。分镜列表不再忽略初始化期间的点击，较早返回的数据不会覆盖最后选择。资产选择框改为正文左侧缩略图列表，提示词正文引用改为缩略图、名称和 ID 卡片。后端接口、工作流和数据库结构保持原有协议。

验收记录：`local/camera-editor-browser-verification.json`；切片提交回归：`local/camera-clips-mentions.log`。正式页面人工核验 S03 → S04 后列表、标题、原文和提示词对应 S04，图片缩略图加载成功，浏览器无脚本错误。

### 生成引导、恢复描述与显示控制

静态页面新增“生成前检查”、对应修复入口和“前往视频生成”快捷入口，明确展示生成按钮的禁用原因。新增“重置为原始分镜”，以及独立的运镜选择折叠和几何示意隐藏按钮。刷新页面生效，无需后端重启。

验收：浏览器回归、脚本语法和类型检查通过。正式 H3 多参考品质工作流在未选素材时显示缺少条件；勾选 S02 分镜图后提示就绪且生成按钮启用；未提交实际推理。


### 提示词引用自动绑定与工作流推荐（2026-09-23）

后端新增 `clipRecommend`，前端在准备提交前同步编号与旧版具名引用，自动填入兼容的已安装工作流、输入模式、时长、规格和声音选项。提示词和方案文案继续使用简体中文，手动参数可保留或一键恢复推荐。已构建并重启 `llmspace-toonflow.service`，刷新页面生效。

验证：67 项单元测试、切片集成、提示词编辑浏览器回归、原分镜方案保存、单个／批量提示词生成、语言约束集成均通过。正式页面 S02 自动绑定 3 项引用并选用 H3 多参考品质 25 步及 5 秒；S18 自动推荐 8 秒。记录：`local/camera-auto-link-live-verification.json`、`local/camera-auto-link-ui-verification.json`。没有提交新的媒体生成任务。

## 工作流节点截图与桌面入口（2026-09-23）

新增 `workflowDetails` 与 `workflowOpen` 接口。两者使用已启用的视频供应商目录校验工作流和模式；桌面入口还校验登录、本机来源、固定模板目录与来源摘要。打开动作串行执行，调用桌面文件选择器并核对文件路径及已加载标签页标题，不触发运行按钮。

预览文件位于 `data/web/workflow-previews/`，可导入文件位于 `/home/ubuntu/llmspace/avspace/manual/comfyui/default/workflows/Toonflow/`。导出脚本直接调用本机 H3 路由或 TRT 模板；截图脚本在真实 ComfyUI 前端加载 API 图，核对每个节点的编号、类型和数量后截图，不提交任务。

更新源工作流后按顺序执行：

```bash
/home/ubuntu/llmspace/comfyui/.venv/bin/python scripts/export-camera-workflows.py
node scripts/capture-camera-workflows.cjs
```

截图工具依赖本机 ComfyUI 8188、Chrome 和 Codex 运行环境中的 Playwright。占位素材为 `/home/ubuntu/llmspace/avspace/shared/input/toonflow/工作流预览占位.png`，已安装；新环境需先创建该占位图再导出。桌面入口适配当前 Ubuntu X11 会话及 Comfy Desktop 1.0.47，启动脚本为 `/home/ubuntu/llmspace/comfy-desktop/start.sh`。操作使用 `local/tools/xdotool/usr/bin/xdotool` 与 `local/tools/xclip/usr/bin/xclip`；本机发行版软件包已下载并解包于相应目录，保留原包供恢复。文件管理器使用系统 `gdbus`。若迁移机器或使用 Wayland，需要重新适配桌面入口。

验证：类型检查、67 项单元测试、切片集成及编辑器浏览器回归通过；16 份预览的节点数量、PNG 和 JSON 下载均核对成功，正式页面完成参数搜索、缩放、模式切换、窄屏显示、目录跳转和桌面打开。原业务数据与前次备份哈希一致，ComfyUI 队列保持为空。截图用于检查节点与配置，不代表已执行推理或验证成片质量。
