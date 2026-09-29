import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import sharp from 'sharp';
import axios from 'axios';
const Database = require('better-sqlite3');

async function main() {
  const root=process.cwd(), temp=await fs.mkdtemp(path.join(os.tmpdir(),'toonflow-portrait-'));
  await fs.mkdir(path.join(temp,'data'),{recursive:true});
  const original=new Database(path.join(root,'data/db2.sqlite'),{readonly:true}); await original.backup(path.join(temp,'data/db2.sqlite')); original.close();
  await fs.copyFile(path.join(root,'package.json'),path.join(temp,'package.json'));
  await fs.cp(path.join(root,'data/skills/female-portrait-director'),path.join(temp,'data/skills/female-portrait-director'),{recursive:true});
  process.chdir(temp);process.env.NODE_ENV='prod';
  const {default:u}=await import('../src/utils');
  const {db}=await import('../src/utils/db');
  const lib=await import('../src/utils/characterPortrait'), recipes=await import('../src/utils/generationRecipe');
  const {characterPortraitTools}=await import('../src/utils/characterPortraitTools');
  const {default:router}=await import('../src/extensions/characterPortrait');
  await lib.ensurePortraits();await (await import('../src/utils/promptLibrary')).ensurePromptLibrary();
  const projectId=1790243217088;
  const [assetId]=await db('o_assets').insert({projectId,type:'role',name:'隔离模板角色',describe:'40岁男性190cm',prompt:'原始手写提示词'});
  const [imageId]=await db('o_image').insert({assetsId:assetId,type:'role',prompt:null,state:'已完成'});
  await db('o_assets').where({id:assetId}).update({imageId});
  const other=await db('o_project').whereNot({id:projectId}).first();
  const protectedAssets=await db('o_assets').whereNot({projectId}).select('*');
  const sections=['人物身份与面部','体型与比例','肤色与皮肤质感','头发与妆容','服装','配饰、道具与鞋履','气质与风格控制'];
  const document:any={name:'隔离模板角色',brief:'40岁男性，天青丝绸长袍，双手空手。',settings:{},character:{
    sections:Object.fromEntries(sections.map(k=>[k,`${k}采用固定明确的创作设定；同一人物保持一致。`])),
    assumptions:['未指定外观为创作补全'],negative:'身份漂移',fingerprint:{height:'190cm',head_body_ratio:'7.8头身',face_structure:'长方脸高颧骨',facial_features:'平眉深眼窝直鼻薄唇',hair:'黑发束冠',body_silhouette:'高挑修长肌肉清晰',costume_silhouette:'交领窄袖长袍',palette:'天青月白'},basic_info:{age:'40岁',gender:'男性'},cast_comparison:[]},cast:[]};
  const app=express();app.use(express.json({limit:'2mb'}));app.use('/portrait',router);
  app.use('/portrait/derivative',(await import('../src/routes/production/assets/batchGenerateAssetsImage')).default);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/portrait/`;
  const post=async(route:string,body:any,status=200)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j:any=await r.json();assert.equal(r.status,status,JSON.stringify(j));return j.data;};
  const target={projectId,assetId};
  try {
    const a=await post('compile',{...target,document}), b=await post('compile',{...target,document});assert.equal(a.prompt,b.prompt);assert.equal(a.width,2048);assert.equal(a.height,1152);
    assert.match(a.prompt,/从左至右严格四栏/);assert.match(a.prompt,/28%/);assert.match(a.prompt,/【纯图模式】/);assert.doesNotMatch(a.prompt,/2×2/);
    for(const key of sections)assert.match(a.prompt,new RegExp(key));
    for(const value of Object.values(document.character.fingerprint))assert.ok(a.prompt.includes(value));
    for(const mutation of [
      (d:any)=>delete d.character.sections['服装'], (d:any)=>d.settings.typo=true,
      (d:any)=>d.settings.quality='4k', (d:any)=>d.settings.show_info='false',
      (d:any)=>d.character.fingerprint.height='180cm', (d:any)=>d.character.basic_info.gender='',
      (d:any)=>d.character.fingerprint.extra='丢弃会丢失的字段', (d:any)=>d.settings.age='20岁',
      (d:any)=>d.settings.head_body_ratio='9头身', (d:any)=>d.settings.portrait_fraction=.9,
    ]){const bad=structuredClone(document);mutation(bad);await post('compile',{...target,document:bad},400);}
    await post('save',{...target,projectId:other.id,document,expectedRevision:0},400);
    assert.equal(await lib.getPortrait(projectId,assetId),null);
    const tools:any=characterPortraitTools(projectId);
    const saved=await tools.save_character_portrait.execute({assetId,document,expectedRevision:0,seed:12345});assert.equal(saved.success,true);assert.equal(saved.revision,1);
    assert.equal((await db('o_image').where({id:imageId}).first()).prompt,'原始手写提示词');
    await post('save',{...target,document,expectedRevision:0},400);
    const changed=structuredClone(document);changed.character.fingerprint.palette='朱红月白';changed.character.sections['服装']='朱红与月白丝绸交领窄袖长袍，其他结构保持原样。';
    const second=await post('save',{...target,document:changed,expectedRevision:1});assert.equal(second.seed,12345);assert.equal(second.revision,2);
    for(const key of sections.filter(k=>k!=='服装'))assert.equal(second.character.sections[key],document.character.sections[key]);
    const patched=await post('patch',{...target,expectedRevision:2,patches:[{path:'character/negative',op:'append',value:'，衣摆漂浮'}]});
    assert.equal(patched.character.negative,second.character.negative+'，衣摆漂浮');assert.deepEqual(patched.character.sections,second.character.sections);assert.equal(patched.seed,second.seed);
    await post('patch',{...target,expectedRevision:3,patches:[{path:'settings/__proto__',value:'bad'}]},400);
    await post('patch',{...target,expectedRevision:3,patches:[{path:'character/fingerprint/unknown',value:'bad'}]},400);
    // Restore the prior text through the same precise API before generation checks.
    await post('patch',{...target,expectedRevision:3,patches:[{path:'character/negative',value:second.character.negative}]});
    const old=await post('revision',{...target,revision:1});assert.equal(old.prompt,saved.prompt);assert.equal(old.character.fingerprint.palette,'天青月白');
    const caption=structuredClone(changed);caption.settings={quality:'1080p',side:'right',show_info:true};const c=await post('compile',{...target,document:caption});assert.equal(c.width,1920);assert.equal(c.height,1080);assert.match(c.prompt,/自身右侧，鼻尖朝画面右方/);assert.match(c.prompt,/隔离模板角色｜40岁｜190cm｜7.8头身/);
    const task={projectId,taskClass:'角色图生成',relatedObjects:JSON.stringify({id:assetId})};
    await assert.rejects(recipes.recordImageRequest(lib.PORTRAIT_MODEL,{prompt:'不符合已保存模板'},task),/模板不一致/);
    const record=await recipes.recordImageRequest(lib.PORTRAIT_MODEL,{prompt:second.prompt,size:'4K',aspectRatio:'9:16',referenceList:[]},task);
    assert.equal(record.input.size,'portrait-2k');assert.equal(record.input.aspectRatio,'16:9');assert.equal(record.input.seed,12345);
    const bytes=await sharp({create:{width:2048,height:1152,channels:3,background:'#aabbcc'}}).png().toBuffer();
    const file=`/${projectId}/role/test.png`;await fs.mkdir(path.join(temp,`data/oss/${projectId}/role`),{recursive:true});await fs.writeFile(path.join(temp,'data/oss',file),bytes);
    await recipes.finishImageRecipe(record,file,bytes);
    const beforeReview=JSON.parse((await db('o_generationRecipe').where({id:record.id}).first()).data);assert.equal(beforeReview.portrait.status,'awaiting_visual_review');
    const checks={four_views:false,identity_and_costume:false,angles_and_sides:false,full_body_uncropped:false,body_and_age:false,cast_distinction:false,optional_caption:false};
    assert.equal((await post('review',{...target,recipeId:record.id,checks,notes:'隔离测试纯色占位图，不满足视觉要求'})).status,'visual_review_failed');
    const replay=await recipes.loadReplayRequest(projectId,record.id);assert.equal(replay.input.seed,12345);const rerun=await recipes.recordImageRequest(lib.PORTRAIT_MODEL,replay.input,{...task,relatedObjects:'{}'});assert.ok(JSON.parse((await db('o_generationRecipe').where({id:rerun.id}).first()).data).portrait);
    await recipes.finishImageRecipe(rerun,file,await sharp({create:{width:512,height:512,channels:3,background:'#fff'}}).png().toBuffer());
    assert.equal((await post('review',{...target,recipeId:rerun.id,checks:Object.fromEntries(Object.keys(checks).map(k=>[k,true])),notes:'测试错误尺寸不能通过'})).status,'resolution_unmet');
    // Exercise the real generation endpoint, image lifecycle and persistence
    // against a synthetic local provider; never contact an image backend.
    const nativeGet=axios.get;
    try {
      axios.get=(async()=>({data:{status:'ok'}})) as any;
      await fs.mkdir(path.join(temp,'data/vendor'),{recursive:true});
      await fs.writeFile(path.join(temp,'data/vendor/comfyui-h3.ts'),`exports.vendor={version:'2.0',inputValues:{},models:[{modelName:'qwen-image-2.1-quality',type:'image',name:'Synthetic fixture'}]};exports.imageRequest=async()=> '${bytes.toString('base64')}';`);
      await db('o_vendorConfig').insert({id:'comfyui-h3',enable:1,inputValues:'{}',models:'[]'}).onConflict('id').merge({enable:1,inputValues:'{}',models:'[]'});
      const generated=await post('generate',{...target,expectedRevision:4,generate:true});assert.ok(generated.filePath.endsWith('.png'));assert.equal(generated.reviewRequired,true);
      assert.equal((await db('o_assets').where({id:assetId}).first()).imageId,imageId,'Candidate generation must not replace the selected image');
      const result=await post('get',target);const actual=result.images.find((i:any)=>i.filePath===generated.filePath);
      assert.deepEqual(actual.data.portrait.actualSize,[2048,1152]);assert.equal(actual.data.portrait.status,'awaiting_visual_review');assert.equal(actual.data.seed,12345);
      const nativeText=u.Ai.Text, nativeExpand=lib.portraitRuntime.expand;
      try {
        u.Ai.Text=(()=>{throw Error('An approved portrait must not call the text model during image generation');}) as any;
        lib.portraitRuntime.expand=async()=>{throw Error('An approved portrait must not be redesigned');};
        const confirmed=await lib.getPortrait(projectId,assetId);
        const beforeIds=await db('o_image').where({assetsId:assetId}).pluck('id');
        await post('derivative',{projectId,scriptId:0,assetIds:[assetId],concurrentCount:1});
        let regenerated:any;
        for(let i=0;i<150;i++) {
          regenerated=await db('o_image').where({assetsId:assetId}).whereNotIn('id',beforeIds).first();
          if(regenerated && regenerated.state!=='生成中')break;
          await new Promise(r=>setTimeout(r,20));
        }
        assert.equal(regenerated?.state,'已完成',regenerated?.errorReason);
        assert.equal(regenerated.prompt,confirmed.prompt);
        assert.deepEqual(await lib.getPortrait(projectId,assetId),confirmed,'Image generation must preserve every approved field, revision and seed');
      } finally {u.Ai.Text=nativeText;lib.portraitRuntime.expand=nativeExpand;}
      await post('generate',{...target,expectedRevision:3,generate:true},400);
      const count=await db('o_image').where({assetsId:assetId}).count('* as n').first();
      axios.get=(async()=>{throw Error('GPU offline fixture');}) as any;
      await post('generate',{...target,expectedRevision:4,generate:true},400);
      assert.deepEqual(await db('o_image').where({assetsId:assetId}).count('* as n').first(),count,'Offline backend must not create image placeholders');
    } finally {axios.get=nativeGet;}
    assert.deepEqual(await db('o_assets').whereNot({projectId}).select('*'),protectedAssets);
    await (await import('../src/utils/assetDeletion')).deleteAssets([assetId],projectId);
    assert.equal(await db('o_characterPortrait').where({projectId,assetId}).first(),undefined,'Delete must prevent templates surviving reused asset IDs');
    console.log('PASS: exact template, deterministic compile, strict fields/settings/heights, Agent save, optimistic revisions, exact edits, old image prompt, project isolation, 2K/1080p, optional caption, recipe seed/replay, pixel and visual gates');
  }finally{await new Promise<void>(r=>server.close(()=>r()));await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exit(1);});
