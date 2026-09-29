const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process'),esbuild=require('esbuild');
const html=fs.readFileSync('data/web/index.html','utf8');
for(const [,code] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(code.trim())esbuild.transformSync(code,{loader:'js'});
const baseline=cp.execFileSync('git',['show','HEAD:data/web/index.html'],{encoding:'utf8',maxBuffer:40*1024*1024});
const routes=s=>new Set(Array.from(s.matchAll(/path:"(\/[^"\n]*)"/g),m=>m[1]));
for(const route of routes(baseline))assert.ok(routes(html).has(route),`Missing original route ${route}`);
assert.ok(html.includes('a.value.script[M.value]={...a.value.script[M.value],...Q.value}'),'Script identity must survive editing');
assert.ok(html.includes('start:"开始剧本规划"'));
cp.execFileSync(process.execPath,['scripts/install-workflow-usability.cjs']);assert.equal(fs.readFileSync('data/web/index.html','utf8'),html,'installer must be idempotent');
assert.ok(html.indexOf('<script src="/workflow-usability.js"></script>')>html.lastIndexOf('</style>'),'Enhancement must not be inserted inside bundled JS string literals');
// Execute the actual shipped navigation guard against both project contexts.
const vm=require('node:vm');
const guardSource=html.match(/yH\.beforeEach\(\(e,t,n\)=>\{[\s\S]*?\}\);/)[0];
let guard,project=null,token='test';
vm.runInNewContext(guardSource,{yH:{beforeEach:fn=>guard=fn},qc:()=>({project}),localStorage:{getItem:()=>token}});
const routeTo=path=>{let calls=0,result;guard({path},{},value=>{calls++;result=value});assert.equal(calls,1);return result};
for(const route of ['/novel','/script','/scriptAgent','/cornerScape','/production','/assets']){
 project=null;assert.equal(routeTo(route),'/project',`${route} without project must redirect`);
 project={id:123};assert.equal(routeTo(route),undefined,`${route} with project must remain reachable`);
}
project=null;for(const route of ['/project','/task','/login'])assert.equal(routeTo(route),undefined);
token=null;assert.equal(routeTo('/scriptAgent'),'/login');assert.equal(routeTo('/login'),undefined);
// Feed streamed XML attributes into the shipped card updater: renaming must keep its ID.
const updater=html.match(/const O=b\.name\?\?"",w=m,[\s\S]*?(?=\}p==="complete")/)[0];
const cards={value:{script:[{id:20,name:'旧标题',content:'旧正文'}]}};
const apply=(attrs,content)=>vm.runInNewContext(updater,{b:attrs,m:content,t:cards});
apply({id:'20',name:'新标题'},'修');apply({id:'20',name:'新标题'},'修订全文');
assert.equal(cards.value.script.length,1);assert.equal(cards.value.script[0].id,20);assert.equal(cards.value.script[0].name,'新标题');assert.equal(cards.value.script[0].content,'修订全文');
apply({name:'新集'},'首段');apply({name:'新集'},'全文');assert.equal(cards.value.script.length,2);
apply({name:'新标题'},'兼容旧格式');assert.equal(cards.value.script.length,2);assert.equal(cards.value.script[0].id,20);
console.log('PASS: all bundled scripts parse, original routes retained, script ID preserved, installer idempotent');

// Execute the shipped production XML handler, including its save callback.
const handlerSource=html.match(/onXmlTag:async N=>\{const\{tag:H,value:z,children:W,attrs:V,status:q\}=N;[\s\S]*?(?=\}\}\),g=MCi)/)[0];
const workspace={value:{storyboardTable:'已确认分镜表'}};let saves=0;
const handler=vm.runInNewContext('({'+handlerSource+'}}).onXmlTag',{n:workspace,g:()=>saves++});
handler({tag:'storyboardTable',value:'我会修改这个字段',status:'complete'});
handler({tag:'storyboardTable',value:'|序号|画面|时长|\n|1|推石|5|',status:'streaming'});
assert.equal(workspace.value.storyboardTable,'已确认分镜表');assert.equal(saves,0);
const table='|序号|画面|时长|\n|1|推石|5|';
handler({tag:'storyboardTable',value:table,status:'complete'});
assert.equal(workspace.value.storyboardTable,table);assert.equal(saves,1);
console.log('PASS: explanatory or incomplete XML cannot overwrite a saved storyboard table');

// Updates must modify one known panel without appending or changing track/media metadata.
(async()=>{
 const source=html.match(/N\.on\("updateStoryboard",async\(H,z\)=>\{[\s\S]*?(?=,N\.on\("addStoryboard")/)[0];
 const row={id:35,prompt:'旧提示词',videoDesc:'旧描述',duration:5,trackId:123,src:'existing.jpg',associateAssetsIds:[378]};
 const current={value:{storyboard:[row]}};let update,posts=0,saved=0,result;
 vm.runInNewContext(source,{N:{on:(_,fn)=>update=fn},n:current,r:{value:19},Jt:{post:async(path,body)=>{assert.equal(path,'/production/storyboard/editStoryboardInfo');assert.equal(body.id,35);posts++;}},k:async()=>saved++});
 await update({id:35,prompt:'巨大圆球',videoDesc:'三倍人高'},v=>result=v);
 assert.equal(result.success,true);assert.equal(current.value.storyboard.length,1);assert.equal(row.prompt,'巨大圆球');assert.equal(row.duration,5);assert.equal(row.trackId,123);assert.equal(row.src,'existing.jpg');assert.deepEqual(row.associateAssetsIds,[378]);assert.equal(posts,1);assert.equal(saved,1);
 await update({id:999,prompt:'新',videoDesc:'新'},v=>result=v);assert.equal(result.success,false);
 await update({id:35,prompt:'',videoDesc:'新'},v=>result=v);assert.equal(result.success,false);assert.equal(posts,1);assert.equal(row.prompt,'巨大圆球');
 console.log('PASS: original panel update preserves identity, track, duration, references and media');
})().catch(e=>{console.error(e);process.exitCode=1;});
