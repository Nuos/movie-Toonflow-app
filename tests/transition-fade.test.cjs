const assert=require('node:assert/strict');const {fadeIn}=require('../data/web/workflow-transition.js');
for(const [progress,alpha] of [[0,0],[.5,.4],[1,.8],[-1,0],[2,.8]]){let drawn=[],cleared=false,restored=false;const ctx={save(){},restore(){restored=true},setTransform(){},clearRect(){cleared=true},drawImage(frame){drawn.push({frame,alpha:this.globalAlpha,filter:this.filter})}};fadeIn(ctx,'new-frame',progress,10,20,{opacity:.8,filter:'grayscale(1)'});assert.ok(cleared&&restored);assert.deepEqual(drawn,[{frame:'new-frame',alpha,filter:'grayscale(1)'}])}
console.log('PASS: fade-in uses only incoming frame, clamps alpha and preserves canvas state and filters');
const {configure}=require('../data/web/workflow-transition.js');
const track={clips:[{id:'a',type:'video',startTime:0,endTime:6},{id:'b',type:'video',startTime:6,endTime:10}]};
const old={type:'transition',startTime:5.6,endTime:6.4,transitionType:'slide',transitionDuration:.8};
const slide={...old,...configure(old,{},track)};assert.equal(slide.startTime,6);assert.equal(slide.endTime,6.8);assert.equal(slide.name,'滑动');
const fade=configure(slide,{transitionType:'fade'},track);assert.equal(fade.startTime,5.6);assert.equal(fade.endTime,6.4);assert.equal(fade.boundary,6);
for(const type of ['slide','wipe','dissolve','zoom','rotate']){const r=configure(slide,{transitionType:type,transitionDuration:2},track);assert.equal(r.endTime-r.startTime,2);assert.equal(r.startTime,6)}
assert.equal(configure(slide,{transitionDuration:50},track).endTime,10);
console.log('PASS: legacy transition migration, stable cut boundary, full non-fade duration and available-footage clamp');

const {occupiesBoundary}=require('../data/web/workflow-transition.js');
assert.equal(occupiesBoundary(slide,6),true);
assert.equal(occupiesBoundary({...slide,boundary:6},6),true);
assert.equal(occupiesBoundary(old,6),true);
assert.equal(occupiesBoundary(slide,10),false);
assert.equal(occupiesBoundary({...slide,type:'video'},6),false);
assert.equal(occupiesBoundary({...slide,boundary:6},6.5),false);
console.log('PASS: duplicate transitions rejected at cut, including non-fade start boundary; distinct cuts remain available');
