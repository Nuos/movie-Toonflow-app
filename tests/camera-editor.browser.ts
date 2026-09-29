import assert from 'node:assert/strict';
import {linkPromptReferences} from '../src/utils/cameraReferencePlan';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {CAMERA_MOVES,CAMERA_CHOICES,CAMERA_TEMPLATES,defaultCameraOptions,compileCameraVariant} from '../src/utils/cameraMotion';
const {chromium}=require('/home/ubuntu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const pause=(n:number)=>new Promise(r=>setTimeout(r,n));
let slowFirst=true,slowSkills=true,skillsFinished=false,failPreview=false;const calls:any[]=[];const mockClips:any[]=[];
const boards=[{id:1,index:0,duration:5,projectId:7,videoDesc:'女子在窗边读信。台词：等我。',prompt:'灰衣女子手持信封。'},{id:2,index:1,duration:6,projectId:7,videoDesc:'男子从门外回来。台词：我回来了。',prompt:'黑衣男子站在门边。'}];
const asset={id:31,sources:'assets',code:'DR-7-CHR-000031',name:'灰衣女子',type:'image',related:true,filePath:'fixture.svg',url:'/oss/fixture.svg'};
async function main(){
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url!,'http://localhost');let data:any;
  if(url.pathname.startsWith('/api/cameraStudio/')){const endpoint=url.pathname.split('/').pop();let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};calls.push({endpoint,body});
   if(endpoint==='catalog')data={moves:CAMERA_MOVES,choices:CAMERA_CHOICES,templates:CAMERA_TEMPLATES};
   else if(endpoint==='projects')data=[{id:7,name:'编辑器隔离验收'}];
   else if(endpoint==='list')data={boards};
   else if(endpoint==='get'){if(slowFirst&&body.storyboardId===1)await pause(1000);const b=boards.find(b=>b.id===body.storyboardId)!;const o=defaultCameraOptions(b);data={board:b,defaults:o,options:o,bundle:null};}
   else if(endpoint==='skills'){if(slowSkills)await pause(2000);skillsFinished=true;data={skills:[],domains:[],mechanisms:[],groups:[]};}
   else if(endpoint==='clipContext')data={references:[asset],catalog:{assets:[asset],shots:[]}};
   else if(endpoint==='clipRecommend'){const linked=linkPromptReferences(body.prompt,[asset],body.references);data={references:linked.references.map((r:any)=>({...asset,...r})),automatic:linked.automatic,issues:linked.issues,warnings:[],parameters:{workflowId:'comfyui-test:fixture',mode:linked.references.length?'[\"imageReference:4\"]':'text',duration:5,resolution:'preview',audio:false}};}
   else if(endpoint==='workflowDetails')data={key:'fixture',image:'/oss/fixture.svg',nodeCount:2,width:5600,directory:'/tmp/工作流验收',directoryUrl:'file:///tmp/工作流验收',downloadUrl:'/oss/fixture.svg',nodes:[{id:'1',title:'MiniMax H3 参考视频',inputs:{prompt:'完整简体中文提示词：女子站在窗边读信。',unet_name:'这是用于验证完整显示且不得截断的工作流模型名称.safetensors'}}]};
   else if(endpoint==='workflowOpen')data={message:'隔离验收：已打开工作流',generatesMedia:false};
   else if(endpoint==='clipList')data={clips:mockClips};
   else if(endpoint==='clipWorkflows')data={workflows:[{id:'comfyui-test:fixture',name:'隔离视频工作流',audio:'optional',available:true,modes:[{value:'["imageReference:4"]',label:'多素材参考',minImages:0,maxImages:4},{value:'text',label:'文字生成视频',minImages:0,maxImages:0}],specifications:[{duration:[5],resolution:['preview']}],defaults:{mode:'["imageReference:4"]',duration:5,resolution:'preview'}}]};
   else if(endpoint==='clipPreview'){if(failPreview){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:'验收：参考图不可用'}));return;}const v=compileCameraVariant(body.options,body.motionId);data={prepareToken:'11111111-1111-4111-8111-111111111111',expiresAt:Date.now()+300000,prompt:body.promptOverride||v.videoPrompt,canGenerate:v.audit.status!=='blocked',audit:v.audit,parameters:{workflowName:'隔离视频工作流',mode:body.mode,duration:5,resolution:'preview'}};}
   else if(endpoint==='clipGenerate'){const clip={id:body.requestId,status:'queued',motionId:'static',parameters:{},prompt:'模拟任务，无实际推理'};mockClips.push(clip);data={clip};}
   else if(endpoint==='promptText'){if(slowFirst&&body.storyboardId===1)await pause(400);data={prompt:body.ai?'AI 辅助：@DR-7-CHR-000031 缓慢抬眼。':body.promptOverride||compileCameraVariant(body.options,body.motionId).videoPrompt};}
   else throw Error('不允许的测试接口 '+endpoint);
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code:200,data}));return;
  }
  if(url.pathname==='/oss/fixture.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#7a9a60"/></svg>');return;}
  const f=path.join(process.cwd(),'data/web',url.pathname);res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html');res.end(await fs.readFile(f));
 }catch(e:any){res.statusCode=500;res.end(e.message);}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors:string[]=[];page.on('pageerror',(e:any)=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${(server.address() as any).port}/camera-studio.html?projectId=7&storyboardId=1`);
 const rich=page.getByRole('textbox',{name:'当前运镜视频提示词',exact:true});
 await page.getByRole('button',{name:/S02 · 6 秒/}).click();await page.waitForFunction(()=>document.querySelector('#shotTitle')?.textContent?.startsWith('S02'));
 await page.waitForFunction(()=>document.querySelector('.camera-rich-prompt')?.textContent?.includes('男子从门外回来'));
 assert.ok(calls.some(c=>c.endpoint==='skills'),'初始化技能请求已启动');assert.equal(skillsFinished,false,'技能库未完成时分镜应已更新');
 slowFirst=true;await page.getByRole('button',{name:/S01 · 5 秒/}).click();await page.getByRole('button',{name:/S02 · 6 秒/}).click();await pause(1300);
 assert.match(await page.locator('#shotTitle').innerText(),/^S02/);assert.match(await rich.innerText(),/男子从门外回来/);assert.equal(await page.locator('#narrative').inputValue(),boards[1].videoDesc);
 await page.getByRole('button',{name:'编辑提示词',exact:true}).click();await rich.fill('正文：@');
 const option=page.getByRole('option',{name:'灰衣女子 · ID 31',exact:true});await option.waitFor();assert.equal(await option.locator('img').count(),1);
 const menu=await page.locator('.camera-mention-menu').boundingBox(),area=await rich.boundingBox();assert.ok(menu.x+menu.width<=area.x,'资产面板在编写区左侧');
 await option.click();assert.equal(await rich.locator('.camera-asset-chip img').count(),1);assert.match(await rich.innerText(),/灰衣女子\s*ID：31/);
 await page.keyboard.type('继续写作');await page.getByRole('button',{name:'完成编辑',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.camera-rich-prompt')?.textContent?.includes('继续写作'));
 assert.equal(calls.filter(c=>c.endpoint==='clipPreview'&&c.body.promptOverride).at(-1).body.promptOverride,'正文：@DR-7-CHR-000031 继续写作');
 assert.equal(await rich.locator('.camera-asset-chip').count(),1);
 assert.equal(await page.getByRole('checkbox',{name:/DR-7-CHR-000031/}).isChecked(),true);
 assert.equal(await page.getByRole('combobox',{name:'输入模式',exact:true}).inputValue(),'["imageReference:4"]');
 await page.getByRole('button',{name:'编辑提示词',exact:true}).click();await rich.press('ControlOrMeta+A');await rich.press('Backspace');await rich.fill('替换内容');await page.getByRole('button',{name:'取消编辑',exact:true}).click();assert.equal(await rich.locator('.camera-asset-chip').count(),1);
 await page.getByRole('button',{name:'AI 辅助',exact:true}).click();await page.getByRole('button',{name:'采用 AI 结果',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.camera-rich-prompt')?.textContent?.includes('缓慢抬眼'));assert.equal(await rich.locator('.camera-asset-chip').count(),1);
 await page.getByRole('button',{name:'编辑提示词',exact:true}).click();await rich.fill('键盘选择@');await rich.press('Enter');assert.equal(await rich.locator('.camera-asset-chip').count(),1);await rich.press('Enter');await page.keyboard.type('第二行');await page.getByRole('button',{name:'完成编辑',exact:true}).click();await pause(100);assert.match(calls.filter(c=>c.body.promptOverride).at(-1).body.promptOverride,/@DR-7-CHR-000031 \n第二行/);

 await page.getByRole('button',{name:'编辑提示词',exact:true}).click();
 await rich.press('ControlOrMeta+A');
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);await rich.press('ControlOrMeta+C');
 assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/@DR-7-CHR-000031/);
 await rich.press('ControlOrMeta+X');assert.equal(await rich.locator('.camera-asset-chip').count(),0);
 await page.evaluate(()=>navigator.clipboard.writeText('安全粘贴 <script>文本</script>\n第二段'));await rich.press('ControlOrMeta+V');
 assert.equal(await rich.locator('script').count(),0);assert.match(await rich.innerText(),/第二段/);
 await page.getByRole('button',{name:'取消编辑',exact:true}).click();assert.equal(await rich.locator('.camera-asset-chip').count(),1);
 // 窄屏仍在左侧展示选择面板，且不产生页面横向溢出。
 await page.setViewportSize({width:760,height:900});await page.getByRole('button',{name:'编辑提示词',exact:true}).click();await rich.fill('@');await option.waitFor();const m=await page.locator('.camera-mention-menu').boundingBox(),r=await rich.boundingBox();assert.ok(m.x+m.width<=r.x);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'取消编辑',exact:true}).click();assert.deepEqual(errors,[]);

 // 生成入口、缺少条件、重置和独立折叠。
 await page.setViewportSize({width:1280,height:900});
 await page.getByRole('button',{name:'重置为原始分镜',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.camera-rich-prompt')?.textContent?.includes('男子从门外回来'));
 assert.doesNotMatch(await rich.innerText(),/第二行|键盘选择/);
 await page.locator('#narrative').fill('临时改写情节');await pause(300);await page.getByRole('button',{name:'重置为原始分镜',exact:true}).click();
 assert.equal(await page.locator('#narrative').inputValue(),boards[1].videoDesc);
 await page.waitForFunction(()=>document.querySelector('.camera-rich-prompt')?.textContent?.includes('男子从门外回来'));
 await page.getByRole('button',{name:'收起运镜选择',exact:true}).click();assert.equal(await page.getByRole('combobox',{name:'效果展示主运镜'}).isVisible(),false);
 await page.getByRole('button',{name:'隐藏几何示意',exact:true}).click();assert.equal(await page.locator('.showcase-diagram-content').isVisible(),false);
 await page.getByRole('button',{name:'编辑提示词',exact:true}).click();await rich.fill('@');await option.waitFor();assert.equal(await page.locator('.camera-mention-menu').isVisible(),true);const foldedMenu=await page.locator('.camera-mention-menu').boundingBox(),foldedEditor=await rich.boundingBox();assert.ok(foldedMenu.x+foldedMenu.width<=foldedEditor.x);
 await page.getByRole('button',{name:'取消编辑',exact:true}).click();assert.equal(await page.locator('.showcase-diagram-panel').isVisible(),false);
 await page.getByRole('button',{name:'展开运镜选择',exact:true}).click();await page.getByRole('button',{name:'显示几何示意',exact:true}).click();
 assert.equal(await page.getByRole('combobox',{name:'效果展示主运镜'}).inputValue(),'static');
 await page.getByRole('button',{name:'前往视频生成 ↓',exact:true}).click();
 const readiness=page.locator('.showcase-readiness'),generate=page.getByRole('button',{name:'生成此运镜切片',exact:true});
 await page.waitForFunction(()=>document.querySelector('.showcase-readiness')?.textContent?.includes('已准备就绪'));assert.equal(await generate.isEnabled(),true);
 assert.equal(await page.getByRole('combobox',{name:'ComfyUI 工作流',exact:true}).inputValue(),'comfyui-test:fixture');
 assert.equal(await page.getByRole('combobox',{name:'输入模式',exact:true}).inputValue(),'text');
 assert.equal(await page.getByRole('combobox',{name:'输入模式',exact:true}).locator('option:checked').innerText(),'T2VA');
 await page.getByRole('button',{name:'放大工作流节点截图'}).click();await page.getByRole('textbox',{name:'搜索工作流节点'}).fill('完整简体');assert.match(await page.locator('.workflow-inspector').innerText(),/完整简体中文提示词：女子站在窗边读信。/);
 await page.getByRole('combobox',{name:'节点截图缩放'}).selectOption('1');await page.getByRole('button',{name:'关闭预览'}).click();
 await page.getByRole('link',{name:'打开工作流目录',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.workflow-open-status')?.textContent?.includes('隔离验收'));
 await page.getByRole('button',{name:'用 ComfyUI 桌面打开'}).click();await page.waitForFunction(()=>document.querySelector('.workflow-open-status')?.textContent?.includes('隔离验收'));assert.equal(calls.filter(c=>c.endpoint==='workflowOpen').length,2);
 assert.equal(await page.getByRole('checkbox',{name:/DR-7-CHR-000031/}).isChecked(),false);
 await page.getByRole('combobox',{name:'ComfyUI 工作流',exact:true}).selectOption('comfyui-test:fixture');
 await page.waitForFunction(()=>document.querySelector('.showcase-readiness')?.textContent?.includes('至少需要一张图片'));
 assert.equal(await generate.isEnabled(),false);await page.getByRole('button',{name:'选择参考素材',exact:true}).click();assert.equal(await page.locator('.showcase-references').getAttribute('open'),'');
 await page.getByRole('checkbox',{name:/DR-7-CHR-000031/}).check();await page.waitForFunction(()=>document.querySelector('.showcase-readiness')?.textContent?.includes('已准备就绪'));assert.equal(await generate.isEnabled(),true);
 await page.locator('#openingFrame').fill('');await page.waitForFunction(()=>document.querySelector('.showcase-readiness')?.textContent?.includes('首帧缺少'));assert.equal(await generate.isEnabled(),false);
 await page.getByRole('button',{name:'补充分镜信息',exact:true}).click();assert.equal(await page.locator('#openingFrame').evaluate((e:any)=>e===document.activeElement),true);
 await page.locator('#openingFrame').fill(boards[1].prompt);await page.waitForFunction(()=>document.querySelector('.showcase-readiness')?.textContent?.includes('已准备就绪'));
 failPreview=true;await page.getByRole('button',{name:'刷新提示词与参数',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.showcase-readiness')?.textContent?.includes('验收：参考图不可用'));assert.equal(await generate.isEnabled(),false);
 failPreview=false;await page.getByRole('button',{name:'重新检查',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.showcase-readiness')?.textContent?.includes('已准备就绪'));
 assert.equal(calls.filter(c=>c.endpoint==='clipGenerate').length,0,'不得自动生成');
 await generate.click();await page.waitForFunction(()=>document.querySelector('.showcase-clips')?.textContent?.includes('排队中'));assert.equal(calls.filter(c=>c.endpoint==='clipGenerate').length,1);
 assert.deepEqual(errors,[]);
 await fs.writeFile('local/camera-generation-controls-verification.json',JSON.stringify({resetPrompt:true,resetNarrative:true,independentFold:true,mentionsWhileHidden:true,generateShortcut:true,missingReferencesExplained:true,referenceJump:true,readyEnablesGenerate:true,auditBlockAndJump:true,serverFailureShown:true,noAutomaticSubmission:true,explicitMockSubmission:1,errors},null,2));
 await fs.writeFile('local/camera-editor-browser-verification.json',JSON.stringify({initialSwitch:true,latestSelectionWins:true,delayedOldResponseIgnored:true,leftPicker:true,thumbnailAndName:true,inlineThumbnailNameId:true,serializedIdPreserved:true,cancelRestoresChips:true,aiChips:true,keyboardAndNewline:true,clipboardAndSafePaste:true,narrowLayout:true,errors},null,2));
 console.log('通过：初始切换、快速切换与乱序响应、左侧资产面板、缩略图卡片、正文引用序列化、取消、AI、键盘、换行和窄屏布局。');
 }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
