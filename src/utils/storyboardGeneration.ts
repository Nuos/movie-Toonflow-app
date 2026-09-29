// 当前服务进程内，每个分镜仅允许最新请求提交结果。重启后旧协程不再存在。
const active = new Map<string, symbol>();
export function claimStoryboardGeneration(projectId: number, storyboardId: number) {
  const key = `${projectId}:${storyboardId}`, token = Symbol();
  active.set(key, token);
  return {
    isCurrent: () => active.get(key) === token,
    release: () => { if (active.get(key) === token) active.delete(key); },
  };
}
export function invalidateStoryboardGeneration(projectId: number, storyboardId: number) {
  active.delete(`${projectId}:${storyboardId}`);
}
