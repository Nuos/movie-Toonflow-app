import test from "node:test";
import assert from "node:assert/strict";
import { CHARACTER_STYLES, FOUR_VIEW_LAYOUT, compileImages, compileVideos, validateVariants, stableSeed, parseH3, unwrapTemplate } from "../src/utils/promptStandards";

const anchor = { subject: "西西弗斯，成年男子；右掌三叉旧疤", style: "写实电影", composition: "近景，侧面，巨石在右", continuity: "同一人同一衣服", allowedChanges: "仅微观纹理和动作节奏", exclusions: "字幕、换脸、新增物件" };
test("three distinct complete prompts share every immutable anchor", () => {
  for (const list of [compileImages(anchor, "推石起始姿态", 1), compileVideos(anchor, "角色肩抵巨石。台词：快了！就差一点！", 5, "singleImage", [{type:"image",name:"起始帧"}], "h3-quality")]) {
    validateVariants(list); assert.equal(list.length, 3);
    for (const prompt of list) for (const value of Object.values(anchor)) assert.ok(prompt.prompt.includes(value));
  }
});
test("Ref2VA preserves all six fields and reference labels for text and JSON",()=>{
  const source={subject_definitions:'<Subject 1> comes from <Picture 1>. <Audio 1> is her voice.',summary:'Reference generation.',retention_analysis:'<Subject 1> is preserved.',detailed_description:'[Shot 1] <Subject 1> says <d>[Chinese] 我回来了。</d>',overall_soundscape:'Wind.',non_diegetic_music:'N/A'};
  for(const body of [JSON.stringify(source),Object.entries(source).map(([k,v])=>`${k}: ${v}`).join('\n\n')]) {
    for(const v of compileVideos(anchor,body,8,'["imageReference:9","audioReference:3"]',[{type:'image',name:'演员'},{type:'audio',name:'声音'}],'h3-reference-quality')) {
      const parsed=parseH3(v.prompt);assert.equal(Object.keys(parsed).length,6);assert.equal(parsed.subject_definitions,source.subject_definitions);assert.equal(parsed.overall_soundscape,'Wind.');assert.ok(parsed.detailed_description.includes('我回来了。'));assert.ok(!v.prompt.includes('integrated_multimodal_description:'));
    }
  }
});
test("editing and resaving generated templates does not multiply anchors",()=>{
  let source='肩抵巨石。台词：再来。';let v=compileVideos(anchor,source,5,'text',[],'h3-quality')[0].prompt;
  for(let i=0;i<4;i++){source=unwrapTemplate(v.replace('肩抵巨石','双肩抵巨石'),'track');v=compileVideos(anchor,source,5,'text',[],'h3-quality')[0].prompt;assert.equal(v.match(/【固定语义锚点】/g)?.length,1);assert.ok(v.includes('再来。'));}
});
test("all four-view styles default to adult women and preserve layout across nine prompts", () => {
  assert.deepEqual(CHARACTER_STYLES.map(s=>s.name), ["超真实", "古装", "玄幻"]);
  for (const s of CHARACTER_STYLES) {
    assert.equal(s.gender, "女性"); assert.match(s.subject, /成年女性/);
    const variants=compileImages({...anchor,subject:s.subject,style:s.style,composition:FOUR_VIEW_LAYOUT},s.subject);
    assert.equal(variants.length,3);
    for (const v of variants) for (const view of ["正面全身","自身左侧全身90°","背面全身","正面头像特写"]) assert.ok(v.prompt.includes(view));
  }
});
test("H3 reference modes never invent absent picture tokens; dialogue survives all variants", () => {
  for(const mode of ["text","singleImage","startEndRequired",'["imageReference:9"]']) {
    const refs=mode==='text'?[]:[{type:'image',name:'起始帧'},...(mode==='startEndRequired'?[{type:'image',name:'结束帧'}]:[])];
    const variants=compileVideos(anchor,"台词：你们就这么对我？\n音效：碎石摩擦",8,mode,refs,"h3-quality");
    for(const v of variants){assert.ok(v.prompt.includes("你们就这么对我？"));assert.ok(v.prompt.includes("non_diegetic_music: N/A"));if(mode==='text')assert.ok(!v.prompt.includes('<Picture'));if(mode==='startEndRequired')assert.ok(v.prompt.includes('8-second'));}
  }
});
test("stable seeds are repeatable and safe integers",()=>{const n=stableSeed('project:asset:18');assert.equal(n,stableSeed('project:asset:18'));assert.ok(Number.isSafeInteger(n));assert.notEqual(n,stableSeed('project:asset:19'));});
test("compact model shot markers do not gain a duplicate opening shot",()=>{
  for(const v of compileVideos(anchor,'[Shot1] The camera holds.\n[Shot2] The camera pulls out.',8,'text',[],'h3-quality')){
    const body=parseH3(v.prompt).integrated_multimodal_description;
    assert.deepEqual([...body.matchAll(/\[Shot\s*(\d+)\]/gi)].map(m=>m[1]),['1','2']);
  }
});
test("camera recomposition retains an explicitly supplied score in H3 and generic prompts",()=>{
  const music='Restrained piano notes at a slow tempo, fading at the end.';
  for(const [model,mode,field] of [['h3-quality','text','integrated_multimodal_description'],['h3-reference-quality','["imageReference:9"]','detailed_description'],['other:model','text','integrated_multimodal_description']]) {
    const body=`${field}: [Shot 1] The camera pulls out as the man says <d>[Chinese] 再来。</d>\n\noverall_soundscape: Wind.\n\nnon_diegetic_music: ${music}`;
    for(const variant of compileVideos(anchor,body,5,mode,[],model)){
      assert.ok(variant.prompt.includes(music));assert.ok(variant.prompt.includes('再来。'));
      assert.ok(!variant.prompt.includes('无额外配乐'));assert.ok(!variant.prompt.includes('non_diegetic_music: N/A'));
    }
  }
});
test("existing H3 output is parsed, preserving dialogue and sound without duplicate sections",()=>{
  const body='For the target video, <Picture 1> is referenced.\n\nintegrated_multimodal_description: [Shot 1] A man says: <d>[Chinese] 再来。</d>\n\noverall_soundscape: Wind and footsteps.\n\nnon_diegetic_music: N/A';
  for(const v of compileVideos(anchor,body,5,'singleImage',[{type:'image',name:'首帧'}],'h3-quality')){
    assert.equal(v.prompt.match(/integrated_multimodal_description:/g)?.length,1);assert.equal(v.prompt.match(/overall_soundscape:/g)?.length,1);
    assert.equal(v.prompt.match(/\[Shot 1\]/g)?.length,2); // one reference alignment plus one narrative shot
    assert.ok(v.prompt.includes('<d>[Chinese] 再来。</d>'));assert.ok(v.prompt.includes('Wind and footsteps.'));
  }
});
