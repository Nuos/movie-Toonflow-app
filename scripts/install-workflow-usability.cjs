const fs=require('node:fs');
const file='data/web/index.html';let html=fs.readFileSync(file,'utf8');
const changes=[
 ["yHs=qe({__name:\"index\",props:{initialTracks:", "yHs=qe({__name:\"index\",props:{draftProjectId:{},draftScriptId:{},initialTracks:"],
 ["wt(CHs,{key:2,\"initial-tracks\":Ae(p)", "wt(CHs,{key:2,draftProjectId:Ae(t)?.id,draftScriptId:Ae(A),\"initial-tracks\":Ae(p)"],
 ["A=ue(),m=ue(),v=ue(!1);async function p(){", "A=ue(),m=ue(),v=ue(!1);const draft=window.ToonflowEditorDraft.create({projectId:t.draftProjectId,scriptId:t.draftScriptId,request:body=>Jt.post(\"/production/editVideo/draft\",body),getTracks:()=>l.tracks});let stopDraftWatch;async function p(){"],
 ["return kn(()=>{S(),r.value&&(s=new ResizeObserver", "return kn(async()=>{if(!await draft.restore(tracks=>{S();if(tracks!==null){l.reset();tracks.forEach(track=>l.addTrack(track));u.initialize();pHs(l)}}))return;stopDraftWatch=lt(()=>l.tracks,()=>draft.changed(),{deep:!0});r.value&&(s=new ResizeObserver"],
 ["Fa(()=>{d.pause(),s==null||s.disconnect()})", "Fa(()=>{stopDraftWatch?.();draft.dispose();d.pause(),s==null||s.disconnect()})"],

 ["audio:l===!1?null:{codec:\"aac\",sampleRate:hu.sampleRate", "audio:l===!1?null:{codec:ze(this,TQ).audioCodec||\"aac\",sampleRate:hu.sampleRate"],
 ["description:g==null?void 0:r5r(g)", "description:e.codec===\"aac\"?(g==null?void 0:r5r(g)):window.ToonflowExportAudio.opusDescription(g)"],
 ["const Z=await u.createCombinator(),$=[]", "const exportAudioCodec=await window.ToonflowExportAudio.pickCodec();const Z=await u.createCombinator({audioCodec:exportAudioCodec}),$=[]"],
 ["ae.click(),URL.revokeObjectURL(K)}return t({avCanvas", "document.body.append(ae),ae.click(),ae.remove(),window.ToonflowExportAudio.showResult(K,ae.download,ne,data=>Jt.post(\"/assets/uploadClip\",{projectId:qc().project.id,name:ae.download,base64Data:data}))}return t({avCanvas"],

 ["_Us=qe({__name:\"mediaLibrary\",props:", "_Us=qe({__name:\"mediaLibrary\",emits:[\"addMedia\"],props:"],
 ["[de(\"div\",uUs,[D.thumbnail?", "[de(\"button\",{type:\"button\",class:\"workflow-add-clip\",title:\"添加到主轨道末尾\",onClick:B=>{B.stopPropagation();p.$emit(\"addMedia\",D)}},\"添加到时间线\"),de(\"div\",uUs,[D.thumbnail?"],
 ["c($Us,{\"initial-video-items\":e.initialVideoItems,", "c($Us,{onAddMedia:addVideoToTimeline,\"initial-video-items\":e.initialVideoItems,"],
 ["async function w(D,B,T){try{if(D.type===", "async function addVideoToTimeline(D){try{const meta=await Dke(D.url,{count:10,width:120});if(!(meta.duration>0))throw Error(\"无法读取视频时长\");const track=l.tracks.find(t=>t.isMain&&t.type===\"video\");if(!track||track.locked){window.$message.warning(\"请先解锁主轨道\");return}const end=Math.max(0,...track.clips.map(c=>c.endTime));return w({...D,duration:meta.duration,thumbnails:meta.thumbnails,sourceUrl:D.url},track.id,end)}catch(error){window.$message.error(error.message||\"视频读取失败，未添加到时间线\")}}async function w(D,B,T){try{if(D.type==="],
 ["storyboard:S+1,id:B+1", "storyboard:L.trackNumber??S+1,id:B+1"],

 ["fe&&(X.medias=fe)}k.value.mode==\"singleImage\"", "fe&&(X.medias=fe)}restoreTrackSettings();k.value.mode==\"singleImage\""],
 ["FOe=bO(\"imageListCache\",()=>{const e=ue({}),t=ue({});", "FOe=bO(\"imageListCache\",()=>{const e=ue({}),t=ue({}),settingsData=ue({});function getSettings(p,b,O){return settingsData.value[p]?.[b]?.[O]}function setSettings(p,b,O,value){if(p==null||b==null||O==null)return;settingsData.value[p]??={},settingsData.value[p][b]??={},settingsData.value[p][b][O]=JSON.parse(JSON.stringify(value))} "],
 ["return{cacheData:e,urlMap:t,getCache:s,", "return{settingsData,getSettings,setSettings,cacheData:e,urlMap:t,getCache:s,"],
 ["persist:{pick:[\"cacheData\"]}", "persist:{pick:[\"cacheData\",\"settingsData\"]}"],
 ["A=ue([]);function m(W){return W.src?", "A=ue([]);function saveTrackSettings(track=O.value){const p=t.value?.id,b=n.value;if(track?.id!=null&&k.value.model)o.setSettings(p,b,track.id,k.value)}function restoreTrackSettings(){const settings=o.getSettings(t.value?.id,n.value,O.value?.id);if(settings)k.value={...k.value,...settings}}lt(()=>({...k.value}),()=>saveTrackSettings(),{deep:!0});function m(W){return W.src?"],
 ["g.value=[...W.trackList]),k.value.duration=w((oe=(J=W.trackList)==null?void 0:J[r.value])==null?void 0:oe.duration)}", "g.value=[...W.trackList]),k.value.duration=w((oe=(J=W.trackList)==null?void 0:J[r.value])==null?void 0:oe.duration),restoreTrackSettings()}"],
 ["function D(W){var _,J,oe,he;if(W!=null){const fe=g.value[W],", "function D(W){var _,J,oe,he;if(W!=null){saveTrackSettings(g.value[W]);const fe=g.value[W],"],
 ["k.value.duration=w((he=(oe=g.value)==null?void 0:oe[r.value])==null?void 0:he.duration)}lt(()=>", "k.value.duration=w((he=(oe=g.value)==null?void 0:oe[r.value])==null?void 0:he.duration),restoreTrackSettings()}lt(()=>"],
 ["f.value=V,k.value.audio=V.audio===!0||V.audio===\"true\"||V.audio==\"optional\";const q=V.durationResolutionMap;", "if(k.value.model!==W)return;const saved=o.getSettings(t.value?.id,n.value,O.value?.id);f.value=V,k.value.audio=(V.audio===!0||V.audio===\"true\"||V.audio==\"optional\")&&(saved?.model===W?saved.audio!==!1:!0);const q=V.durationResolutionMap;"],
 ["k.value.resolution=q[0].resolution[0]),(oe=q[0].duration)", "k.value.resolution=q[0].resolution.includes(k.value.resolution)?k.value.resolution:q[0].resolution[0]),(oe=q[0].duration)"],

 ["N.on(\"addStoryboard\",async(H,z)=>{", "N.on(\"updateStoryboard\",async(H,z)=>{const W=n.value.storyboard.find(V=>V.id===H.id);if(!W)return z({success:!1,message:\"分镜不存在于当前剧集\"});if(!String(H.prompt??\"\").trim()||!String(H.videoDesc??\"\").trim())return z({success:!1,message:\"提示词和视频描述不能为空\"});try{await Jt.post(\"/production/storyboard/editStoryboardInfo\",{id:W.id,prompt:H.prompt,videoDesc:H.videoDesc});W.prompt=H.prompt,W.videoDesc=H.videoDesc;await k(r.value);z({success:!0,id:W.id,message:\"已更新现有分镜\"})}catch(V){z({success:!1,message:V?.message||\"更新分镜失败\"})}}),N.on(\"addStoryboard\",async(H,z)=>{"],
 ["W.storyboard.forEach(V=>{delete V.prompt,delete V.src,delete V.flowId})", "W.storyboard.forEach(V=>{delete V.src,delete V.flowId})"],

 ["const{tag:H,value:z,children:W,attrs:V,status:q}=N;H===\"script\"?","const{tag:H,value:z,children:W,attrs:V,status:q}=N;if(H===\"storyboardTable\"&&(q!==\"complete\"||!String(z??\"\").includes(\"时长\")||!/\\|\\s*\\d+\\s*\\|/.test(z??\"\")))return;H===\"script\"?"],
 ["async function h(){await Jt.post(\"/scriptAgent/setPlanData\",{projectId:e,agentType:\"scriptAgent\",data:t.value})}", "async function h(){const k=t.value.script.slice(),{data:A}=await Jt.post(\"/scriptAgent/setPlanData\",{projectId:e,agentType:\"scriptAgent\",data:t.value});for(const m of A.data?.script||[]){const v=k.find(p=>p.id===m.id||!p.id&&p.name===m.name);v&&(v.id=m.id)}}"],
 ["const O=b.name??\"\",w=m;if(O){const y=t.value.script.findIndex(C=>C.name===O);y!==-1?t.value.script[y].content=w:t.value.script.push({name:O,content:w})}", "const O=b.name??\"\",w=m,I=Number(b.id);if(O){const S=Number.isSafeInteger(I)&&I>0,y=t.value.script.findIndex(C=>S?C.id===I:C.name===O);y!==-1?Object.assign(t.value.script[y],{name:O,content:w}):t.value.script.push({...S?{id:I}:{},name:O,content:w})}"],
 ['yH.beforeEach((e,t,n)=>{e.path==="/login"||localStorage.getItem("token")?n():n("/login")});', 'yH.beforeEach((e,t,n)=>{if(e.path!=="/login"&&!localStorage.getItem("token")){n("/login");return}if(["/novel","/script","/scriptAgent","/cornerScape","/production","/assets"].includes(e.path)&&!qc().project?.id){n("/project");return}n()});'],
 ['s=ue([{type:"btn",path:"/project",labelKey:"workbench.menu.myProject",icon:"i-folder-close"},{type:"btn",path:"/task",labelKey:"workbench.menu.taskCenter",icon:"i-view-list"}])','s=ue([{type:"btn",path:"/project",labelKey:"workbench.menu.myProject",icon:"i-folder-close"},{type:"btn",path:"/task",labelKey:"workbench.menu.taskCenter",icon:"i-view-list"},{type:"btn",path:"/scriptAgent",labelKey:"workbench.menu.scriptAgent",icon:"i-color-filter",needProject:!0},{type:"btn",path:"/cornerScape",labelKey:"workbench.menu.cornerScape",icon:"i-peoples-two",needProject:!0},{type:"btn",path:"/production",labelKey:"workbench.menu.production",icon:"i-carousel-video",needProject:!0}])'],
 ['function h(p){p.needProject&&!t.value||(l.push(p.path),u.value=p.path)}','function h(p){if(p.needProject&&!t.value){l.push("/project"),u.value="/project",window.$message.info("请先选择或新建项目，再打开创作模块。");return}l.push(p.path),u.value=p.path}'],
 ['a.value.script[M.value]={...Q.value}', 'a.value.script[M.value]={...a.value.script[M.value],...Q.value}'],
 ['welcomeMsg:"你好！我是 Toonflow 智能助手，需要我开始为您生成剧本吗？",start:"开始"','welcomeMsg:"先确认改编需求，再依次完成故事骨架、改编策略和分集剧本。点击下方查看原文准备情况并开始规划。",start:"开始剧本规划"'],
 ['placeholder:"$t(\'workbench.scriptAgent.inputPlaceholder\')"','placeholder:$t("workbench.scriptAgent.inputPlaceholder")'],
];
if(html.includes("function addVideoToTimeline(D){const track=l.tracks.find(t=>t.isMain&&t.type===\"video\");if(!track||track.locked){window.$message.warning(\"请先解锁主轨道\");return}const end=Math.max(0,...track.clips.map(c=>c.endTime));return w({...D,sourceUrl:D.url},track.id,end)}"))html=html.replace("function addVideoToTimeline(D){const track=l.tracks.find(t=>t.isMain&&t.type===\"video\");if(!track||track.locked){window.$message.warning(\"请先解锁主轨道\");return}const end=Math.max(0,...track.clips.map(c=>c.endTime));return w({...D,sourceUrl:D.url},track.id,end)}","async function addVideoToTimeline(D){try{const meta=await Dke(D.url,{count:10,width:120});if(!(meta.duration>0))throw Error(\"无法读取视频时长\");const track=l.tracks.find(t=>t.isMain&&t.type===\"video\");if(!track||track.locked){window.$message.warning(\"请先解锁主轨道\");return}const end=Math.max(0,...track.clips.map(c=>c.endTime));return w({...D,duration:meta.duration,thumbnails:meta.thumbnails,sourceUrl:D.url},track.id,end)}catch(error){window.$message.error(error.message||\"视频读取失败，未添加到时间线\")}}");
if(html.includes("document.body.append(ae),ae.click(),ae.remove(),setTimeout(()=>URL.revokeObjectURL(K),60000)}return t({avCanvas"))html=html.replace("document.body.append(ae),ae.click(),ae.remove(),setTimeout(()=>URL.revokeObjectURL(K),60000)}return t({avCanvas","document.body.append(ae),ae.click(),ae.remove(),window.ToonflowExportAudio.showResult(K,ae.download,ne,data=>Jt.post(\"/assets/uploadClip\",{projectId:qc().project.id,name:ae.download,base64Data:data}))}return t({avCanvas");
if(html.includes("window.ToonflowExportAudio.showResult(K,ae.download)"))html=html.replace("window.ToonflowExportAudio.showResult(K,ae.download)","window.ToonflowExportAudio.showResult(K,ae.download,ne,data=>Jt.post(\"/assets/uploadClip\",{projectId:qc().project.id,name:ae.download,base64Data:data}))");
for(const [before,after] of changes){if(html.includes(after)||before.startsWith("return kn(()=>{S(),r.value")&&html.includes("tracks.forEach(track=>l.addTrack({...track")||before.startsWith("async function w(D,B,T)")&&html.includes("async function addVideoToTimeline(D){if("))continue;if(html.split(before).length!==2)throw Error('前端版本不匹配，停止修改：'+before);html=html.replace(before,after);}

