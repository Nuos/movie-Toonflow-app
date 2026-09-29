const assert=require('node:assert/strict');
const {summarize}=require('../data/web/workflow-duration.js');
// Numbering restarts in each segment; header position and duration column can vary.
assert.deepEqual(summarize([
  [['序号','时长','画面'],['1','6秒','山道'],['2','4.5s','回望']],
  [['备注'],['序号','画面','时长（秒）'],['1','近景','8'],['2','远景','8']],
]),{shots:4,total:26.5,invalid:0,segments:[10.5,16]});
// Unspecified, zero and range durations must not become a misleading valid total.
assert.deepEqual(summarize([[['序号','时长'],['1','待定'],['2','0'],['3','3-5']]]),
  {shots:3,total:0,invalid:3,segments:[0]});
assert.equal(summarize([[['人物','年龄'],['1','12']]]).shots,0);
assert.equal(summarize([[['序号','时长'],['1','0.1'],['2','0.2']]]).total,0.3);
console.log('PASS duration totals, repeated numbering, units, invalid values, unrelated tables');
