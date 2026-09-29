(() => {
  const style = document.createElement('style');
  style.textContent = `toonflow-asset-manager{display:block;margin:10px 0}.asset-tools{display:flex;gap:8px;flex-wrap:wrap}.asset-tools button,.asset-manager-dialog button{padding:7px 11px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;color:#24344b;cursor:pointer}.asset-tools button:hover,.asset-manager-dialog button:hover{background:#edf4ff}.asset-manager-dialog{width:min(880px,90vw);max-height:85vh;border:0;border-radius:12px;padding:22px;color:#24344b;background:#fff;box-shadow:0 15px 60px #0005;z-index:100000}.asset-manager-dialog::backdrop{background:#0006}.asset-manager-dialog header{display:flex;align-items:center;justify-content:space-between;gap:20px}.asset-manager-dialog .items{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;margin-top:16px}.asset-manager-dialog article{border:1px solid #dce1e8;border-radius:8px;padding:12px}.asset-manager-dialog img{width:100%;height:125px;object-fit:contain;background:#f7f8fa}.asset-manager-dialog label{display:block;margin:14px 0}.asset-manager-dialog input,.asset-manager-dialog select{padding:8px;max-width:100%;box-sizing:border-box}.asset-manager-dialog .danger{color:#c52b2b}.asset-manager-dialog p{font-size:13px;line-height:1.6}.asset-manager-dialog button:disabled{opacity:.5;cursor:wait}.asset-manager-dialog .status{color:#c52b2b;white-space:pre-wrap}`;
  document.head.append(style);
  const node = (tag, text) => { const n = document.createElement(tag); if (text) n.textContent = text; return n; };
  async function request(action, body) {
    const r = await fetch(`/api/assetManagement/${action}`, { method:'POST', headers:{'Content-Type':'application/json',Authorization:localStorage.getItem('token')||''}, body:JSON.stringify(body) });
    const data = await r.json(); if (!r.ok || data.code !== 200) throw Error(data.message || '操作失败'); return data.data;
  }
  class Manager extends HTMLElement {
    connectedCallback() {
      if (this.childNodes.length) return;
      const bar = node('div'); bar.className='asset-tools';
      const add=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=e=>{e.stopPropagation();fn();};bar.append(b);};
      if (this.getAttribute('asset-id')) {
        add('上传本地图片',()=>this.upload()); add('管理图片 / 归档',()=>this.manage(true));
        add('归档资产',()=>this.change('archive')); add('永久删除资产',()=>this.change('delete'));
      } else {
        add('上传本地图片',()=>this.upload()); add('资产管理 / 归档箱',()=>this.manage(false));
      }
      this.append(bar);
    }
    target(){return {projectId:Number(this.getAttribute('project-id')),assetId:Number(this.getAttribute('asset-id'))||undefined};}
    refresh(){this.dispatchEvent(new CustomEvent('assets-changed',{bubbles:true}));}
    dialog(title){
      const d=node('dialog');d.className='asset-manager-dialog';const h=node('header');h.append(node('h3',title));const close=node('button','关闭');close.onclick=()=>d.close();h.append(close);d.append(h);const status=node('p');status.className='status';status.role='status';d.append(status);d.status=status;
      d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();return d;
    }
    async change(action,imageId,assetId=this.target().assetId,dialog){
      const subject=imageId?'这张图片':'该资产及其全部图片、子资产';
      const warning=action==='delete'?`永久删除${subject}？此操作不可恢复，并清理关联记录；仍被其他素材引用的文件会保留。`:action==='archive'?`归档${subject}？可从归档箱恢复。现有分镜引用保留；归档当前图片后需重新选择展示图片。`:null;
      if(warning&&!confirm(warning))return false;
      try {await request('change',{...this.target(),assetId,imageId,action});this.refresh();return true;}
      catch(e){if(dialog)dialog.status.textContent=e.message;else alert(e.message);return false;}
    }
    async manage(imagesOnly){
      const d=this.dialog(imagesOnly?'图片管理与归档箱':'资产管理与归档箱');let archived=false;
      const tabs=node('div');tabs.className='asset-tools';const normal=node('button',imagesOnly?'当前图片':'在用资产'),archive=node('button','归档箱');tabs.append(normal,archive);d.append(tabs);
      const hint=node('p','归档可恢复；永久删除不可恢复。归档不会删除已制作的视频。');d.append(hint);
      const list=node('div');list.className='items';d.append(list);
      const load=async()=>{
        d.status.textContent='正在读取…';list.replaceChildren();
        try {
          const rows=await request('list',{...this.target(),archived});
          const items=imagesOnly?rows.flatMap(a=>a.images.filter(i=>!!i.archivedAt===archived).map(i=>({...i,asset:a}))):rows;
          d.status.textContent=items.length?'':(archived?'归档箱为空':'暂无素材');
          for(const item of items){
            const card=node('article');const image=imagesOnly?item:item.images.find(i=>i.id===item.imageId);if(image?.url){const img=node('img');img.src=image.url;img.alt=imagesOnly?'资产历史图片':item.name;card.append(img);}
            card.append(node('p',imagesOnly?`图片 #${item.id}${item.asset.imageId===item.id?' · 当前使用':''}${item.model==='local-upload'?' · 本地上传':''}`:item.name));
            if(imagesOnly){
              const label=node('label','此图片的独立提示词');const field=node('textarea');field.value=item.prompt??'';field.rows=5;field.style.cssText='width:100%;box-sizing:border-box';field.placeholder=item.prompt===null?'此历史图尚未找到对应提示词，可补充':'本地上传图可留空或自行补充';label.append(field);card.append(label);
              const save=node('button','保存此图提示词');save.onclick=async()=>{save.disabled=true;try{await request('prompt',{...this.target(),assetId:item.asset.id,imageId:item.id,prompt:field.value});d.status.textContent='此图片提示词已保存';this.refresh();}catch(e){d.status.textContent=e.message;}finally{save.disabled=false;}};card.append(save);
            }
            const buttons=node('div');buttons.className='asset-tools';
            const add=(label,action)=>{const b=node('button',label);b.type='button';if(action==='delete')b.className='danger';b.onclick=async()=>{b.disabled=true;try{if(await this.change(action,imagesOnly?item.id:undefined,imagesOnly?item.asset.id:item.id,d))await load();}finally{b.disabled=false;}};buttons.append(b);};
            if(imagesOnly&&!archived){
              add('设为当前图片','select');
              const crop=node('button','裁切单人参考');crop.onclick=()=>this.crop(item,load);buttons.append(crop);
            }
            add(archived?'恢复':'归档',archived?'restore':'archive');add('永久删除','delete');card.append(buttons);list.append(card);
          }
        }catch(e){d.status.textContent=e.message;}
      };
      normal.onclick=()=>{archived=false;load();};archive.onclick=()=>{archived=true;load();};await load();
    }
    crop(item,reload){
      const d=this.dialog('裁切单视图参考');
      d.append(node('p','在原图上拖选需要保留的一个视图。保存为独立历史图片，原设定集保留；检查后再设为当前图片。场景中的人物不能靠裁切完整去除时，请先制作无人场景。'));
      const canvas=node('canvas');canvas.style.cssText='width:100%;height:auto;touch-action:none;cursor:crosshair';d.append(canvas);
      const preview=node('canvas');preview.style.cssText='max-width:100%;max-height:240px;display:block;margin:12px auto';d.append(preview);
      const save=node('button','保存裁切图片');save.disabled=true;d.append(save);
      const img=new Image();let start,rect,busy=false;
      const draw=()=>{canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const c=canvas.getContext('2d');c.drawImage(img,0,0);if(rect){c.strokeStyle='#22c55e';c.lineWidth=Math.max(2,canvas.width/350);c.strokeRect(rect.left,rect.top,rect.width,rect.height);preview.width=rect.width;preview.height=rect.height;preview.getContext('2d').drawImage(img,rect.left,rect.top,rect.width,rect.height,0,0,rect.width,rect.height);}};
      const point=e=>{const b=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,Math.round((e.clientX-b.left)*canvas.width/b.width))),y:Math.max(0,Math.min(canvas.height,Math.round((e.clientY-b.top)*canvas.height/b.height)))};};
      img.onload=draw;img.onerror=()=>{d.status.textContent='原图加载失败';};img.src=item.url;
      canvas.onpointerdown=e=>{if(busy||!img.naturalWidth)return;start=point(e);canvas.setPointerCapture(e.pointerId);};
      canvas.onpointermove=e=>{if(!start||busy)return;const p=point(e);rect={left:Math.min(p.x,start.x),top:Math.min(p.y,start.y),width:Math.abs(p.x-start.x),height:Math.abs(p.y-start.y)};if(rect.width&&rect.height){draw();save.disabled=false;d.status.textContent=`裁切范围：${rect.width} × ${rect.height} 像素`; }else save.disabled=true;};
      canvas.onpointerup=()=>{start=null;};canvas.onpointercancel=()=>{start=null;};
      save.onclick=async()=>{if(!rect||busy)return;busy=true;save.disabled=true;try{await request('crop',{...this.target(),assetId:item.asset.id,imageId:item.id,...rect});this.refresh();await reload();d.close();}catch(e){d.status.textContent=e.message;}finally{busy=false;save.disabled=false;}};
    }
    upload(){
      const d=this.dialog(this.target().assetId?'上传图片到此资产':'从本地图片新建资产');const form=node('form');
      const name=node('input');name.required=true;name.maxLength=100;name.placeholder='资产名称';
      const type=node('select');[['role','角色'],['scene','场景'],['tool','道具']].forEach(([v,t])=>type.add(new Option(t,v)));
      if(this.target().assetId){name.value=this.getAttribute('asset-name')||'本地图片';type.value=this.getAttribute('asset-type')||'role';}
      else {const l=node('label','名称 ');l.append(name);form.append(l);const t=node('label','类型 ');t.append(type);form.append(t);}
      const file=node('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.required=true;const fl=node('label','本地图片（PNG / JPG / WebP，最大20MB） ');fl.append(file);form.append(fl);
      const preview=node('img');preview.hidden=true;preview.style.cssText='max-height:240px;max-width:100%;object-fit:contain';form.append(preview);let url;
      file.onchange=()=>{if(url)URL.revokeObjectURL(url);if(file.files[0]){url=URL.createObjectURL(file.files[0]);preview.src=url;preview.hidden=false;if(!name.value)name.value=file.files[0].name.replace(/\.[^.]+$/,'');}};
      d.addEventListener('close',()=>{if(url)URL.revokeObjectURL(url);});
      form.append(node('p',this.target().assetId?'上传后设为当前图片，当前提示词清空；原图片保留在历史图片中。':'直接使用本地图片，提示词为空，不调用生成模型。'));
      const save=node('button','上传并保存');save.type='submit';form.append(save);d.append(form);
      form.onsubmit=async e=>{e.preventDefault();save.disabled=true;d.status.textContent='正在上传…';try{
        const f=file.files[0];if(!f||f.size>20*1024*1024)throw Error('请选择不超过20MB的图片');
        const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('读取图片失败'));r.readAsDataURL(f);});
        await request('upload',{...this.target(),name:name.value,type:type.value,base64});this.refresh();d.close();
      }catch(e){d.status.textContent=e.message;}finally{save.disabled=false;}};
    }
  }
  customElements.define('toonflow-asset-manager',Manager);
})();
