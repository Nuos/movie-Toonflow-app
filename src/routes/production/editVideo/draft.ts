import express from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';
import u from '@/utils';
import { success,error } from '@/lib/responseFormat';
import { editorDraft,editorTracksSchema,DraftError } from '@/utils/editorDraft';
const router=express.Router();
const schema=z.object({projectId:z.number().int().positive(),scriptId:z.number().int().positive(),save:z.object({revision:z.number().int().nonnegative(),tracks:editorTracksSchema}).optional()});
export default router.post('/',async(req,res,next)=>{
 const parsed=schema.safeParse(req.body);if(!parsed.success)return res.status(400).send(error('剪辑草稿参数不完整或时间无效'));
 try{const {projectId,scriptId,save}=parsed.data;return res.send(success(await editorDraft(u.db as unknown as Knex,projectId,scriptId,save)));}
 catch(e){if(e instanceof DraftError)return res.status(e.status).send(error(e.message));next(e);}
});
