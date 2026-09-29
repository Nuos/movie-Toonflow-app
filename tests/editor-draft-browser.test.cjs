const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('data/web/workflow-editor-draft.js','utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const elements=[];function element(){const e={children:[],dataset:{},classList:{add(){},remove(){}},setAttribute(){},append(...xs){this.children.push(...xs)},click(){this.clicked=true},remove(){}};elements.push(e);return e}
 const host=element(),content=element();host.append(content);let tracks=[{id:'t',type:'video',clips:[{id:'c',startTime:0,endTime:1}]}],remote={revision:1,tracks:copy(tracks)},mode='ok',saveCalls=0,readCalls=0,release,blobs=[],reloads=0;
 const context={console,Blob,URL:{createObjectURL(b){blobs.push(b);return 'blob:test'},revokeObjectURL(){}},setTimeout:()=>1,clearTimeout(){},document:{querySelector:()=>host,createElement:element,body:element()},location:{reload(){reloads++}}};vm.runInNewContext(source,context);
 async function request(body){if(!body.save){readCalls++;if(mode==='readFail')throw Error('网络中断');return {data:copy(remote)}}saveCalls++;if(mode==='wait'){await new Promise(r=>release=r)}if(mode==='fail'||mode==='wait')throw Error('网络中断');if(body.save.revision!==remote.revision)throw Error('版本冲突');remote={revision:remote.revision+1,tracks:copy(body.save.tracks)};if(mode==='lostAck')throw Error('响应丢失');return {data:copy(remote)}}
 const draft=context.ToonflowEditorDraft.create({projectId:1,scriptId:2,request,getTracks:()=>tracks});
 return {draft,host,content,elements,blobs,setMode:x=>mode=x,get remote(){return remote},get saves(){return saveCalls},get reloads(){return reloads},edit(n){tracks[0].clips[0].endTime=n;draft.changed()},external(){remote={revision:remote.revision+1,tracks:[{id:'other',type:'video',clips:[]}]}},release:()=>release(),restore:()=>draft.restore(x=>{if(x!==null)tracks=x}),button:()=>elements.find(e=>e.textContent==='保存剪辑草稿'||e.textContent==='重试保存'||e.textContent==='重新读取草稿'),backup:()=>elements.find(e=>e.textContent==='下载本页草稿备份'),status:()=>elements.find(e=>e.dataset.failed!==undefined)};
}
(async()=>{
 let s=setup();await s.restore();s.draft.changed();assert.equal(s.status().textContent,'剪辑草稿已保存');assert.equal(s.content.inert,false);
 s.setMode('wait');s.edit(2);const first=s.draft.flush();await Promise.resolve();s.edit(3);const queued=s.draft.flush();s.release();await queued;assert.equal(s.saves,1);assert.match(s.status().textContent,/本页编辑已保留/);assert.equal(s.backup().hidden,false);
 s.backup().onclick();const backup=JSON.parse(await s.blobs[0].text());assert.equal(backup.tracks[0].clips[0].endTime,3);
 s.setMode('ok');await s.button().onclick();assert.equal(s.remote.tracks[0].clips[0].endTime,3);assert.equal(s.saves,2);assert.equal(s.backup().hidden,true);
 s=setup();await s.restore();s.setMode('lostAck');s.edit(4);await s.draft.flush();assert.equal(s.remote.revision,2);s.setMode('ok');await s.button().onclick();assert.equal(s.saves,1);assert.equal(s.status().textContent,'剪辑草稿已保存');
 s=setup();await s.restore();s.setMode('fail');s.edit(5);await s.draft.flush();s.external();s.setMode('ok');await s.button().onclick();assert.equal(s.saves,1);assert.equal(s.remote.tracks[0].id,'other');assert.match(s.status().textContent,/未覆盖/);assert.equal(s.backup().hidden,false);
 s=setup();s.setMode('readFail');assert.equal(await s.restore(),false);assert.equal(s.content.inert,true);await s.draft.flush();assert.equal(s.saves,0);await s.button().onclick();assert.equal(s.reloads,1);
 console.log('PASS: no-op status, queued-write cancellation after failure, latest-edit retry, downloadable backup, lost acknowledgement reconciliation, remote conflict protection, failed-load keyboard lock');
})().catch(e=>{console.error(e);process.exitCode=1});
