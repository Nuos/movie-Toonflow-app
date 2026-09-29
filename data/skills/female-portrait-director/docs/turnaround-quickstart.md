# 通用人物四视图 V2

从简述与设置生成结构化提示词，由 Codex 内置图像工具继续出图。原技能ID保留，仓库仍是技能包，不是独立网页服务。

## 当前默认

- 中国古风／修仙玄幻服饰：丝绸、缎面、织锦、刺绣、玉饰、金银配件；禁止粗麻布、暗灰主色和灰暗工装。
- 女性身高≥170cm，男性≥185cm；默认高挑、修长或匀称，避免矮胖粗短。所有年龄、肤色、族裔及性别可设置，年龄特征保留。
- 横向16:9；头像特写约28%，随后正面、90°侧面、背面三个全身。
- 两档：默认2K（2048×1152）；可选1080p（1920×1080）。实际文件按所选档次验收。
- 基础信息默认关闭。可选开启“角色名｜年龄｜身高｜头身比”，底部独立留白，不覆盖人物。

## 调用

在 Codex 中读取本仓库 `SKILL.md` 后执行：

```text
一位174cm的东亚女修士，面相骨相明确，月白青玉丝绸法衣。
先生成结构化提示词，再生成四视图定妆照。不显示基础信息。
```

本机仓库路径中 `aigc-space ` 带尾随空格，命令行进入目录时用引号。

```bash
python3 scripts/turnaround.py presets
python3 scripts/turnaround.py prepare --name '许澄' --preset east-asian-young-woman --brief '按预设设计高挑东亚女修士，骨相与五官清楚，不套用通用美颜脸' --output outputs/xucheng
```

可选参数：

- `--quality 2k` 或 `--quality 1080p`：优先于设置文件的 `quality`。
- `--settings settings.json`：覆盖所选预设字段；简述与预设冲突时，按用户明确要求先更新设置。
- `--show-info`：开启基础信息；设置文件也可使用 `"show_info": true`。
- `--cast cast.json`：已有角色资产的JSON数组，逐个比较至少四轴差异，必须含脸部与身体。
- `--content character.json`：离线编译已有角色内容，仍校验身高与差异结构。
- `--model`：默认deepseek-flash，先验证官方模型列表，不自动降级。

设置支持模板、侧面方向、头像占比，以及年龄、性别、肤色、族裔、种族、身高、头身比、骨相、五官、体型、发型、服装、配饰、姿态、风格、背景和备注。字段名见脚本 `FIELDS`。身高为带单位字符串，如 `"185cm"`；头身比为 `"7.8头身"`。

## 产物与生成

保存 `character.json`、`asset.json`、`cast-comparison.json`、`prompt.txt`、`negative.txt`、`generation-request.json`。输出目录必须为空，保留旧版本。准备阶段仅调用DeepSeek文本API，不识别图片、不自行出图。

代理读取请求的prompt，再调用内置 `image_gen`。参考图片须先查看，并明确身份、服装、布局、风格角色。出图后保存原图、核对可见结果并运行：

```bash
python3 -m pip install -r requirements.txt
python3 scripts/turnaround.py verify-image outputs/xucheng/sheet.png
python3 -m unittest discover -s tests -v
```

密钥仅读取 `~/.config/llm/deepseek.env`，只发送至DeepSeek官方HTTPS地址，不进入产物。文本结构失败最多自动修正一次。像素检查不会自动放大图片，也不等于视觉验收。

## 模板与审计

- [可复制人物模板](../skill/turnaround/prompt-template.md)
- [东方面孔设计](../skill/turnaround/east-asian-design.md)
- [参考素材审计](reference-audit.md)

旧植物学家、矮壮周岩和灰暗服饰示例已标记为历史版本，不代表当前规则。内置工具实测原图1672×941，2K验收未通过；用户选择保留内置出图、优先完成模板和项目功能，不静默切换后端。

编辑源为仓库根目录。执行 `python3 scripts/sync_skill.py` 同步 `skills/female-portrait-director/` 分发包。若未注册技能，可直接让Codex读取完整路径下的SKILL.md；本次未改动全局技能注册。

保留已有风格：原有20条风格路线与气质叠加文件保持可用，不因新增默认而删除。选择旧风格时保留其适用的色彩、材质或摄影语言，但四视图模式仍使用固定版式和当前身高体型约束；粗麻布与暗灰主色禁用。单张写真仍通过原有模式调用。

## 从准备到交付的完整操作

1. 准备：`prepare --brief '角色描述' --quality 1080p --output outputs/角色名`。默认2K，已有风格保持可选。角色JSON、八轴差异档案和cast输入均保存；跨角色验证仍需提供`--cast`。
2. 有图像工具时，由Codex读取`generation-request.json`中的prompt调用内置工具。工具不可用或暂不测试时，保存为待出图：

```bash
python3 scripts/turnaround.py defer --output outputs/角色名 --reason '保留内置出图，当前暂不测试'
python3 scripts/turnaround.py status --output outputs/角色名
```

3. 恢复时沿用角色内容，不调用文本API；可切换画质，但不会自动换后端或放大小图：

```bash
python3 scripts/turnaround.py resume --output outputs/角色名 --quality 1080p
```

4. Codex按更新后的请求出图。得到原图后登记，自动保留独立图片版本、档次、真实尺寸和状态：

```bash
python3 scripts/turnaround.py record-image --output outputs/角色名 --image /absolute/path/generated.png
```

5. 实际看图后填写输出目录的`review-checklist.json`，再记录验收：

```bash
python3 scripts/turnaround.py review --output outputs/角色名 --checklist outputs/角色名/review-checklist.json
```

`checks`七项：four_views（头像+三全身）、identity_and_costume（同人同衣）、angles_and_sides（90°/180°与配饰左右）、full_body_uncropped（头脚完整）、body_and_age（高挑且保留年龄）、cast_distinction（与已有角色明显区分）、optional_caption（按开关显示且信息正确）。每项填true/false，notes记录实际依据；无已有角色或关闭文字时注明适用情况。默认全为false，禁止未经看图批量通过。

像素与视觉均通过才为`accepted`；否则为`resolution_unmet`或`visual_review_failed`，修正后resume再出图。历次图片与验收记录保存在attempts中。当前工具可延期，不要求出图测试作为模板交付前提；未出图的任务保留`deferred`，不能标成已交付图像。CLI负责准备、归档和验收记录，宿主Codex负责实际内置工具调用。

仅单独检查文件尺寸时：`verify-image /absolute/path/image.png --quality 1080p`。该命令不写资产状态，也不代表人工视觉验收。
