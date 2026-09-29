import { projectNativeBoards } from '@/utils/h3/store';
import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { assetMediaType } from "@/utils/assetMediaType";
import { storyboardVideoSlice } from "@/utils/storyboardVideoSlice";
const router = express.Router();
let rendering = 0;
router.post("/slice", validateFields({projectId:z.number().int().positive(),scriptId:z.number().int().positive(),storyboardId:z.number().int().positive(),videoId:z.number().int().positive()}), async(req,res)=>{
  if(rendering>=2)return res.status(429).json({message:"切片导出繁忙，请稍后重试"});
  rendering++;
  try{
    const slice=await storyboardVideoSlice(req.body);
    res.setHeader("X-Slice-Start",String(slice.start));res.setHeader("X-Slice-Duration",String(slice.duration));
    if(res.destroyed){await slice.cleanup();return;}
    res.download(slice.output,async()=>{await slice.cleanup();});
  }catch(e){if(!res.headersSent)res.status(400).json({message:e instanceof Error?e.message:"切片导出失败"});}
  finally{rendering--;}
});
const durationOf = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 3;

export default router.post("/", validateFields({ scriptId: z.number(), projectId: z.number() }), async (req, res) => {
  const { scriptId, projectId } = req.body;
  const boards = await projectNativeBoards(await u.db("o_storyboard").where({ scriptId, projectId }).orderBy("index", "asc").orderBy("id", "asc"));
  const [assets, tracks, videos] = await Promise.all([
    u.db("o_assets2Storyboard").join("o_assets", "o_assets2Storyboard.assetId", "o_assets.id")
      .leftJoin("o_image", "o_assets.imageId", "o_image.id")
      .whereIn("o_assets2Storyboard.storyboardId", boards.map(b => b.id!)).where("o_assets.projectId", projectId)
      .select("o_assets2Storyboard.storyboardId", "o_assets.id as assetId", "o_assets.name", "o_assets.type", "o_image.filePath"),
    u.db("o_videoTrack").where({ scriptId, projectId }),
    u.db("o_video").where({ scriptId, projectId }).whereIn("state", ["已完成", "生成成功"]).whereNotNull("filePath").orderBy("id", "desc"),
  ]);
  const assetMap = new Map<number, any[]>();
  for (const asset of assets) {
    const kind = assetMediaType(asset);
    const src = asset.filePath ? await u.oss.getFileUrl(asset.filePath) : "";
    const item = { id: asset.assetId, name: asset.name || "未命名资产", type: asset.type, fileType: kind, src,
      avatar: kind === "image" ? src : undefined };
    const list = assetMap.get(asset.storyboardId!) || [];
    if (!list.some(a => a.id === item.id)) list.push(item);
    assetMap.set(asset.storyboardId!, list);
  }
  const ownerId = Number((req as any).user?.id);
  const clips = ownerId && await u.db.schema.hasTable("o_cameraClip")
    ? await u.db("o_cameraClip").where({ projectId, ownerId, status: "completed" }).whereIn("storyboardId", boards.map(b => b.id!)).whereNotNull("filePath").orderBy("createdAt", "desc") : [];
  const offsets = new Map<number, number>();
  const result = [];
  for (const board of boards) {
    const duration = durationOf(board.duration), characters = assetMap.get(board.id!) || [];
    const filePath = board.filePath ? await u.oss.getFileUrl(board.filePath) : "";
    const images = [
      ...(filePath ? [{ id: `storyboard-${board.id}`, src: filePath, name: "分镜成图", source: "storyboard" }] : []),
      ...characters.filter(a => a.fileType === "image" && a.src).map(a => ({ ...a, id: `asset-${a.id}`, source: "asset" })),
    ];
    const track = tracks.find(t => t.id === board.trackId);
    const start = offsets.get(board.trackId!) || 0;
    offsets.set(board.trackId!, start + duration);
    const candidates = track ? videos.filter(v => v.videoTrackId === track.id && v.filePath) : [];
    const selected = candidates.find(v => v.id === track?.videoId);
    const videoList = await Promise.all(candidates.map(async v => ({
      id: `video-${v.id}`, src: await u.oss.getFileUrl(v.filePath!), name: `轨道视频 #${v.id}`,
      source: "track", selected: v.id === selected?.id, start, end: start + duration,
    })));
    if (selected) videoList.sort((a,b) => Number(b.selected) - Number(a.selected));
    const cameraVideos = await Promise.all(clips.filter(c => c.storyboardId === board.id && c.filePath).map(async c => {
      let data: any = {}; try { data = JSON.parse(c.data); } catch { /* Historical clips may have incomplete metadata. */ }
      return { id: `camera-${c.id}`, src: await u.oss.getFileUrl(c.filePath!), name: `运镜切片 · ${data.motionName || c.id}`, source: "camera", selected: false, start: 0, end: null };
    }));
    const assetVideos = characters.filter(a => a.fileType === "video" && a.src).map(a => ({
      id: `asset-video-${a.id}`, src: a.src, name: a.name, source: "asset", selected: false, start: 0, end: null,
    }));
    result.push({ id: String(board.id), index: board.index, scriptId, trackId: board.trackId,
      createTime: board.createTime, duration, filePath: filePath || undefined, prompt: board.prompt || "",
      description: board.videoDesc || "", state: board.state || "未生成", reason: board.reason || "",
      characters, images, videos: [...videoList, ...cameraVideos, ...assetVideos],
      videoState: track?.state || "未生成", videoReason: track?.reason || "", videoPrompt: track?.prompt || "",
    });
  }
  res.status(200).send(success(result));
});
