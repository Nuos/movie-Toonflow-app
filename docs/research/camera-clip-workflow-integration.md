# 运镜视频切片：现有工作流接入调查

本次只读取源码、SQLite 配置、ComfyUI `/object_info` 与桥接 `/health`，没有提交图片或视频任务、下载模型或修改工作流。能力描述代表现有目录及输入校验，不代表所有组合都已成功渲染。

## 可复用的真实目录

后端目录应从 `o_vendorConfig.enable = 1` 开始，逐个调用 `u.vendor.getModelList(id)`，再筛选 `type === "video"`。此函数合并 `data/vendor/<id>.ts` 的内置模型与 DB `models`，同名模型以 DB 配置覆盖；不要直接复制一份静态支持列表。

目前只读 DB 确认启用供应商是 `deepseek`、`comfyui-h3`；`comfyui-jiangxue` 为禁用状态，自定义模型数组为空。桥接 `/health.models` 含 8 个视频 profile 和 2 个图像 profile。新功能只显示已启用本地 ComfyUI 供应商的真实视频条目；对当前桥接再与 health 的模型键取交集，避免把一个任意添加的自定义名字当作可执行工作流。

可复用原生接口：

- `POST /api/modelSelect/getModelList {type:"video"}`：按启用供应商列出 `{id,label,value,type,name}`。
- `POST /api/modelSelect/getModelDetail {modelId:"vendor:model"}`：取得 `mode/audio/durationResolutionMap` 等完整模型定义。它自身不检查启用状态，提交生成时仍须再次校验。
- `getImageAndVideoModel` 只列名称和提示词模板绑定，不包含完整能力约束。

当前 `comfyui-h3` 的真实视频条目如下。所有条目的目录时长为 **5、8、10 秒**，分辨率为 **768p、preview**，音频为 `optional`。

| modelName | 实际桥接 scene / workflow | 模式 |
|---|---|---|
| h3-quality | router `quality`，FL2VA int8，25 步 | text / singleImage / startEndRequired |
| h3-reference-quality | router `reference_fidelity`，Ref2VA int8，25 步，参考尺寸 max | 多参考 |
| h3-fast-sol | router `fast_sol`，FL2VA int8 + Turbo 8 步 + SolAttnPatch | text / singleImage / startEndRequired |
| h3-reference-trt | `media_profiles.build_trt_reference`，Ref2VA Turbo 4 步 + TensorRT VAE | 多参考 |
| h3-turbo | router `fast`，FL2VA int8 + Turbo 8 步 | text / singleImage / startEndRequired |
| h3-standard | router `standard`，FL2VA int8，20 步 | text / singleImage / startEndRequired |
| h3-reference-turbo | router `reference_fast`，Ref2VA int8 + Turbo 4 步，参考尺寸 match | 多参考 |
| h3-reference | router `reference`，Ref2VA int8，20 步，参考尺寸 match | 多参考 |

多参考目录值为 `[["imageReference:9","videoReference:3","audioReference:3"]]`，提交选择项时传内层数组，不是二维数组或字符串 `reference`。目录不提供自动 fallback；不要因失败静默换 profile、删除参考或降级为文生视频。

工作流实际来源：

- `/home/ubuntu/llmspace/avspace/codex/workflows/h3_router.py`：`SCENES` 与 `build`；大部分视频基于同目录 `native_768p_api.json`。
- `/home/ubuntu/llmspace/ComfyUI工作流/projects/ComfyUI-MiniMaxH3-Easy/workspace/workflows/unified-generation/workspace/specifications/tensorrt-vae-1344-4sec/workflow.api.json`：TRT profile。
- `local/media_profiles.py`：将用户参数绑定到已存在 TRT 图，不导入任意用户工作流。

两份基础图本次均存在；只读 `object_info` 检查未发现其节点类或直接绑定权重缺失；SolAttnPatch、MiniMaxH3ReferenceToVideo、MiniMaxH3TRTVAELoader 均已注册。这不等于 GPU 推理或所有分辨率、时长组合的成功保证。

## 输入约束必须取交集

UI 使用当前 provider 的 `mode` 与 `durationResolutionMap`。服务端同时遵守桥接约束；桥接接受更宽的 `4..15` 秒范围不能被用来擅自扩展 provider 当前公布的 5/8/10 秒选项。

