import express from "express";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { bindProjectAudio } from "@/utils/soundLibrary";
const router = express.Router();

// 新增资产
export default router.post(
  "/",
  validateFields({
    assetsId: z.number(),
    audioIds: z.array(z.number()).optional(),
  }),
  async (req, res) => {
    const { assetsId, audioIds } = req.body;
    if (audioIds && audioIds.length > 1) return res.status(400).send(error("仅可绑定一个音色"));
    await bindProjectAudio(u.db, assetsId, audioIds?.[0] ?? null);
    res.status(200).send(success({ message: "更新音频成功" }));
  },
);
