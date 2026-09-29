(() => {
  const element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  class ActionStoryboard extends HTMLElement {
    connectedCallback(){
      if(this.childNodes.length)return;
      this.style.cssText='display:inline-flex;margin-left:8px';
      const b=element('button','完整动作编排');b.type='button';b.className='nodrag';b.style.cssText='border:1px solid #39755a;border-radius:5px;background:#edf6f0;color:#235640;padding:5px 9px;cursor:pointer';
      b.onpointerdown=e=>e.stopPropagation();b.onmousedown=e=>e.stopPropagation();b.onclick=e=>{e.stopPropagation();this.open();};this.append(b);
    }
    get target(){return {projectId:Number(this.getAttribute('project-id')),scriptId:Number(this.getAttribute('script-id'))};}
    get storageKey(){return `toonflow-action-plan:${this.target.projectId}:${this.target.scriptId}`;}
    async api(action,body){const r=await fetch('/api/actionStoryboard/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:localStorage.getItem('token')||''},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.message||'操作失败');return d.data;}
    open(){
      if(this.dialog?.open)return;const d=document.createElement('dialog');this.dialog=d;d.style.cssText='width:min(1080px,94vw);max-height:88vh;box-sizing:border-box;border:1px solid #ccc;border-radius:12px;padding:24px;color:#222;background:#fafbf9;font:14px/1.7 system-ui';
      const heading=element('h2','完整动作分镜编排');const info=element('p','按剧本重新编排会将原分镜和视频保存在备份剧集。校正现有分镜则保留镜头编号、时长和资产，修正姿态、摄影与连续性描述，并同步表格和面板；旧提示词及视频保留，需针对新分镜重新生成提示词和验收。两种操作均不生成媒体。');
      this.status=element('p','点击编排生成可检查的方案。');this.content=element('div');
      const controls=element('div');controls.style.cssText='display:flex;gap:12px;position:sticky;top:0;background:#fafbf9;padding:10px 0;z-index:1';
      this.start=element('button','按当前剧本编排');this.refine=element('button','校正现有分镜');this.apply=element('button','采用并同步分镜表与面板');const close=element('button','关闭');
      for(const b of [this.start,this.refine,this.apply,close]){b.type='button';b.style.cssText='padding:8px 14px;border:1px solid #999;border-radius:6px;cursor:pointer';controls.append(b);}
      this.apply.disabled=true;this.start.onclick=()=>this.generate();this.refine.onclick=()=>this.generate('refine');this.apply.onclick=()=>this.adopt();close.onclick=()=>d.close();
      d.onclose=()=>{clearTimeout(this.timer);d.remove();};d.append(heading,info,controls,this.status,this.content);document.body.append(d);d.showModal();
      this.restoreCurrent();
    }
    async restoreCurrent(){
      this.start.disabled=this.refine.disabled=true;this.status.textContent='正在读取本集最新编排…';
      try{const current=await this.api('current',this.target);if(!this.dialog?.open)return;
        if(current){localStorage.setItem(this.storageKey,current.id);await this.poll(current.id);}
        else{this.start.disabled=this.refine.disabled=false;this.status.textContent='点击编排生成可检查的方案。';}
      }catch(e){this.status.textContent='读取编排失败：'+e.message;this.start.disabled=this.refine.disabled=false;}
    }
    async generate(mode='replan'){
      if(!this.target.projectId||!this.target.scriptId){this.status.textContent='请先选择项目和剧集。';return;}
      this.start.disabled=this.refine.disabled=true;this.apply.disabled=true;this.content.replaceChildren();this.status.textContent='正在提交文字编排任务…';
      try{const r=await this.api('start',{...this.target,requestId:crypto.randomUUID(),mode});localStorage.setItem(this.storageKey,r.id);await this.poll(r.id);}catch(e){this.status.textContent=e.message;this.start.disabled=this.refine.disabled=false;}
    }
    async poll(id){
      clearTimeout(this.timer);
      try{const r=await this.api('get',{id});this.job=r;this.start.disabled=this.refine.disabled=['queued','generating'].includes(r.state);this.apply.disabled=r.state!=='ready';
        if(this.start.disabled){this.status.textContent='Toonflow 正在编排完整动作、核对原台词和素材。可以关闭窗口，稍后继续查看。';this.timer=setTimeout(()=>{if(this.dialog?.open)this.poll(id);},3000);return;}
        if(r.state==='failed'){this.status.textContent='编排未通过：'+r.error;return;}
        const total=r.plan.shots.reduce((n,s)=>n+s.duration,0);this.status.textContent=r.state==='applied'?`已同步 ${r.plan.shots.length} 镜、${total} 秒。${r.mode==='refine'?'编号及媒体保留；旧验收需针对新分镜复核。':'原版本已保留在备份剧集中。'}`:`${r.mode==='refine'?'校正':'编排'}方案共 ${r.plan.shots.length} 镜、${total} 秒。核对动作、原台词与结束状态后采用。`;
        this.content.replaceChildren();r.plan.shots.forEach((s,i)=>{const card=element('section');card.style.cssText='border:1px solid #d6ddd4;border-radius:8px;padding:16px;margin:12px 0;background:white';card.append(element('h3',`第 ${i+1} 镜 · ${s.duration} 秒 · ${s.purpose}`));for(const [label,value]of [['起始画面',s.openingFrame],['完整动作',s.subjectAction],['结束状态',s.endingFrame],['摄影机',s.camera],['连续性',s.continuity]]){card.append(element('strong',label),element('p',value));}this.content.append(card);});
        const detail=element('details');detail.append(element('summary','完整分镜表与原台词'));const pre=element('pre',r.table);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';detail.append(pre);this.content.append(detail);
      }catch(e){this.status.textContent=e.message;this.start.disabled=this.refine.disabled=false;}
    }
    async adopt(){
      if(!this.job||this.job.state!=='ready')return;this.apply.disabled=true;this.start.disabled=this.refine.disabled=true;this.status.textContent='正在同步分镜表、面板和轨道…';
      try{await this.api('apply',{id:this.job.id});this.dispatchEvent(new CustomEvent('applied',{bubbles:true}));await this.poll(this.job.id);}catch(e){this.status.textContent=e.message;this.apply.disabled=false;this.start.disabled=this.refine.disabled=false;}
    }
  }
  customElements.define('toonflow-action-storyboard',ActionStoryboard);
})();
