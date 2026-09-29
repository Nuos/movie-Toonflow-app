import { compiledInput, submitCompiledVideo } from '@/utils/h3/store';
import { isLocalH3 } from '@/utils/localVideoParameters';
import { trackVideoRatio } from "@/utils/videoAspectRatio";
import { shotDurationSchema, validateActionText } from "@/utils/shotActionRules";
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
    trackData: z.array(
      z.object({
        uploadData: z.array(
          z.object({
            id: z.number(),
            sources: z.string(),
          }),
        ),
        trackId: z.number(),
        prompt: z.string(),
        duration: z.number().finite().positive(),
      }),
    ),
    model: z.string(),
    mode: z.string(),
    resolution: z.string(),
    audio: z.boolean().optional(),
  }),
  async (req, res) => {
    const { scriptId, projectId, trackData, model, resolution, audio, mode } = req.body;
    if(isLocalH3(model)) {
      const ownerId=Number((req as any).user?.id),prepared=[];
      for(const t of trackData){const aspectRatio=await trackVideoRatio(projectId,t.trackId);const verified=await compiledInput(projectId,t.trackId,ownerId,model,t.duration,aspectRatio);if(t.prompt!==verified.compiled.prompt)throw Error('提示词与已采用结构化计划不一致');prepared.push({...t,aspectRatio});}
      const results=[];for(const t of prepared){results.push({...await submitCompiledVideo({...t,projectId,ownerId,model,resolution,audio}),trackId:t.trackId});}
      return res.status(200).send(success(results));
    }


    let modeData = [];
    if (Array.isArray(mode)) {
    } else if (typeof mode === "string" && mode.startsWith('["') && mode.endsWith('"]')) {
      try {
        modeData = JSON.parse(mode);
      } catch (e) {}
    }

    // 获取生成视频比例
    const ratio = await u.db("o_project").select("videoRatio").where("id", projectId).first();

    // 为每个 track 预处理数据并插入数据库，返回任务列表
    const tasks = await Promise.all(
      (trackData as { uploadData: { id: number; sources: string }[]; trackId: number; prompt: string; duration: number }[]).map(async (track) => {
        const { uploadData, trackId, prompt, duration } = track;
        validateActionText(prompt);

        // 查询出图片数据
        const images = await Promise.all(
          uploadData.map(async (item) => {
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

        const effectivePrompt = withCharacterVoices(prompt, await characterVoiceContext(u.db, projectId, trackId, uploadData), audio !== false);
        const videoPath = `/${projectId}/video/${uuidv4()}.mp4`;
        const [videoId] = await u.db("o_video").insert({
          filePath: videoPath,
          time: Date.now(),
          state: "生成中",
          scriptId,
          projectId,
          videoTrackId: trackId,
        });

        let audioCount = 0;
        const permittedImages = images.filter(item => item?.sources !== "audio" || (audio !== false && ++audioCount <= audioReferenceLimit(mode)));
        return { videoId, videoPath, prompt: effectivePrompt, duration, images: permittedImages, trackId };
      }),
    );

    res.status(200).send(success(tasks.map((t) => ({ videoId: t.videoId, trackId: t.trackId }))));
    // 响应已返回；每项独立收尾，参考读取失败不阻断同批其他任务。
    await Promise.all(tasks.map(async ({ videoId, videoPath, prompt, duration, images, trackId }) => {
      try {
        const base64 = await Promise.all(images.map(async (item) => {
          if (!item) return null;
          return { base64: await u.oss.getImageBase64(item.path), type: item.sources == "audio" ? "audio" : item.sources == "video" ? "video" : "image" };
        }));
        const relatedObjects = { projectId, videoId, scriptId, type: "视频" };
        const aiVideo = u.Ai.Video(model);
        await aiVideo.run(
          {
            prompt,
            referenceList: base64.filter(Boolean) as ReferenceList[],
            mode: modeData.length > 0 ? modeData : mode,
            duration,
            aspectRatio: await trackVideoRatio(projectId, trackId, ratio?.videoRatio || "16:9"),
            resolution,
            audio,
          },
          {
            projectId,
            taskClass: "视频生成",
            describe: "根据提示词生成视频",
            relatedObjects: JSON.stringify(relatedObjects),
          },
        );
        await aiVideo.save(videoPath, { videoId, projectId, scriptId, trackId });
      } catch (error: any) {
        await u.db("o_video").where({ id: videoId, state: "生成中" }).update({
          state: "生成失败",
          errorReason: u.error(error).message,
        });
      }
    }));
  },
);
