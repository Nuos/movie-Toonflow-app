(() => {
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const button = (text, fn, disabled = false) => { const b = el('button', text); b.type = 'button'; b.disabled = disabled; b.onclick = fn; return b; };
  const time = n => `${Math.floor(Math.max(0,n)/60).toString().padStart(2,'0')}:${(Math.max(0,n)%60).toFixed(1).padStart(4,'0')}`;
  const url = value => { try { const u = new URL(value, location.href); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  class Preview extends HTMLElement {
    static get observedAttributes() { return ['project-id', 'script-id']; }
    constructor() { super(); this.rows = []; this.selected = new Set(); this.active = ''; this.mode = 'image'; this.filter = ''; this.query = ''; this.mediaIndex = 0; this.failed = new Set(); this.abort = null; this.timer = null; this.playing = false; this.busy = false; this.choices = new Map(); }
    connectedCallback() { this.tabIndex = 0; this.setAttribute('aria-label', '分镜资产预览'); this.onkeydown = e => this.key(e);
      this.closest('.t-dialog__body')?.querySelectorAll('.topMenu .item').forEach((item,i)=>{
        const label=['资产预览','视频生成','视频剪辑'][i];if(!label)return;item.setAttribute('aria-label',label);item.title=label;item.setAttribute('role','button');item.tabIndex=0;item.classList.add('sp-workbench-tab');
        if(!item.dataset.spKeyboard){item.dataset.spKeyboard='1';item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();item.click();}});}
      });this.load(); }
    attributeChangedCallback() { if (this.isConnected) this.load(); }
    disconnectedCallback() { this.stop(); this.abort?.abort(); this.querySelectorAll('video').forEach(v => {v.pause(); v.removeAttribute('src'); v.load();}); }
    async load() {
      const projectId = Number(this.getAttribute('project-id')), scriptId = Number(this.getAttribute('script-id'));
      if (!projectId || !scriptId) return;
      const scope = `${projectId}:${scriptId}`;
      if (this.scope !== scope) { this.rows = []; this.selected.clear(); this.active = ''; this.query = ''; this.filter = ''; this.scope = scope; }
      this.stop(); this.abort?.abort(); const controller = this.abort = new AbortController();
      this.replaceChildren(el('p', '正在读取分镜、资产图片与视频…', 'sp-empty'));
      try {
        const r = await fetch('/api/production/getStoryboardData', {method:'POST', signal:controller.signal, headers:{'Content-Type':'application/json', Authorization:localStorage.getItem('token') || ''}, body:JSON.stringify({projectId,scriptId})});
        const body = await r.json(); if (!r.ok || body.code !== 200 || !Array.isArray(body.data)) throw Error(body.message || '读取预览失败');
        if (controller.signal.aborted) return;
        this.rows = body.data; this.original = this.rows.map(r => r.id); this.selected = new Set([...this.selected].filter(id => this.original.includes(id)));
        this.active = this.rows.some(r => r.id === this.active) ? this.active : this.rows[0]?.id; this.mediaIndex = 0; this.failed.clear(); this.render();
      } catch (e) { if (e.name === 'AbortError') return; this.replaceChildren(el('p', e.message, 'sp-empty'), button('重新加载', () => this.load())); }
    }
    visible() { return this.rows.filter(r => (!this.query || `${r.id} ${r.description} ${r.characters.map(a=>a.name).join(' ')}`.toLowerCase().includes(this.query.toLowerCase())) && (!this.filter || (this.filter === 'image' ? r.images.length : this.filter === 'video' ? r.videos.length : !r.images.length && !r.videos.length))); }
    row() { return this.rows.find(r => r.id === this.active); }
    medias(r = this.row()) { return r ? (this.mode === 'image' ? r.images : r.videos) : []; }
    media() { return this.medias()[this.mediaIndex] || this.medias()[0]; }
    stop() { clearInterval(this.timer); this.timer = null; this.playing = false; this.pendingPlay = false; this.querySelectorAll('.sp-stage video').forEach(v => v.pause()); if(this.playButton)this.playButton.textContent='播放'; }
    pick(id, autoplay = false) { this.stop(); this.active = id; this.mediaIndex = this.choices.get(`${id}:${this.mode}`) || 0; this.elapsed = 0; this.renderDetail(); this.renderList(); if(autoplay)this.play(); }
    step(delta, autoplay = false) { const rows=this.visible(), i=rows.findIndex(r=>r.id===this.active), next=rows[i+delta]; if(next)this.pick(next.id,autoplay);else {this.stop();this.updateProgress();} }
    key(e) { if(e.target.closest('input,select,textarea,button,a,video,[contenteditable="true"]') || e.altKey || e.ctrlKey || e.metaKey) return;
      if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();this.step(e.code==='ArrowLeft'?-1:1);}
      if(e.code==='Space'&&!e.repeat){e.preventDefault();this.playing?this.stop():this.play();}
    }
    render() {
      this.replaceChildren(); const header=el('div',null,'sp-toolbar');
      this.imageTab=button('资产图片',()=>this.switchMode('image')); this.videoTab=button('视频切片',()=>this.switchMode('video'));
      header.append(this.imageTab,this.videoTab,el('span',`${this.rows.length} 镜 · ${time(this.rows.reduce((s,r)=>s+r.duration,0))} · ${this.rows.filter(r=>r.images.length).length} 镜有图片 · ${this.rows.filter(r=>r.videos.length).length} 镜有视频`,'sp-summary'),button('刷新素材',()=>this.load()));this.append(header);
      this.status=el('p','','sp-status');this.status.setAttribute('role','status');this.append(this.status);
      const body=el('div',null,'sp-body');this.main=el('section',null,'sp-main');this.details=el('aside',null,'sp-details');body.append(this.main,this.details);this.append(body);
      const tools=el('div',null,'sp-toolbar');const search=el('input');search.type='search';search.placeholder='搜索镜号、描述或资产';search.setAttribute('aria-label','搜索镜号、描述或资产');search.value=this.query;
      search.oninput=()=>{this.query=search.value;this.applyFilter();}; const filter=el('select');filter.setAttribute('aria-label','素材筛选');[['','全部分镜'],['image','有图片'],['video','有视频'],['empty','无可用素材']].forEach(([v,t])=>filter.add(new Option(t,v)));filter.value=this.filter;filter.onchange=()=>{this.filter=filter.value;this.applyFilter();};
      this.all=el('input');this.all.type='checkbox';this.all.onchange=()=>{for(const r of this.visible())this.all.checked?this.selected.add(r.id):this.selected.delete(r.id);this.renderList();};const label=el('label','全选当前结果 ');label.prepend(this.all);this.count=el('span');
      tools.append(search,filter,label,this.count,button('清空选择',()=>{this.selected.clear();this.renderList();}),button('还原排序',()=>{this.stop();this.rows.sort((a,b)=>this.original.indexOf(a.id)-this.original.indexOf(b.id));this.renderList();this.renderDetail();}));
      this.exportButton=button(this.busy?'正在导出…':'导出所选图片',()=>this.export(),this.busy);tools.append(this.exportButton);this.append(tools);
      this.list=el('div',null,'sp-list');this.list.setAttribute('aria-label','分镜素材列表');this.append(this.list,el('p','拖动卡片调整预览顺序，也可用前移 / 后移。排序仅影响本次预览；方向键切换分镜，空格播放。','sp-hint'));
      this.renderDetail();this.renderList();
    }
    switchMode(mode) { this.stop();this.mode=mode;this.mediaIndex=this.choices.get(`${this.active}:${mode}`)||0;this.elapsed=0;this.renderDetail();this.renderList(); }
    applyFilter() { this.stop();const rows=this.visible();if(!rows.some(r=>r.id===this.active)){this.active=rows[0]?.id;this.mediaIndex=0;}this.renderDetail();this.renderList(); }
    image(src, alt, cls='') { const img=el('img',null,cls);img.alt=alt;img.loading='lazy';img.src=url(src);img.onerror=()=>{this.failed.add(src);img.replaceWith(el('span',`${alt}：图片加载失败`,'sp-empty'));};return img; }
    renderDetail() {
      if(!this.main)return;this.status.textContent='';this.main.replaceChildren();this.details.replaceChildren();this.imageTab.setAttribute('aria-pressed',String(this.mode==='image'));this.videoTab.setAttribute('aria-pressed',String(this.mode==='video'));
      this.video=null;this.videoEnd=Infinity;const r=this.row();if(!r){this.main.append(el('p',this.rows.length?'没有符合筛选条件的分镜':'本集暂无分镜，请先在分镜面板添加分镜。','sp-empty'));return;}
      const media=this.media(), stage=this.stage=el('div',null,'sp-stage');this.main.append(stage);
      if(media && url(media.src)) {
        if(this.mode==='image'){const img=this.image(media.src, media.name);img.loading='eager';stage.append(img);}
        else {
          const v=el('video');v.src=url(media.src);v.controls=true;v.preload='metadata';v.playsInline=true;v.setAttribute('aria-label',media.name);this.video=v;stage.append(v);
          v.onloadedmetadata=()=>{const start=media.start||0;this.videoEnd=Math.min(media.end??v.duration,v.duration);
            if(start>=v.duration){this.stop();this.status.textContent='该分镜起点超过视频实际时长，请检查轨道时长。';this.playButton.disabled=true;return;}
            v.currentTime=start;this.seek.max=String(this.videoEnd-start);if(media.end>v.duration+.1)this.status.textContent='视频短于计划切片，播放到实际片尾。';
          };
          
          v.ontimeupdate=()=>{if(this.video!==v)return;this.elapsed=Math.max(0,v.currentTime-(media.start||0));this.updateProgress();if(v.currentTime>=this.videoEnd-.04){const running=this.playing;v.pause();if(v.currentTime>this.videoEnd)v.currentTime=this.videoEnd;if(running)this.step(1,true);}};
          v.onseeking=()=>{if(v.currentTime<(media.start||0))v.currentTime=media.start||0;if(v.currentTime>this.videoEnd)v.currentTime=this.videoEnd;};
          v.onplay=()=>{if(this.video!==v)return;this.pendingPlay=false;if(v.currentTime>=this.videoEnd-.05)v.currentTime=media.start||0;this.playing=true;this.playButton.textContent='暂停';};v.onpause=()=>{if(this.video!==v)return;this.playing=false;this.playButton.textContent='播放';};
          v.onerror=()=>{this.stop();this.failed.add(media.src);this.status.textContent='视频加载失败，可刷新重试或检查源文件。';};
        }
      } else stage.append(el('div',this.mode==='video'?`本镜暂无可播放视频 · ${r.videoState}\n${r.videoReason || '请在视频工作台生成或选择视频版本，再刷新素材。'}`:`本镜尚无图片\n${r.reason || '关联资产也没有可用图片，请在角色与场景中补充素材。'}`,'sp-empty'));
      const caption=el('div',media?(this.mode==='image'?(media.source==='asset'?`参考资产 · ${media.name}（分镜成图${r.filePath?'已就绪':'尚未生成'}）`:'分镜成图 · 原始图片'):(media.source==='track'?`${media.name} · ${media.selected?'已采用版本':'未采用的预览版本'} · 计划切片 ${time(media.start)}—${time(media.end)}`:`资产视频 · ${media.name}`)):'素材待就绪','sp-caption');this.main.append(caption);
      const strip=el('div',null,'sp-media-strip');this.medias().forEach((m,i)=>{const b=button(`${this.mode==='image'?(m.source==='asset'?'参考 · ':''): '▶ '}${m.name}`,()=>{this.stop();this.mediaIndex=i;this.choices.set(`${this.active}:${this.mode}`,i);this.elapsed=0;this.renderDetail();});b.setAttribute('aria-pressed',String(i===this.mediaIndex));if(this.mode==='image')b.prepend(this.image(m.src,m.name));strip.append(b);});this.main.append(strip);
      const controls=el('div',null,'sp-controls'), rows=this.visible(), index=rows.findIndex(x=>x.id===r.id);this.playButton=button('播放',()=>this.playing?this.stop():this.play(),!media);this.seek=el('input');this.seek.type='range';this.seek.min='0';this.seek.max=String(r.duration);this.seek.step='.05';this.seek.value=String(this.elapsed||0);this.seek.setAttribute('aria-label','当前分镜播放进度');this.seek.disabled=!media;
      this.seek.oninput=()=>{this.elapsed=Number(this.seek.value);if(this.mode==='video'&&this.video?.readyState)this.video.currentTime=(media.start||0)+this.elapsed;this.updateProgress();};this.clock=el('span');this.updateProgress();
      controls.append(button('上一镜',()=>this.step(-1),index<=0),this.playButton,button('下一镜',()=>this.step(1),index>=rows.length-1),this.seek,this.clock);this.main.append(controls);
      const actions=el('div',null,'sp-toolbar');if(media){const a=el('a','打开原文件');a.href=url(media.src);a.target='_blank';a.rel='noopener';actions.append(a,button('全屏预览',()=>{const result=stage.requestFullscreen?.();result?.catch(()=>{this.status.textContent='当前浏览器不支持全屏，请打开原文件。';});}));}this.main.append(actions);
      this.details.append(el('h3',`分镜 ${String(this.original.indexOf(r.id)+1).padStart(2,'0')} · #${r.id}`),el('p',`${r.duration} 秒 · 图片：${r.filePath?'已生成':'未生成'} · 视频：${r.videoState}`));
      const assets=el('div',null,'sp-assets');r.characters.forEach(a=>{const card=button(a.name,()=>{const mode=a.fileType==='video'?'video':'image';const items=mode==='image'?r.images:r.videos;const i=items.findIndex(m=>m.src===a.src);if(i<0)return;this.stop();this.mode=mode;this.mediaIndex=i;this.choices.set(`${this.active}:${this.mode}`,i);this.elapsed=0;this.renderDetail();this.renderList();},!a.src||a.fileType==='audio');if(a.avatar)card.prepend(this.image(a.avatar,a.name));card.title=({role:'角色',scene:'场景',tool:'道具',clip:'素材',audio:'音频'}[a.type]||'资产');assets.append(card);});this.details.append(el('h4','涉及资产'),assets);
      if(!r.characters.length)assets.append(el('p','尚未关联资产'));
      for(const [title,text] of [['画面描述',r.description],['图片提示词',r.prompt],['视频提示词',r.videoPrompt]]){const d=el('details');d.open=title==='画面描述';d.append(el('summary',title),el('p',text||'暂无内容'));if(text)d.append(button('复制'+title,async()=>{try{await navigator.clipboard.writeText(text);this.status.textContent=title+'已复制';}catch{this.status.textContent='复制失败，请手动选择文本复制。';}}));this.details.append(d);}
    }
    updateProgress(){if(this.seek)this.seek.value=String(this.elapsed||0);if(this.clock)this.clock.textContent=`${time(this.elapsed||0)} / ${time(Number(this.seek?.max)||this.row()?.duration||0)}`;}
    play(){const media=this.media();if(!media)return;this.status.textContent='';if(this.mode==='video'){const v=this.video;if(!v)return;this.pendingPlay=true;if(v.readyState&&v.currentTime>=this.videoEnd-.05)v.currentTime=media.start||0;v.play().catch(()=>{if(this.video!==v||!this.isConnected||!this.pendingPlay)return;this.stop();this.status.textContent='播放未开始，请点击视频播放按钮重试。';});return;}
      if((this.elapsed||0)>=this.row().duration)this.elapsed=0;this.playing=true;this.playButton.textContent='暂停';let last=performance.now();clearInterval(this.timer);this.timer=setInterval(()=>{const now=performance.now();this.elapsed=(this.elapsed||0)+(now-last)/1000;last=now;this.updateProgress();if(this.elapsed>=this.row().duration)this.step(1,true);},80);
    }
    move(from,to){const a=this.rows.findIndex(r=>r.id===from),b=this.rows.findIndex(r=>r.id===to);if(a<0||b<0||a===b)return;this.stop();this.rows.splice(b,0,this.rows.splice(a,1)[0]);this.renderList();this.renderDetail();}
    renderList(){if(!this.list)return;this.list.replaceChildren();const rows=this.visible();let selected=0;rows.forEach((r,i)=>{if(this.selected.has(r.id))selected++;
      const card=el('article',null,`sp-card${r.id===this.active?' active':''}`);card.draggable=true;card.ondragstart=e=>{e.dataTransfer.setData('text/plain',r.id);};card.ondragover=e=>e.preventDefault();card.ondrop=e=>{e.preventDefault();this.move(e.dataTransfer.getData('text/plain'),r.id);};
      const check=el('input');check.type='checkbox';check.checked=this.selected.has(r.id);check.setAttribute('aria-label',`选择分镜 #${r.id}`);check.onchange=()=>{check.checked?this.selected.add(r.id):this.selected.delete(r.id);this.renderList();};
      const pick=button('',()=>this.pick(r.id));pick.className='sp-pick';pick.setAttribute('aria-label',`预览分镜 #${r.id}`);pick.setAttribute('aria-current',String(r.id===this.active));const m=this.medias(r)[0];
      if(this.mode==='image'&&m){if(!r.filePath&&r.images.length>1){const grid=el('div',null,'sp-thumb-grid');r.images.slice(0,3).forEach(a=>grid.append(this.image(a.src,a.name)));pick.append(grid);}else pick.append(this.image(m.src,m.name));}else if(this.mode==='video'&&m){const v=el('video');v.src=`${url(m.src)}#t=${m.start||0}`;v.preload='metadata';v.muted=true;v.playsInline=true;v.onloadedmetadata=()=>{if((m.start||0)<v.duration)v.currentTime=m.start||0;};v.onerror=()=>v.replaceWith(el('span','视频预览失败'));pick.append(v);}else pick.append(el('span',this.mode==='video'?'待生成视频':'待补充图片','sp-empty'));
      pick.append(el('strong',`#${r.id} · ${r.duration}秒`),el('span',this.mode==='image'?(r.filePath?'分镜成图':r.images.length?`参考资产 ${r.images.length} 张`:'暂无素材'):r.videos.length?`▶ ${r.videos.length} 个视频版本`:'暂无视频'));
      const order=el('div',null,'sp-order');order.append(button('前移',()=>this.move(r.id,rows[i-1]?.id),i===0),button('后移',()=>this.move(r.id,rows[i+1]?.id),i===rows.length-1));card.append(check,pick,order);this.list.append(card);
    });if(!rows.length)this.list.append(el('p','没有符合筛选条件的分镜','sp-empty'));this.all.checked=rows.length>0&&selected===rows.length;this.all.indeterminate=selected>0&&selected<rows.length;this.all.disabled=!rows.length;this.count.textContent=`已选 ${this.selected.size} / ${this.rows.length}`;
      this.exportButton.textContent=this.busy?'正在导出…':this.mode==='image'?'导出所选图片':'导出所选视频切片';this.exportButton.disabled=this.busy||!this.selected.size;
    }
    async export(){if(this.busy)return;const rows=this.rows.filter(r=>this.selected.has(r.id)), mode=this.mode;this.busy=true;this.renderList();this.status.textContent='正在整理导出素材…';const failures=[],manifest=[];let count=0;const seen=new Map();
      try{const zip=new window.ToonflowPreviewZip();for(const r of rows){const items=mode==='image'?r.images:r.videos.slice(this.choices.get(`${r.id}:video`)||0,(this.choices.get(`${r.id}:video`)||0)+1);if(!items.length)failures.push(`#${r.id}：暂无${mode==='image'?'图片':'视频'}`);
          for(const m of items){const src=url(m.src);if(!src){failures.push(`#${r.id}：素材地址无效`);continue;}const key=mode==='video'&&m.source==='track'?`${src}:${r.id}`:src;let filename=seen.get(key);if(!filename){try{const response=mode==='video'&&m.source==='track'?await fetch('/api/production/getStoryboardData/slice',{method:'POST',signal:this.abort?.signal,headers:{'Content-Type':'application/json',Authorization:localStorage.getItem('token')||''},body:JSON.stringify({projectId:Number(this.getAttribute('project-id')),scriptId:Number(this.getAttribute('script-id')),storyboardId:Number(r.id),videoId:Number(m.id.replace('video-',''))})}):await fetch(src,{signal:this.abort?.signal});if(!response.ok){let message=`HTTP ${response.status}`;try{message=(await response.json()).message||message;}catch{}throw Error(message);}const blob=await response.blob();if(!blob.size||!(blob.type.startsWith(mode==='image'?'image/':'video/')||blob.type==='application/octet-stream'))throw Error('文件内容不是有效媒体');const ext=mode==='video'&&m.source==='track'?'mp4':new URL(src).pathname.match(/\.([a-zA-Z0-9]+)$/)?.[1]||(mode==='image'?'png':'mp4');filename=`${mode==='image'?(m.source==='asset'?'参考资产':'分镜成图'):'视频切片'}/${m.id}${m.source==='track'?'-分镜'+r.id:''}.${ext}`;zip.file(filename,blob);seen.set(key,filename);count++;}catch(e){if(e.name==='AbortError')throw e;failures.push(`#${r.id} ${m.name}：${e.message}`);continue;}}
            manifest.push({分镜:r.id,文件:filename,名称:m.name,来源:m.source,计划时长:r.duration,切片开始秒:m.start,切片结束秒:m.end});}}
        if(!count)throw Error(`没有可导出的文件。${failures.join('；')}`);zip.file('素材与切片清单.json',JSON.stringify(manifest,null,2));zip.file('说明.txt','参考资产与分镜成图分目录保存。轨道视频按分镜计划起止点导出独立MP4，短于计划时长时截到实际片尾。运镜切片及关联视频资产保留原文件。切片清单记录其源视频内的计划起止点。\n'+failures.join('\n'));
        const blob=await zip.generateAsync({type:'blob'});if(!this.isConnected)return;const href=URL.createObjectURL(blob),a=el('a');a.href=href;a.download=`分镜${mode==='image'?'图片':'视频'}素材.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(href),30000);this.status.textContent=`已导出 ${count} 个文件${failures.length?`；${failures.length} 项缺失或失败，详见说明.txt`:'。'}`;
      }catch(e){if(e.name!=='AbortError')this.status.textContent=`导出失败：${e.message}`;}finally{this.busy=false;if(this.isConnected)this.renderList();}}
  }
  customElements.define('toonflow-storyboard-preview',Preview);
})();
