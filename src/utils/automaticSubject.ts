import type { SemanticAnchor } from "./promptStandards";

export const VIDEO_SUBJECT_FALLBACK = "人物、场景与道具以各镜正文明确描述的对象为准；保持身份与数量，不补充未出现的主体。";
export function assetSubject(assets: any[], fallback: string) {
  return assets.map(a => `${a.name}：${a.describe || a.prompt || "以基准参考图为准"}`).join("\n") || fallback;
}
// Only replace a field whose saved value still equals our generated value.
// Legacy/custom fields have no provenance: keep them until explicitly reset.
export function refreshAutomaticSubject(anchor: SemanticAnchor, old: any, current: string) {
  return typeof old?.automaticSubject === "string" && anchor.subject === old.automaticSubject
    ? { ...anchor, subject: current } : anchor;
}
