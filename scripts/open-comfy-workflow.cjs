// 使用本机桌面的文件打开入口；不执行工作流，不关闭或保存原有标签页。
const {execFile,spawn}=require('node:child_process'),{promisify}=require('node:util'),fs=require('node:fs'),path=require('node:path');
const run=promisify(execFile),pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const file=process.argv[2],root='/home/ubuntu/llmspace/avspace/manual/comfyui/default/workflows/Toonflow/';
 if(!file||!path.resolve(file).startsWith(root)||!file.endsWith('.json')||!fs.existsSync(file))throw Error('工作流文件不正确。');
 const xdo=path.resolve(__dirname,'../local/tools/xdotool/usr/bin/xdotool'),xclip=path.resolve(__dirname,'../local/tools/xclip/usr/bin/xclip');
 const cmd=async(...args)=>(await run(xdo,args,{timeout:4000})).stdout.trim();
 const readClipboard=async()=>(await run(xclip,['-selection','clipboard','-o','-t','UTF8_STRING'],{timeout:2000,maxBuffer:5000000})).stdout;
 const writeClipboard=text=>new Promise((resolve,reject)=>{const p=spawn(xclip,['-selection','clipboard','-i'],{stdio:['pipe','ignore','ignore']});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(Error('无法使用桌面剪贴板。')));p.stdin.end(text);});
 const find=async()=>{try{for(const id of (await cmd('search','--onlyvisible','--class','^Comfy Desktop$')).split('\n')){const title=await cmd('getwindowname',id);if(title.includes('ComfyUI')&&title.includes('Comfy Desktop'))return id;}}catch{}return null;};
 let window=await find();
 if(!window){const child=spawn('/home/ubuntu/llmspace/comfy-desktop/start.sh',[],{detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();for(let i=0;i<30&&!window;i++){await pause(400);window=await find();}}
 if(!window)throw Error('请先在 ComfyUI 桌面应用连接本机 127.0.0.1:8188。');
 await cmd('windowactivate','--sync',window);await pause(500);await cmd('key','--clearmodifiers','ctrl+o');
 let dialog=null;for(let i=0;i<20;i++){await pause(150);const active=await cmd('getactivewindow');if(active!==window&&/打开|Open File|选择文件|Select File/i.test(await cmd('getwindowname',active))){dialog=active;break;}}
 if(!dialog)throw Error('桌面应用未显示文件选择窗口，请关闭弹窗后重试。');
 let previous=null;try{previous=await readClipboard();}catch{}
 try{
  await pause(800);await cmd('windowactivate','--sync',dialog);await cmd('windowfocus','--sync',dialog);
  await cmd('key','--clearmodifiers','ctrl+l');await pause(500);await cmd('key','--clearmodifiers','ctrl+a');await writeClipboard(file);await cmd('key','--clearmodifiers','ctrl+v');await pause(500);
  if((await cmd('getactivewindow'))!==dialog)throw Error('文件选择窗口失去焦点，已停止自动输入，请重试。');
  await cmd('key','--clearmodifiers','ctrl+a');await cmd('key','--clearmodifiers','ctrl+c');await pause(100);
  if((await readClipboard())!==file)throw Error('文件路径未能完整写入，已停止打开，请在文件选择框中重试。');
  await cmd('key','--clearmodifiers','Return');await pause(700);
  // GTK 文件选择器第一次确认定位到文件，第二次确认才导入。
  if((await cmd('getactivewindow'))===dialog){
   await cmd('key','--clearmodifiers','Return');await pause(500);
  }
  const name=path.basename(file,'.json');
  for(let i=0;i<30;i++){await pause(200);const title=await cmd('getwindowname',window);let stillOpen=false;try{stillOpen=/Open File|打开/.test(await cmd('getwindowname',dialog));}catch{}if(!stillOpen&&title.includes(name)){console.log(JSON.stringify({opened:true,title}));return;}}
  throw Error('桌面应用尚未确认加载该工作流，请检查文件选择框。');
 }finally{if(previous!==null)await writeClipboard(previous);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
