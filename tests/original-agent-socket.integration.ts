import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
const Database = require("better-sqlite3");
// socket.io ships the same browser client used by the application; Node supplies WebSocket.
const { io: clientIo } = require(path.resolve(path.dirname(require.resolve("socket.io")), "../client-dist/socket.io.js"));

async function main() {
  const root=process.cwd(),temp=await fs.mkdtemp(path.join(os.tmpdir(),"toonflow-agent-socket-"));
  await fs.chmod(temp,0o700);await fs.mkdir(path.join(temp,"data/vendor"),{recursive:true});
  const source=new Database(path.join(root,"data/db2.sqlite"),{readonly:true});await source.backup(path.join(temp,"data/db2.sqlite"));source.close();
  await fs.copyFile(path.join(root,"package.json"),path.join(temp,"package.json"));
  await fs.symlink(path.join(root,"data/skills"),path.join(temp,"data/skills"));
  process.chdir(temp);process.env.NODE_ENV="prod";
  const {default:u}=await import("../src/utils");const {db}=await import("../src/utils/db");
  const projectId=99119800,scriptId=99119801,secondScript=99119802;
  await db("o_project").insert({id:projectId,name:"Socket 隔离核查",imageModel:"audit-socket:image",videoModel:"audit-socket:video",artStyle:"2D_flat_design",directorManual:"audit",mode:'["text"]'});
  await db("o_script").insert([{id:scriptId,projectId,name:"隔离第一集",content:"剧本甲"},{id:secondScript,projectId,name:"隔离第二集",content:"剧本乙"}]);
  await db("o_novel").insert({projectId,chapterIndex:1,chapter:"隔离章节",chapterData:"隔离小说原文",event:"隔离事件",eventState:1});
  await db("o_vendorConfig").insert({id:"audit-socket",enable:1,inputValues:"{}",models:"[]"});
  await fs.writeFile(path.join(temp,"data/vendor/audit-socket.ts"),'exports.vendor={models:[{modelName:"video",type:"video",mode:["text"]}]};');
  await db("o_setting").where({key:"messagesPerSummary"}).update({value:"10000"});
  await db("o_setting").where({key:"tokenKey"}).update({value:"isolated-socket-fixture-key"});
  const app=express();app.use(express.json());
  app.use("/savePlan",(await import("../src/routes/scriptAgent/setPlanData")).default);
  app.use("/getPlan",(await import("../src/routes/scriptAgent/getPlanData")).default);
  const server=http.createServer(app),io=new Server(server);
  (await import("../src/socket")).default(io);
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const nativeText=u.Ai.Text,nativeImage=u.Ai.Image,nativeVideo=u.Ai.Video,nativeFetch=global.fetch;
  u.Ai.Image=(()=>{throw Error("测试禁止图片生成")}) as any;u.Ai.Video=(()=>{throw Error("测试禁止视频生成")}) as any;
  global.fetch=((url:any,...args:any[])=>{assert.ok(String(url).startsWith(base+"/"));return (nativeFetch as any)(url,...args)}) as any;
  const calls:any[]=[],clients:any[]=[],results:any[]=[];
  const plan:any={storySkeleton:"",adaptationStrategy:"",script:[]};
  const outputs:Record<string,string>={storySkeletonAgent:"<storySkeleton>隔离故事骨架</storySkeleton>",adaptationStrategyAgent:"<adaptationStrategy>隔离改编策略</adaptationStrategy>",scriptAgent:'<scriptItem name="隔离第一集">隔离剧本正文</scriptItem>',directorPlanAgent:"<scriptPlan>隔离拍摄计划</scriptPlan>",storyboardPanelAgent:'<storyboardItem prompt="隔离分镜" duration="5"></storyboardItem>',storyboardTableAgent:"<storyboardTable>隔离分镜表</storyboardTable>"};
  u.Ai.Text=((key:string,think:boolean,level:number)=>({stream:async(options:any)=>{
    const request=options.messages?.at(-1)?.content||"",entry={key,request,signal:options.abortSignal,tools:Object.keys(options.tools||{}),think,level,finished:false};calls.push(entry);
    if(request==="throw-before")throw Error("模拟流创建失败");
    return {fullStream:(async function*(){try{
      if(request==="hold"){
        yield {type:"text-delta",text:"等待测试中断"};
        await new Promise<void>((_resolve,reject)=>{const abort=()=>reject(Object.assign(Error("测试主动停止"),{name:"AbortError"}));if(options.abortSignal.aborted)abort();else options.abortSignal.addEventListener("abort",abort,{once:true});});
      }
      if(request==="throw-stream"){yield {type:"error",error:Error("401 API key sk-isolated-fixture")};return;}
      if(key.endsWith(":decisionAgent")){
        if(request==="await-client") {
          if(key.startsWith("scriptAgent:")) await options.tools.get_planData.execute({key:"storySkeleton"});
          else await options.tools.get_flowData.execute({key:"script"});
        }
        if(request.startsWith("dispatch:")){
          const name=request.slice(9);assert.ok(options.tools[name]);await options.tools[name].execute({prompt:"隔离执行任务"},{toolCallId:"fixture",messages:[]});
        }
        await options.onFinish?.({text:"决策收尾"});
        yield {type:"text-delta",text:"决策已完成:"+request};
      }else{
        if(key.startsWith("scriptAgent:"))assert.equal(await options.tools.get_novel_text.execute({chapterIndex:"1"}),"隔离小说原文");
        else{
          const script=await options.tools.get_flowData.execute({key:"script"});assert.ok(String(script).includes("剧本"));
          if(key.endsWith(":directorPlanAgent")){assert.deepEqual(Object.keys(options.tools),["get_flowData"]);assert.equal(options.prepareStep({stepNumber:1}).toolChoice,"none");}
        }
        yield {type:"reasoning-start"};yield {type:"reasoning-delta",text:"隔离思考"};yield {type:"reasoning-end"};
        const output=outputs[key.split(":")[1]]||"隔离执行完成";
        yield {type:"text-delta",text:output.slice(0,7)};yield {type:"text-delta",text:output.slice(7)};
      }
      yield {type:"finish"};
    }finally{entry.finished=true;}})()};
  }})) as any;
  async function waitFor(test:()=>boolean,label:string,timeout=1800){const start=Date.now();while(!test()){if(Date.now()-start>timeout)throw Error("等待超时: "+label);await new Promise(r=>setTimeout(r,10));}}
  async function check(name:string,fn:()=>Promise<void>){try{await fn();results.push({name,pass:true});}catch(e:any){results.push({name,pass:false,reason:e.message});}}
  async function connect(kind:string,overrides:any={}){
    const events:any[]=[];
    const client=clientIo(base+"/api/socket/"+kind,{transports:["websocket"],forceNew:true,reconnection:false,auth:{token:jwt.sign({id:1},"isolated-socket-fixture-key"),projectId,scriptId,isolationKey:`${projectId}:${kind}:${scriptId}`,...overrides}});clients.push(client);
    let connected = false; client.on("connect",()=>{connected=true;});
    client.onAny((name:string,...args:any[])=>events.push({name,data:args[0]}));
    client.on("getFlowData",(data:any,ack:any)=>ack({[data.key]:"剧本甲"}));client.on("getPlanData",(_data:any,ack:any)=>ack({storySkeleton:"工作区骨架"}));
    await waitFor(()=>connected,"连接");
    // The server authenticates asynchronously after the transport handshake.
    const serverSocket=()=>io.of("/api/socket/"+kind).sockets.get(client.id);
    if(!overrides.token)await waitFor(()=>!!serverSocket()?.listenerCount("chat"),"认证后注册聊天监听器");
    return {client,events,serverSocket};
  }
  async function sendDone(peer:any,content:string){const start=peer.events.length;peer.client.emit("chat",{content});await waitFor(()=>peer.events.slice(start).some((e:any)=>e.name==="content:update"&&e.data.data==="决策已完成:"+content),"决策完成");return peer.events.slice(start);}
  try{
    for(const kind of ["scriptAgent","productionAgent"]){
      await check(kind+":invalid-token",async()=>{const p=await connect(kind,{token:"invalid-fixture"});await waitFor(()=>!p.client.connected,"拒绝非法令牌");assert.equal(p.events.filter((e:any)=>e.name==="message").length,0);});
      const peer=await connect(kind);
      const names=kind==="scriptAgent"?["run_sub_agent_storySkeleton","run_sub_agent_adaptationStrategy","run_sub_agent_script","run_supervision_agent"]:["run_sub_agent_derive_assets","run_sub_agent_generate_assets","run_sub_agent_director_plan","run_sub_agent_storyboard_gen","run_sub_agent_storyboard_panel","run_sub_agent_storyboard_table","run_sub_agent_supervision"];
      for(const name of names)await check(kind+":"+name,async()=>{
        peer.client.emit("updateThinkConfig",{think:true,thinlLevel:2});
        const before=calls.length,events=await sendDone(peer,"dispatch:"+name);const nested=calls.slice(before);
        for(const event of events.filter((e:any)=>e.name==="content:add"&&e.data.content.status==="pending")) {
          assert.ok(events.some((e:any)=>e.name==="content:update"&&e.data.contentId===event.data.content.id&&e.data.status==="complete"),"子执行完成后所有内容块均应结束等待");
        }
        for(const event of events.filter((e:any)=>e.name==="content:update"&&e.data.type==="thinking"&&e.data.strategy==="append"))assert.equal(typeof event.data.data,"object","思考增量保持前端对象协议");
        assert.equal(nested.length,2);assert.ok(nested.every(c=>c.think===true&&c.level===2));
        const rendered=events.filter((e:any)=>e.name==="content:update"&&e.data.type==="text"&&e.data.strategy==="append").map((e:any)=>e.data.data).join("");
        const expected=outputs[nested[1].key.split(":")[1]]||"隔离执行完成";
        assert.ok(rendered.includes(expected),"实际 Socket 文本分片保留工作区标签和正文");
        if(kind==="scriptAgent") {
          for(const tag of ["storySkeleton","adaptationStrategy"]) {const match=rendered.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));if(match)plan[tag]=match[1];}
          const script=rendered.match(/<scriptItem name="([^"]+)">([\s\S]*?)<\/scriptItem>/);if(script)plan.script=[{id:scriptId,name:script[1],content:script[2]}];
        }
        assert.equal(nested[0].signal,nested[1].signal);assert.ok(events.some((e:any)=>e.name==="message:update"&&e.data.status==="complete"));
        assert.ok(events.filter((e:any)=>e.name==="message").length>=3);
        const memory=await db("memories").where({isolationKey:`${projectId}:${kind}:${scriptId}`});assert.ok(memory.some(m=>m.role?.startsWith("assistant:execution")||m.role==="assistant:supervision"));
      });
      if(kind==="scriptAgent")await check("scriptAgent:streamed-plan-save-read",async()=>{
        const post=async(route:string,body:any)=>{const r=await fetch(base+route,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json() as Promise<any>;};
        await post("/savePlan",{projectId,agentType:"scriptAgent",data:plan});
        const result=await post("/getPlan",{projectId,agentType:"scriptAgent"});
        assert.equal(result.data.data.storySkeleton,"隔离故事骨架");assert.equal(result.data.data.adaptationStrategy,"隔离改编策略");
        assert.equal(result.data.data.script.find((s:any)=>s.id===scriptId).content,"隔离剧本正文");
        assert.equal((await db("o_script").where({id:secondScript}).first()).content,"剧本乙");
      });
      if(kind==="productionAgent")await check("productionAgent:context-switch-aborts",async()=>{
        const before=calls.length;peer.client.emit("chat",{content:"hold"});await waitFor(()=>calls.length>before,"切换前阻塞流");const entry=calls.at(-1);
        const isolationKey=`${projectId}:${kind}:${secondScript}`;
        await new Promise<void>((resolve,reject)=>{peer.client.timeout(1500).emit("updateContext",{projectId,scriptId:secondScript,isolationKey},(err:any,data:any)=>err?reject(err):(assert.equal(data.success,true),resolve()));});
        await waitFor(()=>entry.signal.aborted&&entry.finished,"切换剧集时中断旧请求");
        await sendDone(peer,"新剧集对话");assert.ok(await db("memories").where({isolationKey,role:"user",content:"新剧集对话"}).first());
        assert.equal(await db("memories").where({isolationKey:`${projectId}:${kind}:${scriptId}`,content:"新剧集对话"}).first(),undefined);
      });
      await check(kind+":failure-before-stream",async()=>{const start=peer.events.length;peer.client.emit("chat",{content:"throw-before"});await waitFor(()=>peer.events.slice(start).some(e=>e.name==="message:update"&&e.data.status==="error"),"流创建异常应回传错误");});
      await check(kind+":stream-error-redacted",async()=>{const start=peer.events.length;peer.client.emit("chat",{content:"throw-stream"});await waitFor(()=>peer.events.slice(start).some(e=>e.name==="message:update"&&e.data.status==="error"),"流错误");assert.ok(!JSON.stringify(peer.events.slice(start)).includes("sk-isolated-fixture"));});
      await check(kind+":stop",async()=>{const before=calls.length,start=peer.events.length;peer.client.emit("chat",{content:"hold"});await waitFor(()=>calls.length>before,"阻塞流开始");const entry=calls.at(-1);peer.client.emit("stop");await waitFor(()=>entry.signal.aborted&&entry.finished,"停止信号到达模型");await waitFor(()=>peer.events.slice(start).some(e=>e.name==="message:update"&&e.data.status==="stop"),"停止状态回传");await sendDone(peer,"停止后继续");});
      for(const action of ["stop","disconnect"])await check(kind+":unacknowledged-tool:"+action,async()=>{
        const pendingPeer=await connect(kind),event=kind==="scriptAgent"?"getPlanData":"getFlowData";
        pendingPeer.client.removeAllListeners(event);
        const before=calls.length;pendingPeer.client.emit("chat",{content:"await-client"});
        await waitFor(()=>pendingPeer.events.some(e=>e.name===event),"前端收到工具请求但不确认");
        const entry=calls[before];
        if(action==="stop")pendingPeer.client.emit("stop");else pendingPeer.client.disconnect();
        await waitFor(()=>entry.signal.aborted&&entry.finished,"等待工具确认时能结束模型流");
        if(action==="stop"){
          await waitFor(()=>pendingPeer.events.some(e=>e.name==="message:update"&&e.data.status==="stop"),"工具等待停止状态");
          await sendDone(pendingPeer,"工具等待停止后继续");
        }
        pendingPeer.client.disconnect();
      });
      await check(kind+":disconnect-aborts",async()=>{const before=calls.length;peer.client.emit("chat",{content:"hold"});await waitFor(()=>calls.length>before,"待断开流开始");const entry=calls.at(-1);peer.client.disconnect();try{await waitFor(()=>entry.signal.aborted&&entry.finished,"断开时停止模型");}finally{if(!entry.finished){const sockets=[...io.of("/api/socket/"+kind).sockets.values()];sockets.forEach(s=>s.emit("fixture-cleanup"));}}});
    }
    const {requestSocket}=await import("../src/socket/request");
    const peer=await connect("scriptAgent"),wire=peer.serverSocket()!;
    await check("socket-request:timeout-removes-transport-ack",async()=>{
      const baseline=wire.listenerCount("disconnect"),ackCount=(wire as any).acks.size;
      await assert.rejects(requestSocket(wire,"fixtureMissingAck",{},{timeoutMs:30}),/确认超时/);
      assert.equal(wire.listenerCount("disconnect"),baseline);
      assert.equal((wire as any).acks.size,ackCount);
    });
    await check("socket-request:abort-and-late-ack",async()=>{
      const controller=new AbortController();let acknowledge:any;
      peer.client.once("fixtureLateAck",(_data:any,ack:any)=>{acknowledge=ack;});
      const baseline=wire.listenerCount("disconnect");
      const promise=requestSocket(wire,"fixtureLateAck",{},{signal:controller.signal,timeoutMs:100});
      const rejection=assert.rejects(promise,{name:"AbortError"});
      await waitFor(()=>!!acknowledge,"迟到回调准备");controller.abort();await rejection;
      acknowledge({value:"迟到成功"});
      await waitFor(()=>(wire as any).acks.size===0,"传输确认已释放");
      assert.equal(wire.listenerCount("disconnect"),baseline);
    });
    await check("socket-request:pre-aborted-does-not-send",async()=>{
      const controller=new AbortController();controller.abort();const before=peer.events.length;
      await assert.rejects(requestSocket(wire,"fixtureNeverSent",{},{signal:controller.signal,timeoutMs:30}),{name:"AbortError"});
      assert.equal(peer.events.slice(before).filter(e=>e.name==="fixtureNeverSent").length,0);
    });
    await check("socket-request:client-error-and-success",async()=>{
      peer.client.once("fixtureError",(_data:any,ack:any)=>ack({error:"工作区保存失败"}));
      await assert.rejects(requestSocket(wire,"fixtureError",{},{timeoutMs:100}),/工作区保存失败/);
      peer.client.once("fixtureSuccess",(_data:any,ack:any)=>ack({ok:true}));
      assert.deepEqual(await requestSocket(wire,"fixtureSuccess",{},{timeoutMs:100}),{ok:true});
    });
    console.log(JSON.stringify({results,boundary:"real local Socket.IO transport and actual agent orchestration; deterministic text model; no media generation"}));
    assert.ok(results.every(r=>r.pass));
  }finally{
    clients.forEach(c=>c.disconnect());io.disconnectSockets();await new Promise<void>(r=>io.close(()=>r()));
    // Failed disconnect assertions may leave the old stream waiting; no external service was started.
    u.Ai.Text=nativeText;u.Ai.Image=nativeImage;u.Ai.Video=nativeVideo;global.fetch=nativeFetch;
    await db.destroy();process.chdir(root);await fs.rm(temp,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
