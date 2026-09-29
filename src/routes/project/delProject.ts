import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import fs from "node:fs/promises";
const router = express.Router();

// 删除项目
export default router.post(
  "/",
  validateFields({
    id: z.number(),
  }),
  async (req, res) => {
    const { id } = req.body;
    const archivePaths = await u.db.transaction(async tx => {
      const flowIds = new Set<number>([
        ...(await tx("o_assets").where("projectId", id).whereNotNull("flowId").pluck("flowId")),
        ...(await tx("o_storyboard").where("projectId", id).whereNotNull("flowId").pluck("flowId")),
      ]);
      //删除项目
      await tx("o_project").where("id", id).delete();
      await tx("o_agentWorkData").where("projectId", id).delete();
      // 先清理章节关联，保留仍被其他章节引用的事件。
      const novelIds = (await tx("o_novel").where("projectId", id)).map(row => row.id);
      const eventIds = (await tx("o_eventChapter").whereIn("novelId", novelIds)).map(row => row.eventId);
      await tx("o_eventChapter").whereIn("novelId", novelIds).delete();
      await tx("o_event").whereIn("id", eventIds).whereNotIn("id", tx("o_eventChapter").select("eventId").whereNotNull("eventId")).delete();
      //删除项目下的原文
      await tx("o_novel").where("projectId", id).delete();
      // 删除项目下的剧本信息
      const scriptData = await tx("o_script").where("projectId", id).select("id");
      const scriptIds = scriptData.map((item: any) => item.id);
      if (scriptIds && scriptIds.length > 0) {
        await tx("o_scriptAssets").whereIn("scriptId", scriptIds).delete();
      }
      await tx("o_script").where("projectId", id).delete();
      // 删除项目下的任务
      await tx("o_tasks").where("projectId", id).delete();
      // 删除项目下的分镜
      const storyboardData = await tx("o_storyboard").where("projectId", id).select("id");
      const storyboardIds = storyboardData.map((item: any) => item.id);
      if (storyboardIds.length > 0) {
        await tx("o_assets2Storyboard").whereIn("storyboardId", storyboardIds).delete();
      }
      await tx("o_storyboard").where("projectId", id).delete();
      //删除需要删除资产的归属图片
      const assetsData = await tx("o_assets").where("projectId", id).select("id");
      const assetsIds = assetsData.map((item: any) => item.id);
      if (assetsIds && assetsIds.length > 0) {
        // 先将 o_assets.imageId 置空，解除对 o_image 的外键引用
        await tx("o_assets").whereIn("id", assetsIds).update({ imageId: null });
        await tx("o_image").whereIn("assetsId", assetsIds).delete();
      }
      await tx("o_assetsRole2Audio").whereIn("assetsRoleId", assetsIds).orWhereIn("assetsAudioId", assetsIds).delete();
      // 删除项目下的资产
      await tx("o_assets").where("projectId", id).delete();
      for (const flowId of flowIds) {
        if (!(await tx("o_assets").where({ flowId }).first()) && !(await tx("o_storyboard").where({ flowId }).first())) {
          await tx("o_imageFlow").where({ id: flowId }).delete();
        }
      }
      //删除项目下的视频轨道和视频
      await tx("o_videoTrack").where("projectId", id).delete();
      await tx("o_video").where("projectId", id).delete();
      //删除项目下的资源

      await tx("memories").where("isolationKey", "like", `${id}:%`).delete();

      const archives: string[] = [];
      const extensions = ["o_characterPortrait", "o_promptStandard", "o_generationRecipe", "o_cameraPlan", "o_cameraClipDraft", "o_cameraClip", "o_soundLibraryAssets"];
      for (const table of extensions) {
        if (!(await tx.schema.hasTable(table))) continue;
        if (table === "o_generationRecipe" || table === "o_cameraClip") {
          const rows = await tx(table).where("projectId", id).select("id");
          for (const row of rows) {
            // 仅清理本模块创建的 UUID 归档目录，不信任备份导入的任意路径。
            if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(row.id))) {
              archives.push(u.getPath(table === "o_cameraClip" ? ["reproduction", "camera-clips", row.id] : ["reproduction", row.id]));
            }
          }
        }
        await tx(table).where("projectId", id).delete();
      }
      return archives;
    });
    for (const directory of archivePaths) {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => console.warn("项目已删除，但复现归档文件清理失败"));
    }

    try {
      await u.oss.deleteDirectory(`${id}/`);
      console.log(`项目 ${id} 的OSS文件夹删除成功`);
    } catch (error: any) {
      console.log(`项目 ${id} 没有对应的OSS文件夹，跳过删除`);
    }

    res.status(200).send(success({ message: "删除项目成功" }));
  },
);
