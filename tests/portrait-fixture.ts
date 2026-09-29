// Tests replace only the text inference boundary. The production compiler,
// project checks, revision storage and image adapters still execute in full.
import fs from 'node:fs/promises';
import path from 'node:path';
import { withPromptLanguage } from '../src/utils/promptLanguage';
export async function installPortraitFixture(root: string, temp: string, u: any) {
  await fs.cp(path.join(root,'data/skills/female-portrait-director'),path.join(temp,'data/skills/female-portrait-director'),{recursive:true});
  const {portraitRuntime,portraitWorker}=await import('../src/utils/characterPortrait');
  let sequence=0;
  portraitRuntime.expand=async payload=>{
    const response=await u.Ai.Text('universalAi').invoke({system:withPromptLanguage(u.getArtPrompt('fixture','art_skills','art_character')+'\n'+payload.brief),messages:[{role:'user',content:payload.brief}]});
    const text=response.text||response._output; sequence++;
    const fingerprint={height:`${190+sequence}cm`,head_body_ratio:`${7+sequence/100}头身`,face_structure:`清晰长方脸${sequence}`,facial_features:`平眉直鼻薄唇${sequence}`,hair:`黑色束发${sequence}`,body_silhouette:`修长匀称${sequence}`,costume_silhouette:`青玉色窄袖丝绸长袍${sequence}`,palette:`青玉月白${sequence}`};
    const character={sections:Object.fromEntries(['人物身份与面部','体型与比例','肤色与皮肤质感','头发与妆容','服装','配饰、道具与鞋履','气质与风格控制'].map(k=>[k,text])),assumptions:['隔离测试固定文本'],negative:'身份漂移',fingerprint,basic_info:{age:'40岁',gender:'男性'},cast_comparison:payload.cast.map((c:any)=>({name:c.name,differences:Object.fromEntries(Object.keys(fingerprint).map(k=>[k,'隔离测试中的明确不同特征']))}))};
    return portraitWorker({...payload,settings:{},generate:false,character});
  };
}
