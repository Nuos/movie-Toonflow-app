import { submitCompiledVideo } from '@/utils/h3/store';
import { trackVideoRatio } from "@/utils/videoAspectRatio";
import { shotDurationSchema, validateActionText } from "@/utils/shotActionRules";
import { isLocalH3, resolveLocalVideoParameters, alignVideoPrompt } from "@/utils/localVideoParameters";
import express from "express";
import { audioReferenceLimit } from "@/utils/soundLibrary";
import { characterVoiceContext, withCharacterVoices } from "@/utils/characterVoices";
import u from "@/utils";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { ReferenceList } from "@/utils/ai";
const router = express.Router();

type Type = "imageReference" | "startImage" | "endImage" | "videoReference" | "audioReference";
interface UploadItem {
  fileType: "image" | "video" | "audio";
  type: Type;
  sources?: "assets" | "storyboard";
  id?: number;
  src?: string;
  label?: string;
  prompt?: string;
}

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number(),
    uploadData: z.array(
      z.object({
        id: z.number(),
        sources: z.string(),
      }),
    ),
    prompt: z.string(),
    model: z.string(),
    mode: z.string(),
    resolution: z.string(),
    duration: z.number().finite().positive(),
    seed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    aspectRatio: z.string().regex(/^\d+:\d+$/).optional(),
    audio: z.boolean().optional(),
    trackId: z.number(),
  }),
  async (req, res) => {
    const { scriptId, projectId, prompt, uploadData, model, duration, resolution, audio, mode, trackId } = req.body;
    if(isLocalH3(model)) {
      const aspectRatio=req.body.aspectRatio || await trackVideoRatio(projectId,trackId);
      const submitted=await submitCompiledVideo({projectId,trackId,ownerId:Number((req as any).user?.id),model,duration,aspectRatio,resolution,audio,seed:req.body.seed,prompt});
      return res.status(200).send(success(submitted.videoId));
    }
    validateActionText(prompt);
    let modeData = [];
    if (Array.isArray(mode)) {
    } else if (typeof mode === "string" && mode.startsWith('["') && mode.endsWith('"]')) {
      try {
        modeData = JSON.parse(mode);
      } catch (e) {}
    }
    //获取生成视频比例
    const ratio = await u.db("o_project").select("videoRatio").where("id", projectId).first();
    const videoPath = `/${projectId}/video/${uuidv4()}.mp4`; //视频保存路径
    //查询出图片数据
    const images = await Promise.all(
      uploadData.map(async (item: UploadItem) => {
        if (item.sources === "storyboard") {
          const filePath = await u.db("o_storyboard").where({ id: item.id, projectId }).select("filePath").first();
          return { path: filePath?.filePath, sources: "storyBoard" };
        }
        if (item.sources === "assets") {
          const filePath = await u
            .db("o_assets")
            .where("o_assets.id", item.id)
            .andWhere("o_assets.projectId", projectId)
            .leftJoin("o_image", "o_assets.imageId", "o_image.id")
            .select("o_image.filePath", "o_image.type")
            .first();
          return { path: filePath?.filePath, sources: filePath?.type };
        }
      }),
    );
    //把images里面的图片转成base64格式
    let audioCount = 0;
    const permittedImages = images.filter(item => item?.sources !== "audio" || (audio !== false && ++audioCount <= audioReferenceLimit(mode)));
    const base64 = await Promise.all(
      permittedImages.map(async (item) => {
        if (!item) return null;
        return { base64: await u.oss.getImageBase64(item.path), type: item.sources == "audio" ? "audio" : item.sources == "video" ? "video" : "image" };
      }),
    );
    let effectivePrompt = withCharacterVoices(prompt, await characterVoiceContext(u.db, projectId, trackId, uploadData), audio !== false);
    const aspectRatio = req.body.aspectRatio || await trackVideoRatio(projectId, trackId, ratio?.videoRatio || "16:9");
    if (isLocalH3(model)) {
      await resolveLocalVideoParameters(model, { duration, resolution, aspectRatio });
      effectivePrompt = alignVideoPrompt(effectivePrompt, aspectRatio, duration);
    }
    //新增
    const [videoId] = await u.db("o_video").insert({
      filePath: videoPath,
      time: Date.now(),
      state: "生成中",
      scriptId,
      projectId,
      videoTrackId: trackId,
    });
    res.status(200).send(success(videoId));
    const relatedObjects = {
      projectId,
      videoId,
      scriptId,
      type: "视频",
    };
    const aiVideo = u.Ai.Video(model);
    aiVideo
      .run(
        {
          prompt: effectivePrompt,
          referenceList: base64.filter(Boolean) as ReferenceList[],
          mode: modeData.length > 0 ? modeData : mode,
          duration,
          aspectRatio,
          resolution,
          audio,
        },
        {
          projectId,
          taskClass: "视频生成",
          describe: "根据提示词生成视频",
          relatedObjects: JSON.stringify(relatedObjects),
        },
      )
      .then(async () => await aiVideo.save(videoPath, { videoId, projectId, scriptId, trackId }))
      .catch(async (error: any) => {
        await u
          .db("o_video")
          .where({ id: videoId, state: "生成中" })
          .update({
            state: "生成失败",
            errorReason: u.error(error).message,
          });
      });
  },
);
