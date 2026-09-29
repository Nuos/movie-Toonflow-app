import express from "express";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { startActionStoryboard, getActionStoryboard, applyActionStoryboard, currentActionStoryboard } from "@/utils/actionStoryboard";
const router=express.Router();
const owner=(req:express.Request)=>{const id=Number((req as any).user?.id);if(!Number.isSafeInteger(id)||id<1)throw Error("请先登录");return id;};
router.post("/start",async(req,res)=>{
  const t=z.object({projectId:z.number().int().positive(),scriptId:z.number().int().positive(),requestId:z.uuid(),mode:z.enum(["replan","refine"]).default("replan")}).strict().parse(req.body);
  res.json(success(await startActionStoryboard(t.projectId,t.scriptId,owner(req),t.requestId,t.mode)));
});
router.post("/get",async(req,res)=>{const t=z.object({id:z.uuid()}).strict().parse(req.body);res.json(success(await getActionStoryboard(t.id,owner(req))));});
router.post("/current",async(req,res)=>{const t=z.object({projectId:z.number().int().positive(),scriptId:z.number().int().positive()}).strict().parse(req.body);res.json(success(await currentActionStoryboard(t.projectId,t.scriptId,owner(req))));});
router.post("/apply",async(req,res)=>{const t=z.object({id:z.uuid()}).strict().parse(req.body);res.json(success(await applyActionStoryboard(t.id,owner(req))));});
router.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(400).json(error(err instanceof z.ZodError?err.issues.map(i=>i.message).join("；"):err.message)));
export default router;
