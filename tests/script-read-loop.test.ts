import assert from 'node:assert/strict';
import { scriptReadLoopGuard } from '../src/agents/scriptAgent/readLoopGuard';
const read = (id: string) => ({toolCalls:[{toolName:'get_script_content',input:{ids:[id]}}]});
assert.equal(scriptReadLoopGuard({steps:[read('1'),read('2'),read('3'),read('4')]}),undefined);
assert.equal(scriptReadLoopGuard({steps:[read('1'),read('1'),read('1')]}),undefined);
assert.deepEqual(scriptReadLoopGuard({steps:[read('1'),read('2'),read('1'),read('1'),read('1')]}),{toolChoice:'none'});
assert.equal(scriptReadLoopGuard({steps:Array.from({length:8},()=>({toolCalls:[{toolName:'run_sub_agent_script',input:{prompt:'继续'}}]}))}),undefined);
console.log('PASS: repeated identical reads yield to XML output; distinct reads and orchestration remain available');
