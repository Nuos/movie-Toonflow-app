import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linkPromptReferences,recommendCameraParameters} from '../src/utils/cameraReferencePlan';
const entries=[{id:1,sources:'assets',name:'山道',code:'DR-7-SCN-000001',type:'image'},{id:2,sources:'assets',name:'巨石',code:'DR-7-PRP-000002',type:'image'}];
const workflows=[{id:'comfyui-h3:h3-quality',available:true,audio:'optional',modes:[{value:'text',referenceLimits:{image:0,video:0,audio:0}},{value:'startEndRequired',minImages:2,referenceLimits:{image:2,video:0,audio:0}}],defaults:{resolution:'768p'},specifications:[{duration:[5,8,10],resolution:['768p']}]},{id:'comfyui-h3:h3-reference-quality',available:true,audio:'optional',modes:[{value:'["imageReference:9","videoReference:3","audioReference:3"]',referenceLimits:{image:9,video:3,audio:3}}],defaults:{resolution:'768p'},specifications:[{duration:[5,8,10],resolution:['768p']}]}];
test('旧版具名引用与资产卡片自动绑定，手动顺序保留且不重复',()=>{
 const r=linkPromptReferences('@图1 为山道场景 @图2 为巨石道具，@图2 滚下，@DR-7-SCN-000001。',entries,[{id:2,sources:'assets'}]);
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.references,[{id:2,sources:'assets'},{id:1,sources:'assets'}]);assert.doesNotMatch(r.prompt,/@图/);
 const removed=linkPromptReferences('只保留 @DR-7-SCN-000001',entries);assert.deepEqual(removed.references,[{id:1,sources:'assets'}]);
});
test('未定义别名、同名歧义和外部项目编号不能猜测绑定',()=>{
 assert.equal(linkPromptReferences('@图1 移动',entries).references.length,0);
 assert.ok(linkPromptReferences('@DR-8-SCN-000001',entries).issues.length);
 assert.ok(linkPromptReferences('@图1 为山道场景', [...entries,{...entries[0],id:3,code:'DR-7-SCN-000003'}]).issues.length);
});
test('原分镜关联顺序解析编号，缺失槽位及名称冲突不误绑',()=>{
 const r=linkPromptReferences('@图1 后方是 @图 2',entries,[],[entries[1],entries[0]]);
 assert.deepEqual(r.issues,[]);
 assert.deepEqual(r.references,[{id:2,sources:'assets'},{id:1,sources:'assets'}]);
 assert.doesNotMatch(r.prompt,/@图/);
 const missing=linkPromptReferences('@图1 与 @图2',entries,[],[undefined,entries[0]]);
 assert.equal(missing.issues.length,1);assert.deepEqual(missing.references,[{id:1,sources:'assets'}]);
 assert.ok(linkPromptReferences('@图1 为山道场景',entries,[],[entries[1]]).issues.some(x=>x.includes('冲突')));
 assert.ok(linkPromptReferences('@图3',entries,[],entries).issues.length);
 assert.ok(linkPromptReferences('@图 1 为山道场景',entries,[],[entries[1]]).issues.some(x=>x.includes('冲突')));
});
test('按参考内容选多参考，只有明确首尾帧才选择首尾模式',()=>{
 const refs=recommendCameraParameters(workflows,entries,'两项角色场景参考，时长：8秒。',8);
 assert.equal(refs.parameters?.workflowId,'comfyui-h3:h3-reference-quality');assert.equal(refs.parameters?.duration,8);
 assert.equal(recommendCameraParameters(workflows,entries,'首帧建立环境，尾帧停在人物脸部。',8).parameters?.mode,'startEndRequired');
 assert.equal(recommendCameraParameters(workflows,[],'静态环境',8).parameters?.mode,'text');
 assert.equal(recommendCameraParameters(workflows,[],'总时长：15秒。',5).parameters,null);
 assert.ok(recommendCameraParameters(workflows,[],'总时长：15秒。',5).warnings.length);
});
test('素材超限、音频单独引用不能静默删除或降级',()=>{
 assert.equal(recommendCameraParameters(workflows,Array(10).fill(entries[0]),'',8).parameters,null);
 assert.equal(recommendCameraParameters(workflows,[{type:'audio'}],'',8).parameters,null);
 assert.equal(recommendCameraParameters(workflows,[entries[0],{type:'audio'}],'',8).parameters?.audio,true);
});
