import { SHOT_ACTION_RULES, validateActionText } from "@/utils/shotActionRules";
import express from "express";
import { z } from "zod";
import u from "@/utils";
import { withPromptLanguage } from "@/utils/promptLanguage";
import { resolveCameraMentions } from "@/utils/cameraPromptEditing";
import { writeProductionCatalog } from "@/utils/productionCatalog";
import { db } from "@/utils/db";
import { success, error } from "@/lib/responseFormat";
import { CAMERA_VERSION, CAMERA_MOVES, CAMERA_TEMPLATES, CAMERA_CHOICES, cameraOptionsSchema, compileCameraVariant } from "@/utils/cameraMotion";
import { listCameraBoards, getCameraPlan, buildCameraPlan, applyCameraPlan, auditStoredCameraPlan } from "@/utils/cameraMotionStore";
import { auditCameraClip } from "@/utils/cameraClips";
import { listCameraSkills, saveCameraSkill, setCameraSkillPreference, deleteCameraSkill } from "@/utils/cameraSkillLibrary";
import { H3_CAMERA_RECIPES } from "@/utils/h3CameraRecipes";
import { cameraClipWorkflows, cameraClipContext, recommendCameraClip, previewCameraClip, generateCameraClip, listCameraClips, deleteCameraClip, reviewCameraClip } from "@/utils/cameraClips";

