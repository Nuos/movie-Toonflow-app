import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { withPromptLanguage } from "@/utils/promptLanguage";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    images: z.array(z.string()),
  }),
  async (req, res) => {
    const { images } = req.body;
    try {
      const resText = await u.Ai.Text("universalAi").invoke({
        system: withPromptLanguage('根据图片提取简洁、可直接用于图片生成的画风提示词。只输出一个括号包裹的综合描述，格式如“（画风：二维动漫风格，柔和线条，低饱和色彩）”或“（画风：照片级真人写实，自然光，细腻材质）”。多张图片提取共同风格特征；无法描述时只返回“无法描述”。正文使用简体中文，不附带英文译文。'),
        messages: [
          {
            role: "user",
            content: [
              ...images.map((image: string) => ({
                type: "image" as const,
                image,
              })),
            ],
          },
        ],
      });
      res.status(200).send(success(resText.text));
    } catch (e) {
      const err = u.error(e);
      res.status(500).send({ message: err.message });
    }
  },
);
