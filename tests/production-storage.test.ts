import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonicalMediaPath, writeProductionMedia, linkLegacyMedia } from '../src/utils/productionStorage';
import { catalogCode } from '../src/utils/productionCatalog';
test('编号稳定且分类明确，目录不依赖可变名称',()=>{
 assert.equal(catalogCode(12,'role',4),'DR-12-CHR-000004');assert.equal(catalogCode(12,'scene',4),'DR-12-SCN-000004');assert.notEqual(catalogCode(12,'scene',4),catalogCode(13,'scene',4));
 for(const [folder,category] of [['role','assets/characters'],['scene','assets/scenes'],['props','assets/props'],['assets/audio','assets/audio'],['camera-clips','shots/clips'],['assets/3','shots/frames'],['imageFlow/3','editing']])assert.ok(canonicalMediaPath(`/12/${folder}/sample.png`).startsWith(`productions/DR-12/${category}/DR-12-`));
 assert.equal(canonicalMediaPath('/library/audio/music.wav'),'library/audio/music.wav');assert.throws(()=>canonicalMediaPath('/12/../x'));
});
test('旧引用与规范目录读取同一文件，覆盖写入不产生副本',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'toonflow-storage-'));
 try{const old='/12/role/old.png',canonical=canonicalMediaPath(old);await fs.mkdir(path.join(root,'12/role'),{recursive:true});await fs.writeFile(path.join(root,old),'old');await writeProductionMedia(root,old,Buffer.from('new'));
 assert.equal((await fs.lstat(path.join(root,old))).isSymbolicLink(),true);assert.equal(await fs.readFile(path.join(root,old),'utf8'),'new');assert.equal(await fs.readFile(path.join(root,canonical),'utf8'),'new');await writeProductionMedia(root,old,Buffer.from('updated'));assert.equal(await fs.readFile(path.join(root,old),'utf8'),'updated');await linkLegacyMedia(root,old,canonical);
 assert.equal((await fs.readdir(path.dirname(path.join(root,canonical)))).length,1);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('目录冲突拒绝覆盖并保留原文件',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'toonflow-storage-conflict-'));try{const old='12/scene/old.png',canonical=canonicalMediaPath(old);await fs.mkdir(path.dirname(path.join(root,old)),{recursive:true});await fs.mkdir(path.dirname(path.join(root,canonical)),{recursive:true});await fs.writeFile(path.join(root,old),'original');await fs.writeFile(path.join(root,canonical),'different');await assert.rejects(()=>writeProductionMedia(root,old,Buffer.from('new')),/不同素材/);assert.equal(await fs.readFile(path.join(root,old),'utf8'),'original');}finally{await fs.rm(root,{recursive:true,force:true});}});
