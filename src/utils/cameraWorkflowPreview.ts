import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import getPath from './getPath';
import {digest} from './promptStandards';

const execute=promisify(execFile);
export function compactVideoMode(mode:string){return mode.startsWith('[')||mode==='reference'?'Ref2VA':({text:'T2VA',singleImage:'I2VA',startEndRequired:'FL2VA',endFrameOptional:'I2VA / FL2VA',startFrameOptional:'T2VA / I2VA'} as Record<string,string>)[mode]||mode;}
export async function workflowPreview(workflowId:string,mode:string){
  const manifest=JSON.parse(await fs.readFile(getPath(['web','workflow-previews','manifest.json']),'utf8'));
  const key=workflowId.replace(/^comfyui-h3:/,'')+'-'+compactVideoMode(mode);
  if(!workflowId.startsWith('comfyui-h3:')||!Object.hasOwn(manifest,key))throw Error('此工作流尚未建立本机节点截图。');
  const item=manifest[key];
  const expectedDirectory=path.join('/home/ubuntu/llmspace/avspace/manual/comfyui/default/workflows/Toonflow',item.model);
  if(item.directory!==expectedDirectory||item.uiFile!==path.join(expectedDirectory,key+'.json')||item.apiFile!==path.join(expectedDirectory,item.mode+'.api.json'))throw Error('工作流目录配置不正确。');
  for(const file of [item.uiFile,item.apiFile,getPath(['web','workflow-previews',key+'.png'])])await fs.access(file);
  const stale=(await Promise.all(item.sources.map(async(s:any)=>digest(await fs.readFile(s.path))!==s.sha256))).some(Boolean);
  const graph=JSON.parse(await fs.readFile(item.apiFile,'utf8'));
  return {...item,key,stale,directoryUrl:pathToFileURL(item.directory).href,downloadUrl:`/workflow-previews/${key}.json`,nodes:Object.entries(graph).map(([id,n]:[string,any])=>({id,type:n.class_type,title:n._meta?.title||n.class_type,inputs:n.inputs}))};
}

let opening=false;
/** 仅由已登录的本机显式点击触发；参数只使用已核验的工作流目录。 */
export async function openWorkflowLocally(item:any,action:'desktop'|'directory'){
  if(item.stale)throw Error('原工作流模板已更新，请重新生成节点预览后打开。');
  if(opening)throw Error('正在打开工作流，请稍候。');
  opening=true;
  const env={...process.env,DISPLAY:process.env.DISPLAY||':1',XAUTHORITY:process.env.XAUTHORITY||`/run/user/${process.getuid?.()||1000}/gdm/Xauthority`,DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS||`unix:path=/run/user/${process.getuid?.()||1000}/bus`};
  try{
    if(action==='directory'){
      await execute('/usr/bin/gdbus',['call','--session','--dest','org.freedesktop.FileManager1','--object-path','/org/freedesktop/FileManager1','--method','org.freedesktop.FileManager1.ShowFolders',`['${item.directoryUrl}']`,''],{env,timeout:10000});
      return {message:'已在文件管理器中打开工作流目录。',directory:item.directory,generatesMedia:false};
    }
    const helper=path.resolve('scripts/open-comfy-workflow.cjs');
    const {stdout}=await execute(process.execPath,[helper,item.uiFile],{env,timeout:25000,maxBuffer:10000});
    const result=JSON.parse(stdout.trim());
    if(!result.opened)throw Error('桌面应用尚未确认打开，请在 ComfyUI 中检查。');
    return {message:'已在 ComfyUI 桌面应用的新标签页打开节点模板。',file:item.uiFile,generatesMedia:false};
  }finally{opening=false;}
}
