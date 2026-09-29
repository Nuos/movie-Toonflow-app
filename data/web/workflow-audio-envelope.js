(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ToonflowAudioEnvelope=api})(globalThis,function(){
 function apply(channels,sampleRate,{duration,playbackRate=1,volume=1,fadeIn=0,fadeOut=0}){
  if(!Number.isFinite(sampleRate)||sampleRate<=0||!Number.isFinite(duration)||duration<=0)throw Error('音频时长或采样率无效');
  const rate=Number.isFinite(playbackRate)&&playbackRate>0?playbackRate:1;
  const gain=Number.isFinite(volume)?Math.max(0,volume):1;
  const incoming=Math.min(duration,Math.max(0,Number(fadeIn)||0)),outgoing=Math.min(duration,Math.max(0,Number(fadeOut)||0));
  const count=Math.max(1,Math.round(duration*rate*sampleRate));
  return channels.map(source=>{const target=source.slice(0,count);for(let i=0;i<target.length;i++){const time=i/sampleRate/rate;const remaining=(count-1-i)/sampleRate/rate;target[i]*=gain*(incoming?Math.min(1,time/incoming):1)*(outgoing?Math.min(1,Math.max(0,remaining)/outgoing):1)}return target});
 }
 return {apply};
});