- `text`：恰好 0 张图片，不能带视频或音频参考。
- `singleImage`：恰好 1 张图片，不能带其他参考。
- `startEndRequired`：恰好 2 张图片，顺序为首帧、尾帧；不能复制同一张图假装补齐尾帧。
- Ref2VA：至少有 1 张图片或 1 段视频；仅音频不成立。每类上限为 9 图片、3 视频、3 音频，**总数最多 12**，不是 15。
- 参考视频和音频须为 `2..15.1` 秒；视频被路由转换为 24fps。TRT 分支直接使用 media loader，桥接基础计数仍一致，但独立音频时长并未走标准 router 的同一检查；新切片服务可统一预检，不应声称所有输入都由桥接完成同等校验。
- `referenceList` 的每项为 `{type:"image"|"video"|"audio",base64:"data:<mime>;base64,..."}`；不是任意远程 URL。
- 桥接 MIME 允许 png/jpeg/webp、mp4、mpeg/wav/x-wav/flac/mp4 音频；每项解码后非空且最多 60 MiB；整个 HTTP JSON body 最多 95 MiB。
- 提示词为非空文本，最多 40000 字符。不要向前端泄漏 data URI 或供应商 `inputValues`。
- `aspectRatio` 只支持 `16:9` / `9:16`。preview 实际为 608×352，768p 为 1344×768；竖屏交换宽高。
- 24fps，帧数 `ceil(duration*24)` 再向上对齐 `17k+5`。5 秒请求为 124 帧，约 5.17 秒；8 秒为 192 帧；10 秒为 243 帧，约 10.125 秒。记录 requestedDuration 与实际 frames/fps，不把输入档位当成精确输出时长。
- `audio:false` 关闭输出 MP4 的音频连接，H3 仍联合采样；不等于独立 TTS 或跳过音频计算。
- 桥接接受 `seed` 非负安全整数；未指定时生成随机种子。可预先保存 seed 便于对照，但不承诺跨工作流确定性。

## 原有 `u.Ai.Video` 的可复用边界

`u.Ai.Video("comfyui-h3:h3-quality").run(input,taskRecord).save(relativePath)` 已负责供应商解析、参考格式兼容、轮询、下载及 OSS 保存。输入可额外传稳定 `request_id` 与 `seed`，H3 adapter 会保留这些值；无需修改 vendor 或 Comfy 工作流。类型定义的 `VideoConfig.mode` 目前写成 `VideoMode[]`，与运行时原生路由传单字符串或参考数组不完全一致，应以当前实际 runtime 契约为准。

但它不是完整的切片任务管理 API：

- `AiVideo` 没有 `checkReady`，也不自行校验 vendor 是否启用、mode、时长、分辨率或参考数量。必须先用 catalog 校验；不要仅凭传入 model 字符串执行。
- `.run()` 只返回最终 Promise，没有进度回调、可持久化的 provider job handle 或取消接口。
- `withTaskRecord` 在 `.run()` 成功时就把 `o_tasks` 标记完成，随后 `.save()` 才写文件；保存失败时这个公共任务记录可能已显示完成。切片表应以最终文件落盘为完成条件。
- URL 输出通过 axios 整体读入，再转 base64 放入内存；没有显式下载大小上限。大视频可由专门 clip 服务流式保存。
- `src/lib/fixDB.ts` 重启时将 `o_video.state=生成中` 全部改为失败；不是 provider 状态恢复。`o_tasks` 也没有视频作业自动续接逻辑。
- 原生 `generateVideo` 会向 `o_video` 写入与 track 关联的记录；`selectVideo` 会改变 `o_videoTrack.videoId`。独立运镜切片不能调用这两个动作来冒充隔离的测试结果。

建议独立 `o_cameraClip` 或等效记录，包含 project/storyboard、计划 revision/variant、原始来源 hash、实际 prompt/ref hashes、catalog model/mode/resolution/duration、seed/request UUID、provider promptId、状态、输出路径、错误。保存切片不会改动 `o_storyboard`、`o_videoTrack.prompt/videoId` 或原视频版本；采用结果应是另一个明确操作。

## 桥接任务状态与恢复

桥接固定为 `http://127.0.0.1:10589`，ComfyUI 固定为 `http://127.0.0.1:8188`。

| 接口 | 行为 |
|---|---|
| GET /health | 返回 bridge 模型映射及 ComfyUI running/pending 数量；不验证所有模型权重 |
| POST /jobs | 后端 JSON 请求，拒绝带 Origin；提交一次 ComfyUI prompt，返回 202 job |
| GET /jobs/:uuid | 查询 job + Comfy history，必要时把结果落到 bridge runs 目录并返回状态 |
| GET /jobs/:uuid/output | 已有输出文件；当前没有 Range 处理 |

