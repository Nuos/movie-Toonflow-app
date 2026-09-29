// Upstream ships its settings UI only as a bundle. Remove retired controls structurally.
const fs = require('node:fs');
const acorn = require('acorn');
const walk = require('acorn-walk');
const file = 'data/web/index.html';
let html = fs.readFileSync(file, 'utf8');
const match = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m => m[1].includes('settings.agent.maxOutputTokens'));
if (!match) { console.log('Text generation controls already removed'); process.exit(0); }
let code = match[1];
const ast = acorn.parse(code, {ecmaVersion:'latest', sourceType:'module'});
const edits = [];
function replace(n, text = 'void 0') { edits.push({start:n.start, end:n.end, text}); }
function removeProperty(n, parent) {
  const list = parent.properties, i = list.indexOf(n);
  if (i < list.length - 1) edits.push({start:n.start, end:list[i+1].start, text:''});
  else if (i > 0) edits.push({start:list[i-1].end, end:n.end, text:''});
  else replace(n, '');
}
walk.fullAncestor(ast, (n, _s, ancestors) => {
  const source = code.slice(n.start,n.end);
  if (n.type === 'Literal' && ['settings.agent.maxOutputTokens','settings.memory.summaryMaxLength'].includes(n.value)) {
    // The full control/card tag is a render call whose props/content contain the label.
    const render = [...ancestors].reverse().find(x => x.type==='CallExpression' && /^(?:c|wt)\(/.test(code.slice(x.start,x.start+3)));
    if (render) replace(render, 'null');
  }
  if (n.type==='Property' && /(?:maxOutputTokens|summaryMaxLength)/.test(n.key.name || n.key.value || '')) removeProperty(n,ancestors[ancestors.length-2]);
  if (n.type==='CallExpression' && n.callee.name==='lt' && source.includes('maxOutputTokens')) replace(n);
  if (n.type==='AssignmentExpression' && source.includes('maxOutputTokens')) replace(n);
});
// Coalesce overlapping edits: rendering controls also contain bindings being removed.
const kept=[];
for (const e of edits.sort((a,b)=>a.start-b.start||b.end-a.end)) {
 const p=kept.at(-1);
 if (p && e.start < p.end) { if(e.end>p.end) {if(e.text!==''||p.text!=='')throw Error('Unexpected overlapping edit');p.end=e.end;} continue; }
 kept.push(e);
}
for (const e of kept.reverse()) code=code.slice(0,e.start)+e.text+code.slice(e.end);
// Remove unused help translations too (all token budget labels have been deleted).
acorn.parse(code,{ecmaVersion:'latest',sourceType:'module'});
if (/maxOutputTokens|summaryMaxLength/.test(code)) throw Error('Retired setting still referenced');
const offset=match.index+match[0].indexOf(match[1]);
html=html.slice(0,offset)+code+html.slice(offset+match[1].length);
fs.writeFileSync(file,html);
console.log(`Removed ${kept.length} UI bindings, controls and translations; bundle syntax verified`);
