(() => {
  const $ = id => document.getElementById(id);
  let inventory, selected, current;
  const anchorLabels = {subject:'主体身份与外观',style:'整体风格',composition:'框架与构图',continuity:'连续性要求',allowedChanges:'允许的小幅变化',exclusions:'禁止变化与负向要求'};
  const status = text => $('message').textContent = text;
  async function api(endpoint, body) {
    const r = await fetch('/api/promptStandards/'+endpoint, {method:body?'POST':'GET', headers:{'Content-Type':'application/json',Authorization:localStorage.getItem('token')||''}, ...(body?{body:JSON.stringify(body)}:{})});
    const data = await r.json();
    if (!r.ok) throw Error(data.message || '请求失败');
    return data.data;
  }
  async function act(fn) { try { await fn(); } catch(e) { status(e.message); } }
  function target() { return {projectId:Number($('project').value),kind:selected.kind,targetId:selected.id}; }
  function download(value, name) { const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
  async function refreshList() { inventory=await api('list',{projectId:Number($('project').value)});renderList(); }
  function renderList() {
    $('list').replaceChildren();const type=$('kind').value,search=$('search').value.toLowerCase();
    const rows = type==='track'?inventory.tracks:type==='storyboard'?inventory.boards.map(b=>({...b,name:`剧集 ${b.scriptId} · S${Number(b.index)+1}`})):inventory.assets.filter(a=>a.type===type);
    for(const row of rows.filter(r=>r.name.toLowerCase().includes(search))) {
      const kind=['role','scene','tool'].includes(type)?'asset':type;const count=inventory.statuses[`${kind}:${row.id}`]?.count||0;
      const button=document.createElement('button');button.textContent=`${row.name} · ${count} 组`;button.className=selected?.id===row.id&&selected?.kind===kind?'active':'';
      button.onclick=()=>act(async()=>{selected={...row,kind};renderList();await load();});$('list').append(button);
    }
    if(!rows.length)$('list').textContent='该类型暂无资产或镜头';
  }
  async function load() {
    const thisTarget=target(), loaded=await api('get',thisTarget);
    if(thisTarget.targetId!==selected?.id||thisTarget.kind!==selected?.kind||thisTarget.projectId!==Number($('project').value))return;
    current=loaded;
    $('detail').classList.remove('hidden');$('empty').classList.add('hidden');$('title').textContent=selected.name;
    let cameraLink=document.getElementById('camera-target-link');
    if(!cameraLink){cameraLink=document.createElement('a');cameraLink.id='camera-target-link';cameraLink.style.cssText='display:inline-block;margin-top:12px';$('title').parentElement.append(cameraLink);}
    cameraLink.classList.toggle('hidden',!['storyboard','track'].includes(selected.kind));cameraLink.textContent='设计多种运镜 / 镜头审计 →';
    cameraLink.href='/camera-studio.html?projectId='+Number($('project').value)+'&'+(selected.kind==='track'?'trackId':'storyboardId')+'='+selected.id;
    const b=current.bundle;$('source').value=current.source;
    $('meta').textContent=b?`版本 ${b.revision} · ${b.variants.length} 组 · 固定种子 ${b.seed} · ${b.model}`:'尚未建立提示词标准';
    $('missing').textContent=(current.missingAssets.length?'尚无参考图片的关联资产：'+current.missingAssets.join('、')+'。':'')+(current.sourceChanged?' 原始内容已变化，请更新三组方案。':'');
    $('preview').classList.toggle('hidden',!current.preview);if(current.preview)$('preview').src='/oss/'+current.preview.replace(/^\//,'');
    $('anchors').replaceChildren();for(const [key,label] of Object.entries(anchorLabels)){const box=document.createElement('div'),lab=document.createElement('label'),text=document.createElement('textarea');lab.textContent=label;text.id='anchor-'+key;text.rows=4;text.value=b?.anchor[key]||'';lab.htmlFor=text.id;box.append(lab,text);$('anchors').append(box);}
    $('variants').replaceChildren();for(const v of b?.variants||[]){const div=document.createElement('div');div.className='variant';const h=document.createElement('h3');h.textContent=v.name+(v.id===b.selected?' · 当前采用':'');const sub=document.createElement('p');sub.className='muted';sub.textContent=v.difference;const text=document.createElement('textarea');text.readOnly=true;text.value=v.prompt;text.setAttribute('aria-label',v.name+'完整提示词');const copy=document.createElement('button');copy.textContent='复制';copy.onclick=()=>act(async()=>{await navigator.clipboard.writeText(v.prompt);status('已复制完整提示词');});const apply=document.createElement('button');apply.textContent='采用此组';apply.onclick=()=>act(async()=>{await api('apply',{...target(),selected:v.id});await load();status('已更新提示词；返回原页面刷新即可使用。未生成媒体。');});div.append(h,sub,text,copy,apply);$('variants').append(div);}
    $('recipes').replaceChildren();for(const r of current.recipes){const div=document.createElement('div');div.className='recipe';const title=document.createElement('div');title.textContent=`${r.state} · ${r.model} · 种子 ${r.data.seed} · ${new Date(r.createdAt).toLocaleString()}`;div.append(title);if(r.filePath){const link=document.createElement('a');link.href='/oss/'+r.filePath.replace(/^\//,'');link.textContent='查看原图';link.target='_blank';div.append(link);}
      const detail=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='参数与校验值';pre.style.whiteSpace='pre-wrap';pre.textContent=JSON.stringify(r.data,null,2);detail.append(summary,pre);div.append(detail);
      if(r.state==='已完成'&&r.data.replaySupported){const check=document.createElement('button');check.textContent='校验复现资料';check.onclick=()=>act(async()=>{status('校验工作流、模型和参考图…');await api('checkReplay',{projectId:Number($('project').value),recipeId:r.id});status('校验通过；未生成图片。');});const replay=document.createElement('button');replay.textContent='按原参数复现图片';replay.onclick=()=>act(async()=>{if(!confirm('将使用本地 GPU 生成一张复现图片，作为独立候选保存。确定开始？'))return;replay.disabled=true;status('复现任务已开始，请勿重复提交。');try{const result=await api('replay',{projectId:Number($('project').value),recipeId:r.id,generate:true});await load();status('复现完成，独立候选已保存：'+result.filePath);}finally{replay.disabled=false;}});div.append(check,replay);}$('recipes').append(div);}
    if(!current.recipes.length)$('recipes').textContent='尚无可追溯记录。旧图片需要匹配原始生成记录；新生成图片会自动保存复现资料。';
  }
  $('project').onchange=()=>act(async()=>{selected=null;current=null;$('detail').classList.add('hidden');$('empty').classList.remove('hidden');await refreshList();status('已切换项目');});
  $('kind').onchange=()=>{selected=null;current=null;$('detail').classList.add('hidden');$('empty').classList.remove('hidden');renderList();};$('search').oninput=renderList;
  $('prepare').onclick=()=>act(async()=>{const b=$('prepare');b.disabled=true;status('正在为已有资产与切片建立文字方案…');try{const r=await api('prepareProject',{projectId:Number($('project').value)});await refreshList();if(selected)await load();status(`已建立 ${r.created} 项，保留 ${r.existing} 项。`+(r.skipped.length?' 待补描述：'+r.skipped.join('；'):' 未生成图片或视频。'));}finally{b.disabled=false;}});
  $('build').onclick=()=>act(async()=>{await api('build',target());await load();await refreshList();status('三组文字方案已保存。');});
  $('saveAnchor').onclick=()=>act(async()=>{const anchor=Object.fromEntries(Object.keys(anchorLabels).map(k=>[k,$('anchor-'+k).value]));await api('build',{...target(),anchor});await load();status('锚点与三组方案已保存为新版本。');});
  $('reset').onclick=()=>act(async()=>{if(!confirm('将当前选中的图片设为新基准，旧版锚点和提示词仍保留。继续？'))return;await api('build',{...target(),reset:true});await load();status('已固定新基准。');});
  $('export').onclick=()=>{if(current?.bundle)download(current.bundle,selected.name+'-提示词与锚点.json');};
  $('openTemplates').onclick=()=>$('templates').classList.remove('hidden');$('closeTemplates').onclick=()=>$('templates').classList.add('hidden');
  $('createCharacter').onclick=()=>act(async()=>{const name=$('characterName').value.trim();if(!name)throw Error('请填写人物名称');const result=await api('createCharacter',{projectId:Number($('project').value),name,style:$('characterStyle').value,gender:$('gender').value,description:$('characterDescription').value});$('kind').value='role';await refreshList();selected={id:result.id,name,kind:'asset'};renderList();await load();status('人物资产与三组提示词已建立，未生成图片。');});
  act(async()=>{const projects=await api('projects');for(const p of projects){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;$('project').append(o);}const params=new URLSearchParams(location.search);if(projects.some(p=>String(p.id)===params.get('projectId')))$('project').value=params.get('projectId');const byName=projects.find(p=>p.name===params.get('projectName'));if(byName)$('project').value=byName.id;const t=await api('templates');for(const s of t.characterStyles){const card=document.createElement('article'),title=document.createElement('strong'),p=document.createElement('p');title.textContent=s.name+' · 默认女性';p.textContent=s.style;card.append(title,p);for(const v of s.variants){const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('textarea');summary.textContent=v.name;text.value=v.prompt;text.rows=8;text.readOnly=true;details.append(summary,text);card.append(details);}$('styles').append(card);}$('layout').textContent=t.fourViewLayout;await refreshList();status('就绪。建立方案与保存锚点只处理文字。');});
})();
