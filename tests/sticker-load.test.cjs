const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 let requested;
 const context={Image:class{naturalWidth=256;naturalHeight=256;set src(url){requested=url;this.onload()}},createImageBitmap:async image=>({width:image.naturalWidth,height:image.naturalHeight})};
 vm.runInNewContext(fs.readFileSync('data/web/workflow-sticker.js','utf8'),context);
 const result=await context.ToonflowSticker.load('sticker-1');assert.equal(requested,'/workflow-stickers/smile.svg');assert.equal(result.width,256);
 await context.ToonflowSticker.load('sticker-2');assert.equal(requested,'/workflow-stickers/star.svg');
 context.Image=class{set src(url){this.onerror()}};await assert.rejects(context.ToonflowSticker.load('missing.png'),/贴纸加载失败/);
 context.Image=class{naturalWidth=0;naturalHeight=0;set src(url){this.onload()}};await assert.rejects(context.ToonflowSticker.load('empty.png'),/贴纸尺寸无效/);
 console.log('PASS: legacy sticker IDs resolve to artwork; decoding failures and empty images reject');
})().catch(e=>{console.error(e);process.exitCode=1});
