/* Classified camera skills: persisted per-user curation, separate from shot drafts. */
(() => {
  'use strict';
  const labels = {shotSize:'景别',angle:'机位',lens:'焦距参考',focus:'焦点',lighting:'光线',duration:'时长',speed:'节奏',amplitude:'幅度与落点',axisSide:'轴线侧',screenDirection:'主体方向',eyeline:'视线',continuity:'连续性',axisReason:'空间转换依据',stability:'稳定性',mode:'生成模式',purpose:'叙事目的'};
  const node = (tag, text, className) => {const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;};
  const button = (text, fn, className) => {const b=node('button',text,className);b.type='button';b.onclick=fn;return b;};
  const addOptions = (select, items, first) => {const old=select.value;select.replaceChildren();for(const [value,label] of [['',first],...items]){const o=node('option',label);o.value=value;select.append(o);}if([...select.options].some(o=>o.value===old))select.value=old;};
  const sourceLink = source => {try{const url=new URL(source.url);if(!['https:','http:'].includes(url.protocol))throw Error();const a=node('a',source.label);a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return node('span',source.label||'本地编排');}};
  window.createCameraSkillLibrary = async function(config){
    const {container,api,applySkill,getOptions,getMotionId,status}=config;
    let data,loading=false;
    container.replaceChildren();
    container.append(node('p','按「要表达什么」和「需要什么条件」找技能。主运镜、景别、机位、焦点与表演分开管理；收藏、分组和笔记会保存在当前账号。','muted'));
    const toolbar=node('div',null,'skill-toolbar');
    const search=node('input');search.type='search';search.placeholder='搜索名称、用途、要求或笔记';search.setAttribute('aria-label','搜索技能');
    const domain=node('select'),mechanism=node('select'),group=node('select'),scope=node('select');
    for(const [select,title]of [[domain,'技能主分类'],[mechanism,'运动机制'],[group,'我的技能分组'],[scope,'技能显示范围']])select.setAttribute('aria-label',title);
    addOptions(scope,[['favorite','我的收藏'],['custom','自定义模板'],['hidden','已隐藏']], '全部可见技能');
    toolbar.append(search,domain,mechanism,group,scope);container.append(toolbar);
    const actions=node('div',null,'skill-actions'),count=node('span','','muted');
    actions.append(count,button('保存当前设置为技能',()=>{try{editor();}catch(e){status(e.message,true);}}),button('导出技能清单',()=>{if(!data)return;const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='toonflow-camera-skills.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('技能分类、使用要求与个人整理已导出。');}));container.append(actions);
    const cards=node('div',null,'skill-cards');container.append(cards);
    const sourcesPanel=node('details',null,'skill-sources');sourcesPanel.append(node('summary','按参考影片章节查找技能'));container.append(sourcesPanel);
    if(config.h3Recipes?.length){
      const recipesPanel=node('details',null,'skill-sources');recipesPanel.append(node('summary',`H3 生成配方 · ${config.h3Recipes.length} 项`));
      recipesPanel.append(node('p','选择 H3 模型后，单个与批量「生成提示词」会按分镜条件使用这些配方。已采用的运镜优先；配方不添加人物、台词或动作。来源效果不代表本机成片已验收。','muted'));
      const query=node('input'),items=node('div',null,'skill-source-entries');query.type='search';query.placeholder='搜索 H3 配方、要求或运镜';query.setAttribute('aria-label','搜索 H3 生成配方');recipesPanel.append(query,items);
      const renderRecipes=()=>{items.replaceChildren();const q=query.value.trim().toLowerCase();for(const recipe of config.h3Recipes.filter(r=>!q||JSON.stringify([r.id,r.name,r.primitives,r.requirements]).toLowerCase().includes(q))){
        const row=node('article',null,'skill-source-entry');row.append(node('h3',recipe.name),node('p',recipe.primitives.join(' + '),'skill-meta'));
        const details=node('details');details.append(node('summary','生成要求与摄影段落'),node('h4','起始构图'),node('p',recipe.opening));
        listSection(details,'使用条件',recipe.requirements);details.append(node('h4','摄影指令'),node('p',recipe.instruction,'skill-usage'));listSection(details,'效果与限制',recipe.limitations);
        details.append(sourceLink({label:'查看来源配方（作者记录）',url:recipe.sourceUrl}));row.append(details);items.append(row);
      }if(!items.children.length)items.append(node('p','没有匹配配方。','muted'));};query.oninput=renderRecipes;renderRecipes();container.append(recipesPanel);
    }
    async function loadSourceIndex(){
      try{
        const response=await fetch('/camera-source-index.json');if(!response.ok)throw Error('来源索引暂不可读取');const index=await response.json();
        const picker=node('select'),query=node('input'),intro=node('p',null,'muted'),items=node('div',null,'skill-source-entries');picker.setAttribute('aria-label','参考资料来源');query.type='search';query.placeholder='检索影片章节';query.setAttribute('aria-label','检索影片章节');
        for(const source of index.sources||[]){const o=node('option',source.title+' · '+source.author);o.value=source.id;picker.append(o);}sourcesPanel.append(picker,query,intro,items);
        const renderSources=()=>{items.replaceChildren();const source=index.sources.find(s=>s.id===picker.value);if(!source)return;intro.textContent=source.evidence;const q=query.value.trim().toLowerCase();
          for(const entry of source.entries.filter(e=>!q||(e.title+' '+(e.notes||'')).toLowerCase().includes(q))){
            const row=node('div',null,'skill-source-entry'),url=new URL(source.url);const parts=String(entry.timestamp||'0:00').split(':').map(Number);const seconds=parts.reduce((t,p)=>t*60+p,0);if(seconds)url.searchParams.set('t',String(seconds));
            row.append(sourceLink({label:`${entry.timestamp||''} · ${entry.title}`,url:url.href}));
            if(entry.notes)row.append(node('small',entry.notes,'muted'));
            const links=node('div',null,'skill-card-actions');for(const id of entry.skillIds||[]){const skill=data.skills.find(s=>s.id===id);if(!skill)continue;links.append(button('查看：'+skill.label,()=>{search.value=skill.label;domain.value='';mechanism.value='';group.value='';scope.value=skill.hidden?'hidden':'';render();sourcesPanel.open=false;cards.scrollIntoView({block:'start',behavior:'smooth'});}));}row.append(links);items.append(row);
          }
          if(!items.children.length)items.append(node('p','没有匹配的章节。','muted'));
        };picker.onchange=renderSources;query.oninput=renderSources;renderSources();
      }catch(e){sourcesPanel.append(node('p','来源索引载入失败，可在页面底部查看已核实来源。','muted'));}
    }
    async function run(fn){if(loading)return;loading=true;container.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){status(e.message,true);}finally{loading=false;container.querySelectorAll('button').forEach(b=>b.disabled=!!config.isBusy?.());render();}}
    async function load(){data=await api('skills');addOptions(domain,data.domains.map(d=>[d.id,d.name]),'全部技能分类');addOptions(mechanism,data.mechanisms.map(d=>[d.id,d.name]),'全部运动机制');addOptions(group,data.groups.map(g=>[g,g]),'全部分组');render();}
    async function preference(skill,changes){await run(async()=>{await api('skills/preference',{id:skill.id,...changes});await load();});}
    function listSection(parent,title,items){if(!items?.length)return;parent.append(node('h4',title));const ul=node('ul');items.forEach(item=>ul.append(node('li',item)));parent.append(ul);}
    function render(){
      if(!data)return;cards.replaceChildren();const q=search.value.trim().toLowerCase();
      const matches=data.skills.filter(s=>(scope.value==='hidden'?s.hidden:!s.hidden)&&(!domain.value||s.domain===domain.value)&&(!mechanism.value||s.mechanism===mechanism.value)&&(!group.value||s.group===group.value)&&(scope.value!=='favorite'||s.favorite)&&(scope.value!=='custom'||!s.builtin)&&(!q||JSON.stringify([s.label,s.tags,s.applicable,s.prerequisites,s.inputs,s.notes]).toLowerCase().includes(q)));
      count.textContent=`${matches.length} / ${data.skills.length} 项技能`;
      for(const skill of matches){
        const card=node('article',null,'skill-card'),head=node('div',null,'skill-card-head');
        head.append(node('h3',skill.label),button(skill.favorite?'★ 已收藏':'☆ 收藏',()=>preference(skill,{favorite:!skill.favorite}),'skill-favorite'));card.append(head);
        const meta=[data.domains.find(d=>d.id===skill.domain)?.name,data.mechanisms.find(d=>d.id===skill.mechanism)?.name,skill.group,skill.builtin?'内置':'自定义'].filter(Boolean);
        card.append(node('p',meta.join(' · '),'skill-meta'),node('p',(skill.applicable||[]).join('；')));
        const detail=node('details'),summary=node('summary','要求与使用方法');detail.append(summary);
        listSection(detail,'先决条件',skill.prerequisites);listSection(detail,'需要填写',skill.inputs);
        detail.append(node('h4','使用范式'),node('p',skill.usage||'依据本镜叙事目的设置。','skill-usage'));
        listSection(detail,'不适用 / 冲突',skill.avoid);listSection(detail,'实施风险',skill.risks);
        listSection(detail,'可组合技法',(skill.combinations||[]).map(id=>data.skills.find(s=>s.id===id)?.label||id));
        if(skill.sources?.length){detail.append(node('h4','来源与证据'));const ul=node('ul');for(const source of skill.sources){const li=node('li');li.append(sourceLink(source));ul.append(li);}detail.append(ul);}
        if(skill.notes)detail.append(node('h4','我的笔记'),node('p',skill.notes,'skill-usage'));
        const changes=Object.entries(skill.options||{}).map(([key,value])=>`${labels[key]||key}：${value}`);
        if(changes.length)detail.append(node('h4','应用时更新的设置'),node('p',changes.join('；'),'skill-usage'));
        card.append(detail);
        const footer=node('div',null,'skill-card-actions');
        if(!skill.knowledgeOnly){footer.append(button(skill.motionId?'加入运镜对比':'应用镜头设置',()=>{try{applySkill(skill);status(`已载入「${skill.label}」。${changes.length?'更新：'+changes.join('；')+'。':''}请检查本镜设置后建立对比方案。`);}catch(e){status(e.message,true);}},'primary'));}
        else footer.append(node('span','学习型技法 · 需按要求人工设计','muted'));
        footer.append(button('分组与笔记',()=>curate(skill)),button(skill.hidden?'恢复显示':'隐藏',()=>preference(skill,{hidden:!skill.hidden})));
        if(!skill.builtin)footer.append(button('编辑模板',()=>editor(skill)),button('删除模板',()=>{if(confirm(`删除自定义技能「${skill.label}」？已保存的分镜方案保留。`))run(async()=>{await api('skills/delete',{id:skill.id});await load();});}));
        card.append(footer);cards.append(card);
      }
      if(!matches.length)cards.append(node('p','没有匹配技能。可以切换分类、查看已隐藏技能或保存自己的配置。','muted'));if(config.isBusy?.())cards.querySelectorAll('button').forEach(b=>b.disabled=true);
    }
    function modal(title){const dialog=node('dialog',null,'skill-dialog'),form=node('form');form.append(node('h2',title));dialog.append(form);container.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();return{dialog,form};}
    function field(form,title,value='',multiline=false){const wrap=node('label',title),input=node(multiline?'textarea':'input');if(multiline)input.rows=3;input.value=value;wrap.append(input);form.append(wrap);return input;}
    function closeButtons(form,dialog,save){const row=node('div',null,'skill-actions');row.append(button('取消',()=>dialog.close()));const submit=node('button',save,'primary');submit.type='submit';row.append(submit);form.append(row);return submit;}
    function curate(skill){
      const {dialog,form}=modal(`整理技能 · ${skill.label}`),groupInput=field(form,'分组名称',skill.group||''),notes=field(form,'我的使用笔记',skill.notes||'',true);
      groupInput.maxLength=80;notes.maxLength=4000;const datalist=node('datalist');datalist.id='camera-skill-group-suggestions';for(const name of data.groups){const o=node('option');o.value=name;datalist.append(o);}form.append(datalist);groupInput.setAttribute('list',datalist.id);
      const submit=closeButtons(form,dialog,'保存整理');form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{await api('skills/preference',{id:skill.id,group:groupInput.value.trim(),notes:notes.value.trim()});await load();dialog.close();status('技能分组与笔记已保存。');}catch(error){status(error.message,true);submit.disabled=false;}};
    }
    function editor(skill){
      const options=skill?{...skill.options}:Object.fromEntries(Object.entries(getOptions()).filter(([key])=>Object.hasOwn(labels,key)));
      const {dialog,form}=modal(skill?'编辑自定义镜头技能':'保存当前镜头设置为技能');
      form.append(node('p','模板保存摄影设置。人物、台词、首尾画面与主体动作由每个分镜单独提供。','muted'));
      const name=field(form,'技能名称',skill?.label||''),moveLabel=node('label','绑定主运镜'),move=node('select');move.setAttribute('aria-label','绑定主运镜');
      for(const m of config.moves){const option=node('option',m.name);option.value=m.id;move.append(option);}move.value=skill?.motionId||getMotionId()||'static';moveLabel.append(move);form.append(moveLabel);
      const tags=field(form,'用途标签（用逗号分隔）',(skill?.tags||[]).join('，')),requirements=field(form,'使用要求（每行一条）',(skill?.prerequisites||[]).join('\n'),true),usage=field(form,'提示词用法',skill?.usage||'',true);
      const available=node('details'),summary=node('summary','将保存的摄影设置');available.append(summary,node('p',Object.entries(options).map(([key,value])=>`${labels[key]||key}：${value}`).join('\n'),'skill-usage'));form.append(available);
      name.required=true;name.maxLength=100;usage.maxLength=4000;
      const submit=closeButtons(form,dialog,'保存模板');form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{const source=skill?{id:skill.id,applicable:skill.applicable,avoid:skill.avoid,inputs:skill.inputs,combinations:skill.combinations,risks:skill.risks,sources:skill.sources}:{};const base=data.skills.find(s=>s.builtin&&s.motionId===move.value);await api('skills/save',{...source,domain:base?.domain,mechanism:base?.mechanism,label:name.value.trim(),motionId:move.value,options,tags:tags.value.split(/[,，]/).map(t=>t.trim()).filter(Boolean),prerequisites:requirements.value.split('\n').map(t=>t.trim()).filter(Boolean),usage:usage.value.trim()});dialog.close();status('自定义技能已保存，可以按分类检索、收藏或分组。');try{await load();}catch(refreshError){status('模板已保存，但清单刷新失败，请重新载入页面；无需再次创建。'+refreshError.message,true);}}catch(error){status(error.message,true);submit.disabled=false;}};
    }
    search.oninput=render;for(const select of[domain,mechanism,group,scope])select.onchange=render;
    try{await load();await loadSourceIndex();}catch(e){container.append(node('p','技能库载入失败：'+e.message,'notice'));}
  };
})();
