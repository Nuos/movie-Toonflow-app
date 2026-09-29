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
    const assetsData = await u.db.transaction(async (tx) => {
      const images = await tx("o_image").where({ id });
      await tx("o_assets").where({ imageId: id }).update({ imageId: null });
      await tx("o_image").where({ id }).delete();
      return images;
    });
    for (const image of assetsData) {
      if (!image.filePath || await u.db("o_image").where({ filePath: image.filePath }).first()) continue;
      try { await u.oss.deleteFile(image.filePath); }
      catch (err: any) { if (err.code !== "ENOENT") throw err; }
    }
    res.status(200).send(success({ message: "资产图片删除成功" }));
  },
);
