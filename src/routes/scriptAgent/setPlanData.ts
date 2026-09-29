import express from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";
import { db } from "@/utils/db";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    agentType: z.enum(["scriptAgent"]),
    data: z.object({
      storySkeleton: z.string(),
      adaptationStrategy: z.string(),
      script: z.array(z.object({ id: z.number().optional(), name: z.string(), content: z.string() })).optional(),
    }),
  }),
  async (req, res) => {
    const { projectId, agentType, data } = req.body;
    const scripts = await db.transaction(async trx => {
      const work = await trx("o_agentWorkData").where({ projectId, key: agentType }).first();
      const plan = JSON.stringify({ storySkeleton: data.storySkeleton, adaptationStrategy: data.adaptationStrategy });
      if (work) await trx("o_agentWorkData").where({ id: work.id }).update({ data: plan });
      else await trx("o_agentWorkData").insert({ projectId, key: agentType, data: plan });
      for (const s of data.script || []) {
        const row = await trx("o_script").where(s.id ? { projectId, id: s.id } : { projectId, name: s.name }).first();
        if (s.id && !row) throw new Error("剧本不属于当前项目，未保存");
        if (row) {
          await trx("o_script").where({ id: row.id, projectId }).update({ name: s.name, content: s.content });
        } else {
          await trx("o_script").insert({ projectId, name: s.name, content: s.content });
        }
      }
      return trx("o_script").where({ projectId }).select("id", "name");
    });

    res.status(200).send(success({ script: scripts }));
  },
);
