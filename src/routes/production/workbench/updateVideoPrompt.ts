import { assertLegacyEditAllowed } from '@/utils/h3/store';
import express from "express";
import { tryBuildStandard } from "@/utils/promptLibrary";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();
export default router.post(
  "/",
  validateFields({
    id: z.number(),
    prompt: z.string().optional(),
  }),
  async (req, res) => {
    const { id, prompt, duration } = req.body;
    await assertLegacyEditAllowed(id);
        await u.db("o_videoTrack").where("id", id).update({
      prompt,
    });
    const track = await u.db("o_videoTrack").where("id", id).first();
    if (track?.projectId && prompt?.trim()) await tryBuildStandard(track.projectId, "track", id, { basePrompt: prompt });
    res.status(200).send(success("更新成功"));
  },
);
