import { shotDurationSchema } from "@/utils/shotActionRules";
import express from "express";
import { tryBuildStandard } from "@/utils/promptLibrary";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();
export default router.post(
  "/",
  validateFields({
    data: z.array(
      z.object({
        prompt: z.string(),
        duration: shotDurationSchema,
        track: z.string(),
        state: z.string(),
        src: z.string().nullable(),
        videoDesc: z.string(),
        shouldGenerateImage: z.number(),
        associateAssetsIds: z.array(z.number()),
      }),
    ).refine(items => new Set(items.map(item => item.track)).size === items.length, "每个完整动作镜头须使用独立轨道编号，不能合并多个分镜"),
    scriptId: z.number(),
    projectId: z.number(),
  }),
  async (req, res) => {
    const { data, scriptId, projectId } = req.body;
    if (!data.length) return res.status(400).send({ success: false, message: "数据不能为空" });
    const reusedTrack = await u.db("o_storyboard").where({scriptId, projectId}).whereIn("track", data.map((item: {track: string}) => item.track)).first();
    if (reusedTrack) return res.status(400).send(error("轨道编号已有分镜，请编辑原分镜或为新动作使用独立轨道编号"));
    const lastStoryboard = await u.db.transaction(async tx => {
      for (const item of data) {
        const [id] = await tx("o_storyboard").insert({
          prompt: item.prompt, duration: String(item.duration), state: item.state,
          scriptId, projectId, track: item.track, filePath: u.replaceUrl(item.src),
          videoDesc: item.videoDesc, shouldGenerateImage: item.shouldGenerateImage, createTime: Date.now(),
        });
        if (item.associateAssetsIds?.length) await tx("o_assets2Storyboard").insert(
          item.associateAssetsIds.map((assetId: number) => ({ assetId, storyboardId: id })),
        );
      }
      // 只更新此次导入涉及的命名轨道，保留其他独立分镜已有的轨道关联。
      for (const track of new Set<string>(data.map((item: { track: string }) => item.track))) {
        const members = await tx("o_storyboard").where({ scriptId, projectId, track });
        const duration = members.reduce((sum, board) => sum + Number(board.duration), 0);
        const candidateIds = members.map(board => board.trackId).filter((id): id is number => id != null);
        const existing = await tx("o_videoTrack").where({ scriptId, projectId }).whereIn("id", candidateIds).first();
        let trackId: number;
        if (existing) {
          trackId = existing.id;
          await tx("o_videoTrack").where({ id: trackId }).update({ duration });
        } else {
          // SQLite 分配唯一 ID，避免多轨道在同一毫秒内使用 Date.now() 撞号。
          [trackId] = await tx("o_videoTrack").insert({ scriptId, projectId, duration });
        }
        await tx("o_storyboard").whereIn("id", members.map(board => board.id)).update({ trackId });
      }
      return tx("o_storyboard").where({ scriptId, projectId });
    });
    // 扩展提示词构建使用自己的事务，必须在原分镜事务提交后运行。
    const touchedNames = new Set(data.map((item: { track: string }) => item.track));
    for (const trackId of new Set(lastStoryboard.filter(board => touchedNames.has(board.track)).map(board => board.trackId))) {
      if (trackId != null) await tryBuildStandard(projectId, "track", trackId);
    }

    const storyboardData = await Promise.all(
      lastStoryboard.map(async (i) => {
        return {
          associateAssetsIds: await u.db("o_assets2Storyboard").where("storyboardId", i.id).orderBy("rowid").select("assetId").pluck("assetId"),
          src: i.filePath ? await u.oss.getSmallImageUrl(i.filePath) : "",
          id: i.id,
          trackId: i.trackId,
          prompt: i.prompt,
          duration: Number(i.duration),
          state: i.state,
          scriptId: i.scriptId,
          reason: i.reason,
          videoDesc: i.videoDesc
        };
      }),
    );
    return res.status(200).send(success(storyboardData));
  },
);
