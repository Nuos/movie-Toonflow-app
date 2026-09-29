import { projectNativeBoards } from './h3/store';
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import u from "@/utils";
import { db } from "./db";
import { scriptVideoRatio } from "./videoAspectRatio";
import { SHOT_ACTION_RULES } from "./shotActionRules";
import { applyActionCorrections, actionOpeningPrompt, actionDescription, renderActionTable, scriptBeats, validateActionPlan, currentActionPlan, validateActionRefinement, synchronizeShotCount } from "./actionStoryboardFormat";

const sql: any = db;
const running = new Set<string>();
let schema: Promise<void> | undefined;
export function ensureActionStoryboards() {
  return schema ||= (async () => {
    if (!await sql.schema.hasTable("o_actionStoryboard")) await sql.schema.createTable("o_actionStoryboard", (t: any) => {
      t.string("id").primary(); t.integer("ownerId"); t.bigInteger("projectId"); t.bigInteger("scriptId");
      t.string("state"); t.text("sourceHash"); t.text("data"); t.text("error"); t.text("result"); t.bigInteger("createdAt");
    });
  })().catch(e => { schema = undefined; throw e; });
}
const digest = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
const planIssuesSchema=z.object({issues:z.array(z.object({shot:z.number().int().positive(),quote:z.string().min(2),problem:z.string().min(8)})).max(30)});
async function inspectActionPlan(plan: ReturnType<typeof validateActionPlan>, beats: ReturnType<typeof scriptBeats>) {
  const response=await u.Ai.Text("universalAi",true,3).invoke({
    system:`你是 Toonflow 的分镜文字一致性检查器，检查对象是文字方案，不是生成视频。仅返回 JSON：{"issues":[{"shot":1,"quote":"该镜中确实存在的原文片段","problem":"具体矛盾和需要修正的关系"}]}。无问题返回空数组。逐镜检查：第一帧是否是单一静态状态，是否提前做完随后阶段动作；上一镜结束姿态与下一镜同场开场是否直接相接，允许明确转场；膝盖、脚掌和双手的支撑及转换是否可行；固定摄影的景别能否容纳必须观察的接触点和全身；台词及旁白分配时段是否明显不足；人物面向和目光相对道具是否一致。只报告可定位的矛盾、漏项或明确执行冲突。不能把未明确的空间关系或移动距离当作事实：固定机位可以拍摄构图范围内的运动，抬眼朝山顶方向不等于必须看到被遮挡的山顶；只有文字明确互斥时才报告。修改建议不得改变参考资产尺寸、剧情或强制摄影风格，不确定的情况不作硬性否决。不挑审美，不增加剧本没要求的细节。quote 必须是该镜字段内连续原文，不能编造。原剧情优先，现有编排的错误可修正。不要把提示词正确称为成片合格。`,
    messages:[{role:"user",content:JSON.stringify({beats,plan})}],
  });
  const result=planIssuesSchema.parse(JSON.parse(response.text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"")));
  for(const issue of result.issues){const shot=plan.shots[issue.shot-1];if(!shot || !Object.values(shot).some(value=>typeof value==="string"&&value.includes(issue.quote)))throw Error("文字检查返回了无法定位的引用，未采用结果");}
  return result.issues;
}
async function context(projectId: number, scriptId: number, ownerId: number, connection: any = sql) {
  const project = await connection("o_project").where({id: projectId, userId: ownerId}).first();
  const script = await connection("o_script").where({id: scriptId, projectId}).first();
  if (!project || !script) throw Error("剧集不存在或无权访问");
  const boards = await connection("o_storyboard").where({projectId, scriptId}).orderBy("index").orderBy("id");
  const links = boards.length ? await connection("o_assets2Storyboard").whereIn("storyboardId",boards.map((b:any)=>b.id)).orderBy("rowid") : [];
  for(const b of boards)b.assetIds=links.filter((l:any)=>l.storyboardId===b.id).map((l:any)=>l.assetId);
  const assets = await connection("o_scriptAssets").join("o_assets", "o_assets.id", "o_scriptAssets.assetId")
    .where({"o_scriptAssets.scriptId": scriptId, "o_assets.projectId": projectId})
    .select("o_assets.id", "o_assets.name", "o_assets.type", "o_assets.describe", "o_assets.imageId");
  const beats = scriptBeats(script.content || "");
  return { project, script, boards, assets, beats,
    sourceHash: digest({ script: script.content, boards: boards.map((b: any) => ({id:b.id,trackId:b.trackId,duration:b.duration,videoDesc:b.videoDesc,prompt:b.prompt,filePath:b.filePath,assetIds:b.assetIds})), assets }) };
}

