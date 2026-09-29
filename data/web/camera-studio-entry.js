(() => {
  function install() {
    if(document.getElementById('camera-studio-entry'))return;
    const container=document.querySelector('.menu .itemBox');if(!container)return;
    const link=document.createElement('a');link.id='camera-studio-entry';link.href='/camera-studio.html';link.textContent='镜头与运镜';link.title='同一分镜多种运镜方案、图像与视频提示词、连续性审计';
    link.addEventListener('click',()=>{const name=document.querySelector('.topMenu .title')?.textContent?.trim();link.href='/camera-studio.html'+(name?'?projectName='+encodeURIComponent(name):'');});
    link.style.cssText='display:flex;align-items:center;justify-content:center;flex-shrink:0;min-height:48px;width:100%;color:#d9e8cd;background:#2a3827;border:1px solid #849776;border-radius:8px;padding:8px;font:12px/1.5 system-ui;text-decoration:none;text-align:center';container.append(link);
  }
  const start=()=>{install();new MutationObserver(install).observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
