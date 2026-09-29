import type { Socket } from "socket.io";

/** 工作区确认等待必须能在停止、断线或超时后释放；迟到确认不再改变结果。 */
export function requestSocket<T = any>(
  socket: Pick<Socket, "connected" | "on" | "off" | "timeout">,
  event: string,
  data: unknown,
  { signal, timeoutMs = 30_000 }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, result?: T) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      socket.off("disconnect", disconnect);
      if (error) reject(error); else resolve(result as T);
    };
    const abort = () => finish(Object.assign(new Error("工作区操作已停止"), { name: "AbortError" }));
    const disconnect = () => finish(Object.assign(new Error("工作区连接已断开"), { name: "AbortError" }));
    if (signal?.aborted) { abort(); return; }
    if (!socket.connected) { disconnect(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    socket.on("disconnect", disconnect);
    try {
      // 使用 Socket.IO 的确认超时，确保传输层也会删除未收到回复的回调。
      socket.timeout(timeoutMs).emit(event, data, (error: Error | null, result: any) => {
        if (error) return finish(new Error("等待工作区确认超时，请刷新页面后重试"));
        result?.error ? finish(new Error(String(result.error))) : finish(undefined, result);
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
