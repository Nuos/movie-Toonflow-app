import test from "node:test";
import assert from "node:assert/strict";
import { sourceSpeechBudget, validateVideoSpeechTiming } from "../src/utils/videoSpeechTiming";

test("source budgeting reserves time for both dialogue and following narration before drafting",()=>{
  const narrative="【原剧情与台词】△他跪倒，掌心撑地。\n西西弗斯（嘶哑）：只要推上去……只要推上去……\n旁白（戏谑）：瞧一瞧科林斯的国王，内心是何等的草泥马奔腾而过。\n【主体动作】第11至15秒，旁白响起。";
  const budget=sourceSpeechBudget(narrative,15)!;
  assert.equal(budget.utterances.length,2);
  assert.equal(budget.utterances[0].preferredSeconds,4);
  assert.equal(budget.utterances[1].minimumSeconds,5);
  assert.equal(budget.latestPreferredSpeechStart,5);
  assert.equal(budget.minimumFits,true);
  assert.equal(sourceSpeechBudget(narrative,6)!.minimumFits,false);
  assert.equal(sourceSpeechBudget("无台词的山谷。",12),null);
  const context=formatCameraPromptGenerationContext({projectId:1,trackId:2,duration:15,mode:"text",boards:[{id:3,selection:null,duration:15,videoDesc:narrative}]});
  assert.ok(context.includes('"latestPreferredSpeechStart": 5'));
});
import { validateCameraGeneratedPrompt, formatCameraPromptGenerationContext } from "../src/utils/cameraPromptGeneration";

test("detects the real late-dialogue regression even when all source words are preserved", () => {
  const line = "诸神承诺过……巨石推上去停稳在山顶，就还我自由。";
  const context = formatCameraPromptGenerationContext({projectId:1,trackId:2,duration:14,mode:"text",boards:[{id:3,selection:null,duration:14,videoDesc:`【原剧情与台词】西西弗斯：${line}`} ]});
  const prompt = (end: number, start: number) => `detailed_description: [Shot 1] 人物扶壁行走后停步。\n\n第 ${start} 至 ${end} 秒，西西弗斯 (S1) 压低气息说：<d>[中文] ${line}</d>`;
  assert.throws(() => validateCameraGeneratedPrompt(prompt(11,8),context), /每秒 5 字/);
  assert.doesNotThrow(() => validateCameraGeneratedPrompt(prompt(13,5),context));
});

test("separates spoken text, off-screen narration and action with bounded windows", () => {
  const windows = validateVideoSpeechTiming("[Shot 1] 人物撑石站起。\n\n第 0 至 3 秒，西西弗斯 (S1) 气息断续：<d>[中文] 我就——</d>\n\n随后吞咽。\n\n第 3 至 9 秒，画外旁白（S2）平稳地说：<d>[中文] 他没有放弃。</d>",14);
  assert.equal(windows[0].text,"我就——");
  assert.equal(windows[1].speaker,"S2");
  assert.deepEqual(validateVideoSpeechTiming("[Shot 1] 无台词，只有风声。",10),[]);
});

test("rejects the observed stage-direction continuation and buried speech window",()=>{
  assert.throws(()=>validateVideoSpeechTiming("第 1 至 4 秒，男子 (S1) 说：<d>[中文] 我就——</d> 话音未落即被喘息打断，随即闭嘴。",14),/声音段须/);
  assert.throws(()=>validateVideoSpeechTiming("[Shot 1] 男子跪地。第 0 至 4 秒，他抬头。第 1 至 4 秒，男子 (S1) 说：<d>[中文] 我就——</d>",14),/独立成段/);
});

test("rejects unallocated, overlapping, out-of-range and malformed speech", () => {
  for (const text of [
    "第 0 至 3 秒，男子说：<d>[中文] 我来。</d>",
    "男子 (S1) 说：<d>[中文] 我来。</d>",
    "第 9 至 12 秒，男子 (S1) 说：<d>[中文] 我来。</d>",
    "第 4 至 4 秒，男子 (S1) 说：<d>[中文] 我来。</d>",
    "第 0 至 3 秒，男子 (S1) 说：<d>我来。</d>",
    "第 0 至 6 秒，男子 (S1) 说：<d>[中文] 我来。</d>又说<d>[中文] 我走。</d>",
    "第 0 至 6 秒，男子 (S1) 说：<d>[中文] 我来。</d>\n\n第 5 至 8 秒，旁白 (S2) 说：<d>[中文] 他来了。</d>",
  ]) assert.throws(()=>validateVideoSpeechTiming(text,10));
});
