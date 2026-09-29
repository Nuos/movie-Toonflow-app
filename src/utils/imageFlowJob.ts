import type { Knex } from 'knex';
const initialized=new WeakMap<object,Promise<void>>();
const active=new Set<string>();
async function ensure(db:Knex){
 let pending=initialized.get(db);
 if(!pending){pending=(async()=>{if(!await db.schema.hasTable('o_imageFlowJob'))await db.schema.createTable('o_imageFlowJob',t=>{t.string('id').primary();t.bigInteger('projectId').notNullable();t.text('request').notNullable();t.string('state').notNullable();t.text('url');t.text('error');t.bigInteger('updatedAt').notNullable()})})();initialized.set(db,pending);pending.catch(()=>initialized.delete(db))}
 await pending;
}
function publicJob(row:any){return {operationId:row.id,state:row.state==='pending'&&!active.has(row.id)?'unknown':row.state,url:row.url,error:row.error}}
export async function readImageFlowJob(db:Knex,id:string,projectId:number){await ensure(db);const row=await db('o_imageFlowJob').where({id,projectId}).first();return row?publicJob(row):null}
export async function startImageFlowJob(db:Knex,id:string,projectId:number,request:unknown,run:()=>Promise<string>){
 await ensure(db);
 const encoded=JSON.stringify(request),existing=await db('o_imageFlowJob').where({id}).first();
 if(existing){if(Number(existing.projectId)!==projectId||existing.request!==encoded)throw Error('任务标识与请求不一致');return publicJob(existing)}
 // The primary key prevents two concurrent submission requests from launching two jobs.
 const inserted=await db('o_imageFlowJob').insert({id,projectId,request:encoded,state:'pending',updatedAt:Date.now()}).onConflict('id').ignore().returning('id');
 if(inserted.length)active.add(id);
 const row=await db('o_imageFlowJob').where({id}).first();
 if(Number(row.projectId)!==projectId||row.request!==encoded)throw Error('任务标识与请求不一致');
 if(!inserted.length)return publicJob(row);
 void Promise.resolve().then(run).then(url=>db('o_imageFlowJob').where({id}).update({state:'completed',url,updatedAt:Date.now()}),error=>db('o_imageFlowJob').where({id}).update({state:'failed',error:error instanceof Error?error.message:'图片生成失败',updatedAt:Date.now()})).catch(error=>console.error('图片任务结果持久化失败',error instanceof Error?error.message:'未知错误')).finally(()=>active.delete(id));
 return publicJob(row);
}
