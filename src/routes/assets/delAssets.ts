import { deleteAssets } from "@/utils/assetDeletion";
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
    await deleteAssets([id]);
    res.status(200).send(success({ message: "删除资产成功" }));
  },
);
