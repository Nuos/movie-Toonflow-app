import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import express from "express";
import { createHash } from "node:crypto";
const Database = require("better-sqlite3");

async function main() {
  const root = process.cwd(), temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-sounds-"));
  await fs.chmod(temp, 0o700); await fs.mkdir(path.join(temp, "data/oss"), { recursive: true });
  const original = new Database(path.join(root, "data/db2.sqlite"), { readonly: true }); await original.backup(path.join(temp, "data/db2.sqlite")); original.close();
  await fs.cp(path.join(root, "data/audio-library"), path.join(temp, "data/audio-library"), { recursive: true });
  await fs.symlink(path.join(root, "data/oss/library"), path.join(temp, "data/oss/library"));
  await fs.copyFile(path.join(root,"package.json"), path.join(temp,"package.json"));
  process.chdir(temp); process.env.NODE_ENV = "prod";
  const { default: u } = await import("../src/utils");
  const { db } = await import("../src/utils/db");
  const sound = await import("../src/utils/soundLibrary");
  await sound.ensureSoundLibrarySchema(db); await sound.ensureSoundLibrarySchema(db);
  const { default: routes } = await import("../src/extensions/characterVoices");
  const { default: getAssets } = await import("../src/routes/assets/getAssetsApi");
  const { default: bindAudio } = await import("../src/routes/cornerScape/updateAssetsAudio");
  const { default: getGenerateData } = await import("../src/routes/production/workbench/getGenerateData");
  const { default: single } = await import("../src/routes/production/workbench/generateVideo");
  const { default: batch } = await import("../src/routes/production/workbench/batchGenerateVideo");
  const { default: delAssets } = await import("../src/routes/assets/delAssets");
  const id = 99119500, role = id+1, childRole=id+2, scene=id+3, track=id+4, board=id+5;
  await db("o_project").insert({ id, name:"声音素材隔离验证",videoModel:"test:model", mode:JSON.stringify(["imageReference:3","audioReference:3"]),videoRatio:"16:9" });
  await db("o_project").insert({ id:id+100,name:"另一个声音测试项目",videoModel:"test:model", mode:"text" });
  await db("o_assets").insert([{id:role,projectId:id,type:"role",name:"测试角色"},{id:childRole,projectId:id,type:"role",name:"测试角色变体",assetsId:role},{id:scene,projectId:id,type:"scene",name:"林间"}]);
  await db("o_videoTrack").insert({ id:track,projectId:id,scriptId:0,duration:5,prompt:"测试角色说：今天回家。" });
  await db("o_storyboard").insert({id:board,projectId:id,scriptId:0,trackId:track,index:0,videoDesc:"测试角色说：今天回家。",shouldGenerateImage:0});
  await db("o_assets2Storyboard").insert([{assetId:childRole,storyboardId:board},{assetId:scene,storyboardId:board}]);
  const captures:any[]=[];
  u.Ai.Video=(()=>({run:async (input:any)=>{captures.push(input);},save:async()=>{}})) as any;
  u.Ai.Text=(()=>({invoke:async()=>({text:"测试角色说：今天回家。"})})) as any;
  const app=express();app.use(express.json()); app.use('/api/characterVoices',routes);app.use('/assets',getAssets);app.use('/generateData',getGenerateData);app.use('/single',single);app.use('/batch',batch);app.use('/delete',delAssets);
  app.use('/bindAudio',bindAudio);
  app.use('/oss',express.static(path.join(temp,'data/oss')));app.use(express.static(path.join(root,'data/web')));
  app.use((err:any,_req:any,res:any,_next:any)=>res.status(400).json({code:400,message:err.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
  async function post(url:string,body:any,status=200){const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();assert.equal(r.status,status,JSON.stringify(j));return j.data;}
  try {
    const all=await sound.soundCatalog(); assert.ok(all.filter(s=>s.category==='voice'&&s.gender==='男').length>=15);assert.ok(all.filter(s=>s.category==='voice'&&s.gender==='女').length>=30);
    assert.ok(all.some(s=>s.instrument?.includes('古筝')));assert.ok(all.some(s=>s.instrument?.includes('唢呐')));assert.ok(all.some(s=>s.instrument?.includes('二胡')));assert.ok(all.some(s=>s.instrument?.includes('钢琴')));
    for(const s of all){const file=path.join(temp,'data/oss',s.filePath.slice(1));const data=await fs.readFile(file);assert.equal(createHash('sha256').update(data).digest('hex'),s.sha256);assert.equal(data.toString('ascii',0,4),'RIFF');assert.ok(s.duration>0);}
    const target={projectId:id,assetId:role};
    const freshPicker=await post('/assets',{projectId:id+100,type:'audio',page:1,limit:200});
    assert.equal(freshPicker.total,all.length,'original picker imports sounds for a fresh project');
    const first=await post('/api/characterVoices/import',{projectId:id});assert.equal(first.imported,all.length);const again=await post('/api/characterVoices/import',{projectId:id});assert.equal(again.imported,0);
    const assetList=await post('/assets',{projectId:id,type:'audio',page:1,limit:200});assert.equal(assetList.total,all.length);assert.ok(assetList.data.every((a:any)=>a.sonAssets.length===1&&a.sonAssets[0].src.endsWith('.wav')));
    await post('/api/characterVoices/save',{...target,defaultVoice:'male-deep'});
    let linked=await db('o_assetsRole2Audio').where({assetsRoleId:role}).first();let imported=await db('o_soundLibraryAssets').where({projectId:id,key:'male-deep'}).first();assert.equal(linked.assetsAudioId,imported.parentId);
    await post('/bindAudio',{assetsId:role,audioIds:[]});
    assert.equal(await db('o_assetsRole2Audio').where({assetsRoleId:role}).first(),undefined);
    await post('/bindAudio',{assetsId:role,audioIds:[imported.parentId]});
    assert.equal((await db('o_assetsRole2Audio').where({assetsRoleId:role}).first()).assetsAudioId,imported.parentId,'original binding route persists selection');
    await post('/api/characterVoices/select',{projectId:id,assetId:scene,soundId:'nature-rain'});
    await post('/api/characterVoices/select',{...target,projectId:id+100,soundId:'male-warm'},400);
    await post('/api/characterVoices/select',{projectId:id,assetId:scene,soundId:'female-bright'},400);
    await post('/api/characterVoices/select',{...target,soundId:'music-piano-light'},400);
    let gen=await post('/generateData',{projectId:id,scriptId:0});let refs=gen.trackList[0].medias.filter((m:any)=>m.fileType==='audio');assert.equal(refs.length,2,'inherit parent voice + scene ambience');assert.ok(refs.some((m:any)=>m.id===imported.childId));
    await post('/api/characterVoices/save',{projectId:id,assetId:childRole,defaultVoice:'female-low-magnetic'});
    const selected=await post('/api/characterVoices/get',{projectId:id,assetId:childRole});assert.equal(selected.voice?.name,'磁性低音');assert.equal(selected.selectedSound,'female-low-magnetic');
    gen=await post('/generateData',{projectId:id,scriptId:0});refs=gen.trackList[0].medias.filter((m:any)=>m.fileType==='audio');assert.equal(refs.length,2,'new female voice overrides parent, no double voice');assert.ok(!refs.some((m:any)=>m.id===imported.childId));
    const mode=JSON.stringify(['imageReference:3','audioReference:3']);const uploadData=refs.map((m:any)=>({id:m.id,sources:'assets'}));const req={projectId:id,scriptId:0,trackId:track,uploadData,prompt:'测试角色说：今天回家。',model:'test:model',mode,resolution:'test',duration:5,audio:true};
    await post('/single',req);await post('/batch',{...req,trackData:[{trackId:track,uploadData,prompt:req.prompt,duration:5}]});
    for(let i=0;i<100&&captures.length<2;i++)await new Promise(r=>setTimeout(r,20));assert.equal(captures.length,2);assert.ok(captures.every(c=>c.referenceList.length===2&&c.referenceList.every((r:any)=>r.type==='audio'&&r.base64.startsWith('data:audio/wav;base64,'))));
    await post('/single',{...req,audio:false});for(let i=0;i<100&&captures.length<3;i++)await new Promise(r=>setTimeout(r,20));assert.equal(captures[2].referenceList.length,0,'muted requests do not send audio');
    await db('o_project').where({id}).update({mode:JSON.stringify(['imageReference:3'])});gen=await post('/generateData',{projectId:id,scriptId:0});assert.equal(gen.trackList[0].medias.filter((m:any)=>m.fileType==='audio').length,0,'unsupported mode has no audio references');
    await sound.importProjectSounds(db,id+100);const other=await db('o_soundLibraryAssets').where({projectId:id+100,key:'male-deep'}).first();assert.notEqual(imported.parentId,other.parentId);assert.equal((await db('o_image').where({id:other.imageId}).first()).filePath,(await db('o_image').where({id:imported.imageId}).first()).filePath);
    await post('/delete',{id:imported.childId});assert.ok((await fs.stat(path.join(temp,'data/oss/library/audio/voices/male-deep.wav'))).isFile(),'shared audio survives deleting one project asset');
    await post('/api/characterVoices/save',{...target,defaultVoice:'male-deep'});imported=await db('o_soundLibraryAssets').where({projectId:id,key:'male-deep'}).first();assert.ok(await db('o_assets').where({id:imported.childId}).first(),'explicit choice repairs deleted asset');
    const [custom]=await db('o_assets').insert({projectId:id,type:'audio',name:'自行上传'});await sound.bindProjectAudio(db,role,custom);assert.equal((await sound.selectedAssetSound(db,id,role)).customAudio,true);await post('/api/characterVoices/select',{...target,soundId:null});assert.equal((await db('o_assetsRole2Audio').where({assetsRoleId:role}).first()).assetsAudioId,custom);
    await assert.rejects(()=>sound.bindProjectAudio(db,role,other.parentId),/不属于/);
    await post('/api/characterVoices/select',{...target,soundId:'female-bright'});
    console.log(JSON.stringify({pass:true,count:all.length,voices:all.filter(s=>s.category==='voice').length,effects:all.filter(s=>!['voice','music'].includes(s.category)).length,music:all.filter(s=>s.category==='music').length,checks:['all-file-hashes','idempotent-import','native-picker-fresh-project','native-bind-and-unbind','new-female-voice-persistence','real-local-audio-bytes-single-and-batch','parent-inheritance-and-child-override','cross-project-isolation','shared-file-deletion','repair','custom-reference-preservation','unsupported-model-filter'],inference:'mocked'}));
    if(process.argv.includes('--serve')){console.log(`UI_TEST_URL=${base}/sound-library.html?projectId=${id}&assetId=${role}`);app.post('/api/project/getProject',(_req,res)=>res.json({code:200,data:[{id,name:'声音素材隔离验证'}]}));await new Promise<void>(r=>process.once('SIGTERM',r));}
  } finally {await new Promise<void>(r=>server.close(()=>r()));await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
