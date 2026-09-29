import assert from 'node:assert/strict';
import { test } from 'node:test';
import { H3Plan, inspectPlan, patchPlan } from '../src/utils/h3/plan';
import { compileH3, projectPlan } from '../src/utils/h3/compiler';
import { validateWorkflow } from '../src/utils/h3/workflow';
export const text=(zh:string,en=zh)=>({zh,en});
export function fixture():H3Plan{return {
 version:1,mode:'T2VA',duration:8,aspectRatio:'9:16',style:text('写实','Realistic soft daylight.'),summary:text('女子放下信','A woman sets a letter on a table.'),
 subjects:[{id:'woman',kind:'person',name:'女子',identity:text('穿蓝衣的成年女子','an adult woman wearing a blue shirt')}],references:[],bindings:[],speakers:[{id:'voice',subjectId:'woman',name:'女子',voice:text('自然成年女声','a calm adult female voice')}],
 shots:[{id:'shot1',storyboardId:1,sourceText:'',start:0,end:8,purpose:text('放下信','Set down the letter.'),subjectIds:['woman'],opening:text('站在桌旁拿着信','She stands beside the table holding a letter.'),ending:text('手垂下看信','Her hand rests at her side as she looks at the letter.'),spatial:[{subjectId:'woman',relativeTo:null,relation:text('位于画面左侧','on the left side of the frame')}],phases:[{id:'phase1',start:0,end:4,subjectIds:['woman'],action:text('将信放到桌上','She places the letter on the table.'),endState:text('信在桌上','The letter lies on the table.')},{id:'phase2',start:4,end:8,subjectIds:['woman'],action:text('手离开信后垂下','She withdraws her hand to her side.'),endState:text('站稳','She remains standing.')}],camera:{framing:text('中景','Medium shot.'),position:text('侧面','Side view.'),movement:text('固定','Static camera.'),focus:text('手和信','Focus on her hand and the letter.'),visibleSubjectIds:['woman']},continuity:text('衣着不变','Her clothing remains consistent.')}],
 sound:[{id:'line1',start:1,end:3,kind:'dialogue',speakerId:'voice',language:'Chinese',text:'请收好。',delivery:text('平静','She speaks calmly.'),referenceId:null}],soundscape:text('安静室内声','Quiet indoor room tone.'),music:text('无','N/A'),
};}
test('compiler owns ordered official fields and numbering; projections use same facts',()=>{
 const p=fixture(),c=compileH3(p);assert.deepEqual(inspectPlan(p),[]);assert.ok(c.prompt.startsWith('integrated_multimodal_description:'));assert.match(c.prompt,/\(S1\)/);assert.match(c.prompt,/<d>\[Chinese\] 请收好。<\/d>/);assert.equal((c.prompt.match(/\[Shot 1\]/g)||[]).length,1);assert.ok(!c.prompt.includes('<Subject'));assert.ok(projectPlan(p)[0].videoDesc.includes('1–3秒 女子：请收好。'));assert.deepEqual(compileH3(p),c);
});
test('I2VA alignment is exact and reference layout rejects a design sheet',()=>{
 const p=fixture();p.mode='I2VA';p.references=[{id:'r1',source:'storyboard',sourceId:1,mediaId:null,path:'/frame.png',sha256:'a'.repeat(64),kind:'image',name:'首帧',layout:'single',duration:null,enabled:true}];p.bindings=[{referenceId:'r1',role:'first-frame',subjectId:null,shotIds:['shot1'],retention:'fully_preserved',instruction:text('从首帧开始','Begin from the supplied frame.')}];assert.ok(compileH3(p).prompt.startsWith('For the target video, at 0.00 seconds'));
 p.references[0].layout='four-view';assert.ok(inspectPlan(p).some(i=>i.code==='design-sheet'));assert.throws(()=>compileH3(p));
});
test('selected workflow permits 30 seconds, nodes with shorter limits reject it',()=>{
 const p=fixture();p.duration=30;p.shots[0].end=30;p.shots[0].phases[1].end=30;const w:any={id:'extended',modes:['T2VA'],limits:{duration:{min:.2,max:150},fps:24,frameStep:17,frameOffset:5,maxFrames:3592,aspectRatios:['9:16']}};
 assert.deepEqual(inspectPlan(p),[]);const t=validateWorkflow(p,w);assert.ok(t.effectiveDuration>=30);assert.doesNotThrow(()=>compileH3(p,t.effectiveDuration));w.limits.duration.max=15;assert.throws(()=>validateWorkflow(p,w),/实际节点/);
});
test('local repair preserves every unaffected field and requires exact old value',()=>{
 const p=fixture(),value=text('全景','Wide shot.'),patch=[{path:'/shots/0/camera/framing',before:p.shots[0].camera.framing,value,reason:'手脚需要同时可见'}];const result=patchPlan(p,patch,['/shots/0/camera/framing']);const expected=structuredClone(p);expected.shots[0].camera.framing=value;assert.deepEqual(result.plan,expected);assert.equal(p.shots[0].camera.framing.en,'Medium shot.');assert.throws(()=>patchPlan(p,patch,[]));assert.throws(()=>patchPlan(result.plan,patch,['/shots/0/camera/framing']),/过期/);
 assert.throws(()=>patchPlan(p,[{path:'/sound',before:p.sound,value:[],reason:'删台词'}],['/sound']),/台词/);
});
test('timing gaps, unknown subjects and audio confusion are localized',()=>{const p=fixture();p.shots[0].phases[1].start=5;p.shots[0].subjectIds.push('ghost');p.sound[0].referenceId='missing';const codes=inspectPlan(p).map(i=>i.code);assert.ok(codes.includes('phase-time'));assert.ok(codes.includes('subject'));assert.ok(codes.includes('audio-reference'));});
test('Ref2VA labels follow submitted manifest and independent voice order',()=>{
 const p=fixture();p.mode='Ref2VA';p.references=[{id:'portrait',source:'assets',sourceId:10,mediaId:11,path:'/portrait.png',sha256:'a'.repeat(64),kind:'image',name:'单人',layout:'single',duration:null,enabled:true},{id:'audio',source:'assets',sourceId:12,mediaId:13,path:'/voice.wav',sha256:'b'.repeat(64),kind:'audio',name:'声音',layout:'single',duration:3,enabled:true}];p.bindings=[{referenceId:'portrait',role:'identity',subjectId:'woman',shotIds:['shot1'],retention:'fully_preserved',instruction:text('仅身份','Use identity only, not pose.')},{referenceId:'audio',role:'voice',subjectId:'woman',shotIds:['shot1'],retention:'reference',instruction:text('仅声线','Use timbre only.')}];p.sound[0].referenceId='audio';const c=compileH3(p);assert.deepEqual(Object.keys(c.fields),['subject_definitions','summary','retention_analysis','detailed_description','overall_soundscape','non_diegetic_music']);assert.deepEqual(c.manifest.map(r=>r.label),['<Picture 1>','<Audio 1>']);assert.match(c.fields.subject_definitions!,/<Subject 1> \(S1\)/);assert.ok(!c.fields.retention_analysis!.includes('(S1)'));assert.equal((c.prompt.match(/请收好。/g)||[]).length,1);
});
test('first/last anchors must follow actual submitted order',()=>{
 const p=fixture();p.mode='FL2VA';p.references=['r1','r2'].map((id,i)=>({id,source:'storyboard' as const,sourceId:i+1,mediaId:null,path:`/${id}.png`,sha256:'a'.repeat(64),kind:'image' as const,name:id,layout:'single' as const,duration:null,enabled:true}));p.bindings=[{referenceId:'r2',role:'first-frame',subjectId:null,shotIds:['shot1'],retention:'fully_preserved',instruction:text('首帧','First frame.')},{referenceId:'r1',role:'last-frame',subjectId:null,shotIds:['shot1'],retention:'fully_preserved',instruction:text('尾帧','Last frame.')}];assert.ok(inspectPlan(p).some(i=>i.code==='frame-order'));assert.throws(()=>compileH3(p));
});

test('compiler experiment preserves plan, material order and dialogue',()=>{
 const p=fixture();const a=compileH3(p,8,'h3-compiler/1'),b=compileH3(p,8,'h3-compiler/2');
 assert.equal(a.planHash,b.planHash);assert.deepEqual(a.manifest,b.manifest);assert.deepEqual(a.prompt.match(/<d>[\s\S]*?<\/d>/g),b.prompt.match(/<d>[\s\S]*?<\/d>/g));assert.equal(a.compiler,'h3-compiler/1');assert.equal(b.compiler,'h3-compiler/2');
});
