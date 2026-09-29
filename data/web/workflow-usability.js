(() => {
  // Do not replace Vue-owned nodes: enhance labels and add separate controls only.
  const navigation = {
    'folder-close':'我的项目', 'view-list':'任务列表', 'bill':'问题反馈',
    'setting-one':'设置', 'github-one':'GitHub',
    'color-filter':'AI 编剧', 'peoples-two':'角色与场景', 'carousel-video':'分镜与视频',
  };
  function labelItem(item, text, cls) {
    item.setAttribute('aria-label',text); item.setAttribute('title',text);
    if (!item.querySelector('.'+cls)) {
      const label=document.createElement('span');label.className=cls;label.textContent=text;item.append(label);
    }
    if (!item.hasAttribute('tabindex')) {
      item.tabIndex=0;item.setAttribute('role','button');
      item.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();item.click();}});
    }
  }
  function update() {
    document.querySelectorAll('.deriveAssets .assetCard:not(.emptyCard)').forEach(card=>{
      const name=card.querySelector('.nameText')?.textContent?.trim();if(!name)return;
      card.setAttribute('aria-label',`编辑衍生资产 · ${name}`);card.title=`编辑衍生资产 · ${name}`;card.setAttribute('role','button');card.tabIndex=0;
      if(!card.dataset.workflowKeyboard){card.dataset.workflowKeyboard='1';card.addEventListener('keydown',event=>{if(event.target===card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.stopPropagation();card.click()}})}
    });
    document.querySelectorAll('.historyItemBox .historyItem').forEach((item,index)=>{
      for(const [selector,label] of [['img','预览此视频'],['.selectBtn','采用此视频'],['.download','下载此视频'],['.playBtn','播放此视频'],['.delBtn','删除此视频']]){
        if(selector==='img'&&!item.querySelector('.playBtn'))continue;
        const action=item.querySelector(selector);if(!action)continue;
        action.setAttribute('aria-label',`${label} · 历史版本 ${index+1}`);
        action.title=label;action.setAttribute('role','button');action.tabIndex=0;
        if(!action.dataset.workflowKeyboard){
          action.dataset.workflowKeyboard='1';
          if(selector==='img')action.addEventListener('click',event=>{event.stopPropagation();item.querySelector('.playBtn')?.click()});
          action.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();action.click();}});
        }
      }
    });
    document.querySelectorAll('.vue-flow__node-storyboardTable .md-editor-preview').forEach(preview=>{
      if(!window.ToonflowDurationSummary)return;
      const tables=Array.from(preview.querySelectorAll('table'),table=>Array.from(table.rows,row=>Array.from(row.cells,cell=>cell.textContent.trim())));
      const summary=window.ToonflowDurationSummary.summarize(tables);
      let badge=preview.parentElement.querySelector('.workflow-duration-summary');
      if(!summary.shots){badge?.remove();return;}
      if(!badge){badge=document.createElement('div');badge.className='workflow-duration-summary';badge.setAttribute('role','status');preview.insertAdjacentElement('beforebegin',badge);}
      const script=document.querySelector('.vue-flow__node-script .md-editor-preview')?.textContent||'';
      const range=script.match(/目标时长\s*[：:]\s*(\d+(?:\.\d+)?)\s*[—–~～-]\s*(\d+(?:\.\d+)?)\s*秒/);
      const warnings=[];
      if(summary.invalid)warnings.push(`${summary.invalid} 镜时长无法核算`);
      if(range&&!summary.invalid&&(summary.total<Number(range[1])||summary.total>Number(range[2])))warnings.push(`超出目标 ${range[1]}—${range[2]} 秒`);
      const long=summary.segments.map((seconds,index)=>seconds>15?index+1:null).filter(Boolean);
      if(long.length)warnings.push(`第 ${long.join('、')} 个片段超过 15 秒`);
      const text=`逐行实算：${summary.shots} 镜 · ${summary.invalid?'已知时长 ':''}${summary.total} 秒 · ${summary.segments.length} 个片段${warnings.length?'；'+warnings.join('；'):''}`;
      if(badge.textContent!==text)badge.textContent=text;
      badge.dataset.warning=String(warnings.length>0);
    });
    for(const [icon,label] of Object.entries(navigation)) {
      document.querySelectorAll('.menu .i-icon-'+icon).forEach(node=>{
        const item=node.closest('.item');if(item)labelItem(item,label,'workflow-nav-label');
      });
    }
    for(const [icon,label] of Object.entries({'notebook':'小说原文','color-filter':'剧本规划','document-folder':'剧本管理','peoples-two':'角色与场景','carousel-video':'制作工作台','receive':'资产库'})) {
      document.querySelectorAll('.topMenu .i-icon-'+icon).forEach(node=>{const item=node.closest('.item');if(item)labelItem(item,label,'workflow-top-label');});
    }
    document.querySelectorAll('.project .list .card').forEach(card=>{
      const name=card.querySelector('.title')?.textContent?.trim()||'项目';
      for(const [selector,label] of [['.editBtn','编辑项目'],['.removeBtn','删除项目']]){
        const action=card.querySelector(selector);if(action){action.title=label+'：'+name;action.setAttribute('aria-label',action.title);action.setAttribute('role','button');action.tabIndex=0;if(!action.dataset.workflowKeyboard){action.dataset.workflowKeyboard='1';action.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();action.click();}});}}
      }
      const intro=card.querySelector('.intro');
      if(intro && !card.querySelector('.workflow-summary-toggle')){
        const button=document.createElement('button');button.type='button';button.className='workflow-summary-toggle';button.textContent='展开完整简介';button.setAttribute('aria-expanded','false');
        button.addEventListener('click',event=>{event.stopPropagation();const open=intro.classList.toggle('workflow-expanded');button.setAttribute('aria-expanded',String(open));button.textContent=open?'收起简介':'展开完整简介';});
        intro.insertAdjacentElement('afterend',button);
      }
    });
    document.querySelectorAll('.frameImage').forEach(frame=>{
      const shot=frame.querySelector('.frameTypeTag')?.textContent?.trim()||'分镜';
      for(const [selector,label] of [['.editNode','编辑分镜'],['.generatingPlaceholder','打开分镜画布']]){
        const action=frame.querySelector(selector);if(!action)continue;
        action.setAttribute('aria-label',label+' '+shot);action.setAttribute('role','button');action.tabIndex=0;
        if(!action.dataset.workflowKeyboard){
          action.dataset.workflowKeyboard='1';
          action.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();action.click();}});
        }
      }
    });
    document.querySelectorAll('.workbench .videoPreview').forEach(action=>{
      action.setAttribute('aria-label','打开视频工作台');action.setAttribute('role','button');action.tabIndex=0;
      if(!action.dataset.workflowKeyboard){
        action.dataset.workflowKeyboard='1';
        action.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();action.click();}});
      }
    });
    const menu=document.querySelector('.menu .itemBox');
    const firstExtension=menu?.querySelector('#prompt-studio-entry,#sound-library-entry,#camera-studio-entry');
    if(firstExtension&&!menu.querySelector('.workflow-extension-label')){
      const label=document.createElement('div');label.className='workflow-extension-label';label.textContent='辅助工具';menu.insertBefore(label,firstExtension);
    }
    const header=document.querySelector('.project .header .sub');
    if(header){
      let count=header.querySelector('.workflow-project-count');
      if(!count){count=document.createElement('span');count.className='workflow-project-count';count.setAttribute('role','status');header.append(count);}
      const text=`已显示 ${document.querySelectorAll('.project .list .card').length} 个项目`;
      if(count.textContent!==text)count.textContent=text;
    }
  }
  let queued=false;
  const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;update();});}};
  const start=()=>{update();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
