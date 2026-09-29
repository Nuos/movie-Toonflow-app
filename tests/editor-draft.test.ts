import assert from 'node:assert/strict';
import knex from 'knex';
import {editorDraft} from '../src/utils/editorDraft';
(async()=>{
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 try{
 await db.schema.createTable('o_script',t=>{t.integer('id').primary();t.integer('projectId')});await db('o_script').insert([{id:1,projectId:11},{id:2,projectId:11},{id:3,projectId:22}]);
 assert.equal((await editorDraft(db,11,1)).tracks,null);
 const tracks=[{id:'main',type:'video',isMain:true,clips:[{id:'one',startTime:0,endTime:6.583,sourceUrl:'/oss/clip.mp4',volume:0.8},{id:'two',startTime:6.583,endTime:13.166,sourceUrl:'/oss/clip2.mp4',text:'原字幕'}]}];
 assert.equal((await editorDraft(db,11,1,{revision:0,tracks})).revision,1);
 assert.deepEqual((await editorDraft(db,11,1)).tracks,tracks);
 assert.equal((await editorDraft(db,11,2)).tracks,null);assert.equal((await editorDraft(db,22,3)).tracks,null);
 await assert.rejects(editorDraft(db,22,1),/不属于/);
 await assert.rejects(editorDraft(db,11,1,{revision:0,tracks:[]}),/其他页面/);
 assert.deepEqual((await editorDraft(db,11,1)).tracks,tracks);
 await assert.rejects(editorDraft(db,11,1,{revision:1,tracks:[{id:'main',type:'video',clips:[{id:'bad',startTime:4,endTime:2}]}]}));
 assert.equal((await editorDraft(db,11,1,{revision:1,tracks:[]})).revision,2);assert.deepEqual((await editorDraft(db,11,1)).tracks,[]);
 console.log('PASS: editor draft roundtrip, clip fields, project/episode isolation, stale-write rejection, invalid timing rejection, explicit empty draft');
 }finally{await db.destroy()}
})().catch(e=>{console.error(e);process.exitCode=1});
