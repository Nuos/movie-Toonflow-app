import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import u from '@/utils';
import { canonicalMediaPath, safeMediaPath } from './productionStorage';
const run = promisify(execFile);
export async function storyboardVideoSlice(target: {projectId:number;scriptId:number;storyboardId:number;videoId:number}) {
  const {projectId,scriptId,storyboardId,videoId}=target;
  const board=await u.db('o_storyboard').where({id:storyboardId,projectId,scriptId}).first();
  if(!board?.trackId)throw Error('分镜不存在或未绑定视频轨道');
  const video=await u.db('o_video').where({id:videoId,projectId,scriptId,videoTrackId:board.trackId}).whereIn('state',['已完成','生成成功']).first();
  if(!video?.filePath)throw Error('视频不存在、尚未完成或不属于该分镜');
  const boards=await u.db('o_storyboard').where({projectId,scriptId,trackId:board.trackId}).orderBy('index','asc').orderBy('id','asc');
  const duration=(v:unknown)=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):3;
  const start=boards.slice(0,boards.findIndex(b=>b.id===storyboardId)).reduce((s,b)=>s+duration(b.duration),0);
  const planned=duration(board.duration);if(planned>120)throw Error('单镜切片超过120秒，请在剪辑工作台导出');
  const root=await fs.realpath(u.getPath('oss'));
  let source=safeMediaPath(root,canonicalMediaPath(video.filePath));
  try{await fs.access(source);}catch{source=safeMediaPath(root,video.filePath);}
  source=await fs.realpath(source);if(!source.startsWith(root+path.sep))throw Error('视频文件不在素材目录内');
  const probe=await run('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',source],{timeout:15000,maxBuffer:1024*1024});
  const total=Number(probe.stdout.trim());if(!Number.isFinite(total)||total<=start)throw Error('分镜起点超过视频实际时长');
  const length=Math.min(planned,total-start),folder=await fs.mkdtemp(path.join(os.tmpdir(),'toonflow-slice-'));
  const output=path.join(folder,`分镜-${storyboardId}.mp4`);
  try{
    await run('ffmpeg',['-nostdin','-v','error','-ss',String(start),'-i',source,'-t',String(length),'-map','0:v:0','-map','0:a?','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:a','aac','-movflags','+faststart','-threads','2','-y',output],{timeout:120000,maxBuffer:1024*1024});
    return {output,start,duration:length,cleanup:()=>fs.rm(folder,{recursive:true,force:true})};
  }catch(e){await fs.rm(folder,{recursive:true,force:true});throw e;}
}