if(html.includes("async function addVideoToTimeline(D){try{const meta="))html=html.replace("async function addVideoToTimeline(D){try{const meta=","async function addVideoToTimeline(D){if([\"subtitle\",\"text\"].includes(D.type)){const candidates=l.tracks.filter(t=>t.type===D.type),track=candidates.find(t=>!t.locked);if(candidates.length&&!track){window.$message.warning(\"请先解锁字幕轨道\");return}return w(D,track?.id,Math.max(0,...(track?.clips||[]).map(c=>c.endTime)))}try{const meta=");
if(html.includes("[de(\"div\",GUs,[de(\"span\",KUs,Te(D.preview),1)])"))html=html.replace("[de(\"div\",GUs,[de(\"span\",KUs,Te(D.preview),1)])","[de(\"button\",{type:\"button\",class:\"workflow-add-clip\",title:\"添加到字幕轨道\",onClick:B=>{B.stopPropagation();p.$emit(\"addMedia\",D)}},\"添加到时间线\"),de(\"div\",GUs,[de(\"span\",KUs,Te(D.preview),1)])");
if(html.includes("[de(\"div\",VUs,[c(S,"))html=html.replace("[de(\"div\",VUs,[c(S,","[de(\"button\",{type:\"button\",class:\"workflow-add-clip\",title:\"添加到音频轨道\",onClick:B=>{B.stopPropagation();p.$emit(\"addMedia\",D)}},\"添加到时间线\"),de(\"div\",VUs,[c(S,");
if(html.includes('async function addVideoToTimeline(D){if(["subtitle","text"].includes(D.type))'))html=html.replace("async function addVideoToTimeline(D){if([","async function addVideoToTimeline(D){if(D.type===\"audio\"){try{const meta=await iat(D.url,{samples:500});if(!(meta.duration>0))throw Error(\"无法读取音频时长\");const candidates=l.tracks.filter(t=>t.type===\"audio\"),track=candidates.find(t=>!t.locked);if(candidates.length&&!track){window.$message.warning(\"请先解锁音频轨道\");return}return w({...D,sourceUrl:D.url,duration:meta.duration,waveformData:meta.waveformData},track?.id,Math.max(0,...(track?.clips||[]).map(c=>c.endTime)))}catch(error){window.$message.error(error.message||\"音频读取失败\");return}}if([");
if(html.includes("let be=new u6n(pe.body,{volume:ce});"))html=html.replace("let be=new u6n(pe.body,{volume:ce});","let be=new u6n(pe.body,{volume:1});");
if(!html.includes("const envelopePCM=")&&html.includes("K=new LY(be),K.time.offset=Z.startTime*1e6,K.time.duration=(Z.endTime-Z.startTime)*1e6,K.time.playbackRate=Be}else if(Z.type===\"sticker\""))html=html.replace("K=new LY(be),K.time.offset=Z.startTime*1e6,K.time.duration=(Z.endTime-Z.startTime)*1e6,K.time.playbackRate=Be}else if(Z.type===\"sticker\"","const envelopePCM=window.ToonflowAudioEnvelope.apply(be.getPCMData(),be.meta.sampleRate,{duration:Z.endTime-Z.startTime,playbackRate:Be,volume:ce,fadeIn:ie.fadeIn,fadeOut:ie.fadeOut});be.destroy();be=new u6n(envelopePCM);await be.ready;K=new LY(be),K.time.offset=Z.startTime*1e6,K.time.duration=(Z.endTime-Z.startTime)*1e6,K.time.playbackRate=Be}else if(Z.type===\"sticker\"");
if(html.includes("text:ie.text||\"\",volume:$.volume??1}"))html=html.replace("text:ie.text||\"\",volume:$.volume??1}","text:ie.text||\"\",volume:$.volume??1,fadeIn:ie.fadeIn??0,fadeOut:ie.fadeOut??0,duration:Z.endTime-Z.startTime}");
if(html.includes("$.text!==ie.text||$.volume!==ie.volume}"))html=html.replace("$.text!==ie.text||$.volume!==ie.volume}","$.text!==ie.text||$.volume!==ie.volume||$.fadeIn!==ie.fadeIn||$.fadeOut!==ie.fadeOut||$.duration!==ie.duration}");
if(html.includes("tracks.forEach(track=>l.addTrack(track));"))html=html.replace("tracks.forEach(track=>l.addTrack(track));","tracks.forEach(track=>l.addTrack({...track,clips:track.clips.map(clip=>[\"audio\",\"video\"].includes(clip.type)?{...clip,trimEnd:Math.min(clip.originalDuration??Infinity,(clip.trimStart||0)+(clip.endTime-clip.startTime)*(clip.playbackRate||1))}:clip)}));");
if(html.includes("function m(w,y){r.value&&(t.updateClip(r.value.id,{[w]:y}),"))html=html.replace("function m(w,y){r.value&&(t.updateClip(r.value.id,{[w]:y}),","function m(w,y){r.value&&(t.updateClip(r.value.id,{[w]:y,...w===\"endTime\"&&[\"audio\",\"video\"].includes(r.value.type)?{trimEnd:Math.min(r.value.originalDuration??Infinity,(r.value.trimStart||0)+(Number(y)-r.value.startTime)*(r.value.playbackRate||1))}:{}}),");
if(html.includes("[de(\"div\",DUs,[de(\"span\",QUs,"))html=html.replace("[de(\"div\",DUs,[de(\"span\",QUs,","[de(\"button\",{type:\"button\",class:\"workflow-add-clip\",title:\"在所选片段与下一片段之间添加\",onClick:B=>{B.stopPropagation();p.$emit(\"addMedia\",D)}},\"添加转场\"),de(\"div\",DUs,[de(\"span\",QUs,");
if(html.includes("async function addVideoToTimeline(D){if(D.type===\"audio\")"))html=html.replace("async function addVideoToTimeline(D){if(D.type===\"audio\")","async function addVideoToTimeline(D){if(D.type===\"transition\"){const selected=l.selectedClips.filter(c=>[\"video\",\"image\"].includes(c.type));if(selected.length!==1){window.$message.warning(\"请先选择转场前的一个视频或图片片段\");return}const clip=selected[0],track=l.tracks.find(t=>t.id===clip.trackId);if(!track||track.locked){window.$message.warning(\"请先解锁所选轨道\");return}const next=track.clips.find(c=>c.id!==clip.id&&[\"video\",\"image\"].includes(c.type)&&Math.abs(c.startTime-clip.endTime)<.01);if(!next){window.$message.warning(\"所选片段后没有相邻片段\");return}return x(clip.id,next.id,D.subType)}if(D.type===\"audio\")");
if(!html.includes("window.ToonflowTransition.fadeIn")){if(html.split("if(Je&&!Je.isBeforeClip){const{transition:ht,progress:yt}=Je,Lt=V.get(ht.beforeClipId);").length!==2)throw Error("转场渲染版本不匹配");html=html.replace("if(Je&&!Je.isBeforeClip){const{transition:ht,progress:yt}=Je,Lt=V.get(ht.beforeClipId);","if(Je&&!Je.isBeforeClip&&Je.transition.transitionType===\"fade\"){if((!we||we.width!==Be||we.height!==Ge)&&(we=new OffscreenCanvas(Be,Ge),Ee=we.getContext(\"2d\")),Ee){window.ToonflowTransition.fadeIn(Ee,Qe,Je.progress,Be,Ge,{opacity:pt.length?Qkn(pt).opacity:1,filter:$e.length?BPe($e):\"none\"});\"close\"in Qe&&typeof Qe.close===\"function\"&&Qe.close();return{...ce,video:await createImageBitmap(we)}}}if(Je&&!Je.isBeforeClip){const{transition:ht,progress:yt}=Je,Lt=V.get(ht.beforeClipId);");}
if(html.includes("await bt(Lt),ht>0&&(K.clearRect"))html=html.replace("await bt(Lt),ht>0&&(K.clearRect","await bt(Lt),Je.transition.transitionType===\"fade\"&&ht>0&&(K.clearRect");
if(!html.includes("Object.assign(h,window.ToonflowTransition.configure(h,{},l));return e.addClip(s.trackId,h),t.pushSnapshot")&&html.includes("return e.addClip(s.trackId,h),t.pushSnapshot"))html=html.replace("return e.addClip(s.trackId,h),t.pushSnapshot","Object.assign(h,window.ToonflowTransition.configure(h,{},l));return e.addClip(s.trackId,h),t.pushSnapshot");
if(!html.includes("function m(w,y){if(r.value?.type===\"transition\"&&w===\"transitionType\"){const track=t.tracks.find(track=>track.id===r.value.trackId);if(track)t.updateClip(r.value.id,window.ToonflowTransition.configure(r.value,{transitionType:y},track));n.pushSnapshot(\"\u66f4\u65b0\u8f6c\u573a\u7c7b\u578b\");return}r.value&&(t.updateClip")&&html.includes("function m(w,y){r.value&&(t.updateClip"))html=html.replace("function m(w,y){r.value&&(t.updateClip","function m(w,y){if(r.value?.type===\"transition\"&&w===\"transitionType\"){const track=t.tracks.find(track=>track.id===r.value.trackId);if(track)t.updateClip(r.value.id,window.ToonflowTransition.configure(r.value,{transitionType:y},track));n.pushSnapshot(\"\u66f4\u65b0\u8f6c\u573a\u7c7b\u578b\");return}r.value&&(t.updateClip");
if(!html.includes("const y=g.value,track=t.tracks.find(track=>track.id===w.trackId);if(!track)return;t.updateClip(w.id,window.ToonflowTransition.configure(w,{transitionDuration:y},track))")&&html.includes("const y=g.value,C=(w.startTime+w.endTime)/2;t.updateClip(w.id,{startTime:C-y/2,endTime:C+y/2,transitionDuration:y})"))html=html.replace("const y=g.value,C=(w.startTime+w.endTime)/2;t.updateClip(w.id,{startTime:C-y/2,endTime:C+y/2,transitionDuration:y})","const y=g.value,track=t.tracks.find(track=>track.id===w.trackId);if(!track)return;t.updateClip(w.id,window.ToonflowTransition.configure(w,{transitionDuration:y},track))");
if(!html.includes("clip=>clip.type===\"transition\"?{...clip,...window.ToonflowTransition.configure(clip,{},track)}:[\"audio\",\"video\"].includes(clip.type)?")&&html.includes("clip=>[\"audio\",\"video\"].includes(clip.type)?"))html=html.replace("clip=>[\"audio\",\"video\"].includes(clip.type)?","clip=>clip.type===\"transition\"?{...clip,...window.ToonflowTransition.configure(clip,{},track)}:[\"audio\",\"video\"].includes(clip.type)?");
if(!html.includes("ae=ne.endTime,ve=ne.boundary??(K+ae)/2;")&&html.includes("ae=ne.endTime,ve=(K+ae)/2;"))html=html.replace("ae=ne.endTime,ve=(K+ae)/2;","ae=ne.endTime,ve=ne.boundary??(K+ae)/2;");
// Playback follows actual clips; the timeline canvas may still offer extra editing space.
if(html.includes('d.setDuration(60*5),d.seekTo(0),u.initialize(),pHs(l)'))html=html.replace('d.setDuration(60*5),d.seekTo(0),u.initialize(),pHs(l)','d.setDuration(0),d.seekTo(0),u.initialize(),pHs(l)');
const oldCanvasCall='await Jt.post("/production/editImage/generateFlowImage",{references:A.data.references.map(x=>x.image).filter(Boolean),model:A.data.model,quality:A.data.quality,ratio:A.data.ratio,prompt:A.data.prompt,projectId:A.projectId})';
const newCanvasCall='await window.ToonflowImageJob.generate(body=>Jt.post("/production/editImage/generateFlowImage",body),{references:A.data.references.map(x=>x.image).filter(Boolean),model:A.data.model,quality:A.data.quality,ratio:A.data.ratio,prompt:A.data.prompt,projectId:A.projectId},A.data.generatedImage)';
if(!html.includes(newCanvasCall)){
 if(html.split(oldCanvasCall).length!==2)throw Error('原画布生成入口版本不匹配');
 html=html.replace(oldCanvasCall,newCanvasCall);
}
const oldTransitionCollision='f=>f.type==="transition"&&f.startTime<s.endTime&&f.endTime>s.endTime';
const newTransitionCollision='f=>window.ToonflowTransition.occupiesBoundary(f,s.endTime)';
if(!html.includes(newTransitionCollision)){
 if(html.split(oldTransitionCollision).length!==2)throw Error('转场重复检查版本不匹配');
 html=html.replace(oldTransitionCollision,newTransitionCollision);
}
// Image/media tabs use the same original addMedia route as video assets.
for(const preview of ['vUs','CUs']){
 const before='[de("div",'+preview+',[';
 const after='[de("button",{type:"button",class:"workflow-add-clip",title:"添加到时间线",onClick:B=>{B.stopPropagation();p.$emit("addMedia",D)}},"添加到时间线"),de("div",'+preview+',[';
 if(!html.includes(after)){
  if(html.split(before).length!==2)throw Error('图片媒体卡片版本不匹配：'+preview);
  html=html.replace(before,after);
 }
}
const imageAdd='if(D.type==="image"){try{const image=new Image;image.crossOrigin="anonymous";await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error("图片读取失败"));image.src=D.url});if(!image.naturalWidth||!image.naturalHeight)throw Error("图片尺寸无效");const candidates=l.tracks.filter(t=>t.type==="image"),track=candidates.find(t=>!t.locked);if(candidates.length&&!track){window.$message.warning("请先解锁图片轨道");return}return w({...D,sourceUrl:D.url,thumbnail:D.url,duration:D.duration>0?D.duration:5},track?.id,Math.max(0,...(track?.clips||[]).map(c=>c.endTime)))}catch(error){window.$message.error(error.message||"图片读取失败");return}}';
if(!html.includes(imageAdd)){
 const before='async function addVideoToTimeline(D){';
 if(html.split(before).length!==2)throw Error('图片时间线入口版本不匹配');
 html=html.replace(before,before+imageAdd);
}
// Accessible alternatives to the original filter/effect drag handlers.
const overlayAdd = 'if(["filter","effect"].includes(D.type)){const selected=l.selectedClips.filter(c=>["video","image"].includes(c.type));if(selected.length!==1){window.$message.warning("请先选择一个视频或图片片段");return}const target=selected[0],sourceTrack=l.tracks.find(t=>t.id===target.trackId);if(!sourceTrack||sourceTrack.locked){window.$message.warning("请先解锁所选轨道");return}const candidates=l.tracks.filter(t=>t.type===D.type),track=candidates.find(t=>!t.locked);if(candidates.length&&!track){window.$message.warning("请先解锁效果轨道");return}return w({...D,duration:target.endTime-target.startTime},track?.id,target.startTime)}';
if(!html.includes(overlayAdd)){
 const anchor='async function addVideoToTimeline(D){';
 if(html.split(anchor).length!==2)throw Error('时间线添加入口版本不匹配');
 html=html.replace(anchor,anchor+overlayAdd);
}
for(const preview of ['MUs','UUs']){
 const before='[de("div",'+preview+',[';
 const after='[de("button",{type:"button",class:"workflow-add-clip",title:"应用到所选视频或图片片段",onClick:B=>{B.stopPropagation();p.$emit("addMedia",D)}},"应用到所选片段"),de("div",'+preview+',[';
 if(!html.includes(after)&&!(preview==='MUs'&&html.includes('[D.type==="effect"?de("button",{type:"button",class:"workflow-add-clip"'))){
  if(html.split(before).length!==2)throw Error('滤镜特效卡片版本不匹配：'+preview);
  html=html.replace(before,after);
 }
}
// Sticker placeholders keep their original drag behavior; do not route them through video decoding.
const effectButton='[de("button",{type:"button",class:"workflow-add-clip",title:"应用到所选视频或图片片段",onClick:B=>{B.stopPropagation();p.$emit("addMedia",D)}},"应用到所选片段"),de("div",MUs,[';
const actualEffectButton=effectButton.replace('[de("button",','[D.type==="effect"?de("button",').replace('"应用到所选片段"),de("div",MUs,[','"应用到所选片段"):Pt("",!0),de("div",MUs,[');
html=html.replace(effectButton,actualEffectButton);
// Timeline rows are displayed in descending order: a higher row order is foreground.
const oldLayerOrder='function I(Z,$=!1){const ne=(100-Z)*10;return $?ne+1e3:ne}';
const newLayerOrder='function I(Z,$=!1){const ne=Z*10;return $?ne+1e3:ne}';
if(!html.includes(newLayerOrder)){
 if(html.split(oldLayerOrder).length!==2)throw Error('剪辑轨道层级入口版本不匹配');
 html=html.replace(oldLayerOrder,newLayerOrder);
}
// Restore the original two sticker choices with real, bundled artwork.
html=html.replace(actualEffectButton,effectButton);
const stickerAdd='if(D.type==="sticker"){try{const selected=l.selectedClips.filter(c=>["video","image"].includes(c.type));if(selected.length!==1){window.$message.warning("请先选择一个视频或图片片段");return}const target=selected[0],sourceTrack=l.tracks.find(t=>t.id===target.trackId);if(!sourceTrack||sourceTrack.locked){window.$message.warning("请先解锁所选轨道");return}const source=window.ToonflowSticker.resolve(D.url||D.id),bitmap=await window.ToonflowSticker.load(source);bitmap.close();const candidates=l.tracks.filter(t=>t.type==="sticker"),track=candidates.find(t=>!t.locked);if(candidates.length&&!track){window.$message.warning("请先解锁贴纸轨道");return}return w({...D,url:source,sourceUrl:source,duration:target.endTime-target.startTime},track?.id,target.startTime)}catch(error){window.$message.error(error.message||"贴纸加载失败");return}}';
if(!html.includes(stickerAdd))html=html.replace('async function addVideoToTimeline(D){','async function addVideoToTimeline(D){'+stickerAdd);
const stickerSource='D.type==="sticker"?P={...P,type:"sticker",name:D.name,endTime:pr(T+M),sourceUrl:D.id}';
html=html.replace(stickerSource,stickerSource.replace('sourceUrl:D.id','sourceUrl:window.ToonflowSticker.resolve(D.sourceUrl||D.url||D.id)'));
const stickerDecode='Z.type==="sticker"&&ie.sourceUrl){const pe=await fetch(ie.sourceUrl);if(!pe.ok)return null;const ce=await pe.blob(),be=await createImageBitmap(ce),xe=new SLe(be);';
html=html.replace(stickerDecode,'Z.type==="sticker"&&ie.sourceUrl){const be=await window.ToonflowSticker.load(ie.sourceUrl),xe=new SLe(be);');
// Original track placement must never fall back into a locked track.
html=html.replace('if(d&&d.type===t&&Fkn(d,n,r))','if(d&&!d.locked&&d.type===t&&Fkn(d,n,r))');
html=html.replace('e.sortedTracks.filter(d=>d.type===t&&!d.isMain)','e.sortedTracks.filter(d=>d.type===t&&!d.isMain&&!d.locked)');
// Preserve filters and geometric effects on both sides of a transition.
const transitionEffectPatches=[
 ['{opacity:pt.length?Qkn(pt).opacity:1,filter:$e.length?BPe($e):"none"}', '{...Qkn(pt),filter:$e.length?BPe($e):"none"}'],
 ['Bjs(ht.transitionType).render(Ee,Lt,Qe,yt,Be,Ge)', '(!ne||ae!==Be||ve!==Ge)&&(ne=new OffscreenCanvas(Be,Ge),K=ne.getContext("2d"),ae=Be,ve=Ge);if(!K)throw Error("无法建立特效画布");window.ToonflowEffectRender.draw(K,Qe,Be,Ge,Qkn(pt),$e.length?BPe($e):"none");Bjs(ht.transitionType).render(Ee,Lt,ne,yt,Be,Ge)'],
 ['K.globalAlpha=yt,K.drawImage(Qe,0,0);const Lt=await createImageBitmap(ne)', 'window.ToonflowEffectRender.draw(K,Qe,Be,Ge,Qkn(pt),$e.length?BPe($e):"none");const Lt=await createImageBitmap(ne)'],
 ['K.globalAlpha=yt*(1-ht),K.drawImage(Qe,0,0)', 'window.ToonflowEffectRender.draw(K,Qe,Be,Ge,{...Qkn(pt),opacity:yt*(1-ht)},$e.length?BPe($e):"none")']
];
for(const [before,after] of transitionEffectPatches){
 if(!html.includes(after)){
  if(html.split(before).length!==2)throw Error('转场叠加特效入口版本不匹配：'+before);
  html=html.replace(before,after);
 }
}
const originalEffectDraw='Xe.globalAlpha=He.opacity,Xe.drawImage(ht,0,0)';
const correctedEffectDraw='window.ToonflowEffectRender.draw(Xe,ht,yt,Lt,He,$e.length?BPe($e):"none")';
if(!html.includes(correctedEffectDraw)){
 if(html.split(originalEffectDraw).length!==2)throw Error('特效渲染入口版本不匹配');
 html=html.replace(originalEffectDraw,correctedEffectDraw);
}
// Match the original 缩小退出 label: shrink away from full size, then fade out.
const oldZoomOut='case"zoomOut":{const a=1+.5*s.progress;r*=1-s.progress';
const newZoomOut='case"zoomOut":{const a=1-.5*s.progress;r*=1-s.progress';
if(!html.includes(newZoomOut)){
 if(html.split(oldZoomOut).length!==2)throw Error('缩小退出特效入口版本不匹配');
 html=html.replace(oldZoomOut,newZoomOut);
}
for(const tag of ['<script src="/workflow-sticker.js"></script>','<script src="/workflow-effect-render.js"></script>','<script src="/workflow-image-job.js"></script>','<script src="/workflow-transition.js"></script>','<script src="/workflow-audio-envelope.js"></script>','<script src="/workflow-editor-draft.js"></script>','<script src="/workflow-export-audio.js"></script>','<link rel="stylesheet" href="/workflow-usability.css">','<script src="/workflow-duration.js"></script>','<script src="/workflow-usability.js"></script>']){
 if(!html.includes(tag))html=html.slice(0,html.lastIndexOf('</head>'))+tag+'\n'+html.slice(html.lastIndexOf('</head>'));
}
// Extend the original property panel through its existing update/history path.
const filterEditor='r.value.type==="filter"&&typeof r.value.filterValue==="number"?de("div",{class:"sectionCard",id:"workflow-filter-properties"},[de("div",{class:"sectionHeader"},"滤镜参数"),de("div",{class:"sectionBody"},[de("label",{for:"workflow-filter-value"},r.value.filterType==="hue-rotate"?"色相角度（度）":r.value.filterType==="blur"?"模糊半径（像素）":"滤镜强度",1),de("input",{id:"workflow-filter-value",type:"number",value:r.value.filterValue,min:r.value.filterType==="hue-rotate"?-360:0,max:r.value.filterType==="hue-rotate"?360:r.value.filterType==="blur"?100:["grayscale","sepia","invert","opacity"].includes(r.value.filterType)?1:10,step:["hue-rotate","blur"].includes(r.value.filterType)?1:.05,onChange:z=>{const input=z.target,value=Number(input.value);if(!input.value.trim()||!Number.isFinite(value)||!input.checkValidity()){input.value=r.value.filterValue;window.$message.warning("请输入范围内的有效数值");return}m("filterValue",value)}},null,40,["value","min","max","step"])])]):Pt("",!0),';
html=html.replace('"模糊半径（像素）":"滤镜强度"),de(', '"模糊半径（像素）":"滤镜强度",1),de(');
if(!html.includes('id:"workflow-filter-properties"')){
 const anchor='r.value.type==="subtitle"?(ye(),Me("div",iHs,';
 if(html.split(anchor).length!==2)throw Error('原滤镜属性面板版本不匹配');
 html=html.replace(anchor,filterEditor+anchor);
}
fs.writeFileSync(file,html);
console.log('已安装剧本规划文案和自适应布局');