import {workflowPreview,openWorkflowLocally} from "@/utils/cameraWorkflowPreview";
const router = express.Router();
const workflowTarget=z.object({workflowId:z.string().max(200),mode:z.string().max(300)}).strict();
async function checkedWorkflow(raw:unknown){
 const t=workflowTarget.parse(raw),w=(await cameraClipWorkflows()).workflows.find(w=>w.id===t.workflowId);
 if(!w||!w.modes.some((m:any)=>m.value===t.mode))throw Error('工作流或输入模式不存在，或已停用。');
 return workflowPreview(t.workflowId,t.mode);
}
router.post('/workflowDetails',async(req,res)=>res.json(success(await checkedWorkflow(req.body))));
router.post('/workflowOpen',async(req,res)=>{
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||''))throw Error('打开本机桌面功能仅允许本机访问。');
 const origin=req.headers.origin;if(origin&&!['http://127.0.0.1:10588','http://localhost:10588'].includes(origin))throw Error('请从本机 Toonflow 面板打开工作流。');
 const t=workflowTarget.extend({action:z.enum(['desktop','directory'])}).parse(req.body);
 const item=await checkedWorkflow(workflowTarget.parse({workflowId:t.workflowId,mode:t.mode}));res.json(success(await openWorkflowLocally(item,t.action)));
});
const project = z.object({ projectId: z.number().int().positive() });
const target = project.extend({ storyboardId: z.number().int().positive() });
const skillOwner = (req: express.Request) => Number((req as any).user?.id);
router.post("/promptText", async (req, res) => {
  const t = target.extend({ options: cameraOptionsSchema, motionId: z.string().max(80), promptOverride: z.string().trim().min(1).max(40000).optional(), ai: z.boolean().optional() }).strict().parse(req.body);
  const ctx = await cameraClipContext(target.parse(t), skillOwner(req));
  const variant = compileCameraVariant(t.options, t.motionId);
  let prompt = t.promptOverride || variant.videoPrompt;
  if (t.ai) {
    const result = await u.Ai.Text("universalAi").invoke({ system: withPromptLanguage(SHOT_ACTION_RULES + "\n你是分镜视频提示词编辑。根据本镜原文和指定运镜完善现有提示词，保留所有动作、台词、摄影方向与已有模型字段。不新增剧情；保留 @DR- 开头的资产编号，不虚构素材引用。只返回完整提示词正文。"), messages: [{ role: "user", content: JSON.stringify({ storyboard: t.options.narrative, camera: variant.cameraInstruction, currentPrompt: prompt, assets: ctx.catalog.assets.map(a=>({code:a.code,name:a.name,related:a.related})) }) }] });
    prompt = result.text;
    if (!prompt?.trim()) throw Error("AI 未返回有效提示词，请重试");
    validateActionText(prompt);
  }
  res.json(success({ prompt, resolvedPrompt: await resolveCameraMentions(t.projectId, prompt, []), audit: variant.audit, generatesMedia: false }));
});
router.post("/productionCatalog", async (req, res) => {
  const t = project.parse(req.body), p = await db("o_project").where({id:t.projectId,userId:skillOwner(req)}).first();
  if (!p) throw Error("项目不存在或无权限");
  res.json(success(await writeProductionCatalog(t.projectId)));
});
router.get("/clipWorkflows", async (_req, res) => res.json(success(await cameraClipWorkflows())));
router.post("/clipContext", async (req, res) => res.json(success(await cameraClipContext(req.body, skillOwner(req)))));
router.post("/clipRecommend", async (req, res) => res.json(success(await recommendCameraClip(req.body, skillOwner(req)))));
router.post("/clipPreview", async (req, res) => res.json(success(await previewCameraClip(req.body, skillOwner(req)))));
router.post("/clipGenerate", async (req, res) => res.json(success(await generateCameraClip(req.body, skillOwner(req)))));
router.post("/clipReview", async (req, res) => res.json(success(await reviewCameraClip(req.body, skillOwner(req)))));
router.post("/clipAudit", async (req, res) => res.json(success(await auditCameraClip(req.body, skillOwner(req)))));
router.post("/clipDelete", async (req, res) => res.json(success(await deleteCameraClip(req.body, skillOwner(req)))));
router.post("/clipList", async (req, res) => res.json(success(await listCameraClips(req.body, skillOwner(req)))));
router.get("/skills", async (req, res) => res.json(success(await listCameraSkills(skillOwner(req)))));
router.post("/skills/save", async (req, res) => res.json(success(await saveCameraSkill(skillOwner(req), req.body))));
router.post("/skills/preference", async (req, res) => res.json(success(await setCameraSkillPreference(skillOwner(req), req.body))));
router.post("/skills/delete", async (req, res) => res.json(success(await deleteCameraSkill(skillOwner(req), req.body))));
router.get("/catalog", (_req, res) => res.json(success({ version: CAMERA_VERSION, moves: CAMERA_MOVES, templates: CAMERA_TEMPLATES, choices: CAMERA_CHOICES, h3Recipes: H3_CAMERA_RECIPES })));
router.get("/projects", async (_req, res) => res.json(success(await db("o_project").select("id", "name"))));
router.post("/preview", (req, res) => {
  const t = z.object({ options: cameraOptionsSchema, motionIds: z.array(z.string().min(1).max(80)).min(1).max(12) }).parse(req.body);
  res.json(success({ options: t.options, variants: [...new Set(t.motionIds)].map(id => compileCameraVariant(t.options, id)), revision: 0, generatesMedia: false }));
});
router.post("/list", async (req, res) => {
  const t = project.parse(req.body);
  res.json(success({ boards: await listCameraBoards(t.projectId) }));
});
router.post("/get", async (req, res) => {
  const t = target.parse(req.body);
  res.json(success(await getCameraPlan(t.projectId, t.storyboardId)));
});
router.post("/build", async (req, res) => {
  const t = target.extend({ options: cameraOptionsSchema.partial().optional(), motionIds: z.array(z.string().min(1).max(80)).min(1).max(12).optional(), reset: z.boolean().optional(), revision: z.number().int().nonnegative().optional() }).parse(req.body);
  res.json(success(await buildCameraPlan(t.projectId, t.storyboardId, t)));
});
router.post("/apply", async (req, res) => {
  const t = target.extend({ revision: z.number().int().positive(), variantId: z.string().min(1).max(80), targets: z.array(z.enum(["storyboard", "image", "video"])).min(1).max(3) }).parse(req.body);
  res.json(success(await applyCameraPlan(t.projectId, t.storyboardId, t.revision, t.variantId, [...new Set(t.targets)])));
});
router.post("/audit", async (req, res) => {
  const t = target.extend({ options: cameraOptionsSchema.partial().optional(), motionId: z.string().max(80).optional(), variantId: z.string().max(80).optional() }).parse(req.body);
  res.json(success(await auditStoredCameraPlan(t.projectId, t.storyboardId, t)));
});
router.use((err: any, _req: any, res: any, _next: any) => res.status(400).json(error(err instanceof z.ZodError ? "运镜参数不正确，请检查必填字段和数值范围" : err.message || "运镜操作失败")));
export default router;
