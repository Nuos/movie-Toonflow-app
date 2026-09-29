// The shipped UI is bundled. Keep this exact native-editor hook reproducible;
// fail before writing if an upstream build changes the component structure.
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../data/web/index.html');
let html = fs.readFileSync(file, 'utf8');
const editorAnchor = 'de("div",{class:"promptInput",onFocusout:L},[c(XKn,{modelValue:Ae(O).prompt';
const nativeSave = 'function L(){var V,q;const W=(V=g.value[r.value])==null?void 0:V.id;W!=null&&Jt.post("/production/workbench/updateVideoPrompt",{id:W,prompt:(q=O.value)==null?void 0:q.prompt})}';
const queuedSave = 'let toonflowCameraSaveQueue=Promise.resolve();function L(){var V,q;const W=(V=g.value[r.value])==null?void 0:V.id;if(W==null)return Promise.resolve();const toonflowCameraSaveBody={id:W,prompt:(q=O.value)==null?void 0:q.prompt};toonflowCameraSaveQueue=toonflowCameraSaveQueue.catch(()=>{}).then(()=>Jt.post("/production/workbench/updateVideoPrompt",toonflowCameraSaveBody));toonflowCameraSaveQueue.catch(()=>{});return toonflowCameraSaveQueue}';
const hook = 'de("toonflow-camera-video",{"project-id":Ae(t)?.id,"track-id":Ae(O).id,"prompt-state":Ae(O).state,onCameraOpen:toonflowEvent=>toonflowEvent.detail.connect({getContext:()=>({projectId:Number(Ae(t)?.id),trackId:Number(Ae(O)?.id),prompt:Ae(O)?.prompt??"",busy:Ae(O)?.state==="生成中"}),saveCurrent:()=>L(),applyPrompt:toonflowValue=>{const toonflowTrack=Ae(O);if(!toonflowTrack||Number(toonflowTrack.id)!==toonflowValue.trackId||Number(Ae(t)?.id)!==toonflowValue.projectId)return!1;toonflowTrack.prompt=toonflowValue.prompt;return!0}})},null,8,["project-id","track-id","prompt-state","onCameraOpen"]),';
const count = value => html.split(value).length - 1;
if (!html.includes(hook)) {
  if (count(editorAnchor) !== 1) throw Error('视频提示词入口位置已改变，请更新运镜安装脚本');
  html = html.replace(editorAnchor, hook + editorAnchor);
} else if (count(hook) !== 1) throw Error('运镜入口重复，停止安装');
if (!html.includes(queuedSave)) {
  if (count(nativeSave) !== 1) throw Error('视频提示词保存函数已改变，请更新运镜安装脚本');
  html = html.replace(nativeSave, queuedSave);
} else if (count(queuedSave) !== 1) throw Error('运镜保存队列重复，停止安装');
const tags = ['camera-studio-entry.js', 'camera-video-controls.js'].map(name => {
  if (!fs.existsSync(path.join(__dirname, '../data/web', name))) throw Error(`缺少运镜脚本：${name}`);
  return `<script src="/${name}"></script>`;
});
for (const tag of tags) {
  if (count(tag) > 1) throw Error('运镜脚本被重复加载');
  html = html.replace(tag, '');
}
const bodyEnd = html.lastIndexOf('</body>');
if (bodyEnd < 0) throw Error('找不到页面结束标签');
html = html.slice(0, bodyEnd) + tags.join('') + html.slice(bodyEnd);
fs.writeFileSync(file, html);
console.log('原生视频提示词运镜入口已安装');
