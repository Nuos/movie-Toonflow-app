import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
const run = promisify(execFile);
export type AuditState = "pass" | "fail" | "unverified" | "not_applicable";
export interface AuditCheck { id: string; label: string; status: AuditState; evidence: string }

/** Measures the actual file, without inference or changing acceptance status. */
export async function inspectVideoFile(file: string, expected: {width?:number;height?:number;frames?:number;fps?:number;audio?:boolean}) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const checks: AuditCheck[] = [];
  const add = (id: string,label: string,status: AuditState,evidence: string) => checks.push({id,label,status,evidence});
  let probe: any = null;
  try {
    const result = await run("ffprobe", ["-v","error","-show_streams","-show_format","-of","json",file], {timeout:20000,maxBuffer:2*1024*1024});
    probe = JSON.parse(result.stdout);
    const video = probe.streams?.find((s: any)=>s.codec_type==="video");
    const audio = probe.streams?.find((s: any)=>s.codec_type==="audio");
    add("video","视频流",video?"pass":"fail",video?`${video.codec_name}，${video.width}×${video.height}`:"未找到视频流");
    if (video) {
      const dimensionsKnown = !!expected.width && !!expected.height;
      add("dimensions","生成尺寸", dimensionsKnown?(video.width===expected.width&&video.height===expected.height?"pass":"fail"):"unverified",dimensionsKnown?`实测 ${video.width}×${video.height}；提交 ${expected.width}×${expected.height}`:"提交记录未保存精确尺寸，无法比较");
      const duration = Number(video.duration ?? probe.format?.duration);
      const intended = expected.frames && expected.fps ? expected.frames/expected.fps : null;
      const tolerance = expected.fps ? 1/expected.fps+0.002 : 0;
      add("duration","帧数对应时长",intended && Number.isFinite(duration)?(Math.abs(duration-intended)<=tolerance?"pass":"fail"):"unverified",`实测 ${Number.isFinite(duration)?duration:"未知"} 秒；工作流帧数对应 ${intended??"未知"} 秒，容差 ${tolerance} 秒`);
    }
    add("audio","必需音轨",expected.audio===true?(audio?"pass":"fail"):"not_applicable",expected.audio===true?(audio?`存在 ${audio.codec_name} 音轨；尚未检查其内容`:"提交要求含声音，实际没有音轨"):"本次提交未要求音轨");
  } catch (error: any) {
    add("probe","媒体信息读取",typeof error.code==="number"&&!error.killed?"fail":"unverified",error.killed?"读取超时":typeof error.code==="number"?"ffprobe 无法读取媒体":"检测工具不可用或结果无法解析");
  }
  if (probe) {
    try {
      await run("ffmpeg",["-v","error","-xerror","-err_detect","explode","-i",file,"-map","0:v?","-map","0:a?","-f","null","-"],{timeout:60000,maxBuffer:2*1024*1024});
      add("decode","完整解码","pass","已将全部视频与音频流解码至结尾，未报告错误");
    } catch (error: any) {
      add("decode","完整解码",typeof error.code==="number"&&!error.killed?"fail":"unverified",error.killed?"解码检查超时":typeof error.code==="number"?"FFmpeg 报告解码失败":"解码工具不可用");
    }
  }
  for (const [id,label] of [["action","动作与结束状态"],["identity","人物与参考资产"],["camera","构图与运镜"],["continuity","跨镜连续性"],["speech","台词、声音与音画"]]) {
    add(id,label,"unverified","技术检测不判断此项，需要实际观看或听审并记录依据");
  }
  return {version:1,createdAt:Date.now(),mediaSha256:hash.digest("hex"),status:checks.some(c=>c.status==="fail")?"fail" as const:"unverified" as const,checks,
    measured:probe?{streams:probe.streams?.map((s:any)=>({type:s.codec_type,codec:s.codec_name,width:s.width,height:s.height,duration:s.duration,frames:s.nb_frames,fps:s.avg_frame_rate})),duration:probe.format?.duration}:null};
}
