(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ToonflowTransition=api})(globalThis,function(){
 function fadeIn(ctx,frame,progress,width,height,{opacity=1,filter='none',transform=''}={}){
  if(globalThis.ToonflowEffectRender){globalThis.ToonflowEffectRender.draw(ctx,frame,width,height,{opacity:Math.max(0,Math.min(1,progress))*opacity,transform},filter);return}
  ctx.save();try{ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);ctx.filter=filter;ctx.globalAlpha=Math.max(0,Math.min(1,progress))*opacity;ctx.drawImage(frame,0,0,width,height)}finally{ctx.restore()}
 }
 function configure(clip,patch,track){
  const type=patch.transitionType??clip.transitionType??'fade';
  const videos=track.clips.filter(c=>['video','image'].includes(c.type)).sort((a,b)=>a.startTime-b.startTime);
  const anchor=clip.boundary??(clip.startTime+clip.endTime)/2;
  let pair;for(let i=0;i<videos.length-1;i++){const before=videos[i],after=videos[i+1];if(Math.abs(before.endTime-after.startTime)>.01)continue;const distance=Math.abs(before.endTime-anchor);if(!pair||distance<pair.distance)pair={before,after,distance}}
  if(!pair)return {...patch};
  const {before,after}=pair,boundary=before.endTime;
  const max=type==='fade'?2*Math.min(before.endTime-before.startTime,after.endTime-after.startTime):after.endTime-after.startTime;
  const duration=Math.max(.001,Math.min(max,Number(patch.transitionDuration??clip.transitionDuration)||1));
  const startTime=type==='fade'?boundary-duration/2:boundary,endTime=type==='fade'?boundary+duration/2:boundary+duration;
  const names={fade:'淡入淡出',slide:'滑动',wipe:'擦除',dissolve:'溶解',zoom:'缩放',rotate:'旋转'};
  return {...patch,boundary,beforeClipId:before.id,afterClipId:after.id,transitionType:type,transitionDuration:duration,startTime,endTime,name:names[type]||type};
 }
 function occupiesBoundary(clip,boundary){
  if(clip.type!=='transition')return false;
  if(Number.isFinite(clip.boundary))return Math.abs(clip.boundary-boundary)<.01;
  return clip.startTime<=boundary&&clip.endTime>boundary;
 }
 return {fadeIn,configure,occupiesBoundary};
});
