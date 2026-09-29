import { tool, jsonSchema } from 'ai';
import { z } from 'zod';
import { db } from './db';
import { portraitDocument, getPortrait, savePortrait, portraitPatch, patchPortrait } from './characterPortrait';

export function characterPortraitTools(projectId: number, signal?: AbortSignal) {
  const schema = z.object({ assetId: z.number().int().positive(), expectedRevision: z.number().int().min(0), document: portraitDocument, seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional() }).strict();
  const patchSchema=z.object({assetId:z.number().int().positive(),expectedRevision:z.number().int().positive(),patches:z.array(portraitPatch).min(1).max(40)}).strict();
  return {
    patch_character_portrait: tool({
      description:'精确修改已保存角色的指定字段。先读取当前版本。仅提交指定路径（如 character/negative、character/fingerprint/palette、character/sections/服装、settings/quality）及新值；op=set替换该字段，op=append仅追加value原文，追加时不要复制原文。未列出的字段由服务端原样保留，固定种子不变。若数值在明确设置和章节重复出现，须同步修改对应路径。不生成图片。',
      inputSchema:jsonSchema<z.infer<typeof patchSchema>>(patchSchema.toJSONSchema()),
      execute:async raw=>{signal?.throwIfAborted();try{const t=patchSchema.parse(raw);return {success:true,...await patchPortrait(projectId,t.assetId,t.expectedRevision,t.patches),generatesMedia:false};}catch(e:any){return {success:false,message:e.message};}},
    }),
    get_character_portraits: tool({
      description: '读取当前项目角色定妆模板和历史身份锚点。写定妆提示词前先读取；只编写七章节、八轴指纹、年龄性别、补全与负向词，布局由程序固定编译为头像加三全身。不要用自由文本代替 save_character_portrait。',
      inputSchema: jsonSchema(z.object({}).toJSONSchema()),
      execute: async () => {
        signal?.throwIfAborted();
        const assets = await db('o_assets').where({projectId, type:'role'}).whereNull('archivedAt').select('id','name','describe');
        const rows = [];
        for (const asset of assets) rows.push({...asset, document: await getPortrait(projectId, asset.id)});
        return { roles: rows, template: portraitDocument.toJSONSchema(), settings: {template:'xianxia',quality:'2k',side:'left',portrait_fraction:0.28,show_info:false},
          sections:['人物身份与面部','体型与比例','肤色与皮肤质感','头发与妆容','服装','配饰、道具与鞋履','气质与风格控制'],
          rules:'简体中文；女性≥170cm，男性≥185cm；高挑修长或匀称。默认丝绸缎面织锦古风修仙服饰，禁粗麻布和暗灰主色。确定可见特征，七章节不写布局。明确设定优先，冲突报错。保存不出图。修改时先读取完整document，只改指定字段，其余字段及seed保持原样。已有角色cast逐个比较至少四轴且含面部与身体，创作补全记入assumptions。' };
      },
    }),
    save_character_portrait: tool({
      description: '把Agent编写的人物角色JSON按同一模板校验、编译并保存版本。必须先读取当前角色，使用真实资产ID和expectedRevision（初次0）。保留未要求修改的字段。不调用图像生成。',
      inputSchema: jsonSchema<z.infer<typeof schema>>(schema.toJSONSchema()),
      execute: async raw => {
        signal?.throwIfAborted();
        try { const t = schema.parse(raw); return { success:true, ...await savePortrait(projectId, t.assetId, t.document, t.expectedRevision, t.seed), generatesMedia:false }; }
        catch (e: any) { return {success:false, message:e.message}; }
      },
    }),
  };
}
