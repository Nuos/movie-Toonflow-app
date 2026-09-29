import { cleanDeletionFiles } from "@/utils/assetDeletion";
import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    id: z.number(),
  }),
  async (req, res) => {
    const { id } = req.body;
    const filePath = await u.db.transaction(async trx => {
      const row = await trx("o_video").where({ id }).first();
      await trx("o_video").where({ id }).delete();
      await trx("o_videoTrack").where("videoId", id).update({ videoId: null });
      return row?.filePath;
    });
    if (filePath) await cleanDeletionFiles({ media: [filePath], archives: [] });
    res.status(200).send(success({ message: "视频删除成功" }));
  },
);
