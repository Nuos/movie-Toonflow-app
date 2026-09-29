/* Audio-preserving export fallback for browsers without an AAC encoder. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ToonflowExportAudio=api;})(globalThis,function(){
  async function pickCodec(encoder=globalThis.AudioEncoder){
    if(!encoder?.isConfigSupported)throw Error('当前浏览器不支持音频编码，请使用支持音频编码的浏览器导出。');
    for(const [codec,key] of [['mp4a.40.2','aac'],['opus','opus']]){
      try{if((await encoder.isConfigSupported({codec,sampleRate:48000,numberOfChannels:2,bitrate:128000})).supported)return key;}catch{}
    }
    throw Error('当前浏览器无法编码 AAC 或 Opus 音频，未生成静音替代文件。');
  }
  function opusDescription(header){
    if(!header)throw Error('缺少 Opus 音频配置');
    const bytes=header instanceof ArrayBuffer?new Uint8Array(header):new Uint8Array(header.buffer,header.byteOffset,header.byteLength);
    if(bytes.length<19||String.fromCharCode(...bytes.slice(0,8))!=='OpusHead'||bytes[18]!==0||![1,2].includes(bytes[9]))throw Error('不支持的 Opus 音频配置');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    // ISO BMFF dOps fields are big endian; OpusHead fields are little endian.
    return {type:'dOps',size:19,write(stream){
      stream.writeUint32(19);stream.writeString('dOps');stream.writeUint8(0);stream.writeUint8(bytes[9]);
      stream.writeUint16(view.getUint16(10,true));stream.writeUint32(view.getUint32(12,true));
      stream.writeInt16(view.getInt16(16,true));stream.writeUint8(0);
    }};
  }
  let previousUrl;
  function showResult(url,filename,blob,saveToProject){
    document.getElementById('workflow-export-result')?.remove();
    if(previousUrl)URL.revokeObjectURL(previousUrl);previousUrl=url;
    const section=document.createElement('section');section.id='workflow-export-result';section.className='workflow-export-result';section.setAttribute('aria-label','导出结果');
    for(const event of ['keydown','keyup'])section.addEventListener(event,e=>e.stopPropagation());
    const heading=document.createElement('strong');heading.textContent='导出结果';
    const close=document.createElement('button');close.type='button';close.textContent='关闭';close.onclick=()=>section.remove();
    const preview=document.createElement('video');preview.controls=true;preview.src=url;preview.preload='metadata';preview.setAttribute('aria-label','导出成片预览');
    const download=document.createElement('a');download.href=url;download.download=filename;download.textContent='下载导出视频';
    section.append(heading,close,preview,download);
    if(saveToProject&&blob){
      const save=document.createElement('button');save.type='button';save.className='workflow-save-export';save.textContent='保存到项目素材';
      save.onclick=async()=>{save.disabled=true;save.textContent='正在保存…';try{
        const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('读取导出文件失败'));reader.readAsDataURL(blob)});
        await saveToProject(data);save.textContent='已保存到项目素材';
      }catch(error){save.disabled=false;save.textContent='保存到项目素材';const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message||'保存失败';section.append(message)}};
      section.append(save);
    }
    (document.querySelector('.editVideo')||document.body).append(section);
  }
  return {pickCodec,opusDescription,showResult};
});
