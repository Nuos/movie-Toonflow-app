const assert=require('node:assert/strict');
const {pickCodec,opusDescription}=require('../data/web/workflow-export-audio.js');
(async()=>{
 const seen=[];assert.equal(await pickCodec({isConfigSupported:async c=>{seen.push(c.codec);return{supported:c.codec==='opus'}}}),'opus');assert.deepEqual(seen,['mp4a.40.2','opus']);
 assert.equal(await pickCodec({isConfigSupported:async()=>({supported:true})}),'aac');
 await assert.rejects(pickCodec({isConfigSupported:async()=>({supported:false})}),/无法编码/);
 const h=Buffer.alloc(19);h.write('OpusHead');h[8]=1;h[9]=2;h.writeUInt16LE(312,10);h.writeUInt32LE(48000,12);h.writeInt16LE(-3,16);
 const chunks=[];const stream={writeString:s=>chunks.push(Buffer.from(s))};
 for(const [method,size] of [['Uint32',4],['Uint16',2],['Int16',2],['Uint8',1]])stream['write'+method]=value=>{const b=Buffer.alloc(size);b['write'+(method==='Uint8'?'UInt8':method.replace('Uint','UInt')+'BE')](value);chunks.push(b)};
 opusDescription(h).write(stream);const d=Buffer.concat(chunks);assert.equal(d.length,19);assert.equal(d.readUInt32BE(),19);assert.equal(d.subarray(4,8).toString(),'dOps');assert.equal(d[9],2);assert.equal(d.readUInt16BE(10),312);assert.equal(d.readUInt32BE(12),48000);assert.equal(d.readInt16BE(16),-3);
 assert.throws(()=>opusDescription(Buffer.alloc(19)),/不支持/);
 console.log('PASS: AAC preference, Opus fallback, unsupported rejection, and dOps channel/pre-skip/rate/gain encoding');
})().catch(e=>{console.error(e);process.exitCode=1});
