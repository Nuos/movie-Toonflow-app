import assert from "node:assert/strict";
import { productionStageTools } from "../src/utils/directorPlanTools";
const workspace = { get_flowData: {}, add_flowData_storyboard: {}, add_deriveAsset: {}, generate_storyboard: {} };
const extra = { activate_skill: {} };
for (const key of ["storyboardTableAgent", "supervisionAgent"]) {
  const tools = productionStageTools(`productionAgent:${key}`, workspace, extra);
  assert.deepEqual(Object.keys(tools).sort(), ["activate_skill", "get_flowData"]);
  assert.equal(tools.get_flowData, workspace.get_flowData);
}
assert.equal(productionStageTools("productionAgent:storyboardPanelAgent", workspace).add_flowData_storyboard, workspace.add_flowData_storyboard);
assert.equal(productionStageTools("productionAgent:storyboardGenAgent", workspace).generate_storyboard, workspace.generate_storyboard);
console.log("PASS: table/review stages cannot add panel data or submit media; panel and media stages retain original tools");
