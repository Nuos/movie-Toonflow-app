// Add five narrowly scoped review controls without replacing the native editor/save workflow.
// Upstream bundle drift must fail before any write. Re-running this installer is idempotent.
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../data/web/index.html');
let html = fs.readFileSync(file, 'utf8');
const hooks = [];
function add(anchor, { id, render = 'de', owner, field, kind, label, context, enabled = '!0', storyboardId, wrap = false }) {
  const source = `String(${owner}.${field}??"")`;
  const hook = `${render}("toonflow-prompt-ai",{"entry-id":"${id}",kind:"${kind}",label:"${label}",onPromptAssist:toonflowEvent=>toonflowEvent.detail.connect({getContext:()=>({owner:${owner},source:${source},context:${context},enabled:${enabled}${storyboardId ? `,storyboardId:${storyboardId}` : ""}}),applyPrompt:(toonflowValue,toonflowOriginal)=>{if(${owner}!==toonflowOriginal.owner||${source}!==toonflowOriginal.source||!(${enabled}))return!1;${owner}.${field}=toonflowValue;return!0}})}${render === 'de' ? ',null,8,["onPromptAssist"]' : ''})`;
  const replacement = wrap ? `de("div",{style:{width:"100%","min-width":"0"}},[${anchor},${hook}])` : `${anchor},${hook}`;
  hooks.push({ id, anchor, hook, replacement });
}
add('c(A,{modelValue:r.formData.describe,"onUpdate:modelValue":f[1]||(f[1]=p=>r.formData.describe=p),placeholder:h.$t("workbench.assets.add.describePh")},null,8,["modelValue","placeholder"])', {
  id:'asset-description',owner:'r.formData',field:'describe',kind:'storyboard',label:'素材描述',enabled:'o.value',wrap:true,
  context:'["只描述当前素材，不新增故事事件。",`素材名称：${r.formData.name??""}`,`素材类型：${r.type??""}`,r.formData.remark??""].filter(Boolean).join("\\n")',
});
add('c(A,{modelValue:r.formData.prompt,"onUpdate:modelValue":f[3]||(f[3]=p=>r.formData.prompt=p),autosize:{minRows:3,maxRows:5},placeholder:h.$t("workbench.assets.add.promptPh")},null,8,["modelValue","placeholder"])', {
  id:'asset-image-prompt',owner:'r.formData',field:'prompt',kind:'image',label:'素材图像提示词',enabled:'o.value',wrap:true,
  context:'[`素材名称：${r.formData.name??""}`,`素材类型：${r.type??""}`,r.formData.describe??"",r.formData.remark??""].filter(Boolean).join("\\n")',
});
add('de("div",REs,[c(XKn,{modelValue:e.data.prompt,"onUpdate:modelValue":x[1]||(x[1]=z=>e.data.prompt=z),references:Ae(k),placeholder:C.$t("workbench.production.editImage.promptPlaceholder")},null,8,["modelValue","references","placeholder"])])', {
  id:'generated-image-prompt',owner:'e.data',field:'prompt',kind:'image',label:'自定义图像提示词',enabled:'!Ae(d)',
  context:'"针对当前图像节点编写静态画面提示词；保留原文中的素材引用标记，不新增或改名。"',
});
add('Sn(FA,{value:T.prompt,placeholder:$t("workbench.production.node.storyboard.promptPlaceholder"),autosize:{minRows:3,maxRows:6},"onUpdate:value":P=>T.prompt=P})', {
  id:'storyboard-image-prompt',storyboardId:'B.id',render:'Sn',owner:'T',field:'prompt',kind:'image',label:'分镜图提示词',
  context:'["为当前分镜编写静态画面提示词，保留人物与情节。",T.videoDesc??""].filter(Boolean).join("\\n")',
});
add('Sn(FA,{value:T.videoDesc,placeholder:$t("workbench.production.node.storyboard.videoDescPlaceholder"),autosize:{minRows:3,maxRows:6},"onUpdate:value":P=>T.videoDesc=P})', {
  id:'storyboard-description',render:'Sn',owner:'T',field:'videoDesc',kind:'storyboard',label:'分镜描述',
  context:'["描述当前分镜的情节、原台词与主体动作，不新增事件。",T.prompt??""].filter(Boolean).join("\\n")',
});
for (const { id, anchor, hook, replacement } of hooks) {
  const count = value => html.split(value).length - 1;
  if (count(hook) === 1) continue;
  if (id === 'storyboard-image-prompt') {
    const oldHook = hook.replace(',storyboardId:B.id', '');
    if (count(oldHook) === 1) { html = html.replace(oldHook, hook); continue; }
  }
  if (count(hook) > 1 || html.includes(`"entry-id":"${id}"`)) throw Error(`AI 入口重复或结构已改变：${id}`);
  if (count(anchor) !== 1) throw Error(`原生提示词入口已改变，请更新安装脚本：${id}`);
  html = html.replace(anchor, replacement);
}
const tag = '<script src="/prompt-ai-controls.js"></script>';
if (!fs.existsSync(path.join(__dirname, '../data/web/prompt-ai-controls.js'))) throw Error('缺少 AI 控件脚本');
if (html.split(tag).length > 2) throw Error('AI 控件脚本重复加载');
html = html.replace(tag, '');
const bodyEnd = html.lastIndexOf('</body>');
if (bodyEnd < 0) throw Error('找不到页面结束标签');
html = html.slice(0, bodyEnd) + tag + html.slice(bodyEnd);
fs.writeFileSync(file, html);
console.log('已安装 5 个原生 AI 简体中文预览入口');
