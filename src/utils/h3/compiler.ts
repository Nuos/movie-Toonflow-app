import { H3_PROTOCOL, H3Plan, requireValidPlan, digest } from './plan';
export const COMPILER_VERSION='h3-compiler/2';
const language=(value:string)=>({zh:'Chinese','zh-cn':'Chinese',cmn:'Chinese',en:'English',ja:'Japanese',ko:'Korean',fr:'French',de:'German',es:'Spanish',pt:'Portuguese',ru:'Russian',ar:'Arabic',it:'Italian'} as Record<string,string>)[value.toLowerCase()]||value;
const stamp=(seconds:number)=>{const ms=Math.round(seconds*1000);return `${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;};
export function compileH3(raw:unknown,effectiveDuration?:number,compilerVersion:string=COMPILER_VERSION){
  if(!['h3-compiler/1','h3-compiler/2'].includes(compilerVersion))throw Error('编译器版本不受支持');
  const concise=compilerVersion==='h3-compiler/2';
  const p=requireValidPlan(raw),ref=p.mode==='Ref2VA',duration=effectiveDuration??p.duration;
  if(!Number.isFinite(duration)||duration<p.duration)throw Error('有效时长必须是目标时长对应的帧对齐结果');
  const counters={image:0,video:0,audio:0},names={image:'Picture',video:'Video',audio:'Audio'};
  // Exactly this array is submitted. No subsequent sorting, filtering or implicit audio.
  const manifest=p.references.filter(r=>r.enabled).map(r=>({...r,label:`<${names[r.kind]} ${++counters[r.kind]}>`}));
  const label=(id:string)=>{const r=manifest.find(r=>r.id===id);if(!r)throw Error(`引用 ${id} 未绑定`);return r.label;};
  const subject=(id:string)=>{const n=p.subjects.findIndex(s=>s.id===id);if(n<0)throw Error('主体不存在');return ref?`<Subject ${n+1}>` : p.subjects[n].identity.en;};
  const sound=[...p.sound].sort((a,b)=>a.start-b.start),speakerIds=[...new Set(sound.filter(s=>s.speakerId).map(s=>s.speakerId!))];
  const speaker=(id:string)=>`(S${speakerIds.indexOf(id)+1})`;
  const shotLabels=(ids:string[])=>ids.map(id=>`[Shot ${p.shots.findIndex(s=>s.id===id)+1}]`).join(', ');
  const definitions:string[]=[],retention:string[]=[],types=new Set<string>();
  if(ref){
    for(const s of p.subjects){
      const bindings=p.bindings.filter(b=>b.subjectId===s.id&&!['voice','sound','music','first-frame','last-frame','camera'].includes(b.role));
      definitions.push(`${subject(s.id)} is ${s.identity.en}${bindings.length?' Sources: '+bindings.map(b=>`${label(b.referenceId)} provides ${b.role}${concise?'.':': '+b.instruction.en}`).join(' '):''}`);
      const appearances=p.shots.filter(shot=>shot.subjectIds.includes(s.id)).map(shot=>shot.id);
      if(bindings.length)for(const b of bindings){retention.push(`${subject(s.id)} (appears in ${shotLabels(b.shotIds)}): ${b.retention} - ${label(b.referenceId)}: ${b.instruction.en}`);types.add('reference generation');}
      else retention.push(`${subject(s.id)} (appears in ${shotLabels(appearances)}): fully_preserved - ${s.identity.en}`);
    }
    for(const r of manifest){
      const bindings=p.bindings.filter(b=>b.referenceId===r.id);
      const independent=bindings.filter(b=>['first-frame','last-frame','camera','voice','sound','music'].includes(b.role));
      if(!independent.length)continue;
      definitions.push(`${r.label} ${independent.map(b=>{
        if(['first-frame','last-frame'].includes(b.role)){types.add('keyframe completion');return `is the ${b.role.replace('-',' ')} of ${shotLabels(b.shotIds)}. ${b.instruction.en}`;}
        if(r.kind==='audio'){
          types.add(b.retention.includes('copy')?'audio reuse':'audio reference');
          const s=p.speakers.find(s=>s.subjectId===b.subjectId);
          return `provides ${b.role}${b.subjectId?' for '+subject(b.subjectId)+(s&&speakerIds.includes(s.id)?' '+speaker(s.id):''):''}: ${b.instruction.en}`;
        }
        types.add('reference generation');return `provides ${b.role} for ${shotLabels(b.shotIds)}: ${b.instruction.en}`;
      }).join(' ')}`);
      for(const b of independent)retention.push(`${r.label}${r.kind==='audio'?'':` (${shotLabels(b.shotIds)} ${b.role})`}: ${b.retention} - ${b.instruction.en}`);
    }
  }
  const body=p.shots.map((s,i)=>{
    const lines=[`[Shot ${i+1}] ${i?`At ${stamp(s.start)}, the shot cuts. `:ref?'':p.style.en+' '}${s.camera.framing.en} ${s.camera.position.en} ${s.opening.en}`];
    for(const sid of s.subjectIds)lines.push(`${subject(sid)} is present in this shot.`);
    for(const rel of s.spatial)lines.push(`${subject(rel.subjectId)}${rel.relativeTo?' in relation to '+subject(rel.relativeTo):''}: ${rel.relation.en}`);
    if(ref)for(const b of p.bindings.filter(b=>b.shotIds.includes(s.id)&&!['voice','sound','music'].includes(b.role)))lines.push(`${b.role==='first-frame'?'The shot begins from':b.role==='last-frame'?'The shot ends on':'Reference '+b.role+':'} ${label(b.referenceId)}.${concise?'':' '+b.instruction.en}`);
    lines.push(`Camera: ${s.camera.movement.en} Focus: ${s.camera.focus.en}`);
    for(const a of s.phases)lines.push(`From ${stamp(a.start)} to ${stamp(a.end)}, ${a.subjectIds.map(subject).join(' and ')}: ${a.action.en} Result: ${a.endState.en}`);
    for(const a of sound.filter(a=>a.start>=s.start&&a.end<=s.end)){
      if(a.kind==='effect'){lines.push(`From ${stamp(a.start)} to ${stamp(a.end)}, ${a.referenceId&&ref?label(a.referenceId)+' ':''}${a.delivery.en}`);continue;}
      const sp=p.speakers.find(sp=>sp.id===a.speakerId)!;
      lines.push(`From ${stamp(a.start)} to ${stamp(a.end)}, ${sp.subjectId?subject(sp.subjectId):sp.voice.en} ${speaker(sp.id)}${a.kind==='narration'?' (off-screen narration; visible subjects do not speak this line)':''}, ${concise&&!sp.subjectId?'':sp.voice.en+' '}${a.delivery.en}${a.referenceId&&ref?' Voice reference: '+label(a.referenceId)+'.':''}\n<d>[${language(a.language)}] ${a.text}</d>`);
    }
    if(i===p.shots.length-1&&duration>p.duration)lines.push(`From ${stamp(p.duration)} to ${stamp(duration)}, maintain the final visual state with natural breathing and continuing ambient sound; no additional speech or new action.`);
    lines.push(`At the end of this shot, ${s.ending.en} ${s.continuity.en}`);return lines.join('\n\n');
  }).join('\n\n');
  const audioLayer=(role:string)=>ref?p.bindings.filter(b=>b.role===role).map(b=>`${label(b.referenceId)} (${b.retention}): ${b.instruction.en}`).join(' '):'';
  const fields=ref?{subject_definitions:definitions.join('\n'),summary:`[${[...types].join(' + ')||'reference generation'}] ${p.summary.en}${concise?' '+p.bindings.map(b=>`${b.subjectId?subject(b.subjectId):'The target video'} uses ${label(b.referenceId)} for ${b.role}.`).join(' '):''}`,retention_analysis:retention.join('\n'),detailed_description:p.style.en+'\n'+body,overall_soundscape:[p.soundscape.en,audioLayer('sound')].filter(Boolean).join(' '),non_diegetic_music:[p.music.en,audioLayer('music')].filter(Boolean).join(' ')}:{integrated_multimodal_description:body,overall_soundscape:p.soundscape.en,non_diegetic_music:p.music.en};
  let alignment='';
  if(p.mode==='I2VA')alignment='For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';
  if(p.mode==='FL2VA')alignment=`How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot ${p.shots.length}) aligns with the ${duration.toFixed(2)}-second mark of the target video.`;
  if(p.mode==='L2VA')alignment=`How the reference pictures align with the target video — <Picture 1> (from [Shot ${p.shots.length}]) aligns with the ${duration.toFixed(2)}-second mark of the target video.`;
  const prompt=[alignment,Object.entries(fields).map(([k,v])=>`${k}:\n${v}`).join('\n\n')].filter(Boolean).join('\n\n');
  return {protocol:H3_PROTOCOL,compiler:compilerVersion,planHash:digest(p),promptHash:digest(prompt),prompt,fields,manifest,effectiveDuration:duration};
}

/** Chinese UI projections are derived from exactly the compiled plan. */
export function projectPlan(p:H3Plan){return p.shots.map(s=>({
  id:s.storyboardId,duration:s.end-s.start,prompt:[s.opening.zh,s.camera.framing.zh,s.camera.position.zh].join('\n'),
  videoDesc:[['本镜主题',s.purpose.zh],['原剧情与台词',s.sourceText],['起始画面',s.opening.zh],['空间关系',s.spatial.map(r=>`${p.subjects.find(x=>x.id===r.subjectId)?.name}：${r.relation.zh}`).join('\n')],['主体动作',s.phases.map(a=>`${a.start}–${a.end}秒：${a.action.zh}；${a.endState.zh}`).join('\n')],['结束画面',s.ending.zh],['摄影机',[s.camera.framing.zh,s.camera.position.zh,s.camera.movement.zh,s.camera.focus.zh].join('；')],['台词与声音',p.sound.filter(a=>a.start>=s.start&&a.end<=s.end).map(a=>`${a.start}–${a.end}秒 ${a.kind==='narration'?'画外旁白':p.speakers.find(sp=>sp.id===a.speakerId)?.name||'音效'}：${a.kind==='effect'?a.delivery.zh:a.text}`).join('\n')],['连续性',s.continuity.zh]].map(([k,v])=>`【${k}】${v}`).join('\n\n'),
  h3Plan:s,
}));}
