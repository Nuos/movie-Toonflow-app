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
    id: z.number(),
  }),
  async (req, res) => {
    const { id } = req.body;
    if (!(await u.db("o_storyboard").where({ id }).first())) return res.status(400).send(error("未找到该分镜"));
    await deleteStoryboards([id]);
    res.status(200).send(success({ message: "视频删除成功" }));
  },
);
