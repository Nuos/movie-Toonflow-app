// Script execution writes XML in its final response; repeatedly reading the
// same workspace cannot perform that write. Give it a final text-only step.
export function scriptReadLoopGuard({ steps }: { steps: readonly { toolCalls?: readonly { toolName: string; input?: unknown }[] }[] }) {
  const reads = new Map<string, number>();
  for (const step of steps) {
    for (const call of step.toolCalls || []) {
      if (!['get_planData', 'get_script_content', 'get_novel_text', 'get_novel_events'].includes(call.toolName)) continue;
      const signature = call.toolName + ':' + JSON.stringify(call.input);
      const count = (reads.get(signature) || 0) + 1;
      if (count >= 4) return { toolChoice: 'none' as const };
      reads.set(signature, count);
    }
  }
  return undefined;
}
