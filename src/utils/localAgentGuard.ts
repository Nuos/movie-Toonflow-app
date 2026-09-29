/** Detect local models that repeatedly call tools without making progress. */
function stable(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function localAgentGuard({ steps }: { steps: any[] }): boolean {
  const signatures = steps.map(step => step.toolResults?.length ? stable(step.toolResults.map((result: any) => ({
    toolName: result.toolName, input: result.input, output: result.output,
  }))) : null);
  // Detect both one repeated call and a repeated cycle of up to four steps.
  for (let width = 1; width <= 4; width++) {
    if (signatures.length < width * 3) continue;
    const tail = signatures.slice(-width * 3);
    if (tail.some(value => value === null)) continue;
    const blocks = [tail.slice(0, width), tail.slice(width, width * 2), tail.slice(width * 2)];
    if (stable(blocks[0]) === stable(blocks[1]) && stable(blocks[1]) === stable(blocks[2])) {
      throw new Error("本地模型连续重复调用工具且结果没有变化，已停止本次运行。请缩小步骤或更换文本模型后继续。");
    }
  }
  return false;
}
