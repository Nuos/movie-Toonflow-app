import { nativeGenerate, selectionSchema } from '@/utils/h3/store';
import { isLocalH3 } from '@/utils/localVideoParameters';
import { validatePromptReferences } from "@/utils/shotActionRules";
import { episodeVideoRatio } from "@/utils/videoAspectRatio";
import express from "express";
import { characterVoiceContext, withCharacterVoices } from "@/utils/characterVoices";
import { standardizeVideo } from "@/utils/promptLibrary";
import { withPromptLanguage } from "@/utils/promptLanguage";
import { cameraPromptGenerationSystem, cameraPromptGenerationContext, withCameraPromptContext, validateCameraGeneratedPrompt } from "@/utils/cameraPromptGeneration";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import fs from "fs/promises";
import path from "path";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    trackId: z.number(),
    projectId: z.number(),
    info: z.array(
      z.object({
        id: z.number(),
        sources: z.string(),
      }),
    ),
    model: z.string(),
    mode: z.string(),
  }),
  async (req, res) => {
    const { trackId, projectId, info, model, mode } = req.body;
    if (isLocalH3(model)) {
      try { return res.status(200).send(success(await nativeGenerate(projectId,trackId,Number((req as any).user?.id),selectionSchema.parse(info),model,mode))); }
      catch(e:any) { return res.status(400).send(error(e.message)); }
    }

    await u.db("o_videoTrack").where({ id: trackId }).update({
      state: "生成中",
    });
    //查询参数
    const images = await Promise.all(
      info.map(async (item: { id: number; sources: string }) => {
        if (item.sources === "storyboard") {
          // 查询分镜主信息
          const storyboard = await u
            .db("o_storyboard")
            .where("o_storyboard.id", item.id)
            .select("videoDesc", "prompt", "track", "duration", "shouldGenerateImage")
            .first();
          // 查询分镜关联的资产ID
          const assetRows = await u.db("o_assets2Storyboard").where("storyboardId", item.id).orderBy("rowid").select("assetId");
          const associateAssetsIds = assetRows.map((row: any) => row.assetId);
          return {
            ...storyboard,
            associateAssetsIds,
            _type: "storyboard", // 标记类型，便于后续区分
          };
        }
        if (item.sources === "assets") {
          // 查询素材
          const assetsData = await u
            .db("o_assets")
            .leftJoin("o_image", "o_image.id", "o_assets.imageId")
            .where("o_assets.id", item.id)
            .select("o_assets.id", "o_assets.type", "o_assets.name", "o_assets.describe", "o_assets.prompt", "o_image.filePath")
            .first();
          return {
            ...assetsData,
            _type: "assets", // 标记类型
          };
        }
      }),
    );

    // 拆分 assets 和 storyboard
    const assets: any[] = [];
    const storyboard: any[] = [];
    for (const item of images) {
      if (!item) continue; // 忽略空
      if (item._type === "assets")
        assets.push({
          id: item.id,
          type: item.type,
          name: item.name,
                describe: item.describe || item.prompt || "",
          filePath: item.filePath,
        });
      if (item._type === "storyboard")
        storyboard.push({
          videoDesc: item.videoDesc,
          prompt: item.prompt,
          track: item.track,
          duration: item.duration,
          associateAssetsIds: item.associateAssetsIds,
          shouldGenerateImage: item.shouldGenerateImage,
        });
    }
    const assetsNotAudioIds = assets.filter((i) => i.type == "audio").map((i) => i.id);

    const assets2Audio = await u
      .db("o_assets")
      .whereIn("o_assets.id", assetsNotAudioIds)
      .join("o_assetsRole2Audio", "o_assetsRole2Audio.assetsAudioId", "o_assets.assetsId")
      .select("o_assets.assetsId", "o_assets.id", "o_assetsRole2Audio.assetsAudioId", "o_assetsRole2Audio.assetsRoleId");

    const assetsAudioRecord: Record<number, number> = {};
    assets2Audio.forEach((i) => {
      assetsAudioRecord[i.assetsRoleId!] = i.id!;
    });

    const [id, modelData] = model.split(/:(.+)/);
    const projectData = await u.db("o_project").select("*").where({ id: projectId }).first();
    const videoPrompt = await u.db("o_prompt").where("type", "videoPromptGeneration").first();
    let videoPromptGeneration = "" as string | undefined;

    const modelPromptData = await u.db("o_modelPrompt").where("vendorId", id).where("model", modelData).first();
    //查询到 有绑定对应视频提示词
    if (modelPromptData) {
      const modelPromptRoot = u.getPath(["modelPrompt"]);
      try {
        const fullPath = path.join(modelPromptRoot, modelPromptData?.path!);
        const content = await fs.readFile(fullPath, "utf-8");
        videoPromptGeneration = content ?? "";
      } catch {}
    }

    // 未查询到绑定，根据模型名称 + mode 自动匹配 modelPrompt/video/ 下的文件
    if (!videoPromptGeneration) {
      const modelPromptRoot = u.getPath(["modelPrompt"]);
      const videoPromptDir = path.join(modelPromptRoot, "video");
      const modelLower = (modelData ?? "").toLowerCase();

      let fileName: string | null = null;

      if (modelLower.includes("wan") && modelLower.includes("2.6")) {
        // wan2.6 系列 => 单图首尾帧模式
        fileName = "wan2.6Single-imageFirstFrameMode.md";
      } else if (/seedance.*2[.\-]0/i.test(modelData)) {
        // seedance 2.0 / 2-0 系列
        fileName = "seedance2Multi-parameterMode.md";
      } else if (mode === "startEndRequired" || mode === "endFrameOptional" || mode === "startFrameOptional") {
        // body.mode 为首尾帧相关 => 通用首尾帧模式
        fileName = "universalFirstAndLastFrameMode.md";
      } else if (typeof mode === "string" && mode.startsWith('["') && mode.endsWith('"]')) {
        // 其他 => 通用多参模式
        fileName = "universalMulti-parameterMode.md";
      }
      if (fileName) {
        try {
          const fullPath = path.join(videoPromptDir, fileName);
          videoPromptGeneration = await fs.readFile(fullPath, "utf-8");
        } catch {
          // 文件不存在则忽略，继续用备选
        }
      }
    }

    //备选
    if (!videoPromptGeneration) {
      if (videoPrompt && videoPrompt.useData) {
        videoPromptGeneration = videoPrompt.useData;
      } else {
        videoPromptGeneration = videoPrompt?.data ?? undefined;
      }
    }

    const artStyle = projectData?.artStyle || "无";

    const visualManual = u.getArtPrompt(artStyle, "art_skills", "art_storyboard_video");
    const promptTrack = await u.db("o_videoTrack").where({id:trackId,projectId}).select("duration", "scriptId").first();
    const aspectRatio = await episodeVideoRatio(projectId, promptTrack?.scriptId, projectData?.videoRatio || "16:9");
    const voiceContext = await characterVoiceContext(u.db, projectId, trackId, info);
    const content = `
          **模型名称**：${modelData},
          **生成模式**：${mode}（text=T2VA；singleImage=I2VA；startEndRequired=FL2VA；引用数组=Ref2VA）,
          **目标时长（秒）**：${promptTrack?.duration ?? 5},
          **画幅**：${aspectRatio},
          **参考素材顺序**：${JSON.stringify(info)},
          图片按输入顺序标记为 <Picture 1>、<Picture 2>；音频按对应音频输入顺序标记。singleImage 唯一图片是首帧；startEndRequired 第一张是首帧、第二张是尾帧。不要添加未提供的引用。


          **资产信息**（角色、场景、道具、音频):${assets
            .filter((i) => i.filePath)
            .map((i) => `[${i.id},${i.type},${i.name} ${assetsAudioRecord[i.id] ? `audio:${assetsAudioRecord[i.id]}` : ""} ] `)
            .join("，")},
          **参考分镜描述**（这里只含选中的参考，完整轨道顺序以摄影编排数据为准）：${storyboard.map(
            (i) => `<storyboardItem
  videoDesc='${i.videoDesc}'
  duration='${i.duration}'
></storyboardItem>`,
          )},
          `;

    try {
      const referenceCounts = { Picture: images.filter((i: any) => i && (i._type === "storyboard" || !["audio", "video"].includes(i.type))).length, Audio: assets.filter((a: any) => a.type === "audio" && a.filePath).length, Video: assets.filter((a: any) => a.type === "video" && a.filePath).length };
      const slotCounts = { Picture: 0, Audio: 0, Video: 0 };
      const slots = images.filter(Boolean).map((a: any) => { const type = a.type === "audio" ? "Audio" : a.type === "video" ? "Video" : "Picture"; return { label: `<${type} ${++slotCounts[type]}>`, id: a.id, name: a.name || "分镜首帧", description: a.describe || a.prompt || "" }; });
      const identityContext = `\n【真实素材与身份】${JSON.stringify(slots)}。subject_definitions 必须把每个引用主体明确绑定上述 label，不用数据库编号替代 <Picture N>。\n实际引用数量：${JSON.stringify(referenceCounts)}。只允许引用各类型的真实编号；没有音频文件时不得出现 <Audio N>。角色声线描述只约束声音，绝不据此推断或改变可见角色年龄、面容、身份。场景参考里的示意人物与巨石不增加角色或道具数量。\n`;
      const cameraContext = await cameraPromptGenerationContext(projectId, trackId, mode, info);
      const generateText = (correction = "", previous = "") => u.Ai.Text("universalAi").invoke({
        system: withPromptLanguage(cameraPromptGenerationSystem(videoPromptGeneration, model)),
        messages: [
          {
            role: "assistant",
            content: `${visualManual}`,
          },
          {
            role: "user",
            content: withCharacterVoices(withCameraPromptContext(content + identityContext, cameraContext), voiceContext),
          },
          ...(previous ? [{role:"assistant" as const,content:previous},{role:"user" as const,content:correction}] : []),
        ],
      });
      let { text } = await generateText();
      const validate = () => { validateCameraGeneratedPrompt(text, cameraContext); validatePromptReferences(text, referenceCounts); };
      try { validate(); } catch (e: any) {
        ({ text } = await generateText(`\n【本次校验修正】上次输出未保存，原因：${e.message}。请修改上方失败草稿并重新输出完整提示词，保留所有原台词、动作和真实引用，不输出说明。`, text));
        validate();
      }
      text = await standardizeVideo(projectId, trackId, text, model, mode, info);
      await u.db("o_videoTrack").where({ id: trackId }).update({
        state: "已完成",
        prompt: text,
      });
      res.status(200).send(success(text));
    } catch (e) {
      await u
        .db("o_videoTrack")
        .where({ id: trackId })
        .update({
          state: "生成失败",
          reason: u.error(e).message,
        });
      res.status(400).send(error(u.error(e).message));
    }
  },
);
