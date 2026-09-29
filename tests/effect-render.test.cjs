const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={};vm.runInNewContext(fs.readFileSync('data/web/workflow-effect-render.js','utf8'),context);
const calls=[];const ctx=new Proxy({}, {get:(o,k)=> k in o ? o[k] : (...args)=>{calls.push([k,...args]);if(k==='drawImage'&&o.fail)throw Error('draw failed')},set:(o,k,v)=>(o[k]=v,true)});
context.ToonflowEffectRender.draw(ctx,'frame',100,200,{opacity:.5,transform:' scale(0.5) translate(3px, -4px) rotate(90deg) translateX(-50%)'},'grayscale(1)');
assert.deepEqual(calls,[['save'],['setTransform',1,0,0,1,0,0],['clearRect',0,0,100,200],['translate',50,100],['scale',.5,.5],['translate',3,-4],['rotate',Math.PI/2],['translate',-50,0],['translate',-50,-100],['drawImage','frame',0,0],['restore']]);
assert.equal(ctx.globalAlpha,.5);assert.equal(ctx.filter,'grayscale(1)');
assert.equal(calls.at(-1)[0],'restore');
ctx.fail=true;assert.throws(()=>context.ToonflowEffectRender.draw(ctx,'frame',10,10),/draw failed/);assert.equal(calls.at(-1)[0],'restore');
console.log('PASS: centered transform order, pixel/percent translation, rotation and canvas restoration');
const transition={...context};vm.runInNewContext(fs.readFileSync('data/web/workflow-transition.js','utf8'),transition);
let forwarded;transition.ToonflowEffectRender={draw:(...args)=>{forwarded=args}};
transition.ToonflowTransition.fadeIn(ctx,'next',.25,100,200,{opacity:.4,transform:'scale(0.7)',filter:'grayscale(1)'});
assert.equal(forwarded[4].opacity,.1);assert.equal(forwarded[4].transform,'scale(0.7)');assert.equal(forwarded[5],'grayscale(1)');
console.log('PASS: fade transition composes opacity with geometric effect and filter');
// Exercise the shipped effect computation, rather than a duplicate formula.
const bundle=fs.readFileSync('data/web/index.html','utf8');
const start=bundle.indexOf('function Qkn('),end=bundle.indexOf('const Mjs=',start);
assert.ok(start>=0&&end>start,'shipped effect computation must be identifiable');
const native={};vm.runInNewContext(bundle.slice(start,end),native);
let previousScale=Infinity;
for(const progress of [0,.25,.5,.75,1]){
  const result=native.Qkn([{effectType:'zoomOut',progress}],100,200);
  const scale=Number(result.transform.match(/scale\(([^)]+)\)/)[1]);
  assert.ok(scale>0&&scale<=1&&scale<previousScale,'zoomOut must shrink monotonically');
  assert.equal(result.opacity,1-progress);
  previousScale=scale;
}
assert.equal(previousScale,.5);
console.log('PASS: shipped zoomOut shrinks while fading across its full duration');
