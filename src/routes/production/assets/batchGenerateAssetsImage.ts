import { SCENE_REFERENCE_RULES } from "@/utils/assetReferenceRules";
import { getPortrait, polishPortrait } from "@/utils/characterPortrait";
import { preserveSelectedPrompt } from "@/utils/imagePrompts";
import express from "express";
import { ensureAssetBaselines } from "@/utils/promptLibrary";
import { withPromptLanguage } from "@/utils/promptLanguage";
import u from "@/utils";
import { z } from "zod";
import sharp from "sharp";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { Output } from "ai";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    assetIds: z.array(z.number()),
    projectId: z.number(),
    scriptId: z.number(),
    concurrentCount: z.number().min(1).optional(),
  }),
  async (req, res) => {
    const { assetIds, projectId, scriptId, concurrentCount = 5 } = req.body;

    const projectSettingData = await u.db("o_project").where("id", projectId).select("imageModel", "imageQuality", "artStyle").first();

    try { await u.Ai.Image(projectSettingData?.imageModel as `${string}:${string}`).checkReady(); }
    catch (e) { return res.status(400).send(error(u.error(e).message)); }

    const assetsDataArr = await u.db("o_assets").where({ projectId }).whereIn("id", assetIds).select("id", "describe", "name", "type", "assetsId");
    const parentIds = assetsDataArr.map((item) => item.assetsId).filter((id) => id !== null);
    const parentAssetsData = await u
      .db("o_assets")
      .leftJoin("o_image", "o_assets.imageId", "o_image.id")
      .whereIn("o_assets.id", parentIds as number[])
      .select("o_assets.id", "o_image.filePath", "o_assets.describe");
    assetsDataArr.forEach((i: any) => {
      const parent = parentAssetsData.find((item) => item.id === i.assetsId);
      if (parent) {
        i.parentDescribe = parent.describe;
      }
    });
    const imageUrlRecord: Record<number, string> = {};
    parentAssetsData.forEach((item) => {
      if (item.filePath) imageUrlRecord[item.id] = item.filePath;
    });
    const rolePrompt = u.getArtPrompt(projectSettingData!.artStyle!, "art_skills", "art_character_derivative");
    const toolPrompt = u.getArtPrompt(projectSettingData!.artStyle!, "art_skills", "art_prop_derivative");
    const scenePrompt = u.getArtPrompt(projectSettingData!.artStyle!, "art_skills", "art_scene_derivative");
    const promptRecord: Record<string, { prompt: string }> = {
      role: {
        prompt: rolePrompt,
      },
      tool: {
        prompt: toolPrompt,
      },
      scene: {
        prompt: scenePrompt,
      },
    };
    let previousImages: Map<number, number | null>;
    try { previousImages = await ensureAssetBaselines(projectId, assetIds, projectSettingData?.imageModel ?? ""); }
    catch (e) { return res.status(400).send(error(u.error(e).message)); }

    // 先批量为所有 assets 创建 image 记录并标记为"生成中"
    const imageIdMap: Record<number, number> = {};
    for (const item of assetsDataArr) {
      await preserveSelectedPrompt(u.db, await u.db("o_assets").where({id:item.id}).first());
    const [imageId] = await u.db("o_image").insert({
        assetsId: item.id,
        type: item.type,
        state: "生成中",
        resolution: projectSettingData?.imageQuality,
        model: projectSettingData?.imageModel,
      });
      imageIdMap[item.id!] = imageId;
      await u.db("o_assets").where("id", item.id).update({ imageId: imageId });
    }

    const imageData: { id: number; state: string; src: string }[] = [];
    res.status(200).send(success("开始生成资产图片"));
    const generateSingleAsset = async (item: any) => {
      const imageId = imageIdMap[item.id!];
      const typeConfig = promptRecord[item.type!] || promptRecord["role"];

      try {
        const pending = () => u.db("o_image").where({ id: imageId, assetsId: item.id, state: "生成中" }).first();
        if (!(await pending())) return { id: item.id, state: "生成失败", src: "" };
        // Generating an image must not redesign a character already approved or
        // precisely patched by the user/Agent. Only legacy roles need expansion.
        const { text } = item.type === "role" ? { text: ((await getPortrait(projectId, item.id)) ?? await polishPortrait(projectId, item.id, `父级角色：${item.parentDescribe || "无"}\n当前角色：${item.describe || item.name}`, imageId)).prompt } : await u.Ai.Text("universalAi").invoke({
          system: withPromptLanguage(typeConfig.prompt + (item.type === "scene" ? "\n" + SCENE_REFERENCE_RULES : "")),
          messages: [
            {
              role: "user",
              content: `
              父级资产描述: ${item.parentDescribe || "无详细描述"}
              当前资产描述: ${item.describe || "无详细描述"}`,
            },
          ],
        });
        if (!(await pending())) return { id: item.id, state: "生成失败", src: "" };
        await u.db("o_image").where({id:imageId}).update({prompt:text});
        await u.db("o_assets").where({ id: item.id, projectId, imageId }).update({ prompt: text });

        const imageBase64 = imageUrlRecord[item.assetsId!] ? await u.oss.getImageBase64(imageUrlRecord[item.assetsId!]) : null;
        const repeloadObj = {
          prompt: text,
          size: projectSettingData?.imageQuality as "1K" | "2K" | "4K",
          aspectRatio: "16:9" as `${number}:${number}`,
        };
        const imageCls = await u.Ai.Image(projectSettingData?.imageModel as `${string}:${string}`).run(
          {
            referenceList: imageBase64 ? [{ type: "image", base64: imageBase64 }] : [],
            ...repeloadObj,
          },
          {
            taskClass: "生成图片",
            describe: "资产图片生成",
            relatedObjects: JSON.stringify({ ...repeloadObj, assetId: item.id }),
            projectId: projectId,
          },
        );
        const savePath = `/${projectId}/assets/${scriptId}/${item.type}/${u.uuid()}.jpg`;
        const saved = await imageCls.save(savePath, {
          imageId, assetId: item.id, projectId, type: item.type,
          model: projectSettingData!.imageModel!, resolution: projectSettingData!.imageQuality!,
        });
        if (!saved) return { id: item.id, state: "生成失败", src: "" };
        return {
          id: item.id!,
          state: "已完成",
          src: await u.oss.getSmallImageUrl(savePath),
        };
      } catch (e) {
        await u
          .db("o_image")
          .where({ id: imageId })
          .update({ state: "生成失败", errorReason: u.error(e).message });
        if (previousImages.get(item.id)) await u.db("o_assets").where({ id: item.id, imageId }).update({ imageId: previousImages.get(item.id) });
        return {
          id: item.id!,
          state: "生成失败",
          src: "",
        };
      }
    };

    // 按 concurrentCount 分批并发执行
    for (let i = 0; i < assetsDataArr.length; i += concurrentCount) {
      const batch = assetsDataArr.slice(i, i + concurrentCount);
      const batchResults = await Promise.all(batch.map(generateSingleAsset));
      imageData.push(...batchResults);
    }
  },
);
