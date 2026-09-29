// Describe only confirmed field differences, without asking an LLM to rewrite
// the character. The complete current template remains in the image request.
export function portraitEditInstruction(previous: any, current: any) {
  const changes: { path: string; operation: string; value: any }[] = [];
  function visit(before: any, after: any, path: string) {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    if (after && typeof after === 'object' && !Array.isArray(after)) {
      for (const key of new Set([...Object.keys(before || {}), ...Object.keys(after)]))
        visit(before?.[key], after[key], path ? `${path}/${key}` : key);
      return;
    }
    const appended = typeof before === 'string' && before.length > 0 && typeof after === 'string' && after.startsWith(before);
    changes.push({ path, operation: after === undefined ? '移除' : appended ? '追加' : '替换', value: appended ? after.slice(before.length) : after ?? null });
  }
  visit(previous.character, current.character, 'character');
  visit(previous.settings, current.settings, 'settings');
  if (!changes.length) return { changes, prefix: '' };
  return { changes, prefix: '【参考图局部修改指令】\n在参考图上只执行以下已确认字段变更，未修改的身份、脸部、服装、配饰、背景和画质保持一致。指定的外观变更必须清晰可见。不要整体重绘风格或提高锐化、对比度。\n'
    + changes.map(c => `${c.path}：${c.operation} ${typeof c.value === 'string' ? c.value : JSON.stringify(c.value)}`).join('\n')
    + '\n以下是修改后完整人物模板，作为一致性约束；本次修改优先执行上面的差异清单。\n' };
}
