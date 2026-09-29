import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shotDurationSchema, validateActionText, validatePromptReferences } from '../src/utils/shotActionRules';
import { defaultCameraOptions, auditCameraPlan } from '../src/utils/cameraMotion';
import { formatCameraPromptGenerationContext, validateCameraGeneratedPrompt } from '../src/utils/cameraPromptGeneration';

test('完整动作只接受 8 至 15 个整数秒', () => {
 for (const n of [8, 10, 12, 15]) assert.equal(shotDurationSchema.parse(n), n);
 for (const n of [0, 3, 7, 8.5, 15.1, 16, NaN, Infinity]) assert.equal(shotDurationSchema.safeParse(n).success, false);
});
test('拒绝简略动作、小数秒和摄影缩写，同时保留台词与模型协议', () => {
 for (const text of ['0.5秒转身', '第0.5至3秒转身', '起身→迈步', '00:02.50 抬手', '动作：同上。', '按原分镜。', 'CU 人物', 'BGM 钢琴']) assert.throws(() => validateActionText(text));
 assert.doesNotThrow(() => validateActionText('[Shot 1] 第0至8秒，女子用右手把信放到桌上。<d>等等，我还有0.5秒！</d>'));
 assert.throws(() => validatePromptReferences('<Picture 2>', {Picture:1,Audio:0,Video:0}));
 assert.throws(() => validatePromptReferences('<Audio 1>', {Picture:1,Audio:0,Video:0}));
 assert.doesNotThrow(() => validatePromptReferences('<Picture 1>', {Picture:1,Audio:0,Video:0}));
});
test('结构化分镜直接带入主题、主体动作与结束状态', () => {
 const o = defaultCameraOptions({duration:12, videoDesc:'【本镜主题】女子把信交还原主。\n【起始画面】女子双手持信站在桌前。\n【主体动作】女子右手推信到桌边，再收手到身侧。\n【结束画面】女子双脚站稳、右手垂在身侧，目光停在对方手中，保持呼吸。\n【连续性】同一信纸。'});
 assert.equal(o.purpose,'女子把信交还原主。'); assert.match(o.subjectAction,/推信/); assert.match(o.endingFrame,/双脚站稳/);
 assert.notEqual(auditCameraPlan(o,'static').status,'blocked');
 assert.equal(auditCameraPlan({...o,purpose:''},'static').issues.filter(i=>i.code==='purpose_missing').length,1);
});
test('旁白必须出现在叙事正文，摘要不能掩盖遗漏', () => {
 const c=formatCameraPromptGenerationContext({projectId:1,trackId:2,mode:'text',duration:12,boards:[{id:3,duration:12,selection:null,videoDesc:'旁白：“第9999次失败。”'}]});
 assert.throws(()=>validateCameraGeneratedPrompt('summary: 第9999次失败。\ndetailed_description: [Shot 1] 人物站稳。',c),/遗漏/);
 assert.doesNotThrow(()=>validateCameraGeneratedPrompt('detailed_description: [Shot 1] 人物站稳。\n\n第0至3秒，画外旁白（S1）说：<d>[中文] 第9999次失败。</d>',c));
});

test('首尾帧协议的整数端点格式不误判为小数动作时间',()=>{
 const header='For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';
 assert.doesNotThrow(()=>validateActionText(header+'\n\n[Shot 1] 第0至12秒，人物完成动作。'));
 assert.doesNotThrow(()=>validateActionText('How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 12.00-second mark of the target video.'));
 assert.throws(()=>validateActionText(header+'\n第0.5至3秒，人物迈步。'));
 assert.throws(()=>validateActionText(header.replace('0.00','0.50')));
});