export async function startActionStoryboard(projectId: number, scriptId: number, ownerId: number, id: string, mode: "replan" | "refine" = "replan") {
  await ensureActionStoryboards(); const ctx = await context(projectId, scriptId, ownerId);
  const old = await sql("o_actionStoryboard").where({id}).first();
  if (old) {
    if (old.ownerId !== ownerId || old.projectId !== projectId || old.scriptId !== scriptId) throw Error("请求编号已被使用");
    return getActionStoryboard(id, ownerId);
  }
  const pending = await sql("o_actionStoryboard").where({ownerId,projectId,scriptId}).whereIn("state",["queued","generating"]).first();
  if (pending) return getActionStoryboard(pending.id, ownerId);
  const lastFailed = mode==="refine" ? await sql("o_actionStoryboard").where({ownerId,projectId,scriptId,state:"failed",sourceHash:ctx.sourceHash}).orderBy("createdAt","desc").first() : null;
  const failedData = lastFailed ? JSON.parse(lastFailed.data) : null;
  const resumeCandidate = failedData?.mode==="refine" && typeof failedData.lastCandidate==="string" ? failedData.lastCandidate : "";
  const previousPlan = mode==="refine" ? currentActionPlan(ctx.boards,ctx.beats) : null;
  await sql("o_actionStoryboard").insert({id, ownerId, projectId, scriptId, state:"queued",sourceHash:ctx.sourceHash,data:JSON.stringify({beats:ctx.beats,mode}),createdAt:Date.now()});
  running.add(id);
  void (async () => {
    try {
      await sql("o_actionStoryboard").where({id}).update({state:"generating"});
      const template = await fs.readFile(path.join(process.cwd(), "data/skills/production_execution_storyboard_table.md"), "utf8");
      const system = `${template}\n${SHOT_ACTION_RULES}\n你是 Toonflow 的完整动作分镜编排模块。返回纯 JSON，结构为 {"shots":[{"sourceBeatIds":["B1"],"duration":12,"purpose":"完整叙事任务","openingFrame":"静态起始画面","subjectAction":"带整数时间的连续完整动作","endingFrame":"最后两秒明确姿态、目光与呼吸","camera":"完整摄影机描述","continuity":"相邻镜头和身份连续性","assetIds":[1]}]}。\n所有 sourceBeatIds 必须按原顺序恰好出现一次，不跨场合并。剧本中的一句旁白不能丢弃，也不能因为它独立成行就自动拆成一镜；相关动作和台词应合理合并。人物和道具数量、动作因果、原台词均来自剧本。身份以真实参考资产为准。多参考模式的分镜图片不是必需输入，但必须给出静态起始画面。动作以正常速度执行，避免机械慢动作。分镜数量由完整行动决定，不追求碎镜或凑固定数量。每镜时长至少覆盖全部台词，喘息与停顿需额外时间。不得返回 Markdown 或媒体生成请求。`;
      const refinementRules = mode==="refine" ? `\n本次是校正现有分镜，不是重新拆镜。保持每镜的顺序、sourceBeatIds、duration、assetIds完全不变，只修正其余文字中的矛盾与执行困难。逐镜检查：开场必须是动作开始前的一张静态画面，不能已经完成后续动作；左右膝、脚掌、手的支撑转换必须前后可行，不必添加原文没有要求的左右细节；相邻同场镜头的结束和起始状态相接，转场可变更位置；角色相对道具的面向与视线不能自相矛盾；固定近景不能要求全身或脚底可见，优先保留动作所需的可见范围并修正景别称谓；视觉细节不可喧宾夺主。保留全部原剧情与台词，不新增情节。声音以原句和次数为准，按正常语速提前分配时间，与动作并行，禁止把长句堆在末尾。将发现的问题真正修正在 JSON 中，不仅写进说明。` : "";
      let correction = resumeCandidate ? `继续修正同一原分镜的上次失败草稿，保留已修正内容。复核反馈：${lastFailed.error}。逐项核实，不按没有文字依据的推测改动；重新输出完整 JSON。` : "", previousCandidate = resumeCandidate, plan: ReturnType<typeof validateActionPlan> | undefined;
      const attempts:any[]=[];
      let patchIssues = failedData?.attempts?.at(-1)?.issues || [];
      const parseJson = (text:string) => JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/, ""));
      for (let attempt=0; attempt<3; attempt++) {
        const patchMode=mode==="refine" && previousCandidate && patchIssues.length>0;
        const patchRule=patchMode ? `\n本轮只输出局部字段修正，覆盖前述全量输出格式：{"corrections":[{"shot":镜号,"patch":{"camera":"修改后的完整字段原文"}}]}。patch只允许purpose、openingFrame、subjectAction、endingFrame、camera、continuity；只包含必须修改的字段，未返回字段和其他镜头由程序原样保留。允许的镜号：${[...new Set(patchIssues.map((i:any)=>i.shot))].join("、")}。不要为了无依据的推测添加动作，不改原台词、时长和素材。` : "";
        const response = await u.Ai.Text("universalAi",mode==="refine"?true:undefined,3).invoke({system:system+refinementRules+patchRule,messages:[{role:"user",content:JSON.stringify({script:ctx.script.content,beats:ctx.beats,assets:ctx.assets,previousPlan,aspectRatio:scriptVideoRatio(ctx.script.content || "",ctx.project.videoRatio || "16:9")})},...(previousCandidate?[{role:"assistant" as const,content:previousCandidate},{role:"user" as const,content:patchMode?`修正上方草稿的这些问题，只返回局部字段修正：${JSON.stringify(patchIssues)}`:correction}]:[])]});
        const patchResponse=patchMode?response.text:undefined;
        const candidateText=patchMode?JSON.stringify(applyActionCorrections(parseJson(previousCandidate).shots,parseJson(response.text),patchIssues.map((i:any)=>i.shot))):response.text;
        patchIssues=[];
        attempts.push({attempt:attempt+1,candidate:candidateText,...(patchResponse?{patchResponse}: {})});
        await sql("o_actionStoryboard").where({id}).update({data:JSON.stringify({beats:ctx.beats,mode,attempt:attempt+1,lastCandidate:candidateText,attempts})});
        try {
          const text = candidateText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
          plan = validateActionPlan(JSON.parse(text), ctx.beats, ctx.assets.map((a:any)=>a.id));
          if(previousPlan) {
            validateActionRefinement(plan,previousPlan);
            const issues=await inspectActionPlan(plan,ctx.beats);
            attempts[attempt].issues=issues;patchIssues=issues;
            await sql("o_actionStoryboard").where({id}).update({data:JSON.stringify({beats:ctx.beats,mode,attempt:attempt+1,lastCandidate:candidateText,issues,attempts})});
            if(issues.length)throw Error(`分镜文字一致性检查未通过：${JSON.stringify(issues)}。不能只删除‘全身’等可见范围要求来回避矛盾，应保留动作验证所需范围并调整景别。必须实际修正开场与动作关系、阶段支撑和发声预算。`);
          }
          break;
        } catch(e:any) { attempts[attempt].error=e.message;await sql("o_actionStoryboard").where({id}).update({data:JSON.stringify({beats:ctx.beats,mode,attempt:attempt+1,lastCandidate:candidateText,attempts})});previousCandidate=candidateText;correction = `\n上次输出未通过校验：${e.message}。请修正上方失败草稿并重新输出覆盖全部剧本的完整 JSON。`; if(attempt===2)throw e; }
      }
      const data = {beats:ctx.beats,plan,mode,attempts,modelGenerated:true};
      await sql("o_actionStoryboard").where({id}).update({state:"ready",data:JSON.stringify(data),error:null});
    } catch(e:any) { await sql("o_actionStoryboard").where({id}).update({state:"failed",error:e.message}); }
    finally { running.delete(id); }
  })();
  return {id,state:"queued",projectId,scriptId,mode};
}

