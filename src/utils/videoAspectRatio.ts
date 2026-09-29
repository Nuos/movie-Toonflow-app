import { db } from "./db";

/** Only explicit episode header metadata overrides the project default. */
export function scriptVideoRatio(content: string, fallback = "16:9"): string {
  const header = content.split(/^\s*\d+[-－]\d+\s/m)[0];
  const match = header.match(/^\s*#{1,6}\s*(?:平台|画幅)[：:]\s*(?:竖屏|横屏)?\s*(\d+)\s*[:：]\s*(\d+)/m);
  return match && Number(match[1]) > 0 && Number(match[2]) > 0 ? `${Number(match[1])}:${Number(match[2])}` : fallback;
}

export async function episodeVideoRatio(projectId: number, scriptId: number | null | undefined, fallback = "16:9") {
  if (!scriptId) return fallback;
  const script = await db("o_script").where({id:scriptId,projectId}).select("content").first();
  return scriptVideoRatio(script?.content || "", fallback);
}

export async function trackVideoRatio(projectId: number, trackId: number, fallback = "16:9") {
  const track = await db("o_videoTrack").where({id:trackId,projectId}).select("scriptId").first();
  return episodeVideoRatio(projectId, track?.scriptId, fallback);
}
