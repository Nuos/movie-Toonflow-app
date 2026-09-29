(() => {
  function install() {
    if(document.getElementById('prompt-studio-entry'))return;
    const container=document.querySelector('.menu .itemBox');
    if(!container)return;
    const link=document.createElement('a');link.id='prompt-studio-entry';link.href='/prompt-studio.html';link.textContent='提示词与复现';
    link.addEventListener('click',()=>{const name=document.querySelector('.topMenu .title')?.textContent?.trim();if(name)link.href='/prompt-studio.html?projectName='+encodeURIComponent(name);});
    link.title='人物、场景与视频提示词标准；图片复现';
    link.style.cssText='display:flex;align-items:center;justify-content:center;flex-shrink:0;min-height:48px;width:100%;color:#e9f0ff;background:#24457d;border:1px solid #668bd0;border-radius:8px;padding:8px;font:12px/1.5 system-ui;text-decoration:none;text-align:center';
    container.append(link);
  }
  const start=()=>{install();new MutationObserver(install).observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