export async function getActionStoryboard(id: string, ownerId: number) {
  await ensureActionStoryboards(); const row = await sql("o_actionStoryboard").where({id,ownerId}).first();
  if(!row)throw Error("编排任务不存在");
  await context(row.projectId,row.scriptId,ownerId);
  if(["queued","generating"].includes(row.state) && !running.has(id)) {
    row.state="failed";row.error="服务重启中断了文字编排，请重新编排；原分镜未改变。";
    await sql("o_actionStoryboard").where({id}).update({state:row.state,error:row.error});
  }
  const data=JSON.parse(row.data);
  return {id,rowVersion:row.sourceHash,state:row.state,mode:data.mode||"replan",error:row.error||"",projectId:row.projectId,scriptId:row.scriptId,
    plan:data.plan||null,table:data.plan?renderActionTable(data.plan.shots.map((s:any)=>({duration:s.duration,videoDesc:actionDescription(s,data.beats),prompt:actionOpeningPrompt(s)}))):"",
    result:row.result?JSON.parse(row.result):null};
}

export async function currentActionStoryboard(projectId:number,scriptId:number,ownerId:number) {
  await ensureActionStoryboards(); await context(projectId,scriptId,ownerId);
  const row=await sql("o_actionStoryboard").where({projectId,scriptId,ownerId}).orderBy("createdAt","desc").first();
  return row?getActionStoryboard(row.id,ownerId):null;
}

