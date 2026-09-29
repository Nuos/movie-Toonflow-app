import express from "express";
import { z } from "zod";
import { db } from "@/utils/db";
import { success, error } from "@/lib/responseFormat";
import { findCharacterVoice } from "@/utils/characterVoices";
import { soundCatalog, soundWithUrl, selectedAssetSound, selectAssetSound, importProjectSounds } from "@/utils/soundLibrary";

const router = express.Router();
const target = z.object({ projectId: z.number().int().positive(), assetId: z.number().int().positive() });
router.get("/presets", async (_req, res) => res.json(success(await Promise.all((await soundCatalog()).filter(s => s.category === "voice").map(soundWithUrl)))));
router.get("/library", async (_req, res) => res.json(success(await Promise.all((await soundCatalog()).map(soundWithUrl)))));
router.post("/import", async (req, res) => {
  const { projectId } = z.object({ projectId: z.number().int().positive() }).parse(req.body);
  res.json(success(await importProjectSounds(db, projectId)));
});
router.post("/get", async (req, res) => {
  const t = target.parse(req.body);
  const state = await selectedAssetSound(db, t.projectId, t.assetId);
  res.json(success({ ...state, voice: findCharacterVoice(state.defaultVoice) }));
});
router.post("/select", async (req, res) => {
  const t = target.extend({ soundId: z.string().max(80).nullable() }).parse(req.body);
  res.json(success(await selectAssetSound(db, t.projectId, t.assetId, t.soundId)));
});
router.post("/save", async (req, res) => {
  const t = target.extend({ defaultVoice: z.string().max(80).nullable() }).parse(req.body);
  if (t.defaultVoice !== null && !findCharacterVoice(t.defaultVoice)) throw new Error("未知声线，请重新选择");
  if (!(await db("o_assets").where({ id: t.assetId, projectId: t.projectId, type: "role" }).first())) throw new Error("角色不存在或不属于当前项目");
  const state = await selectAssetSound(db, t.projectId, t.assetId, t.defaultVoice);
  res.json(success({ ...state, voice: findCharacterVoice(state.defaultVoice) }));
});
router.use((err: any, _req: any, res: any, _next: any) => res.status(400).json(error(err instanceof z.ZodError ? "声音参数不正确" : err.message || "声音操作失败")));
export default router;
