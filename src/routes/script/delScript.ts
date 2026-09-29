import { deleteScripts } from "@/utils/productionDeletion";
import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 删除剧本
export default router.post(
  "/",
  validateFields({
    ids: z.array(z.number()),
  }),
  async (req, res) => {
    const { ids } = req.body;
    await deleteScripts(ids);
    res.status(200).send(success({ message: "删除剧本成功" }));
  },
);
