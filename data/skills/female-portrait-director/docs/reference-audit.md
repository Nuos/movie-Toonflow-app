# 本地参考素材适配审计

范围：用户指定目录内十个与本项目相关的样本（第一轮六个，服饰追加四个）。已读取正文，不仅查看README；不是整个目录的全面审计。原目录只读，未运行其中命令或安装第三方技能。

证据等级：本地存档内容证明作者写过相关方法，不证明模型效果或版本宣传正确。此次只进行静态内容适配审查；未重新联网核实所有外链、未审核对应完整上游技能实现，也未对各示例做重生成实验。

| 本地来源 | SHA-256 | 取舍 |
|---|---|---|
| [01-镜头-camera-01/01-镜头-camera-01.md](</home/ubuntu/workspace/project/github/ai-modulecm/docs/ref/ai-creation/01-镜头-camera-01/01-镜头-camera-01.md>) | `55cde30dd0ea48ea6717bd0830f7c88987e2d1bc24715f7d596668867cc066e1` | 360°环绕仅为运动镜头示例；静态定妆不采用，不将一行宣传当质量保证。 |
| [00-人物-光影/00-人物-光影.md](</home/ubuntu/workspace/project/github/ai-modulecm/docs/ref/ai-creation/00-人物-光影/00-人物-光影.md>) | `5f52cd004767a96559cd9d6cb91bc0c6ff23e03e0d14fa6f09587ce8d23bb5f2` | 吸收丝绸、织锦、金属的材质分述和暗部层次；排除默认年轻白皙女性、回眸、竖幅、浅景深以及8K标签即真分辨率的误解。 |
| [prompt/南鸢-nuyoah-nanyuan0412/人像角色设定师Skill-2098245691542061090/article.html](</home/ubuntu/workspace/project/github/ai-modulecm/docs/ref/ai-creation/prompt/南鸢-nuyoah-nanyuan0412/人像角色设定师Skill-2098245691542061090/article.html>) | `9693ac74c5a17575791f31ca03396451c3f21f724895fbc61bd4b42e4facc62e` | 吸收骨相关系、妆容与脸分离、同气质可不同脸、身份与妆容参考分工；不执行安装指令，不继承女性年龄限制，不将作者对模型版本的描述当已核实事实。 |
| [prompt/周防義経-y_suou/衣装系列提示词-2097884125130863101/post.html](</home/ubuntu/workspace/project/github/ai-modulecm/docs/ref/ai-creation/prompt/周防義経-y_suou/衣装系列提示词-2097884125130863101/post.html>) | `7d4ad00adb602b42e65fd8cb6022f241e4b936a1ba6aec161fc6998283fb0b7c` | 只吸收服装裁剪、缝线、带体连接、材质与配色的描述方法；不复制成人内衣主题进通用或儿童预设。 |
| [prompt/鄭鈞霆-zhngwibn284976/古装梦-分行拆词提示词格式-2061981758057566221/article.html](</home/ubuntu/workspace/project/github/ai-modulecm/docs/ref/ai-creation/prompt/鄭鈞霆-zhngwibn284976/古装梦-分行拆词提示词格式-2061981758057566221/article.html>) | `2a2b40691f5d6a522281bb3e91cce26bfdac34f77987930f85c3cf230a2eaa59` | 吸收分模块便于独立修改；其关于减少审核误判的因果解释未经控制实验，本项目不采纳为事实或规避策略。 |
| [prompt/古一-MANISH1027512/AI摄影师-2095347397509652954/article.html](</home/ubuntu/workspace/project/github/ai-modulecm/docs/ref/ai-creation/prompt/古一-MANISH1027512/AI摄影师-2095347397509652954/article.html>) | `5fb80b7b126de6da9845a1f1781fa200b82d9c768c154c61826f505601996769` | 吸收有边界的变量库；排除抓拍遮挡、广角畸变、随机景别、瞬间动作和强浅景深，避免破坏定妆可读性。 |

落地点：`skill/turnaround/east-asian-design.md`、`east-asian-presets.json`、`prompt-template.md` 与 `scripts/turnaround.py`。均为方法提炼和重新编写；未复制外部完整提示词或图片作为项目分发素材。

采用的摄影边界：固定中性背景、低畸变、平机位、柔光补光、全身可辨。运镜仅属于未来动态展示，不进入四视图出图指令。

## 中国古风服饰追加审阅

- [00-人物-古装-提示词/00-人物-古装-提示词.md](</home/ubuntu/workspace/project/github/ai-modulecm/docs/ref/ai-creation/00-人物-古装-提示词/00-人物-古装-提示词.md>)；SHA-256 `8f6ebcd9ba0dbed1cb8e623f8daa6633bc5456ad6374db5332e93f2eb6f2c1d7`。采用金属厚度、镂空云纹花叶、丝缎织物、玉石珠宝与固定连接的细节描写；重新设计完整覆盖法衣，排除露背与三分之二侧背姿态。
- [00-人物-古装-提示词/00-人物-古装-提示词-02.md](</home/ubuntu/workspace/project/github/ai-modulecm/docs/ref/ai-creation/00-人物-古装-提示词/00-人物-古装-提示词-02.md>)；SHA-256 `bdea573563d4d40374f025423bd1110aaee70cde30df1c9b23fbfab3f7a2bdf4`。仅采用珍珠与缎面的分材质高光、配件重力；此例是欧式服装，不作为中国古风版型来源。
- [00-人物-光影-国风/00-人物-光影-国风.md](</home/ubuntu/workspace/project/github/ai-modulecm/docs/ref/ai-creation/00-人物-光影-国风/00-人物-光影-国风.md>)；SHA-256 `dfc6a8ece91e32c7cacc04ef978f1147c374a59cc7136b15282be30098b8b7f5`。采用内外层衣料、广袖、发簪与丝绸层次；服装配色改为明净天青月白，排除灰暗调、环境道具、俯拍和浅景深。
- [00-人物-提示词-古典/00-人物-提示词-古典.md](</home/ubuntu/workspace/project/github/ai-modulecm/docs/ref/ai-creation/00-人物-提示词-古典/00-人物-提示词-古典.md>)；SHA-256 `dc7f761cff122c576afee011b8a1a2fe4dd8b71cdc26dc04f208a53569459147`。此例为希腊主题，不纳入中国修仙默认；只确认不能因同属古典就混用文化装饰。
