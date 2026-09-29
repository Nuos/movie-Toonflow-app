(async () => {
  const q = new URLSearchParams(location.search), $ = id => document.getElementById(id);
  const targetAsset = Number(q.get('assetId')); let targetProject = Number(q.get('projectId')); let targetType;
  let sounds = [], category = q.get('category') || 'all';
  async function request(url, body) {
    const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: localStorage.getItem('token') || '', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok || result.code !== 200) throw new Error(result.message || '读取失败'); return result.data;
  }
  function element(tag, text, cls) { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; }
  function link(text, href) { const a = element('a', text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; }
  function stopPlayers() { document.querySelectorAll('audio').forEach(p => p.pause()); }
  function render() {
    stopPlayers(); const normalize = value => value.toLowerCase().replace(/[劇黃戲聲樂嗩箏鳥鋼環風]/g,c=>({'劇':'剧','黃':'黄','戲':'戏','聲':'声','樂':'乐','嗩':'唢','箏':'筝','鳥':'鸟','鋼':'钢','環':'环','風':'风'}[c]));
    const word = normalize($('search').value.trim()); $('opera-filters').hidden = !['all','music','opera'].includes(category);
    $('gender').hidden = $('age').hidden = !['all','voice'].includes(category);
    const items = sounds.filter(s => (category === 'all' || category === s.category || (['opera','classic'].includes(category) && s.collection === category)) && (!$('opera-genre').value || s.operaGenre === $('opera-genre').value) && (!$('material-type').value || s.materialType === $('material-type').value) && (!$('gender').value || s.gender === $('gender').value) && (!$('age').value || s.age === $('age').value) && (!word || normalize([s.name,s.description,s.categoryName,s.instrument,s.operaGenre,s.materialType,s.author,s.recordingType,s.gender,s.age,...(s.traits || [])].join(' ')).includes(word)));
    $('results').replaceChildren(); $('status').textContent = `显示 ${items.length} 项声音素材`;
    if (!items.length) $('results').append(element('p', '没有匹配的声音，请调整关键词或筛选条件。', 'note'));
    for (const s of items) {
      const card = element('article', '', 'card');
      const traits = (s.traits || []).filter(t => !s.operaGenre || ![s.operaGenre,s.materialType,'中国戏曲'].includes(t));
      card.dataset.soundId = s.id;
      card.append(element('div', [s.operaGenre ? `${s.operaGenre} · ${s.materialType}` : s.categoryName,s.instrument,s.gender ? s.gender + '声' : '',s.age,...traits].filter(Boolean).join(' · '), 'tags'), element('h2', s.name), element('p', s.description));
      const audio = element('audio'); audio.controls = true; audio.preload = 'none'; audio.src = s.previewSrc || s.src; audio.setAttribute('aria-label', s.name + '试听'); audio.addEventListener('play', () => { document.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); }); });
      audio.addEventListener('error', () => { $('status').textContent = `${s.name} 无法播放，请检查本地文件。`; }); card.append(audio);
      const playback = element('div', '', 'playback');
      if (s.previewSrc && s.duration > 30) {
        const full = element('button', '试听完整音频'); full.type = 'button';
        full.addEventListener('click', async () => { stopPlayers(); audio.src = s.src; try { await audio.play(); full.textContent = '正在播放完整音频'; } catch { $('status').textContent = '请点击播放器继续试听'; } }); playback.append(full);
      }
      const loopLabel = element('label'), loop = element('input'); loop.type = 'checkbox'; loop.setAttribute('aria-label', s.name + '循环播放');
      loop.addEventListener('change', () => { audio.loop = loop.checked; }); loopLabel.append(loop, document.createTextNode('循环试听')); playback.append(loopLabel); card.append(playback);
      const credit = element('p', `${s.duration.toFixed(1)} 秒 · ${s.author} · ${s.license}`, 'credit'); card.append(credit);
      if (s.usageNotice) card.append(element('p', s.usageNotice, 'usage-notice'));
      if (s.license.includes('SA')) card.append(element('p', '使用条件：署名，并按相同许可共享相应改编。', 'credit'));
      else if (/BY/.test(s.license)) card.append(element('p', '使用条件：署名并注明改动。', 'credit'));
      const details = element('details'); details.append(element('summary', '素材说明'),element('p',s.provenance)); card.append(details);
      const actions = element('div', '', 'actions');
      if (targetAsset && targetProject === Number($('project').value) && s.category !== 'music' && (targetType === 'role' || s.category !== 'voice')) {
        const bind = element('button', s.category === 'voice' ? '设为角色声线' : '关联到当前资产'); bind.type = 'button';
        bind.addEventListener('click', async () => { bind.disabled = true; try { await request('/api/characterVoices/select',{projectId:targetProject,assetId:targetAsset,soundId:s.id});$('status').textContent = `已关联：${s.name}。返回人物或场景面板后重新打开即可查看。`; } catch(e) { $('status').textContent = e.message; } finally { bind.disabled = false; } }); actions.append(bind);
      }
      const download = link(s.category === 'music' ? '下载完整配乐' : '下载完整音频',s.src);download.setAttribute('download',s.id+'.wav'); actions.append(download);
      if (s.originalSrc) { const original = link('下载源音轨',s.originalSrc); original.setAttribute('download',''); actions.append(original); }
      actions.append(link('原始来源',s.sourceUrl));card.append(actions);$('results').append(card);
    }
  }
  try {
    const [library,projects] = await Promise.all([request('/api/characterVoices/library'),request('/api/project/getProject',{})]);sounds=library;
    for(const p of projects)$('project').add(new Option(p.name,String(p.id)));
    if(targetProject && projects.some(p=>p.id===targetProject))$('project').value=String(targetProject);
    else if(q.get('projectName')) { const p=projects.find(p=>p.name===q.get('projectName'));if(p)$('project').value=String(p.id); }
    if(targetAsset && targetProject) { const state=await request('/api/characterVoices/get',{projectId:targetProject,assetId:targetAsset});targetType=state.type; }
    $('summary').textContent = `本地共 ${sounds.length} 项 · ${sounds.filter(s=>s.category==='voice').length} 种人物声线 · ${sounds.filter(s=>!['voice','music','dubbing'].includes(s.category)).length} 项自然、环境与特效声音 · ${sounds.filter(s=>s.category==='dubbing').length} 项经典配音 · ${sounds.filter(s=>s.category==='music').length} 项影视配乐（含 ${sounds.filter(s=>s.collection==='opera').length} 项中国戏曲）`;
    const groups = [['all','全部'],['voice','人物声线'],['classic','经典影视'],['dubbing','经典配音'],['environment','环境声'],['nature','自然声'],['effect','影视特效'],['insect','虫鸣'],['mammal','走兽'],['bird','鸟鸣飞禽'],['music','影视配乐'],['opera','中国戏曲']];
    for(const [id,name] of groups){const count = sounds.filter(s=>id==='all'||s.category===id||s.collection===id).length;const b=element('button',`${name} ${count}`);b.type='button';b.setAttribute('aria-pressed',String(category===id));b.addEventListener('click',()=>{category=id;$('categories').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));if(id!=='voice'){$('gender').value='';$('age').value='';}if(!['all','music','opera'].includes(id)){$('opera-genre').value='';$('material-type').value='';}render();});$('categories').append(b);}
    for(const [id,key] of [['opera-genre','operaGenre'],['material-type','materialType']]) for(const value of new Set(sounds.map(s=>s[key]).filter(Boolean))) $(id).add(new Option(value,value));
    ['search','gender','age','project','opera-genre','material-type'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));
    $('import').addEventListener('click',async()=>{const projectId=Number($('project').value);if(!projectId){$('status').textContent='请先选择项目';return;}$('import').disabled=true;try{const r=await request('/api/characterVoices/import',{projectId});$('status').textContent=`已加入当前项目音频资产（新增 ${r.imported} 项，内置库共 ${r.count} 项），可在资产中心的音频分类中选择。`;}catch(e){$('status').textContent=e.message;}finally{$('import').disabled=false;}});
    render();
  } catch(e) {$('status').textContent=e.message;$('summary').textContent='声音库加载失败，请先打开 Toonflow 登录页面，再重试。';}
})();
