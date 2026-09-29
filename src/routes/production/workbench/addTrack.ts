import { shotDurationSchema } from "@/utils/shotActionRules";
import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number(),
    duration: shotDurationSchema.optional(),
  }),
  async (req, res) => {
    const { projectId, scriptId, duration } = req.body;
    // Creating a track does not need the generation service to be online.
    const trackId = Date.now()
    await u.db("o_videoTrack").insert({
      id: trackId,
      projectId,
      scriptId,
      duration,
    });
    res.status(200).send(success(trackId));
  },
);
