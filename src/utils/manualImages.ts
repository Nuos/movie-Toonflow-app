import path from "node:path";

/** 手册读取接口返回本地 /skills URL；它和绝对 URL 都表示保留原图。 */
export function manualImageName(value: string): string | null {
  if (!value.startsWith("/skills/") && !/^https?:\/\//i.test(value)) return null;
  return path.basename(new URL(value, "http://localhost").pathname);
}
