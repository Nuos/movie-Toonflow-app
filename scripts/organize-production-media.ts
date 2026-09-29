/** 先生成迁移清单，显式 --apply 时移动原文件并建立兼容链接。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalMediaPath, linkLegacyMedia, safeMediaPath } from '../src/utils/productionStorage';
import { productionCatalog } from '../src/utils/productionCatalog';
import knex from 'knex';
const db = knex({client:'better-sqlite3',connection:{filename:path.resolve('data/db2.sqlite'),options:{readonly:true}} as any,useNullAsDefault:true});
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function main(){
 const root=path.resolve('data/oss'),apply=process.argv.includes('--apply'),report:any={at:new Date().toISOString(),apply,root,files:[],projects:[]};
 const projects=await db('o_project').select('id','name');
 for(const project of projects){
  const base=path.join(root,String(project.id));
  async function walk(dir:string){let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e:any){if(e.code==='ENOENT')return;throw e;}
   for(const entry of entries){const source=path.join(dir,entry.name);if(entry.isDirectory()){await walk(source);continue;}if(!entry.isFile())continue;
    const relative=path.relative(root,source),canonical=canonicalMediaPath(relative),destination=safeMediaPath(root,canonical),bytes=await fs.readFile(source);const row={source:relative,destination:canonical,bytes:bytes.length,sha256:hash(bytes)};report.files.push(row);
    if(apply){await fs.mkdir(path.dirname(destination),{recursive:true});try{const other=await fs.readFile(destination);if(hash(other)!==row.sha256)throw Error('规范目录文件冲突：'+canonical);await fs.unlink(source);}catch(e:any){if(e.code==='ENOENT')await fs.rename(source,destination);else throw e;}
     await linkLegacyMedia(root,relative,canonical);if(hash(await fs.readFile(source))!==row.sha256||hash(await fs.readFile(destination))!==row.sha256)throw Error('迁移后文件校验失败');}
   }
  }
  await walk(base);const catalog=await productionCatalog(project.id,undefined,db);report.projects.push({id:project.id,name:project.name,code:catalog.productionCode,root:catalog.root,assets:catalog.assets.length,shots:catalog.shots.length});if(apply){await fs.mkdir(catalog.root,{recursive:true});await fs.writeFile(path.join(catalog.root,'catalog.json'),JSON.stringify(catalog,null,2));}
 }
 await fs.mkdir('local',{recursive:true});await fs.writeFile(`local/production-media-${apply?'migration':'plan'}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({apply,files:report.files.length,projects:report.projects}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.destroy());
