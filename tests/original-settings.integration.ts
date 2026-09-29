import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
const Database = require("better-sqlite3");

async function main() {
  const root = process.cwd(), temp = await fs.mkdtemp(path.join(os.tmpdir(), "toonflow-settings-"));
  await fs.chmod(temp, 0o700); await fs.mkdir(path.join(temp, "data"));
  const original = new Database(path.join(root, "data/db2.sqlite"), { readonly: true });
  await original.backup(path.join(temp, "data/db2.sqlite")); original.close();
  for (const folder of ["vendor", "skills", "modelPrompt"]) await fs.cp(path.join(root, "data", folder), path.join(temp, "data", folder), { recursive: true });
  await fs.copyFile(path.join(root, "package.json"), path.join(temp, "package.json"));
  process.chdir(temp); process.env.NODE_ENV = "prod";
  const { default: u } = await import("../src/utils"); const { db, databaseReady } = await import("../src/utils/db"); await databaseReady;
  u.Ai.Text = (() => ({ invoke: async () => ({ text: "2" }) })) as any;
  const app = express(); app.use(express.json({ limit: "10mb" }));
  await (await import("../src/router")).default(app);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ message: err.code || err.name }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const realFetch = global.fetch, loginEnv = process.env.TOONFLOW_PASSWORDLESS;
  global.fetch = ((url: any, ...args: any[]) => { assert.ok(String(url).startsWith(base + "/"), "external network forbidden"); return (realFetch as any)(url, ...args); }) as any;
  const endpoints = new Set<string>(), results: any[] = [];
  async function call(route: string, body: any = {}, method = "POST", status = 200) {
    endpoints.add(`${method} ${route}`);
    const r = await fetch(base + "/api/" + route, { method, ...(method === "GET" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    assert.equal(r.status, status, `${route}: HTTP ${r.status}`); return (await r.json()).data;
  }
  async function check(name: string, fn: () => Promise<void>) { try { await fn(); results.push({ name, pass: true }); } catch (e: any) { results.push({ name, pass: false, reason: e.message }); } }
  const vendor = { id: "audit-settings", name: "隔离测试供应商", author: "test", version: "2.0", inputs: [], inputValues: {}, models: [{ name: "本地测试文本", modelName: "fixture", type: "text", think: false }] };
  const code = (value: any) => `exports.vendor = ${JSON.stringify(value)}; exports.textRequest = () => {}; exports.imageRequest = () => ''; exports.videoRequest = () => '';`;
  try {
    await call("setting/vendorConfig/addVendor", { tsCode: code(vendor) });
    await check("vendor-enable-model-list-detail-inputs", async () => {
      await call("setting/vendorConfig/enableVendor", { id: vendor.id, enable: 1 });
      const list = await call("modelSelect/getModelList", { type: "text" }); assert.ok(list.some((r: any) => r.id === vendor.id && r.value === "fixture"));
      assert.equal((await call("modelSelect/getModelDetail", { modelId: vendor.id + ":fixture" })).name, vendor.models[0].name);
      await call("setting/vendorConfig/updateVendorInputs", { id: vendor.id, inputValues: { endpoint: "http://127.0.0.1/mock-only" } });
      assert.equal(JSON.parse((await db("o_vendorConfig").where({ id: vendor.id }).first()).inputValues).endpoint, "http://127.0.0.1/mock-only");
      assert.ok(Array.isArray(await call("setting/vendorConfig/getVendorList")));
      await call("setting/getTextModel"); await call("setting/modelMap/getImageAndVideoModel");
    });
    await check("vendor-custom-model-edit-keeps-other-model", async () => {
      const a = { name: "测试 A", modelName: "custom-a", type: "text", think: false };
      const b = { name: "测试 B", modelName: "custom-b", type: "image", mode: ["text"] };
      await call("setting/vendorConfig/addVendorModel", { id: vendor.id, model: a });
      await call("setting/vendorConfig/addVendorModel", { id: vendor.id, model: b });
      await call("setting/vendorConfig/upVendorModel", { id: vendor.id, modelName: "custom-a", model: { ...a, name: "测试 A 更新" } });
      const models = await u.vendor.getModelList(vendor.id);
      assert.equal(models.find((r: any) => r.modelName === "custom-a").name, "测试 A 更新");
      assert.ok(models.some((r: any) => r.modelName === "custom-b"), "editing A must not replace B");
      await call("setting/vendorConfig/delVendorModel", { id: vendor.id, modelName: "custom-a" });
      assert.ok(!(await u.vendor.getModelList(vendor.id)).some((r: any) => r.modelName === "custom-a"));
    });
    await check("vendor-code-update", async () => {
      await call("setting/vendorConfig/updateCode", { id: vendor.id, tsCode: code({ ...vendor, name: "更新后的测试供应商" }) });
      assert.equal(u.vendor.getVendor(vendor.id).name, "更新后的测试供应商");
    });
    await check("agent-single-and-batch-model-settings", async () => {
      const agents = await db("o_agentDeploy").orderBy("id");
      const config = (row: any) => ({ id: row.id, name: row.name, model: "fixture", modelName: vendor.id + ":fixture", vendorId: vendor.id, desc: "隔离测试", temperature: 1, maxOutputTokens: 1024 });
      await call("setting/agentDeploy/updateAgentModel", config(agents[0]));
      await call("setting/agentDeploy/deployAgentModel", { items: agents.slice(1, 3).map(config) });
      for (const row of agents.slice(0, 3)) assert.equal((await db("o_agentDeploy").where({ id: row.id }).first()).modelName, vendor.id + ":fixture");
      assert.ok(await call("setting/agentDeploy/getAgentDeploy"));
      assert.equal(await db.schema.hasColumn("o_agentDeploy", "maxOutputTokens"), false);
      assert.equal(await db("o_setting").where("key", "summaryMaxLength").first(), undefined);
      await call("setting/dev/updateSwitchAiDevTool", { switchAiDevTool: "0" });
      assert.equal((await db("o_setting").where({ key: "switchAiDevTool" }).first()).value, "0");
      await call("setting/dev/getSwitchAiDevTool", {}, "GET");
    });
    await check("model-prompt-file-crud-and-binding", async () => {
      await call("setting/modelMap/savePrompt", { name: "audit-template", data: "原提示词模板", type: "video" });
      await call("setting/modelMap/updatePrompt", { name: "audit-template", data: "更新模板：保持主体。", type: "video" });
      const list = await call("setting/modelMap/getPromptList", {}, "GET");
      assert.equal(list.find((r: any) => r.path === "video/audit-template.md").data, "更新模板：保持主体。");
      await call("setting/modelMap/bindingPrompt", { vendorId: vendor.id, model: "fixture", path: "video/audit-template.md", fileName: "audit-template.md" });
      assert.equal((await db("o_modelPrompt").where({ vendorId: vendor.id, model: "fixture" }).first()).path, "video/audit-template.md");
      await call("setting/modelMap/deletePrompt", { path: "video/audit-template.md" });
      await assert.rejects(fs.stat(path.join(temp, "data/modelPrompt/video/audit-template.md")), { code: "ENOENT" });
    });
    await check("skill-file-list-read-save-reload", async () => {
      const list = await call("setting/skillManagement/getSkillList"); assert.ok(list.includes("script_agent_decision.md"));
      assert.ok((await call("setting/skillManagement/getSkillContent", { path: "script_agent_decision.md" })).includes("决策"));
      await call("setting/skillManagement/saveSkillContent", { path: "script_agent_decision.md", content: "隔离测试技能内容" });
      assert.equal(await call("setting/skillManagement/getSkillContent", { path: "script_agent_decision.md" }), "隔离测试技能内容");
      await call("setting/skillManagement/getSkillContent", { path: "../db2.sqlite" }, "POST", 400);
    });
    await check("login-password-and-local-mode", async () => {
      await db("o_user").insert({ id: 99119800, name: "audit-user", password: "audit-only-password" });
      process.env.TOONFLOW_PASSWORDLESS = "0";
      await call("login/login", { username: "audit-user", password: "wrong" }, "POST", 400);
      assert.ok((await call("login/login", { username: "audit-user", password: "audit-only-password" })).token.startsWith("Bearer "));
      await call("setting/loginConfig/updateUserPwd", { id: 99119800, name: "audit-user", password: "audit-only-updated" });
      await call("login/login", { username: "audit-user", password: "audit-only-password" }, "POST", 400);
      assert.ok((await call("login/login", { username: "audit-user", password: "audit-only-updated" })).token);
      process.env.TOONFLOW_PASSWORDLESS = "1";
      assert.ok((await call("login/login", { username: "audit-user" })).token);
      await call("setting/loginConfig/getUser", {}, "GET");
    });
    await check("task-list-filter-detail", async () => {
      const projectId = 99119801;
      await db("o_project").insert({ id: projectId, name: "任务测试项目" });
      const [taskId] = await db("o_tasks").insert({ projectId, taskClass: "隔离测试任务", state: "已完成", model: "fixture", describe: "测试完成" });
      const list = await call("task/getTaskApi", { projectId, state: "已完成", taskClass: "隔离测试任务", page: 1, limit: 10 });
      assert.equal(list.total, 1); assert.equal(list.data[0].id, taskId, "task list must return task id");
      assert.equal((await call("task/taskDetails", { taskId })).describe, "测试完成");
      assert.ok((await call("task/getTaskCategories")).some((r: any) => r.taskClass === "隔离测试任务"));
      await call("task/getProject");
    });
    await check("vendor-delete-unbinds-config", async () => {
      await call("setting/vendorConfig/deleteVendor", { id: vendor.id });
      assert.equal(await db("o_vendorConfig").where({ id: vendor.id }).first(), undefined);
      assert.equal((await db("o_agentDeploy").where({ vendorId: vendor.id })).length, 0);
      await assert.rejects(fs.stat(path.join(temp, "data/vendor", vendor.id + ".ts")), { code: "ENOENT" });
    });
    const report = { results, endpoints: [...endpoints].sort(), inference: "disabled" };
    await fs.writeFile(path.join(root, "local/full-regression-20260924/original-settings-results.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report)); assert.ok(results.every(r => r.pass), "settings failures listed above");
  } finally {
    global.fetch = realFetch; if (loginEnv === undefined) delete process.env.TOONFLOW_PASSWORDLESS; else process.env.TOONFLOW_PASSWORDLESS = loginEnv;
    await new Promise<void>(r => server.close(() => r())); await db.destroy(); process.chdir(root); await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
