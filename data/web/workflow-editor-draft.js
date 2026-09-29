(function(root){
 root.ToonflowEditorDraft={create({projectId,scriptId,request,getTracks}){
  let revision=0,ready=false,paused=false,timer,chain=Promise.resolve(),lastSaved='',lastAttempt='',disposed=false,status,saveButton,backupButton;
  const encode=data=>JSON.stringify(data,(key,value)=>['thumbnails','waveformData'].includes(key)?undefined:value);
  const snapshot=()=>encode(getTracks());
  function message(text,failed=false){if(status){status.textContent=text;status.dataset.failed=String(failed)}}
  function pendingStatus(){message(snapshot()===lastSaved?'剪辑草稿已保存':'剪辑草稿待保存')}
  function failed(error){paused=true;message((error?.response?.data?.message||error?.message||'草稿保存失败')+'；本页编辑已保留，可重试或备份',true);if(saveButton)saveButton.textContent='重试保存';if(backupButton)backupButton.hidden=false}
  function backup(){
   const blob=new Blob([JSON.stringify({projectId,scriptId,revision,tracks:JSON.parse(snapshot())},null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`剪辑草稿-${projectId}-${scriptId}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function flush(){clearTimeout(timer);if(!ready||paused)return chain;
   chain=chain.then(async()=>{
    if(paused)return;
    const data=snapshot();if(data===lastSaved){pendingStatus();return}
    message('正在保存剪辑草稿…');lastAttempt=data;
    try{const result=await request({projectId,scriptId,save:{revision,tracks:JSON.parse(data)}});revision=result.data.revision;lastSaved=data;pendingStatus()}
    catch(error){failed(error)}
   });return chain;
  }
  async function retry(){
   if(!ready){root.location.reload();return}
   await chain;if(!paused)return flush();
   saveButton&&(saveButton.disabled=true);
   try{
    const result=await request({projectId,scriptId}),remote=result.data;
    if(remote.revision!==revision){
     // A lost save acknowledgement is safe to reconcile; a different remote edit is not.
     if(encode(remote.tracks)!==lastAttempt)throw Error('其他页面已更新草稿，未覆盖。请下载本页备份后重新打开剪辑台');
     revision=remote.revision;lastSaved=lastAttempt;
    }
    paused=false;if(saveButton)saveButton.textContent='保存剪辑草稿';if(backupButton)backupButton.hidden=true;
    await flush();
   }catch(error){failed(error)}finally{if(saveButton)saveButton.disabled=false}
  }
  return {
   async restore(apply){
    const host=document.querySelector('.editVideo');
    if(host){
     const bar=document.createElement('div');bar.className='workflow-draft-status';status=document.createElement('span');status.setAttribute('role','status');
     saveButton=document.createElement('button');saveButton.type='button';saveButton.textContent='保存剪辑草稿';saveButton.disabled=true;saveButton.onclick=retry;
     backupButton=document.createElement('button');backupButton.type='button';backupButton.textContent='下载本页草稿备份';backupButton.hidden=true;backupButton.onclick=backup;
     bar.append(status,saveButton,backupButton);host.append(bar);host.classList.add('workflow-draft-loading');for(const child of host.children)if(child!==bar)child.inert=true;
    }
    message('正在读取剪辑草稿…');
    try{
     const result=await request({projectId,scriptId});if(disposed)return false;revision=result.data.revision;apply(result.data.tracks);lastSaved=snapshot();ready=true;
     host?.classList.remove('workflow-draft-loading');if(host)for(const child of host.children)child.inert=false;
     if(saveButton)saveButton.disabled=false;message(result.data.tracks===null?'尚无剪辑草稿，编辑后自动保存':'已恢复剪辑草稿');return true;
    }catch(error){message(error.message||'读取剪辑草稿失败',true);if(saveButton){saveButton.disabled=false;saveButton.textContent='重新读取草稿'}return false}
   },
   changed(){if(ready&&!paused){clearTimeout(timer);pendingStatus();if(snapshot()!==lastSaved)timer=setTimeout(flush,400)}},
   flush,
   dispose(){flush();disposed=true;clearTimeout(timer)}
  };
 }};
})(globalThis);
