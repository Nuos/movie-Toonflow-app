import type { Knex } from 'knex';
import { z } from 'zod';
export const editorTracksSchema = z.array(z.object({
  id:z.string().min(1),type:z.string().min(1),clips:z.array(z.object({
    id:z.string().min(1),startTime:z.number().finite().nonnegative(),endTime:z.number().finite().nonnegative(),
  }).passthrough().refine(c=>c.endTime>=c.startTime,'片段结束时间不能早于开始时间')),
}).passthrough());
const initialized=new WeakMap<object,Promise<void>>();
async function ensure(db:Knex){
 let ready=initialized.get(db);
 if(!ready){ready=(async()=>{if(!await db.schema.hasTable('o_editorDraft'))await db.schema.createTable('o_editorDraft',t=>{t.bigInteger('projectId').notNullable();t.bigInteger('scriptId').notNullable();t.integer('revision').notNullable();t.text('data').notNullable();t.bigInteger('updatedAt').notNullable();t.primary(['projectId','scriptId']);});})();initialized.set(db,ready);ready.catch(()=>initialized.delete(db));}
 await ready;
}
export class DraftError extends Error { constructor(public status:number,message:string){super(message);} }
export async function editorDraft(db:Knex,projectId:number,scriptId:number,save?:{revision:number;tracks:unknown}):Promise<{revision:number;tracks?:z.infer<typeof editorTracksSchema>|null;updatedAt:number|null}>{
 if(!await db('o_script').where({id:scriptId,projectId}).first())throw new DraftError(404,'剧集不属于当前项目');
 await ensure(db);
 if(!save){const row=await db('o_editorDraft').where({projectId,scriptId}).first();return row?{revision:row.revision,tracks:JSON.parse(row.data),updatedAt:row.updatedAt}:{revision:0,tracks:null,updatedAt:null};}
 const tracks=editorTracksSchema.parse(save.tracks),data=JSON.stringify(tracks),updatedAt=Date.now();
 return db.transaction(async tx=>{
   const row=await tx('o_editorDraft').where({projectId,scriptId}).first();
   if((row?.revision??0)!==save.revision)throw new DraftError(409,'剪辑草稿已在其他页面更新，请重新打开后再编辑');
   const revision=save.revision+1;
   if(row)await tx('o_editorDraft').where({projectId,scriptId,revision:save.revision}).update({revision,data,updatedAt});
   else await tx('o_editorDraft').insert({projectId,scriptId,revision,data,updatedAt});
   return {revision,updatedAt};
 });
}
