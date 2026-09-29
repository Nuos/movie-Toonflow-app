import { tool } from "ai";
import { z } from "zod";

/** The director-plan prompt permits one script read and XML plan output only. */
export function directorPlanTools(workspaceTools: Record<string, any>) {
  return {
    get_flowData: tool({
      description: "读取当前剧本。导演规划只需读取一次，随后直接输出 scriptPlan。",
      inputSchema: z.object({ key: z.literal("script") }),
      execute: (_input, options) => workspaceTools.get_flowData.execute({ key: "script" }, options),
    }),
  };
}

export function directorPlanStep({ stepNumber }: { stepNumber: number }) {
  return { toolChoice: stepNumber > 0 ? "none" as const : "auto" as const };
}

/** Table authoring writes XML; reviewing has no write responsibility. */
export function productionStageTools(key: string, workspace: Record<string, any>, extra: Record<string, any> = {}): Record<string, any> {
  if (key === "productionAgent:directorPlanAgent") return directorPlanTools(workspace);
  if (key === "productionAgent:storyboardTableAgent" || key === "productionAgent:supervisionAgent") {
    return { ...extra, get_flowData: workspace.get_flowData };
  }
  return { ...extra, ...workspace };
}
