// 固定项目界面语言。只改已核验的语言选择及初始化锚点，不改第三方程序代码。
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../data/web/index.html');
let html = fs.readFileSync(file, 'utf8');
const option = 'Tpe=[{label:"简体中文",tips:"简体中文",value:"zh-CN"}]';
if (!html.includes(option)) {
  const matches = [...html.matchAll(/Tpe=\[\{label:"简体中文"[^\n]*?\],EF=Spe\("locale","zh-CN"\)/g)];
  if (matches.length !== 1) throw Error('语言选择入口已改变，请先检查新版本页面');
  html = html.replace(matches[0][0], option + ',EF=Spe("locale","zh-CN")');
}
const old = 'legacy:!1,locale:EF.value,fallbackLocale:"en",messages:';
const replacement = 'legacy:!1,locale:"zh-CN",fallbackLocale:"zh-CN",messages:';
if (!html.includes(replacement)) {
  if (html.split(old).length !== 2) throw Error('语言初始化入口已改变');
  html = html.replace(old, replacement);
}
const marker = '<script id="toonflow-simplified-chinese">';
if (!html.includes(marker)) {
  html = html.replace('<head>', `<head>\n${marker}(()=>{document.documentElement.lang="zh-CN";try{localStorage.setItem("locale","zh-CN");const value=JSON.parse(localStorage.getItem("setting")||"{}");if(value&&typeof value==="object"&&!Array.isArray(value)){value.language="zh-CN";localStorage.setItem("setting",JSON.stringify(value));}}catch{}})();</script>`);
}
html = html.replace('<html lang="">', '<html lang="zh-CN">');
fs.writeFileSync(file, html);
console.log('界面已固定使用简体中文，旧语言偏好会在启动时更新');
