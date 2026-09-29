import { assertLegacyEditAllowed } from '@/utils/h3/store';
import { shotDurationSchema } from "@/utils/shotActionRules";
import express from "express";
import { tryBuildStandard, latestStandard } from "@/utils/promptLibrary";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();
export default router.post(
    "/",
    validateFields({
        id: z.number(),
        duration: shotDurationSchema.optional(),
    }),
    async (req, res) => {
        const { id, duration } = req.body;
        await assertLegacyEditAllowed(id);
        await u.db("o_videoTrack").where("id", id).update({
            duration,
        });
        const track = await u.db("o_videoTrack").where("id", id).first();
        if (track?.projectId) {
            const before = await latestStandard(track.projectId, "track", id);
            const result = await tryBuildStandard(track.projectId, "track", id, before ? { basePrompt: before.source, model: before.model, mode: before.mode } : {});
            if (result.bundle && before?.variants.some((v: any) => v.prompt === track.prompt)) {
                await assertLegacyEditAllowed(id);
        await u.db("o_videoTrack").where("id", id).update({ prompt: result.bundle.variants.find(v => v.id === result.bundle!.selected)!.prompt });
            }
        }
        res.status(200).send(success("更新成功"));
    },
);
