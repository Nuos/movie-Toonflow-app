import assert from 'node:assert/strict';
import {test} from 'node:test';
import {alignVideoPrompt,promptAspectRatio} from '../src/utils/localVideoParameters';
import {recommendCameraParameters} from '../src/utils/cameraReferencePlan';
test('显式画幅与时长同步到生成提示词，动作时间点和台词保留',()=>{
 const p=alignVideoPrompt('【画面与镜头】\n12秒，竖屏9:16。时长：5秒。0s~3s向上推。台词：“我会等你。”','16:9',12);
 assert.match(p,/横屏16:9/);assert.match(p,/时长：12秒/);assert.match(p,/0s~3s/);assert.match(p,/我会等你/);assert.equal(promptAspectRatio(p),'16:9');
 assert.equal(alignVideoPrompt(p,'16:9',12),p);
});
test('自定义规格保留提示词的12秒，不取5/8/10预设',()=>{
 const w={id:'comfyui-h3:h3-quality',modes:[{value:'text',minImages:0,maxImages:0}],audio:'optional',parameterCapabilities:{customDuration:true},specifications:[{duration:[5,8,10],resolution:['768p']}]};
 const r=recommendCameraParameters([w],[],'【画面与镜头】\n12秒，横屏16:9。',3);
 assert.equal(r.parameters?.duration,12);
});
test('横画幅写法同步但原台词不改写',()=>{
 const p=alignVideoPrompt('16:9 横画幅。时长：5秒。人物说：“画幅16:9，时长：5秒。” <d>16:9横画幅</d>','9:16',15);
 assert.match(p,/9:16\s*竖屏画幅/);
 assert.match(p,/时长：15秒/);
 assert.ok(p.includes('“画幅16:9，时长：5秒。”'));
 assert.ok(p.includes('<d>16:9横画幅</d>'));
 assert.equal(alignVideoPrompt(p,'9:16',15),p);
});
