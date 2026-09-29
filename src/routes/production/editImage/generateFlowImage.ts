import express from "express";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import axios from "axios";
import type { Knex } from "knex";
import { readImageFlowJob,startImageFlowJob } from "@/utils/imageFlowJob";
const router = express.Router();

async function urlToBase64(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("/oss/")) {
    return await u.oss.getImageBase64(u.replaceUrl(imageUrl).replace("/smallImage", ""));
  }
  imageUrl = await u.oss.getFileUrl(u.replaceUrl(imageUrl));
  const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
  const contentType = response.headers["content-type"] || "image/png";
  const base64 = Buffer.from(response.data, "binary").toString("base64");
  return `data:${contentType};base64,${base64}`;
}
const requestSchema=z.object({model:z.string().regex(/^.+:.+$/).transform(v=>v as `${string}:${string}`),references:z.array(z.string()).default([]),quality:z.enum(["1K","2K","4K"]),ratio:z.string().regex(/^\d+:\d+$/).transform(v=>v as `${number}:${number}`),prompt:z.string(),projectId:z.number().int().positive()});
export default router.post("/",async(req,res)=>{
 try{
  if(req.body.statusOnly===true){
   const {operationId,projectId}=z.object({operationId:z.string().uuid(),projectId:z.number().int().positive()}).parse(req.body);
   const job=await readImageFlowJob(u.db as unknown as Knex,operationId,projectId);
   return job?res.send(success(job)):res.status(404).send(error('图片任务不存在'));
  }
  const input=requestSchema.parse(req.body),{model,references,quality,ratio,prompt,projectId}=input;
  const generate=async()=>{
   const referenceList=[];
   for(const url of references)referenceList.push({type:"image" as const,base64:await urlToBase64(url)});
   const imageClass=await u.Ai.Image(model).run({prompt,referenceList,size:quality,aspectRatio:ratio},{taskClass:"工作流图片生成",describe:"工作流图片生成",relatedObjects:JSON.stringify(input),projectId});
   const savePath=`${projectId}/workFlow/${u.uuid()}.jpg`;
   await imageClass.save(savePath);
   return u.oss.getSmallImageUrl(savePath);
  };
  if(req.body.async===true){
   const operationId=z.string().uuid().parse(req.body.operationId);
   const job=await startImageFlowJob(u.db as unknown as Knex,operationId,projectId,input,generate);
   return res.send(success(job));
  }
  // Preserve compatibility for original synchronous callers.
  return res.send(success({url:await generate()}));
 }catch(e){return res.status(400).send(error(u.error(e).message))}
});
