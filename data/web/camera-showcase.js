/* Camera motion demonstrations and isolated workflow clips. No submission on load or preview. */
(() => {
  'use strict';
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;};
  const button=(text,fn,className)=>{const b=node('button',text,className);b.type='button';b.onclick=fn;return b;};
  const field=(label,input)=>{const l=node('label',label,'showcase-field');l.append(input);return l;};
  const unique=items=>[...new Set(items)];
  const refKey=ref=>`${ref.sources}:${ref.id}`;
  const sameOriginUrl=value=>{try{const u=new URL(value,location.origin);return u.origin===location.origin&&['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}};
  const canonicalMode=(mode,imageCount=0)=>{if(mode==='endFrameOptional')return imageCount>=2?'startEndRequired':'singleImage';if(mode==='startFrameOptional')return imageCount?'singleImage':'text';if(mode==='startEndRequired')return 'startEndRequired';if(mode==='singleImage')return 'singleImage';if(mode==='reference'||String(mode).startsWith('['))return 'reference';return 'text';};
  const eased=t=>t<.15?0:t>.85?1:(t-.15)/.7;
  const fast=t=>t<.4?0:t>.58?1:(t-.4)/.18;
  const lerp=(a,b,t)=>a+(b-a)*t;

  // An abstract path diagram, not simulated optics or a generated frame.
  function geometry(id,category,t){
    let p=eased(t),x=110,y=176,angle=-34,fov=45,sx=220,sy=105,roll=null,view='空间路径示意',route=[];
    const aim=()=>{angle=Math.atan2(sy-y,sx-x)*180/Math.PI;};
    const line=(a,b)=>{x=lerp(a[0],b[0],p);y=lerp(a[1],b[1],p);route=[a,b];aim();};
    if(id==='static'){view='机位与朝向保持 · 主体可以动作';}
    else if(['push_in','push_in_fast','macro_dive','eyes_in'].includes(id)){if(id==='push_in_fast')p=fast(t);line([75,181],[183,128]);if(id==='macro_dive')view='虚拟尺度深入 · 需两端视觉锚点';}
    else if(id==='pull_out')line([183,128],[65,186]);
    else if(['truck_left','truck_right'].includes(id)){const left=id==='truck_left';line(left?[265,175]:[90,175],left?[90,175]:[265,175]);angle=-90;}
    else if(['pan_left','pan_right','whip_pan_left','whip_pan_right'].includes(id)){x=175;y=182;const left=id.endsWith('left');p=id.startsWith('whip')?fast(t):p;angle=lerp(left?-40:-140,left?-140:-40,p);view='原地水平旋转 · 机位保持';}
    else if(['tilt_up','tilt_down'].includes(id)){x=95;y=130;sx=238;sy=125;angle=lerp(id==='tilt_up'?28:-42,id==='tilt_up'?-42:28,p);view='高度剖面 · 原地改变俯仰';}
    else if(['pedestal_up','pedestal_down','drone_reveal_rise'].includes(id)){sx=245;sy=150;const up=id!=='pedestal_down';line(up?[104,177]:[104,48],up?[104,48]:[104,177]);angle=0;view='高度剖面 · 机位升降';}
    else if(['crane_reveal','crane_up_overhead','crane_down_eye'].includes(id)){sx=238;sy=150;const down=id==='crane_down_eye';line(down?[155,45]:[125,165],down?[125,150]:id==='crane_reveal'?[68,45]:[214,48]);view='高度剖面 · 升降与朝向协同';}
    else if(['zoom_in','zoom_out','snap_zoom_in'].includes(id)){p=id==='snap_zoom_in'?fast(t):p;fov=lerp(id==='zoom_out'?18:64,id==='zoom_out'?64:18,p);view='机位保持 · 视角随焦距变化';}
    else if(id==='dolly_zoom'){line([177,133],[75,183]);fov=lerp(60,20,p);view='机位后退＋视角收窄 · 主体大小补偿意图';}
    else if(['arc_left','arc_right','orbit_half','orbit_full_fast','drone_orbit'].includes(id)){
      const span=id==='orbit_half'?Math.PI:id==='orbit_full_fast'?Math.PI*2:id==='drone_orbit'?Math.PI*.75:Math.PI*.4;
      const direction=id==='arc_left'?-1:1,r=id==='drone_orbit'?94:75;sx=180;sy=113;
      const point=q=>[sx+Math.cos(Math.PI/2+span*q*direction)*r,sy+Math.sin(Math.PI/2+span*q*direction)*r];
      route=Array.from({length:49},(_,i)=>point(i/48));[x,y]=point(p);aim();view='俯视路线 · 机位绕主体移动';
    }else if(['tracking','tracking_front','tracking_back','tracking_side','topdown_follow'].includes(id)){
      sx=lerp(122,261,p);sy=108;
      const offsets=id==='tracking_front'?[49,0]:id==='tracking_back'?[-62,0]:id==='topdown_follow'?[0,-60]:[0,73];
      x=sx+offsets[0];y=sy+offsets[1];aim();route=[[122+offsets[0],108+offsets[1]],[261+offsets[0],108+offsets[1]]];view=id==='topdown_follow'?'高度剖面 · 主体与高机位同速':'主体与摄影机各自移动 · 保持相对位置';
    }else if(id==='topdown_rotate'){x=180;y=112;sx=180;sy=112;roll=p*95;view='正上方光轴滚转 · 机位保持';}
    else if(['fpv_flythrough','pov_walk','virtual_pass'].includes(id)){
      const point=q=>[65+220*q,160-70*q+Math.sin(q*Math.PI*2)*22];route=Array.from({length:40},(_,i)=>point(i/39));[x,y]=point(p);angle=-20;
      if(id==='pov_walk')y+=Math.sin(p*Math.PI*10)*3;view=id==='virtual_pass'?'虚拟穿越 · 路径由视觉锚点连接':id==='pov_walk'?'第一人称步行 · 地面通道':'第一人称穿行 · 真实开口';
    }else if(['drone_flyover','drone_dive','cosmic_dive'].includes(id)){sx=240;sy=154;if(id==='drone_dive')p=fast(t);line(id==='drone_flyover'?[60,60]:[90,35],id==='drone_flyover'?[280,60]:[210,127]);view=id==='cosmic_dive'?'虚拟跨尺度路径 · 地点与层级需明确':'高度剖面 · 通道与净空由文字说明';}
    else if(category==='虚拟'){line([70,175],[215,105]);view='虚拟路径概览 · 具体路线以提示词为准';}
    else{line([90,175],[170,140]);view='运动概览 · 具体方向与路径以提示词为准';}
    return{x,y,angle,fov,sx,sy,roll,view,route};
  }

  function createDiagram(container,getMove){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 360 230');svg.setAttribute('role','img');svg.setAttribute('aria-label','摄影机几何运动示意，非生成视频');
    const shape=(tag,attrs,parent=svg)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);parent.append(n);return n;};
    for(let i=30;i<350;i+=30)shape('path',{d:`M${i} 20V210`,class:'showcase-gridline'});
    for(let i=30;i<220;i+=30)shape('path',{d:`M20 ${i}H340`,class:'showcase-gridline'});
    shape('rect',{x:35,y:70,width:22,height:60,rx:4,class:'showcase-obstacle'});shape('rect',{x:285,y:130,width:28,height:48,rx:4,class:'showcase-obstacle'});
    const trajectory=shape('polyline',{fill:'none',class:'showcase-trajectory'}),frustum=shape('path',{class:'showcase-frustum'}),subject=shape('g',{}),camera=shape('g',{});
    shape('circle',{r:11,class:'showcase-subject'},subject);shape('path',{d:'M-17 28Q-17 12 0 12Q17 12 17 28',class:'showcase-subject'},subject);
    const subjectText=shape('text',{x:0,y:45,'text-anchor':'middle',class:'showcase-svg-label'},subject);subjectText.textContent='主体';
    shape('rect',{x:-11,y:-7,width:18,height:14,rx:3,class:'showcase-camera'},camera);shape('path',{d:'M7 -5L17 -10V10L7 5Z',class:'showcase-camera'},camera);
    const rollFrame=shape('rect',{x:117,y:62,width:126,height:100,rx:3,fill:'none',class:'showcase-roll-frame'});
    const view=node('p','','showcase-diagram-caption'),slider=node('input');slider.type='range';slider.min='0';slider.max='100';slider.value='0';slider.setAttribute('aria-label','运镜示意进度');
    let playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,frame=0,start=0,phase=0,visible=true;
    const play=button(playing?'暂停示意':'播放示意',()=>{playing=!playing;start=performance.now()-phase*4800;play.textContent=playing?'暂停示意':'播放示意';if(playing)loop(performance.now());});
    const controls=node('div',null,'showcase-animation-controls');controls.append(play,slider);container.append(svg,view,controls);
    function draw(t){const move=getMove();if(!move)return;const g=geometry(move.id,move.category,t);subject.setAttribute('transform',`translate(${g.sx} ${g.sy})`);camera.setAttribute('transform',`translate(${g.x} ${g.y}) rotate(${g.angle})`);trajectory.setAttribute('points',g.route.map(point=>point.join(',')).join(' '));
      const point=a=>[g.x+Math.cos(a*Math.PI/180)*95,g.y+Math.sin(a*Math.PI/180)*95];const a=point(g.angle-g.fov/2),b=point(g.angle+g.fov/2);frustum.setAttribute('d',`M${g.x} ${g.y}L${a.join(' ')}L${b.join(' ')}Z`);frustum.style.display=g.roll==null?'':'none';camera.style.display=g.roll==null?'':'none';rollFrame.style.display=g.roll==null?'none':'';if(g.roll!=null)rollFrame.setAttribute('transform',`rotate(${g.roll} 180 112)`);view.textContent=g.view;slider.value=String(Math.round(t*100));}
    function loop(now){cancelAnimationFrame(frame);if(!playing||!visible||document.hidden)return;if(!start)start=now;phase=((now-start)%4800)/4800;draw(phase);frame=requestAnimationFrame(loop);}
    slider.oninput=()=>{playing=false;play.textContent='播放示意';phase=Number(slider.value)/100;cancelAnimationFrame(frame);draw(phase);};
    const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting!==false;if(visible&&playing){start=performance.now()-phase*4800;loop(performance.now());}else cancelAnimationFrame(frame);});observer.observe(container);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&playing)loop(performance.now());else cancelAnimationFrame(frame);});
    return{reset(){phase=0;start=performance.now();draw(0);if(playing)loop(start);},setBusy(value){play.disabled=value;slider.disabled=value;}};
  }

  window.createCameraShowcase=function(config){
    const {container,api,getState,isBusy=()=>false}=config;
    container.classList.add('camera-showcase');container.replaceChildren();
    let autoRefs=[],manualRefs=new Set(),linkIssues=[],manualSettings=new Set(),recommendationWarnings=[];
    let previewError='',promptEditor=null,editingPrompt=false,overridePrompt='',draftContext='',aiEpoch=0;const promptDrafts=new Map();
    let workflows=[],context={references:[]},clips=[],selectedRefs=[],resourceEpoch=0,listEpoch=0,previewEpoch=0,timer=null,pollTimer=null,boardKey='',optionsKey='',loadingResources=false,loadingWorkflows=true,preparing=false,submitting=false,prepared=null,variant=null,renderKey='',request=null;
    const pendingStorage='toonflow:camera-clip-pending:v1',seedStorage='toonflow:camera-clip-seeds:v1';
    const pendingRequests=new Map(),boardSeeds=new Map(),comparison=new Set(),clipNodes=new Map(),comparisonNodes=new Map();
    try{for(const [key,value]of JSON.parse(sessionStorage.getItem(pendingStorage)||'[]'))if(value?.requestId&&value?.prepareToken)pendingRequests.set(key,value);for(const [key,value]of JSON.parse(sessionStorage.getItem(seedStorage)||'[]'))if(Number.isSafeInteger(value)&&value>=0)boardSeeds.set(key,value);}catch{}
    const persistPending=()=>{try{sessionStorage.setItem(pendingStorage,JSON.stringify([...pendingRequests].slice(-30)));}catch{}};
    const rememberSeed=()=>{boardSeeds.set(boardKey,Number(seed.value));try{sessionStorage.setItem(seedStorage,JSON.stringify([...boardSeeds].slice(-100)));}catch{}};
    const state=()=>getState()||{},real=()=>{const s=state();return !s.demoMode&&Number(s.projectId)>0&&Number(s.storyboardId)>0;},target=()=>({projectId:Number(state().projectId),storyboardId:Number(state().storyboardId)});
    const title=node('div',null,'showcase-heading');title.append(node('div',null,'showcase-title'),node('span','示意与成片分开展示','tag'));title.firstChild.append(node('p','MOTION SHOWCASE · 运镜效果','eyebrow'),node('h2','先看表达，再制作切片。'),node('p','同一分镜切换运镜即更新提示词；生成切片独立保存，可用于比较。','muted'));container.append(title);
    const localStatus=node('p','选择一种运镜，查看提示词与路径示意。','showcase-status');localStatus.setAttribute('role','status');localStatus.setAttribute('aria-live','polite');container.append(localStatus);
    const say=(text,error=false)=>{localStatus.textContent=text;localStatus.classList.toggle('error',error);};
    const motion=node('select');motion.setAttribute('aria-label','效果展示主运镜');for(const category of unique(config.moves.map(m=>m.category))){const group=node('optgroup');group.label=category;for(const m of config.moves.filter(m=>m.category===category)){const o=node('option',m.name);o.value=m.id;group.append(o);}motion.append(group);}motion.value='static';
    const selector=node('div',null,'showcase-motion-picker');selector.id='showcase-motion-picker';selector.append(field('切换同镜运镜',motion),button('← 上一种',()=>cycle(-1)),button('下一种 →',()=>cycle(1)));container.append(selector);
    const previewGrid=node('div',null,'showcase-preview-grid'),diagramPanel=node('div',null,'showcase-diagram-panel'),diagramLabel=node('div','动态几何示意 · 非生成视频','showcase-diagram-label'),diagramHost=node('div');const diagramContent=node('div',null,'showcase-diagram-content');diagramContent.id='showcase-diagram-content';diagramContent.append(diagramLabel,diagramHost);diagramPanel.append(diagramContent);const moveInfo=node('p','','showcase-move-info');diagramContent.append(moveInfo);previewGrid.append(diagramPanel);
    const promptPanel=node('div',null,'showcase-prompt-panel'),promptLabel=node('div','视频提示词 · 正在准备','showcase-prompt-label'),prompt=node('textarea');prompt.readOnly=true;prompt.rows=13;prompt.setAttribute('aria-label','当前运镜视频提示词');const copy=button('复制当前提示词',async()=>{try{await navigator.clipboard.writeText(prompt.value);say('已复制当前运镜提示词。');}catch{say('自动复制失败，可在文本框中选中后复制。',true);}});promptPanel.append(promptLabel,prompt,copy);previewGrid.append(promptPanel);container.append(previewGrid);
    let motionCollapsed=false,diagramHidden=false;
    try{const saved=JSON.parse(localStorage.getItem('toonflow:camera-view')||'{}');motionCollapsed=!!saved.motionCollapsed;diagramHidden=!!saved.diagramHidden;}catch{}
    const viewControls=node('div',null,'showcase-view-controls'),motionToggle=button('',()=>{motionCollapsed=!motionCollapsed;updateView();}),diagramToggle=button('',()=>{diagramHidden=!diagramHidden;updateView();});
    motionToggle.setAttribute('aria-controls',selector.id);diagramToggle.setAttribute('aria-controls',diagramContent.id);viewControls.append(motionToggle,diagramToggle);container.insertBefore(viewControls,selector);
    function updateView(){selector.hidden=motionCollapsed;diagramContent.hidden=diagramHidden;previewGrid.classList.toggle('diagram-hidden',diagramHidden);motionToggle.textContent=motionCollapsed?'展开运镜选择':'收起运镜选择';diagramToggle.textContent=diagramHidden?'显示几何示意':'隐藏几何示意';motionToggle.setAttribute('aria-expanded',String(!motionCollapsed));diagramToggle.setAttribute('aria-expanded',String(!diagramHidden));try{localStorage.setItem('toonflow:camera-view',JSON.stringify({motionCollapsed,diagramHidden}));}catch{}}
    updateView();
    promptEditor=window.createCameraPromptEditor({host:promptPanel,textarea:prompt,getAssets:()=>[...(context.catalog?.assets||[]),...(context.catalog?.shots||[]).map(s=>({...s,name:s.label,type:'image'}))].map(a=>({...a,url:context.references.find(r=>r.sources===a.sources&&r.id===a.id)?.url})),getContext:()=>({key:boardKey+':'+motion.value+':'+optionsKey,locked:!!isBusy()||loadingResources||loadingWorkflows||submitting||!!request||preparing}),onEditing:value=>{editingPrompt=value;if(value)generate.disabled=true;else queueMicrotask(refreshControls);renderReadiness();},apply:text=>{overridePrompt=text;promptDrafts.set(boardKey+':'+motion.value,{text,optionsKey});queuePreview(0);},assist:async source=>{const snapshot=body();const result=await api('promptText',{...target(),options:snapshot.options,motionId:motion.value,promptOverride:source,ai:true});return result.prompt;}});
    const promptTools=node('div',null,'camera-editor-actions'),resetOriginal=button('重置为原始分镜',()=>{
      if(isBusy()||submitting||request)return;
      promptEditor.reset();overridePrompt='';for(const key of [...promptDrafts.keys()])if(key.startsWith(boardKey+':'))promptDrafts.delete(key);
      config.restoreOriginal?.();optionsKey=JSON.stringify(state().options||{});queuePreview(0);say('已恢复原始分镜描述，按当前运镜重新生成提示词。');
    }),goGenerate=button('前往视频生成 ↓',()=>{submitRow.scrollIntoView({behavior:'smooth',block:'center'});});
    resetOriginal.title='恢复载入时的分镜描述，清除本镜手工和 AI 提示词草稿，保留当前运镜与生成参数。';promptTools.append(resetOriginal,goGenerate);promptPanel.append(promptTools);
    const diagram=createDiagram(diagramHost,()=>config.moves.find(m=>m.id===motion.value));
    const audit=node('details',null,'showcase-audit');audit.append(node('summary','文字审计与使用条件'));const auditBody=node('div');audit.append(auditBody);container.append(audit);
    const controls=node('div',null,'showcase-workflow-controls'),workflow=node('select'),mode=node('select'),duration=node('input'),resolution=node('input'),aspectRatio=node('select'),audio=node('input'),seed=node('input');duration.type='number';duration.min='8';duration.max='15';duration.step='1';resolution.placeholder='预设或宽x高，如 1920x1088';const durationList=node('datalist'),resolutionList=node('datalist');durationList.id='camera-duration-presets';resolutionList.id='camera-resolution-presets';duration.setAttribute('list',durationList.id);resolution.setAttribute('list',resolutionList.id);container.append(durationList,resolutionList);aspectRatio.setAttribute('aria-label','实际生成画幅');audio.type='checkbox';seed.type='number';seed.min='0';seed.max=String(Number.MAX_SAFE_INTEGER);seed.step='1';seed.value=String(crypto.getRandomValues(new Uint32Array(1))[0]);seed.setAttribute('aria-label','比较随机种子');
    workflow.setAttribute('aria-label','ComfyUI 工作流');mode.setAttribute('aria-label','输入模式');duration.setAttribute('aria-label','切片时长');resolution.setAttribute('aria-label','工作流规格');workflow.append(new Option('正在载入工作流…',''));const audioLabel=field('生成声音',audio);audioLabel.classList.add('showcase-audio');controls.append(field('ComfyUI 工作流',workflow),field('输入模式',mode),field('切片时长（秒）',duration),field('分辨率（可自定义）',resolution),field('实际生成画幅',aspectRatio),field('比较种子（保持可比）',seed),audioLabel);container.append(controls);
    const workflowNote=node('p','','muted');const autoMatch=button('按提示词自动匹配',()=>{manualSettings.clear();queuePreview(0);});container.append(workflowNote,autoMatch);
    const workflowPreview=window.createCameraWorkflowPreview?.({container,api,isLocked:()=>!!isBusy()||submitting||!!request});
    const referencesBox=node('details',null,'showcase-references');referencesBox.open=true;const referencesSummary=node('summary','选择实际引用素材');referencesBox.append(referencesSummary);const catalogInfo=node('p','','muted'),catalogExport=button('导出本剧编号与目录清单',async()=>{try{const data=await api('productionCatalog',{projectId:target().projectId});const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download=data.productionCode+'-catalog.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){say(e.message,true);}});referencesBox.append(catalogInfo,catalogExport);
    const refNote=node('p','按选中顺序传入素材；箭头可调整顺序。','muted'),refList=node('div',null,'showcase-reference-list');referencesBox.append(refNote,refList);container.append(referencesBox);
    const review=node('div',null,'showcase-review'),reviewTitle=node('h3','本次提交预览'),parameters=node('dl',null,'showcase-parameters'),warnings=node('div',null,'showcase-warnings');const readiness=node('div',null,'showcase-readiness');readiness.id='camera-generation-readiness';readiness.setAttribute('role','status');review.append(reviewTitle,readiness,parameters,warnings);container.append(review);
    const submitRow=node('div',null,'showcase-submit-row'),generate=button('生成此运镜切片',()=>submit(false),'primary'),retry=button('重试确认同一次提交',()=>submit(true)),refreshPreview=button('刷新提示词与参数',()=>queuePreview(0));generate.setAttribute('aria-describedby',readiness.id);retry.hidden=true;submitRow.append(node('p','只有点击生成才提交媒体任务。切片保留在此处供比较。','muted'),refreshPreview,retry,generate);container.append(submitRow);
    const resultHeading=node('div',null,'showcase-result-heading'),resultTitle=node('div');resultTitle.append(node('h3','生成切片'),node('p','成片可播放、下载与同步比较；提示词审计不代表影片效果通过。','muted'));const refreshClipsButton=button('刷新切片',()=>loadClips());resultHeading.append(resultTitle,refreshClipsButton);container.append(resultHeading);
    const compareBar=node('div',null,'showcase-compare-bar'),compareLabel=node('span','选择最多 4 个成片进行比较','muted'),playAll=button('同步播放',async()=>{const forBoard=boardKey,videos=[...comparisonView.querySelectorAll('video')];if(!videos.length){say('请先选择可播放的成片进行比较。',true);return;}const outcomes=await Promise.allSettled(videos.map(async v=>{v.currentTime=0;await v.play();}));if(forBoard!==boardKey)return;const failed=outcomes.filter(result=>result.status==='rejected');if(failed.length)say(`${failed.length} 个切片未能开始播放：${failed[0].reason?.message||'浏览器未接受播放请求'}。可单独点击视频播放，或下载查看。`,true);else say(`已从片头开始播放 ${videos.length} 个切片；加载速度可能影响同步。`);}),pauseAll=button('暂停比较',()=>comparisonView.querySelectorAll('video').forEach(v=>v.pause()));compareBar.append(compareLabel,playAll,pauseAll);container.append(compareBar);
    const comparisonView=node('div',null,'showcase-comparison'),results=node('div',null,'showcase-clips');container.append(comparisonView,results);

    function cycle(delta){const all=[...motion.options],index=all.findIndex(o=>o.value===motion.value);motion.value=all[(index+delta+all.length)%all.length].value;motion.onchange();}
    function selectedWorkflow(){return workflows.find(w=>String(w.id)===workflow.value);}
    function selectedMode(){return selectedWorkflow()?.modes?.find(m=>m.value===mode.value);}
    function selectedReferenceObjects(){return selectedRefs.map(key=>context.references.find(ref=>refKey(ref)===key)).filter(Boolean);}
    function body(){const s=state();return{...target(),...(overridePrompt?{promptOverride:overridePrompt}:{}),motionId:motion.value,options:{...s.options,duration:Number(duration.value)||Number(s.options?.duration)||5,mode:canonicalMode(mode.value||s.options?.mode,selectedReferenceObjects().filter(ref=>ref.type==='image').length)},workflowId:workflow.value,mode:mode.value,duration:Number(duration.value),resolution:resolution.value,aspectRatio:aspectRatio.value||context.aspectRatio||'16:9',audio:audio.checked,seed:Number(seed.value),references:selectedReferenceObjects().map(ref=>({id:ref.id,sources:ref.sources}))};}
    function key(){return JSON.stringify(body());}
    function localProblem(){
      if(!real())return '示例可预览运镜。选择项目中的实际分镜后可生成切片。';
      if(linkIssues.length)return linkIssues.join(' ');
      const w=selectedWorkflow(),m=selectedMode();if(!w)return '请先选择已配置的 ComfyUI 视频工作流。';if(w.available===false)return w.reason||'该工作流当前不可用。';if(!m)return '请选择工作流支持的输入模式。';
      if(seed.value.trim()===''||!Number.isSafeInteger(Number(seed.value))||Number(seed.value)<0)return '随机种子应为非负安全整数。';
      if(!Number.isInteger(Number(duration.value))||Number(duration.value)<8||Number(duration.value)>15||!resolution.value)return '每镜请选择 8 至 15 个整数秒，并填写工作流规格。';
      const refs=selectedReferenceObjects(),counts={image:0,video:0,audio:0};for(const ref of refs)counts[ref.type]=(counts[ref.type]||0)+1;
      if(String(m.value).startsWith('[')&&!counts.image&&!counts.video)return '多素材参考模式至少需要一张图片或一段视频，请选择实际引用素材。';
      if(!audio.checked&&counts.audio)return '关闭声音时请移除音频引用。';
      if(refs.length>16||(String(w.id).startsWith('comfyui-h3:')&&refs.length>12))return '实际引用素材数量超出当前工作流上限，请减少引用。';
      if(counts.image<(m.minImages||0))return `当前模式至少需要 ${m.minImages} 张实际图片，请在引用素材中选择。`;
      if(m.maxImages!=null&&counts.image>m.maxImages)return `当前模式最多接受 ${m.maxImages} 张图片。`;
      for(const type of ['image','video','audio']){const limit=m.referenceLimits?.[type];if(Number.isFinite(limit)&&counts[type]>limit)return `${({image:'图片',video:'视频',audio:'音频'})[type]}引用超出当前工作流允许的 ${limit} 个。`;}
      return '';
    }
    function fillSelect(select,items,preferred){select.replaceChildren();for(const item of items){const value=typeof item==='object'?item.value:item,label=typeof item==='object'?item.label:item;const option=new Option(select===mode?(window.cameraModeLabel?.(String(value))||String(label)):String(label),String(value));if(item.description)option.title=item.description;select.append(option);}if(items.some(item=>String(typeof item==='object'?item.value:item)===String(preferred)))select.value=String(preferred);}
    function updateDuration(preferred){const w=selectedWorkflow();const specs=(w?.specifications||[]).filter(spec=>w?.parameterCapabilities?.customResolution||!spec.resolution?.length||spec.resolution.includes(resolution.value));const values=unique(specs.flatMap(spec=>spec.duration||[])).filter(v=>Number.isInteger(v)&&v>=8&&v<=15);durationList.replaceChildren(...values.map(v=>new Option(String(v),String(v))));duration.value=String(preferred??10);}
    function configureWorkflow(quiet=false){const w=selectedWorkflow();if(!w){mode.replaceChildren();duration.replaceChildren();resolution.replaceChildren();workflowNote.textContent=workflows.length?'选择工作流后可准备实际提交参数。':'暂无可用工作流；仍可比较提示词与几何示意。';queuePreview(0);return;}
      fillSelect(mode,w.modes||[],w.defaults?.mode);const sizes=unique((w.specifications||[]).flatMap(spec=>spec.resolution||[]));resolutionList.replaceChildren(...sizes.map(v=>new Option(v,v)));resolution.value=manualSettings.has('resolution')&&resolution.value?resolution.value:w.defaults?.resolution||sizes[0]||'768p';fillSelect(aspectRatio,w.parameterCapabilities?.aspectRatios||['16:9','9:16'],aspectRatio.value||context.aspectRatio||'16:9');updateDuration(manualSettings.has('duration')&&duration.value?duration.value:w.defaults?.duration);audio.checked=w.audio==='required'||(w.audio!=='none'&&!!w.defaults?.audio);workflowNote.textContent=[w.vendorName,w.description,w.available===false?w.reason||'当前不可用':'使用现有工作流的参数规格'].filter(Boolean).join(' · ');renderReferences();if(!quiet)queuePreview(0);
    }
    function renderReferences(){refList.replaceChildren();const refs=context.references||[];referencesSummary.textContent=`实际引用素材 · 已选 ${selectedRefs.length}（自动关联 ${autoRefs.length}）`;
      for(const ref of refs){const row=node('div',null,'showcase-reference'),check=node('input');check.type='checkbox';check.checked=selectedRefs.includes(refKey(ref));check.onchange=()=>{if(check.checked){selectedRefs.push(refKey(ref));manualRefs.add(refKey(ref));}else{selectedRefs=selectedRefs.filter(id=>id!==refKey(ref));manualRefs.delete(refKey(ref));}renderReferences();queuePreview();};
        const name=node('label'),url=ref.url&&sameOriginUrl(ref.url);name.append(check);if(ref.type==='image'&&url){const image=node('img');image.src=url;image.alt='';image.loading='lazy';name.append(image);}name.append(node('span',`${ref.code||''} · ${({image:'图片',video:'视频',audio:'音频'})[ref.type]||'素材'} · ${ref.name}`));row.append(name);if(url){const preview=button(ref.type==='image'?'放大预览':ref.type==='audio'?'试听播放':'播放视频',()=>window.previewCameraAsset(ref));row.append(preview);}
        const position=selectedRefs.indexOf(refKey(ref));if(position>=0){row.append(node('span',`引用 ${position+1}`,'showcase-reference-order'));for(const[delta,label]of[[-1,'↑'],[1,'↓']]){const b=button(label,()=>{const next=position+delta;if(next<0||next>=selectedRefs.length)return;[selectedRefs[position],selectedRefs[next]]=[selectedRefs[next],selectedRefs[position]];renderReferences();queuePreview();});b.title=delta<0?'向前调整引用顺序':'向后调整引用顺序';b.disabled=position+delta<0||position+delta>=selectedRefs.length;b.dataset.refBoundary=b.disabled?'true':'false';row.append(b);}}
        refList.append(row);
      }if(!refs.length)refList.append(node('p',real()?'当前分镜没有可用引用素材；文字模式可直接预览。':'示例不读取项目引用素材。','muted'));refreshControls();
    }
    function renderAudit(data){auditBody.replaceChildren();for(const issue of data?.issues||[]){const p=node('p',null,`showcase-issue ${issue.severity||'info'}`);p.append(node('strong',issue.message),node('span',issue.suggestion));auditBody.append(p);}if(!data?.issues?.length)auditBody.append(node('p','未发现阻断项。成片的运动与一致性仍需观看核对。','muted'));audit.open=data?.status==='blocked';}
    function renderParameters(data,items=prepared?.warnings||[]){parameters.replaceChildren();const labels={workflowName:'工作流',mode:'模式',duration:'请求时长（秒）',actualDuration:'实际时长（秒）',width:'实际宽度',height:'实际高度',frames:'帧数',fps:'帧率',resolution:'参数规格',aspectRatio:'画幅',audio:'声音',seed:'随机种子'};for(const[k,label]of Object.entries(labels)){if(data?.[k]==null)continue;parameters.append(node('dt',label),node('dd',k==='audio'?(data[k]?'开启':'关闭'):k==='mode'?(window.cameraModeLabel?.(String(data[k]))||String(data[k])):String(data[k])));}warnings.replaceChildren();for(const warning of items)warnings.append(node('p',typeof warning==='string'?warning:warning.message||String(warning)));}
    function queuePreview(delay=260){if(editingPrompt){overridePrompt=promptEditor.getDraft()||overridePrompt;promptEditor.reset();}previewError='';clearTimeout(timer);previewEpoch++;prepared=null;renderKey='';preparing=true;prompt.value='';parameters.replaceChildren();warnings.replaceChildren();copy.disabled=true;promptLabel.textContent='视频提示词 · 正在更新';generate.disabled=true;const move=config.moves.find(m=>m.id===motion.value);moveInfo.textContent=move?`${move.description} ${move.path}`:'';diagram.reset();refreshControls();timer=setTimeout(preview,delay);}
    async function preview(){const epoch=previewEpoch;if(request){const snapshot=request.preview;prompt.value=snapshot?.prompt||'';renderAudit(snapshot?.audit);renderParameters(snapshot?.parameters,snapshot?.warnings||[]);promptLabel.textContent='待确认提交 · 原提示词与参数';say('上一切片提交尚未确认。请先确认同一次提交，重试使用原提示词与参数。');preparing=false;refreshControls();return;}if(!state().options){preparing=false;prompt.value='';refreshControls();return;}
      try{
        if(real()){
          if(loadingResources||loadingWorkflows)return;
          const source=overridePrompt||Object.values(state().options).filter(v=>typeof v==='string').join('\n');if(!manualSettings.has('aspectRatio')){const ratios=[...new Set((overridePrompt.match(/(?:16[:：]9|9[:：]16|1[:：]1|4[:：]3|3[:：]4|21[:：]9|3[:：]2|2[:：]3)/g)||[]).map(v=>v.replace('：',':')))];aspectRatio.value=ratios.length===1?ratios[0]:context.aspectRatio||'16:9';}
          const result=await api('clipRecommend',{...target(),prompt:source,duration:Number(state().options.duration)||5,mode:state().options.mode,references:selectedReferenceObjects().filter(r=>manualRefs.has(refKey(r))).map(r=>({id:r.id,sources:r.sources})),order:selectedReferenceObjects().map(r=>({id:r.id,sources:r.sources}))});
          if(epoch!==previewEpoch)return;
          autoRefs=(result.automatic||[]).map(refKey);selectedRefs=(result.references||[]).map(refKey);linkIssues=result.issues||[];recommendationWarnings=result.warnings||[];
          const p=result.parameters;
          if(p){
            if(!manualSettings.has('workflow')&&workflow.value!==p.workflowId){workflow.value=p.workflowId;configureWorkflow(true);}
            const w=selectedWorkflow();
            if(!mode.options.length&&w)configureWorkflow(true);
            if(w?.id===p.workflowId){
              if(!manualSettings.has('mode'))mode.value=p.mode;
              if(!manualSettings.has('resolution'))resolution.value=p.resolution;
              if(!manualSettings.has('duration'))updateDuration(p.duration);
              if(!manualSettings.has('audio'))audio.checked=p.audio;
            }
            workflowNote.textContent=(manualSettings.size?'保留手动设置；可点击“按提示词自动匹配”恢复推荐。':'已按提示词引用、分镜时长自动匹配工作流与参数。')+' '+recommendationWarnings.join(' ')+(selectedWorkflow()?.parameterCapabilities?` 可自定义；当前节点时长上限 ${selectedWorkflow().parameterCapabilities.duration.max} 秒，宽高按 ${selectedWorkflow().parameterCapabilities.width.step} 像素对齐。`:'');
          }else{linkIssues.push(...recommendationWarnings);}
          renderReferences();
        }
        const snapshot=body(),signature=JSON.stringify(snapshot),problem=localProblem();
        const result=problem?(real()?await api('promptText',{...target(),options:snapshot.options,motionId:snapshot.motionId,...(overridePrompt?{promptOverride:overridePrompt}:{})}):await api('preview',{options:snapshot.options,motionIds:[snapshot.motionId]})):await api('clipPreview',snapshot);if(epoch!==previewEpoch||signature!==key())return;
        if(problem){variant=result.variants?.[0];prompt.value=result.prompt||variant?.videoPrompt||'';renderAudit(result.audit||variant?.audit);promptLabel.textContent='视频提示词 · 运镜文字预览';renderParameters(null);say(problem);}else{prepared=result;variant=null;renderKey=signature;prompt.value=result.prompt||'';renderAudit(result.audit);renderParameters(result.parameters,[...(result.warnings||[]),...recommendationWarnings]);promptLabel.textContent='视频提示词 · 将按以下参数提交';say(result.canGenerate?'提示词与参数已准备好。点击生成后才提交此切片。':'当前方案尚不能生成，请处理审计或参数提示。',!result.canGenerate);}
      }catch(error){if(epoch!==previewEpoch)return;prepared=null;previewError=error.message;if(!prompt.value)prompt.value=overridePrompt||Object.values(state().options||{}).filter(v=>typeof v==='string').join('\n');promptLabel.textContent='视频提示词 · 更新失败';say(error.message,true);}finally{if(epoch===previewEpoch){preparing=false;refreshControls();}}
    }
    function tokenExpired(){const raw=prepared?.expiresAt;if(!raw)return false;let value=typeof raw==='number'?raw:Date.parse(raw);if(typeof raw==='string'&&/^\d+$/.test(raw))value=Number(raw);if(value<1e12)value*=1000;return Number.isFinite(value)&&Date.now()>=value;}
    function renderReadiness(){
      if(!readiness)return;
      readiness.replaceChildren();const problem=localProblem();let message='',action='',go=null;
      if(submitting)message='正在提交，请稍候；任务结果将在下方“生成切片”显示。';
      else if(request)message='上次提交尚未确认。请点击“重试确认同一次提交”，避免重复生成。';
      else if(isBusy()||loadingResources||loadingWorkflows)message='正在载入分镜、工作流和素材，完成后自动检查生成条件。';
      else if(!real())message='请选择左侧的实际分镜，再配置视频工作流。';
      else if(editingPrompt){message='提示词正在编辑，请先点击“完成编辑”。';action='返回编辑区';go=()=>promptPanel.scrollIntoView({behavior:'smooth',block:'center'});}
      else if(problem){message=problem;
        if(!selectedWorkflow()||!selectedMode()||/种子|时长|规格|不可用/.test(problem)){action='检查生成设置';go=()=>{controls.scrollIntoView({behavior:'smooth',block:'center'});workflow.focus({preventScroll:true});};}
        else {action='选择参考素材';go=()=>{referencesBox.open=true;referencesBox.scrollIntoView({behavior:'smooth',block:'center'});};}
      }
      else if(preparing)message='正在检查提示词和参数，请稍候。';
      else if(previewError){message='准备失败：'+previewError;action='重新检查';go=()=>queuePreview(0);}
      else if(prepared?.audit?.status==='blocked'){
        const issues=prepared.audit.issues.filter(i=>i.severity==='error');message='请先补全：'+issues.map(i=>i.message+' '+i.suggestion).join(' ');action='补充分镜信息';
        go=()=>{audit.open=true;const fieldId={narrative_missing:'narrative',opening_missing:'openingFrame',end_reference_missing:'endingFrame'}[issues[0]?.code];const field=fieldId&&document.getElementById(fieldId);(field||audit).scrollIntoView({behavior:'smooth',block:'center'});field?.focus({preventScroll:true});};
      }
      else if(!prepared?.prepareToken||renderKey!==key()||tokenExpired()){message='请刷新提示词与参数，检查完成后即可生成。';action='刷新提交预览';go=()=>queuePreview(0);}
      else if(prepared.canGenerate)message='已准备就绪。点击下方“生成此运镜切片”开始生成，进度和成片会显示在“生成切片”区域。';
      else message='当前参数尚未通过检查，请查看文字审计与使用条件。';
      readiness.append(node('p',message));if(action&&go)readiness.append(button(action,go));
      if(/素材|图片|视频/.test(problem)&&selectedWorkflow())readiness.append(node('p','提示词中的资产卡片会自动关联实际文件。无可用文件或引用不明确时，请先修复素材或重新插入资产卡片。','muted'));
      generate.title=message;reviewTitle.textContent=prepared?.parameters?'本次提交预览':'生成前检查';
    }
    function refreshControls(){const locked=!!isBusy()||submitting,pendingLocked=locked||!!request;container.querySelectorAll('button,input,select').forEach(n=>n.disabled=pendingLocked);audio.disabled=pendingLocked||selectedWorkflow()?.audio==='none'||selectedWorkflow()?.audio==='required';container.querySelectorAll('[data-ref-boundary="true"]').forEach(n=>n.disabled=true);copy.disabled=locked||preparing||!prompt.value;generate.disabled=editingPrompt||locked||preparing||loadingResources||!real()||!prepared?.canGenerate||!prepared?.prepareToken||renderKey!==key()||tokenExpired()||!!request;retry.hidden=!request;retry.disabled=locked||!request;refreshClipsButton.disabled=locked||!real();playAll.disabled=locked||comparison.size<2;pauseAll.disabled=locked||comparison.size<2;diagram.setBusy(locked);workflowPreview?.sync(selectedWorkflow(),mode.value);workflowPreview?.refresh();promptEditor?.refresh();resetOriginal.disabled=locked||!!request||!state().options;goGenerate.disabled=false;motionToggle.disabled=false;diagramToggle.disabled=false;renderReadiness();}
    async function submit(retrying){if(isBusy()||submitting)return;const submitBoard=boardKey;
      if(retrying){if(!request)return;}else{if(!real()||preparing||!prepared?.canGenerate||!prepared?.prepareToken||renderKey!==key()||tokenExpired()||request){say('当前提示词或参数已变化，请先刷新提交预览。',true);return;}request={...target(),prepareToken:prepared.prepareToken,requestId:crypto.randomUUID(),confirmed:true,preview:{prompt:prepared.prompt,parameters:prepared.parameters,audit:prepared.audit,warnings:prepared.warnings}};pendingRequests.set(submitBoard,request);persistPending();}
      const submission={projectId:request.projectId,storyboardId:request.storyboardId,prepareToken:request.prepareToken,requestId:request.requestId,confirmed:true};submitting=true;say(retrying?'正在确认同一次提交…':'正在提交独立运镜切片…');refreshControls();
      try{const response=await api('clipGenerate',submission);pendingRequests.delete(submitBoard);persistPending();if(submitBoard!==boardKey)return;request=null;if(response.clip){clips=[response.clip,...clips.filter(c=>c.id!==response.clip.id)];renderClips();}say(response.duplicate?'已找到同一次切片任务，没有重复提交。':'切片任务已提交，可在下方查看进度。');prepared=null;renderKey='';loadClips();}
      catch(error){if(submitBoard!==boardKey)return;if(error.status&&error.status>=400&&error.status<500&&![408,429].includes(error.status)){pendingRequests.delete(submitBoard);persistPending();request=null;say(error.message,true);}else{say(`提交状态尚未确认：${error.message}。重试将沿用同一请求编号与原参数。`,true);promptLabel.textContent='待确认提交 · 原提示词与参数';}}
      finally{submitting=false;refreshControls();}
    }
    function schedulePoll(){clearTimeout(pollTimer);if(!document.hidden&&real()&&clips.some(clip=>['queued','running','uncertain'].includes(clip.status)))pollTimer=setTimeout(()=>loadClips(true),5000);}
    async function loadClips(quiet=false){if(!real())return;const epoch=resourceEpoch,listing=++listEpoch,forBoard=boardKey;try{const result=await api('clipList',target());if(epoch!==resourceEpoch||forBoard!==boardKey||listing!==listEpoch)return;const next=result.clips||[];if(request&&next.some(clip=>clip.id===request.requestId)){pendingRequests.delete(boardKey);persistPending();request=null;refreshControls();}if(JSON.stringify(clips)!==JSON.stringify(next)){clips=next;renderClips();}}catch(error){if(epoch===resourceEpoch&&!quiet)say('切片清单刷新失败：'+error.message,true);}finally{if(epoch===resourceEpoch&&listing===listEpoch)schedulePoll();}}
    function videoFor(clip){const url=clip.url&&sameOriginUrl(clip.url);if(!url)return null;const video=node('video');video.controls=true;video.preload='metadata';video.src=url;video.setAttribute('aria-label',`${clip.motionName||clip.motionId}生成切片`);return video;}
    function renderComparison(){const selected=clips.filter(clip=>comparison.has(clip.id)&&clip.status==='completed');for(const [id,card]of comparisonNodes)if(!selected.some(clip=>clip.id===id)){card.remove();comparisonNodes.delete(id);}for(const clip of selected){if(comparisonNodes.has(clip.id))continue;const card=node('div',null,'showcase-compare-card');card.append(node('strong',clip.motionName||clip.motionId));const v=videoFor(clip);if(v)card.append(v);comparisonNodes.set(clip.id,card);comparisonView.append(card);}compareLabel.textContent=selected.length?`已选 ${selected.length} 个成片；同步播放从片头开始。`:'选择最多 4 个成片进行比较';refreshControls();}
    function reviewClip(clip){
      const dialog=node('dialog');dialog.style.cssText='width:min(620px,90vw);border:1px solid #66745c;border-radius:12px;padding:24px;background:#fff;color:#222';
      dialog.append(node('h3','视频切片验收'),node('p','观看本切片后逐项确认。只有五项全部通过才能计入本镜合格数量。'));
      const checks={},labels={action:'主题与动作完整、自然，接触与受力合理',ending:'结束姿态与目光明确，没有突然失神或重新启动',identity:'人物身份、衣着与道具数量正确',continuity:'空间、方向和前后动作连续，没有穿模或跳变',speech:'台词、旁白与声音符合原剧本，没有漏说或新增说话'};
      for(const [key,label]of Object.entries(labels)){const input=node('input');input.type='checkbox';input.checked=!!clip.review?.checks?.[key];checks[key]=input;dialog.append(field(label,input));}
      const notes=node('textarea');notes.rows=4;notes.value=clip.review?.notes||'';notes.setAttribute('aria-label','验收依据与问题');notes.placeholder='记录实际看到的动作、结尾和声音；不合格时写明问题。';notes.style.width='100%';dialog.append(field('验收依据与问题',notes));
      const message=node('p');dialog.append(message);const actions=node('div');actions.style.cssText='display:flex;gap:10px';
      async function save(status){try{if(notes.value.trim().length<8)throw Error('请填写至少八个字的实际验收依据。');const values=Object.fromEntries(Object.entries(checks).map(([k,v])=>[k,v.checked]));if(status==='accepted'&&!Object.values(values).every(Boolean))throw Error('请完成五项检查，未通过项不能勾选。');const epoch=resourceEpoch;await api('clipReview',{projectId:clip.projectId,storyboardId:clip.storyboardId,clipId:clip.id,status,checks:values,notes:notes.value});dialog.close();if(epoch===resourceEpoch)await loadClips();}catch(e){message.textContent=e.message;}}
      actions.append(button('标为合格',()=>save('accepted')),button('标为不合格',()=>save('rejected')),button('取消',()=>dialog.close()));dialog.append(actions);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
    }
    function renderClips(){results.querySelectorAll('.showcase-empty').forEach(n=>n.remove());for(const [id,entry]of clipNodes)if(!clips.some(clip=>clip.id===id)){entry.node.remove();clipNodes.delete(id);}for(const id of [...comparison])if(!clips.some(c=>c.id===id&&c.status==='completed'))comparison.delete(id);const names={queued:'排队中',running:'生成中',completed:'已生成 · 待验收',failed:'生成失败',uncertain:'状态待确认'};
      for(let clipIndex=0;clipIndex<clips.length;clipIndex++){
        const clip=clips[clipIndex],signature=JSON.stringify(clip),existing=clipNodes.get(clip.id);if(existing?.signature===signature)continue;
        const card=node('article',null,'showcase-clip'),media=node('div',null,'showcase-clip-media'),body=node('div',null,'showcase-clip-body'),head=node('div',null,'showcase-clip-heading');
        const stateText=clip.review?.status==='accepted'?'已验收合格':clip.review?.status==='rejected'?'不合格 · 已保留':clip.review?.status==='stale'?'分镜已更新 · 待复核':names[clip.status]||clip.status;
        head.append(node('h4',clip.motionName||clip.motionId),node('span',stateText,'showcase-clip-state'));body.append(head);
        const info=clip.parameters||{},meta=[info.workflowName,info.duration?`${info.duration} 秒`:null,info.resolution,info.aspectRatio,info.width?`${info.width}×${info.height}`:null,info.audio?'含声音':'无声音',clip.createdAt?new Date(Number(clip.createdAt)||clip.createdAt).toLocaleString():null].filter(Boolean).join(' · ');
        body.append(node('p',meta,'muted showcase-clip-meta'));
        if(clip.status==='completed'){const video=videoFor(clip);if(video)media.append(video);}else media.append(node('span',stateText,'showcase-clip-placeholder'));
        if(clip.status==='completed'){
          const actions=node('div',null,'showcase-clip-actions'),check=node('input');check.type='checkbox';check.checked=comparison.has(clip.id);check.onchange=()=>{if(check.checked&&comparison.size>=4){check.checked=false;say('一次最多比较 4 个切片。',true);return;}check.checked?comparison.add(clip.id):comparison.delete(clip.id);renderComparison();};const label=field('加入比较',check);label.classList.add('showcase-compare-choice');
          const inspect=button('检测文件',async()=>{const epoch=resourceEpoch;inspect.disabled=true;inspect.textContent='检测中…';try{await api('clipAudit',{projectId:clip.projectId,storyboardId:clip.storyboardId,clipId:clip.id});if(epoch===resourceEpoch){await loadClips();say('文件检测完成，动作、画面与声音内容仍需验收。');}}catch(e){if(epoch===resourceEpoch)say('检测失败：'+e.message,true);}finally{inspect.disabled=false;inspect.textContent='检测文件';}});
          actions.append(label,inspect,button(clip.review?'查看验收':'验收',()=>reviewClip(clip)));const url=clip.url&&sameOriginUrl(clip.url);if(url){const link=node('a','下载');link.href=url;link.download=`camera-${String(clip.id).replace(/[^a-z0-9_-]/gi,'')}.mp4`;actions.append(link);}body.append(actions);
        }
        body.append(node('span','保留为测试记录','showcase-retained'));
        if(clip.technicalAudit){const report=node('details');report.append(node('summary',clip.technicalAudit.status==='fail'?'文件检测发现问题':'文件已检测 · 成片内容待复核'));const states={pass:'通过',fail:'不通过',unverified:'未确认',not_applicable:'不适用'};for(const item of clip.technicalAudit.checks||[])report.append(node('p',`${item.label}：${states[item.status]||item.status}。${item.evidence}`));report.append(node('p','检测时间：'+new Date(clip.technicalAudit.createdAt).toLocaleString(),'muted'));body.append(report);}
        if(clip.error)body.append(node('p',clip.error,'showcase-error'));const detail=node('details');detail.append(node('summary','提示词与参数'),node('pre',clip.prompt||''),node('pre',JSON.stringify(info,null,2)));body.append(detail);card.append(media,body);
        if(existing){const oldVideo=existing.node.querySelector('video'),newVideo=card.querySelector('video');if(oldVideo&&newVideo&&oldVideo.src===newVideo.src)newVideo.replaceWith(oldVideo);existing.node.replaceWith(card);}else results.insertBefore(card,results.children[clipIndex]||null);clipNodes.set(clip.id,{node:card,signature});
      }resultTitle.querySelector('p').textContent=`本镜合格 ${new Set(clips.filter(c=>c.review?.status==='accepted').map(c=>c.review.mediaSha256)).size} / 4 个 · 已生成 ${clips.filter(c=>c.status==='completed').length} 个；未验收与不合格不计入。`;if(!clips.length)results.append(node('p','尚无生成切片。上方几何示意不会自动生成影片。','showcase-empty'));renderComparison();schedulePoll();
    }
    async function loadResources(){const epoch=++resourceEpoch;clearTimeout(pollTimer);loadingResources=true;context={references:[]};selectedRefs=[];autoRefs=[];manualRefs.clear();linkIssues=[];manualSettings.clear();clips=[];comparison.clear();renderReferences();renderClips();if(!real()){loadingResources=false;queuePreview(0);return;}
      try{const result=await api('clipContext',target());if(epoch!==resourceEpoch)return;context={...result,references:result.references||[]};aspectRatio.value=result.aspectRatio||'16:9';catalogInfo.textContent=`本剧编号：${result.catalog?.productionCode||''} · 固定素材目录：${result.catalog?.root||''}`;renderReferences();refNote.textContent=`提示词引用自动关联；也可手动补充素材。按选中顺序传入，画幅 ${result.aspectRatio||'以工作流预览为准'}。箭头可调整引用顺序。`;await loadClips();}catch(error){if(epoch===resourceEpoch)say('引用素材载入失败：'+error.message,true);}finally{if(epoch===resourceEpoch){loadingResources=false;queuePreview(0);}}
    }
    function syncContext(){const s=state(),nextKey=real()?`${s.projectId}:${s.storyboardId}`:'demo';const nextOptions=JSON.stringify(s.options||{});if(nextKey!==boardKey){rememberDraft();promptEditor?.reset();overridePrompt='';boardKey=nextKey;request=pendingRequests.get(boardKey)||null;seed.value=String(boardSeeds.get(boardKey)??crypto.getRandomValues(new Uint32Array(1))[0]);rememberSeed();optionsKey=nextOptions;restoreDraft();queuePreview(0);loadResources();}else if(nextOptions!==optionsKey){optionsKey=nextOptions;promptEditor?.reset();overridePrompt='';queuePreview();}refreshControls();}
    function rememberDraft(){const text=promptEditor?.getDraft()||overridePrompt;if(text)promptDrafts.set(boardKey+':'+(draftContext||motion.value),{text,optionsKey});}
    function restoreDraft(){draftContext=motion.value;const d=promptDrafts.get(boardKey+':'+motion.value);overridePrompt=d?.optionsKey===optionsKey?d.text:'';}
    motion.onchange=()=>{rememberDraft();promptEditor?.reset();restoreDraft();queuePreview(0);};workflow.onchange=()=>{manualSettings.add('workflow');manualSettings.add('mode');configureWorkflow();};mode.onchange=()=>{manualSettings.add('mode');renderReferences();queuePreview();};resolution.onchange=()=>{manualSettings.add('resolution');updateDuration(duration.value);queuePreview();};aspectRatio.onchange=()=>{manualSettings.add('aspectRatio');queuePreview();};duration.onchange=()=>{manualSettings.add('duration');queuePreview();};audio.onchange=()=>{manualSettings.add('audio');queuePreview();};seed.oninput=()=>{if(seed.value.trim()!==''&&Number.isSafeInteger(Number(seed.value))&&Number(seed.value)>=0)rememberSeed();queuePreview();};
    document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(pollTimer);else schedulePoll();});
    (async()=>{try{const result=await api('clipWorkflows');workflows=result.workflows||[];fillSelect(workflow,[{value:'',label:'选择已配置的工作流'},...workflows.map(w=>({value:w.id,label:w.name+(w.available===false?'（不可用）':'')}))],'');workflowNote.textContent=result.notice||'选择工作流后检查输入模式、时长、规格和实际素材。';}catch(error){workflow.replaceChildren(new Option('工作流载入失败',''));workflowNote.textContent=error.message;}finally{loadingWorkflows=false;syncContext();queuePreview(0);}})();
    renderClips();diagram.reset();refreshControls();
    return{syncContext,refreshControls,refreshPreview:()=>queuePreview(0)};
  };
})();
