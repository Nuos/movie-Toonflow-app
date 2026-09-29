import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 新增项目
export default router.post(
  "/",
  validateFields({
    projectType: z.string(),
    name: z.string(),
    intro: z.string(),
    type: z.string(),
    artStyle: z.string(),
    directorManual: z.string(),
    videoRatio: z.string(),
    imageModel: z.string().default("comfyui-h3:qwen-image-2.1-quality"),
    videoModel: z.string().default("comfyui-h3:h3-quality"),
    imageQuality: z.string().default("2K"),
    mode: z.string().default("text"),
  }),
  async (req, res) => {
    const { projectType, name, intro, type, directorManual, artStyle, videoRatio,
      imageModel = "comfyui-h3:qwen-image-2.1-quality", videoModel = "comfyui-h3:h3-quality",
      imageQuality = "2K", mode = "text" } = req.body;

    await u.db("o_project").insert({
      id: Date.now(),
      projectType,
      name,
      intro,
      type,
      artStyle,
      videoRatio,
      directorManual,
      userId: 1,
      imageModel,
      videoModel,
      createTime: Date.now(),
      imageQuality,
      mode,
    });

    res.status(200).send(success({ message: "新增项目成功" }));
  },
);
