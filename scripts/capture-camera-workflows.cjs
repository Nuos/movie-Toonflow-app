// 在真正的 ComfyUI 画布中渲染并截图；禁止调用任务提交接口。
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('/home/ubuntu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),file=path.join(root,'data/web/workflow-previews/manifest.json'),manifest=JSON.parse(await fs.readFile(file,'utf8'));
 const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:2800,height:1600},deviceScaleFactor:2});
  await page.route('**/prompt',route=>route.abort());
  await page.goto('http://127.0.0.1:8188/');await page.waitForFunction(()=>window.comfyAPI?.app?.app?.graph);
  for(const [key,item] of Object.entries(manifest)){
   const graph=JSON.parse(await fs.readFile(item.apiFile,'utf8'));
   const result=await page.evaluate(async ({graph,key})=>{
    const app=window.comfyAPI.app.app;
    await app.loadApiJson(graph,key,{deferWarnings:true});
    await new Promise(resolve=>setTimeout(resolve,600));
    const matches=()=>app.graph._nodes.length===Object.keys(graph).length&&app.graph._nodes.every(n=>graph[String(n.id)]?.class_type===n.type);
    if(!matches()){await app.loadApiJson(graph,key,{deferWarnings:true});await new Promise(resolve=>setTimeout(resolve,600));}
    if(!matches())throw Error('画布节点与源工作流不一致：'+key);
    const nodes=app.graph._nodes;
    const missing=nodes.filter(n=>n.has_errors).map(n=>n.type);if(missing.length)throw Error('缺少节点：'+missing.join(','));
    for(const n of nodes){n.setSize([Math.max(n.size[0],/Loader/.test(n.type)?600:400),Math.max(n.size[1],n.widgets?.some(w=>w.name==='prompt')?500:130)]);}
    app.graph.arrange(80);
    const minX=Math.min(...nodes.map(n=>n.pos[0])),minY=Math.min(...nodes.map(n=>n.pos[1]-40));
    const maxX=Math.max(...nodes.map(n=>n.pos[0]+n.size[0])),maxY=Math.max(...nodes.map(n=>n.pos[1]+n.size[1]+30));
    const scale=Math.min(1.2,2500/(maxX-minX),1380/(maxY-minY));
    app.canvas.ds.scale=scale;app.canvas.ds.offset=[-minX+140/scale,-minY+120/scale];app.canvas.setDirty(true,true);
    const ui=app.graph.serialize();ui.extra={...ui.extra,ds:{scale,offset:[...app.canvas.ds.offset]}};
    return {ui,nodeCount:nodes.length,scale,bounds:{width:maxX-minX,height:maxY-minY},canvasId:app.canvas.canvas.id};
   },{graph,key});
   await fs.writeFile(item.uiFile,JSON.stringify(result.ui,null,2));
   await fs.writeFile(path.join(root,'data/web/workflow-previews',key+'.json'),JSON.stringify(result.ui,null,2));
   await page.waitForTimeout(250);
   await page.locator('#'+result.canvasId).screenshot({path:path.join(root,'data/web',item.image)});
   Object.assign(item,{nodeCount:result.nodeCount,renderScale:result.scale,capturedAt:new Date().toISOString(),width:5600,height:3168});
   console.log(key,result.nodeCount,'个节点');
  }
  await fs.writeFile(file,JSON.stringify(manifest,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
