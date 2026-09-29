(function(root){
 const running=new Map(),prefix='toonflow-image-job:';
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 root.ToonflowImageJob={async generate(request,input,existingImage){
  const bytes=new TextEncoder().encode(JSON.stringify(input));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const key=prefix+hash;if(running.has(key))return running.get(key);
  let saved;try{saved=JSON.parse(localStorage.getItem(key)||'null')}catch{}
  if(saved?.state==='completed'&&existingImage&&existingImage===saved.url)saved=null;
  const operationId=saved?.operationId||crypto.randomUUID();
  // Save the identifier before submission so a lost acknowledgement cannot cause a second job.
  localStorage.setItem(key,JSON.stringify({operationId,state:saved?.state||'pending'}));
  const task=(async()=>{
   let job=(await request({...input,async:true,operationId})).data;
   for(;;){
    if(job.state==='completed'){
     localStorage.setItem(key,JSON.stringify({operationId,state:'completed',url:job.url}));
     return {data:{url:job.url}};
    }
    if(job.state==='failed'){localStorage.removeItem(key);throw Error(job.error||'图片生成失败')}
    if(job.state==='unknown')throw Error('后台任务状态待核对，未重复提交。请查看任务列表；确认结果前请勿另建相同任务');
    await pause(3000);
    try{job=(await request({statusOnly:true,operationId,projectId:input.projectId})).data}
    catch(error){throw Error('查询图片任务失败，任务标识已保留。再次点击生成将继续查询，不会重复提交：'+(error.message||'网络异常'))}
   }
  })();
  running.set(key,task);try{return await task}finally{running.delete(key)}
 }};
})(globalThis);
