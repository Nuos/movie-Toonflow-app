(() => {
  function install() {
    if(document.getElementById('sound-library-entry'))return;
    const container=document.querySelector('.menu .itemBox');if(!container)return;
    const a=document.createElement('a');a.id='sound-library-entry';a.href='/sound-library.html';a.textContent='声音与影视配音';
    a.style.cssText='display:flex;align-items:center;justify-content:center;flex-shrink:0;min-height:48px;width:100%;color:#def4ea;background:#1e5147;border:1px solid #4d907d;border-radius:8px;padding:8px;font:12px/1.5 system-ui;text-decoration:none;text-align:center';
    a.addEventListener('click',()=>{const name=document.querySelector('.topMenu .title')?.textContent?.trim();if(name)a.href='/sound-library.html?projectName='+encodeURIComponent(name);});container.append(a);
  }
  const start=()=>{install();new MutationObserver(install).observe(document.body,{childList:true,subtree:true});};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