export async function applyActionStoryboard(id: string, ownerId: number) {
  await ensureActionStoryboards();
  return sql.transaction(async (trx:any) => {
    const row=await trx("o_actionStoryboard").where({id,ownerId}).first();
    if(!row)throw Error("编排任务不存在");
    const ctx=await context(row.projectId,row.scriptId,ownerId,trx);
    if(row.state==="applied")return JSON.parse(row.result);
    if(row.state!=="ready")throw Error("编排未就绪");
    if(ctx.sourceHash!==row.sourceHash)throw Error("剧本、分镜或资产已修改，请重新编排后采用");
    const {plan:raw,mode}=JSON.parse(row.data),plan=validateActionPlan(raw,ctx.beats,ctx.assets.map((a:any)=>a.id));
    const {projectId,scriptId}=row;
    if(await trx.schema.hasTable("o_cameraClip") && await trx("o_cameraClip").where({projectId}).whereIn("storyboardId",ctx.boards.map((b:any)=>b.id)).whereIn("status",["queued","running","uncertain"]).first())throw Error("本集仍有未结束的视频切片，请等待后再采用");
    const work=await trx("o_agentWorkData").where({projectId,episodesId:scriptId,key:"productionAgent"}).first();
    if(mode==="refine") {
      validateActionRefinement(plan,currentActionPlan(ctx.boards,ctx.beats));
      if(await trx("o_videoTrack").whereIn("id",ctx.boards.map((b:any)=>b.trackId)).where({state:"生成中"}).first())throw Error("本集正在生成提示词，请完成后再采用校正");
      const before={boards:ctx.boards,work:work?.data,tracks:await trx("o_videoTrack").whereIn("id",ctx.boards.map((b:any)=>b.trackId))};
      const boards:any[]=[];
      for(const [index,shot] of plan.shots.entries()) {
        const board=ctx.boards[index],videoDesc=actionDescription(shot,ctx.beats),changed=videoDesc!==board.videoDesc||actionOpeningPrompt(shot)!==board.prompt;
        if(changed) {
          await trx("o_storyboard").where({id:board.id,projectId,scriptId}).update({videoDesc,prompt:actionOpeningPrompt(shot)});
          await trx("o_videoTrack").where({id:board.trackId,projectId,scriptId}).update({state:"待重新生成",reason:"分镜已校正，请重新生成视频提示词；旧提示词与媒体已保留。"});
          if(await trx.schema.hasTable("o_cameraClip")) {
            const clips=await trx("o_cameraClip").where({projectId,storyboardId:board.id});
            for(const clip of clips)if(clip.review){const old=JSON.parse(clip.review);await trx("o_cameraClip").where({id:clip.id}).update({review:JSON.stringify({status:"stale",previousReview:old,notes:"分镜已校正，旧验收需针对新版本复核。",invalidatedBy:id,invalidatedAt:Date.now()}),updatedAt:Date.now()});}
          }
        }
        boards.push({...board,videoDesc,prompt:actionOpeningPrompt(shot),associateAssetsIds:board.assetIds});
      }
      const previous=work?JSON.parse(work.data||"{}"):{};
      const data={...previous,scriptPlan:synchronizeShotCount(previous.scriptPlan,boards),storyboard:boards,storyboardTable:renderActionTable(boards),actionStoryboard:{planId:id,version:2}};
      if(work)await trx("o_agentWorkData").where({id:work.id}).update({data:JSON.stringify(data),updateTime:Date.now()});
      else await trx("o_agentWorkData").insert({projectId,episodesId:scriptId,key:"productionAgent",data:JSON.stringify(data),createTime:Date.now()});
      const result={projectId,scriptId,mode,archiveScriptId:null,storyboardIds:boards.map(b=>b.id),trackIds:boards.map(b=>b.trackId),shotCount:boards.length,before};
      await trx("o_actionStoryboard").where({id}).update({state:"applied",result:JSON.stringify(result)});
      return result;
    }
    let archiveScriptId:number|null=null;
    if(ctx.boards.length) {
      [archiveScriptId]=await trx("o_script").insert({projectId,name:`${ctx.script.name} · 编排前备份 ${new Date().toISOString().slice(0,16)}`,content:ctx.script.content,createTime:Date.now()});
      await trx("o_scriptAssets").insert(ctx.assets.map((a:any)=>({scriptId:archiveScriptId,assetId:a.id})));
      await trx("o_storyboard").where({projectId,scriptId}).update({scriptId:archiveScriptId});
      await trx("o_videoTrack").where({projectId,scriptId}).update({scriptId:archiveScriptId});
      await trx("o_video").where({projectId,scriptId}).update({scriptId:archiveScriptId});
      if(work)await trx("o_agentWorkData").insert({projectId,episodesId:archiveScriptId,key:"productionAgent",data:work.data,createTime:Date.now()});
    }
    const boards:any[]=[];
    for(const [index,s] of plan.shots.entries()) {
      const [trackId]=await trx("o_videoTrack").insert({projectId,scriptId,duration:s.duration});
      const board={projectId,scriptId,trackId,index,track:String(index+1),duration:String(s.duration),videoDesc:actionDescription(s,ctx.beats),prompt:actionOpeningPrompt(s),shouldGenerateImage:0,state:"未生成",createTime:Date.now()};
      const [boardId]=await trx("o_storyboard").insert(board);
      await trx("o_assets2Storyboard").insert(s.assetIds.map(assetId=>({assetId,storyboardId:boardId})));
      boards.push({...board,id:boardId,associateAssetsIds:s.assetIds});
    }
    const previous=work?JSON.parse(work.data||"{}"):{};
    const data={...previous,scriptPlan:synchronizeShotCount(previous.scriptPlan,boards),script:ctx.script.content,storyboardTable:renderActionTable(boards),storyboard:boards,workbench:{videoList:[]},actionStoryboard:{planId:id,version:1}};
    if(work)await trx("o_agentWorkData").where({id:work.id}).update({data:JSON.stringify(data),updateTime:Date.now()});
    else await trx("o_agentWorkData").insert({projectId,episodesId:scriptId,key:"productionAgent",data:JSON.stringify(data),createTime:Date.now()});
    const result={projectId,scriptId,archiveScriptId,storyboardIds:boards.map(b=>b.id),trackIds:boards.map(b=>b.trackId),shotCount:boards.length};
    await trx("o_actionStoryboard").where({id}).update({state:"applied",result:JSON.stringify(result)});
    return result;
  });
}

export async function synchronizeActionTable(projectId:number,scriptId:number,data:any,connection:any=sql) {
  const work=await connection("o_agentWorkData").where({projectId,episodesId:scriptId,key:"productionAgent"}).first();
  const stored=work?JSON.parse(work.data||"{}"):{};
  if(!stored.actionStoryboard&&!stored.h3Pipeline)return data;
  const boards:any[]=await projectNativeBoards(await connection("o_storyboard").where({projectId,scriptId}).orderBy("index").orderBy("id"),connection);
  return {...data,storyboard:data.storyboard?.map((b:any)=>({...b,...boards.find((x:any)=>x.id===b.id)})),h3Pipeline:stored.h3Pipeline,scriptPlan:synchronizeShotCount(data.scriptPlan,boards),actionStoryboard:stored.actionStoryboard,storyboardTable:renderActionTable(boards)};
}
