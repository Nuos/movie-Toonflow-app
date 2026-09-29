// This checkout ships a bundled frontend only. Keep the small render hook
// reproducible and fail closed if an upstream bundle changes its structure.
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../data/web/index.html');
let html = fs.readFileSync(file, 'utf8');
const anchor = 'c(Be,{label:pe.$t("workbench.cornerScape.assetsAudioLabel")}';
const oldHook = 'Ae(P).type==="role"?de("toonflow-character-voice",{"asset-id":Ae(P).assetsId,"project-id":Ae(r)?.id},null,8,["asset-id","project-id"]):Pt("",!0),';
const hook = '["role","scene","tool"].includes(Ae(P).type)?de("toonflow-character-voice",{"asset-id":Ae(P).assetsId,"project-id":Ae(r)?.id,"asset-type":Ae(P).type},null,8,["asset-id","project-id","asset-type"]):Pt("",!0),';
html = html.replace(oldHook, hook);
if (!html.includes(hook)) {
  if (html.split(anchor).length !== 2) throw new Error('角色声线入口位置已改变，请更新前端安装脚本');
  html = html.replace(anchor, hook + anchor);
}
const tag = '<script src="/character-voices.js"></script>';
const libraryTag = '<script src="/sound-library-entry.js"></script>';
html = html.replace(libraryTag, '');
if (html.split(tag).length > 2) throw new Error('声线脚本被重复加载');
html = html.replace(tag, '');
// Earlier occurrences can be string literals inside the bundled JS.
const bodyEnd = html.lastIndexOf('</body>');
if (bodyEnd < 0) throw new Error('找不到页面结束标签');
html = html.slice(0, bodyEnd) + tag + libraryTag + html.slice(bodyEnd);
fs.writeFileSync(file, html);
console.log('角色默认声线入口已安装');
