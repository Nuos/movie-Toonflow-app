import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const root=process.cwd(), temp=await fs.mkdtemp(path.join(os.tmpdir(),'toonflow-prompts-'));
  await fs.chmod(temp,0o700);await fs.mkdir(path.join(temp,'data'));
  await fs.copyFile(path.join(root,'package.json'),path.join(temp,'package.json'));
  // Copy an SQLite backup, never write test fixtures into the user's active DB.
  await fs.copyFile(path.join(root,'local/backups/prompt-standards-20260922/db2.sqlite'),path.join(temp,'data/db2.sqlite'));
  process.chdir(temp);process.env.NODE_ENV='prod';
  await import('../src/utils');
  const { db }=await import('../src/utils/db');
  const lib=await import('../src/utils/promptLibrary');
  const recipe=await import('../src/utils/generationRecipe');
  try {
    const { ensureCharacterVoiceColumn } = await import('../src/utils/characterVoices');
    await ensureCharacterVoiceColumn(db);
    await lib.ensurePromptLibrary();
    const projectId=99001001;await db('o_project').insert({id:projectId,name:'隔离验证',imageModel:'comfyui-h3:qwen-image-2.1-quality',imageQuality:'2K',videoModel:'comfyui-h3:h3-quality',mode:'singleImage',videoRatio:'9:16'});
    const [assetId]=await db('o_assets').insert({projectId,name:'既有男性',type:'role',describe:'成年男性，黑发灰衣',prompt:'四视图，灰衣，站立'});
    const originals=await lib.ensureAssetBaselines(projectId,[assetId]);assert.equal(originals.get(assetId),null);assert.equal(await lib.latestStandard(projectId,'asset',assetId),null,'original generation preflight must not create an auxiliary baseline');
    const first=await lib.buildStandard(projectId,'asset',assetId);assert.equal(first.variants.length,3);assert.ok(first.anchor.subject.includes('男性'));
    const [changingAsset] = await db('o_assets').insert({projectId,name:'阶段道具',type:'tool',describe:'旧阶段发光石头',prompt:'石头'});
    await lib.buildStandard(projectId,'asset',changingAsset);
    await db('o_assets').where({id:changingAsset}).update({describe:'当前阶段普通天然石头，无特殊图案'});
    const currentAsset = await lib.buildStandard(projectId,'asset',changingAsset);
    assert.match(currentAsset.anchor.subject, /当前阶段/);
    assert.doesNotMatch(currentAsset.anchor.subject, /旧阶段/);
    const customAnchor = {...currentAsset.anchor,subject:'用户明确指定的主体限制'};
    await lib.buildStandard(projectId,'asset',changingAsset,{anchor:customAnchor});
    await db('o_assets').where({id:changingAsset}).update({describe:'再次修改原资产'});
    assert.equal((await lib.buildStandard(projectId,'asset',changingAsset)).anchor.subject, customAnchor.subject);
    const legacy = await lib.latestStandard(projectId,'asset',changingAsset);
    delete legacy.automaticSubject;
    await db('o_promptStandard').where({projectId,kind:'asset',targetId:changingAsset,revision:legacy.revision}).update({data:JSON.stringify(legacy)});
    assert.equal((await lib.buildStandard(projectId,'asset',changingAsset)).anchor.subject, customAnchor.subject, 'legacy fields without provenance must not be silently overwritten');
    const resetAsset = await lib.buildStandard(projectId,'asset',changingAsset,{reset:true});
    assert.match(resetAsset.anchor.subject, /再次修改原资产/);
    const chosen=await lib.applyVariant(projectId,'asset',assetId,'detail');assert.equal(chosen,first.variants[1].prompt);
    const revised=await lib.buildStandard(projectId,'asset',assetId);assert.equal(revised.source,first.source);assert.equal(revised.variants[1].prompt,chosen);
    await assert.rejects(()=>lib.targetContext(projectId+1,'asset',assetId));
    const trackId=99001002;await db('o_videoTrack').insert({id:trackId,projectId,duration:5});
    await db('o_storyboard').insert({projectId,trackId,videoDesc:'站立，静止机位。台词：今天不走了。',duration:'5',index:0});
    const v=await lib.buildStandard(projectId,'track',trackId);assert.equal(v.variants.length,3);assert.ok(v.variants.every(p=>p.prompt.includes('今天不走了。')));
    const h3Source='integrated_multimodal_description: [Shot 1] A man stays at the door. The camera holds still. He says <d>[Chinese] 今天不走了。</d>\n\noverall_soundscape: Wind.\n\nnon_diegetic_music: Quiet piano.';
    assert.equal(await lib.standardizeVideo(projectId,trackId,h3Source,'comfyui-h3:h3-quality','text',[]),h3Source,'unadopted video proposals must preserve the original model-specific prompt exactly');
    const refreshed = await lib.latestStandard(projectId, 'track', trackId);
    assert.deepEqual(refreshed.referenceSelection, [], 'original regeneration must replace legacy implicit references with the actual empty selection');
    assert.deepEqual(refreshed.promptRefs, [], 'text-only regeneration must not retain stale auxiliary references');
    assert.equal(refreshed.mode, 'text');
    assert.equal(refreshed.appliedPrompt, undefined, 'refreshing metadata must not adopt an auxiliary variant');
    const h3=await lib.buildStandard(projectId,'track',trackId,{basePrompt:h3Source});
    for(const variant of h3.variants) for(const field of ['integrated_multimodal_description','overall_soundscape','non_diegetic_music']) assert.equal(variant.prompt.match(new RegExp(field+':','g'))?.length,1,'no nested H3 fields in subject anchor');
    let saved=v;
    for(let i=0;i<3;i++){saved=await lib.buildStandard(projectId,'track',trackId,{basePrompt:saved.variants[0].prompt});assert.equal(saved.variants[0].prompt.match(/【固定语义锚点】/g)?.length,1);}
    await db('o_videoTrack').where('id',trackId).update({duration:8});const durationChange=await lib.buildStandard(projectId,'track',trackId,{basePrompt:saved.source});assert.ok(durationChange.variants.every(p=>p.prompt.includes('目标时长：8秒')));
    const emptyTrack=99001003;await db('o_videoTrack').insert({id:emptyTrack,projectId});
    const optional=await lib.tryBuildStandard(projectId,'track',emptyTrack);assert.equal(optional.bundle,null);assert.ok(optional.error.includes('镜头描述'));
    const originalInput={prompt:'无手印的天然巨石',size:'2K',aspectRatio:'9:16',referenceList:[]};
    const untouched=await lib.prepareImageRequest('comfyui-h3:qwen-image-2.1-quality',originalInput,{projectId,taskClass:'角色图生成',relatedObjects:JSON.stringify({id:assetId})});
    assert.deepEqual(untouched.input,originalInput,'unadopted auxiliary proposals must not change original prompt, references or seed');
    const adopted=await lib.applyVariant(projectId,'asset',assetId,'faithful');
    const prepared=await recipe.recordImageRequest('comfyui-h3:qwen-image-2.1-quality',{prompt:adopted,size:'2K',aspectRatio:'16:9'}, {projectId,taskClass:'角色图生成',relatedObjects:JSON.stringify({id:assetId})});
    assert.equal(prepared.input.seed,first.seed);assert.ok(prepared.input.prompt.includes(first.anchor.subject));
    const file=`/${projectId}/fixture.png`;await fs.mkdir(path.dirname(lib.mediaPath(file)),{recursive:true});const bytes=Buffer.from('89504e470d0a1a0a','hex');await fs.writeFile(lib.mediaPath(file),bytes);
    await recipe.finishImageRecipe(prepared,file,bytes);const after=await lib.latestStandard(projectId,'asset',assetId);assert.equal(after.references.length,1);
    const next=await lib.prepareImageRequest('comfyui-h3:qwen-image-2.1-quality',{prompt:adopted,size:'2K',aspectRatio:'16:9'}, {projectId,taskClass:'角色图生成',relatedObjects:JSON.stringify({id:assetId})});assert.equal(next.input.referenceList.length,1);
    const replay=await recipe.loadReplayRequest(projectId,prepared.id);assert.equal(replay.input.seed,first.seed);
    await fs.writeFile(lib.mediaPath(file),'tampered');await assert.rejects(()=>recipe.loadReplayRequest(projectId,prepared.id),/校验失败/);
    await assert.rejects(()=>lib.prepareImageRequest('comfyui-h3:qwen-image-2.1-quality',{prompt:adopted}, {projectId,taskClass:'角色图生成',relatedObjects:JSON.stringify({id:assetId})}),/参考图内容已改变/);
    const manual=await lib.prepareImageRequest('comfyui-h3:qwen-image-2.1-quality',originalInput,{projectId,taskClass:'角色图生成',relatedObjects:JSON.stringify({id:assetId})});assert.deepEqual(manual.input,originalInput,'manual edit after adoption must bypass stale auxiliary references');
    console.log('PASS: isolated DB, revisions, variants, gender preservation, anchor enforcement, reference freezing, replay integrity; zero inference');
  } finally {await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