`request_id` 必须 UUID。桥接将其直接用作 job ID；`request_hash` 是完整请求 JSON 排序后的 SHA256。同 UUID+同请求返回已存 job，不会再次提交；同 UUID+不同请求报错。应在提交前持久化 UUID、seed 与请求快照，不能为超时自动新建 UUID。

实际状态为 `submitting → queued → success|error`，另有 `submission_uncertain`。**没有 running、cancelled 状态**；渲染中仍可能显示 queued。`success` 含 output_url、output_bytes、output_name、width/height/frames/fps、完成时间；queued 含 prompt_id。

桥接 `local/runs/<UUID>/job.json` 和 `workflow-api.json` 持久化，可在 Toonflow 重启后通过已存 UUID 继续查询。限制：

- 提交超时或未知网络结果进入 `submission_uncertain`，不会自动重新寻找 Comfy prompt；必须保留“结果未知”状态，避免重复生成。
- 若进程在 submitting 与 prompt_id 落盘之间中断，GET 可能因无 prompt_id 返回 502。不能据此判定没有生成。
- Comfy 队列被删除、Comfy 重启丢失历史等情形可能使记录永久 queued；桥接没有恢复超时与队列消失状态。
- GET job_status 并非纯读：发现完成结果会从 `/view` 下载并写入 runs，再置 success；调查期间未调用此接口。

## 取消边界

桥接没有 cancel endpoint；Toonflow 的 `assetsGenerate/cancelGenerate` 只把图片 DB 状态改失败，不中断后端，不可复用作视频取消。

本机当前 ComfyUI `server.py` 实现精确接口：

- 待执行：`POST /queue {delete:[ownedPromptId]}`。
- 执行中：`POST /interrupt {prompt_id:ownedPromptId}`；只有该 ID 在当前 running 队列时才中断。

必须先从本切片已存桥接 job 获取 prompt_id，检查所有权和当前队列。不要调用无 prompt_id 的 `/interrupt` 或 `{clear:true}`，这会影响原有项目或其他工作流。取消请求不等于取消完成：running job 可能已完成，pending 删除后桥接也不会自动产生 cancelled 状态。新服务需记录本地 cancelRequested 并查询结果后收敛状态，不能让轮询覆盖用户取消意图。

## 输出路径与下载

Comfy 输出目录由当前服务启动参数指定为 `/home/ubuntu/llmspace/avspace/shared/output`，文件前缀为 `toonflow/<UUID>/video` 或 `h3-trt-reference`。桥接另存 `local/runs/<UUID>/output.mp4`；Toonflow 的最终素材根目录为 `data/oss`。

新服务可固定写 `/PROJECT_ID/camera-clips/UUID.mp4`，通过 `u.oss.getFileUrl()` 获得网页 URL。保存时先写同目录临时文件，再校验非空/容器后原子改名；失败不得标记 ready。

从桥接下载时根据自有 UUID 构造固定 `http://127.0.0.1:10589/jobs/UUID/output`，不使用客户端提交的下载地址，也不盲信 provider 任意 output_url；禁止重定向到其他主机。下载设置超时、字节上限，并核对 output_name、output_bytes 与实际数据。只在 success 后暴露可播放 URL。现有 `/oss` 静态中间件配置 `acceptRanges:false`，新切片若需流畅拖动进度，应另设有范围请求支持的只读文件接口，而不是改变原素材服务。

## 原页面兼容回归准备

- 原 native 视频提示词入口仍可打开、保存、回填；单个/批量提示词生成行为保持。
- showcase 自有按钮管理自身 disabled，不能被 `camera-studio.js` 的全页 setBusy 解除；展示、准备、刷新不会自动调用 media API。
- 仅显式“生成/重试”按钮提交媒体任务；提交前再次检查项目来源、方案 revision、已存准备用请求 hash。
- 新切片完成、失败、取消、删除都不改变原 `o_videoTrack` 的 prompt/videoId/duration，也不改变原分镜和普通视频记录。
- 用隔离 DB + fake provider 验证多用户/项目、重复请求、来源变更、重启恢复、取消竞态和失败下载；真实媒体生成需主线明确执行，不在本调查中进行。

源码依据：`src/utils/vendor.ts`、`src/utils/ai.ts`、`src/utils/taskRecord.ts`、`src/utils/oss.ts`、`src/lib/fixDB.ts`、`data/vendor/comfyui-h3.ts`、`local/bridge.py`、`local/media_profiles.py`、上述 H3 router 与本机 ComfyUI `server.py`。
