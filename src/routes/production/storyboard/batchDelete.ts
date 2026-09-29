import { deleteStoryboards } from "@/utils/productionDeletion";
import express from "express";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    ids: z.array(z.number()),
    projectId: z.number(),
  }),
  async (req, res) => {
    const { ids, projectId } = req.body;
    if (!ids.length) return res.status(400).send(error("请先选择分镜"));
    if (!(await u.db("o_storyboard").whereIn("id", ids).where({ projectId }).first())) return res.status(400).send(error("当前选择分镜不存在"));
    await deleteStoryboards(ids, projectId);
    res.status(200).send(success({ message: "视频删除成功" }));
  },
);
