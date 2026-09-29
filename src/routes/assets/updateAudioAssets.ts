import { canonicalMediaPath } from "@/utils/productionStorage";
import { deleteAssetRows, cleanDeletionFiles } from "@/utils/assetDeletion";
import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 新增资产
export default router.post(
  "/",
  validateFields({
    id: z.number(),
    name: z.string(),
    describe: z.string(),
    projectId: z.number(),
    assetsItem: z.array(
      z.object({
        src: z.string().optional(),
        id: z.number().optional(),
        base64: z.string().optional(),
        prompt: z.string(),
        describe: z.string(),
        name: z.string(),
      }),
    ),
  }),
  async (req, res) => {
    const { id, name, describe, projectId, assetsItem } = req.body;
    await Promise.all(
      assetsItem.map(async (i: { src?: string; id?: number; base64: string; prompt: string }) => {
        if (i.src) {
          i.src = u.replaceUrl(i.src);
        }
        if (i.base64) {
          const mimeMatch = i.base64.match(/^data:audio\/([^;]+);base64,/);
          const mimeExt = mimeMatch ? mimeMatch[1] : "mp3";
          const mimeToExt: Record<string, string> = {
            mpeg: "mp3",
            "x-wav": "wav",
            "x-aiff": "aiff",
            "x-m4a": "m4a",
            "x-flac": "flac",
          };
          const ext = mimeToExt[mimeExt] ?? mimeExt;
          const savePath = `/${projectId}/assets/audio/${u.uuid()}.${ext}`;
          const base64Data = i.base64.replace(/^data:[^;]+;base64,/, "");
          await u.oss.writeFile(savePath, base64Data);
          i.src = savePath;
        }
      }),
    );

    const removedFiles = await u.db.transaction(async tx => {
      await tx("o_assets").where("id", id).update({
        name,
        describe,
      });

      // 删除不在 assetsItem 中的子项
      const existingItems = await tx("o_assets").where("assetsId", id).select("id");
      const existingIds = existingItems.map((i: { id?: number }) => i.id!);
      const incomingIds = assetsItem.filter((i: { id?: number }) => i.id).map((i: { id?: number }) => i.id);
      const toDeleteIds = existingIds.filter((eid: number) => !incomingIds.includes(eid));
      const replacedFiles: string[] = [];

      for (const item of assetsItem) {
        if (item.id) {
          await tx("o_assets").where("id", item.id).update({
            prompt: item.prompt,
            describe: item.describe,
            name: item.name,
          });
          const itemData = await tx("o_assets").where("id", item.id).select("imageId").first();
          if (item.src !== undefined) {
            const image = await tx("o_image").where("id", itemData?.imageId).first();
            if (image?.filePath && canonicalMediaPath(u.replaceUrl(image.filePath)) !== canonicalMediaPath(u.replaceUrl(item.src))) {
              replacedFiles.push(image.filePath);
              if (await tx.schema.hasTable("o_soundLibraryAssets")) {
                const mappings = await tx("o_soundLibraryAssets").where({ childId: item.id, projectId });
                if (mappings.length) {
                  const roles = await tx("o_assetsRole2Audio").whereIn("assetsAudioId", mappings.map(row => row.parentId)).pluck("assetsRoleId");
                  await tx("o_assets").whereIn("id", roles).update({ defaultVoice: null });
                  await tx("o_soundLibraryAssets").where({ childId: item.id, projectId }).delete();
                }
              }
            }
            await tx("o_image").where("id", itemData?.imageId).update({ filePath: item.src });
          }
        } else {
          const [assetsId] = await tx("o_assets").insert({
            prompt: item.prompt,
            assetsId: id,
            type: "audio",
            projectId,
            describe: item.describe,
            name: item.name,
            startTime: Date.now(),
          });
          const [imageId] = await tx("o_image").insert({
            filePath: item.src,
            type: "audio",
            assetsId,
            state: "已完成",
          });
          await tx("o_assets").where("id", assetsId).update({
            imageId,
          });
        }
      }

      const removedFiles = await deleteAssetRows(tx, toDeleteIds, projectId);
      removedFiles.media.push(...replacedFiles);
      return removedFiles;
    });
    await cleanDeletionFiles(removedFiles);

    res.status(200).send(success({ message: "新增资产成功" }));
  },
);
