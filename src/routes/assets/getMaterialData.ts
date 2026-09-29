import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 获取生成图片
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number().optional(),
  }),
  async (req, res) => {
    const { projectId, scriptId } = req.body;
    const list = await u
      .db("o_assets")
      .leftJoin("o_image", "o_assets.id", "=", "o_image.assetsId")
      .whereIn("o_assets.type", ["clip", "audio"])
      .whereNotNull("o_image.filePath")
      .andWhere("o_assets.projectId", projectId)
      .select("o_assets.*", "o_image.filePath");
    const data = await Promise.all(
      list.map(async (item) => ({
        ...item,
        filePath: item.filePath ? await u.oss.getFileUrl(item.filePath) : "",
      })),
    );
    //拿到本地片尾视频并插入到data中
    const ending = await u.oss.getFileUrl("/ending.mp4", "assets");
    data.push({
      id: 0,
      name: "Toonflow片尾",
      filePath: ending,
      type: "clip",
    });
    // 查询视频轨道
    const trackQuery = u
      .db("o_videoTrack")
      .andWhere("o_videoTrack.projectId", projectId)
      .select("o_videoTrack.id as trackId","o_videoTrack.videoId")
      .orderBy("o_videoTrack.id", "asc");
    if (scriptId !== undefined) trackQuery.where("o_videoTrack.scriptId", scriptId);
    const trackRows = await trackQuery;
    // 按轨道分组处理视频
    const video = await Promise.all(
      trackRows.map(async (track, trackIndex) => {
        const videoItems = await u.db("o_video").where("o_video.videoTrackId", track.trackId).andWhere("o_video.state", "生成成功").select("*");
        const videoList = await Promise.all(
          videoItems.map(async (v) => ({
            id: v.id,
            filePath: v.filePath ? await u.oss.getFileUrl(v.filePath) : "",
            videoTrackId: v.videoTrackId,
          })),
        );
        return {
          id: track.trackId,
          trackNumber: trackIndex + 1,
          videoId: track.videoId,
          video: videoList,
        };
      }),
    ).then((tracks) => tracks.filter((track) => track.video.length > 0));

    res.status(200).send(success({ data, video }));
  },
);
