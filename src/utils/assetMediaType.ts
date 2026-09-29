import path from "node:path";

// Original uploads and editor exports share the business kind "clip". That
// kind is not a media type; resolve the stored filename before routing refs.
export function assetMediaType(asset: { type?: string | null; filePath?: string | null }): "image" | "video" | "audio" {
  if (asset.type === "audio" || asset.type === "video") return asset.type;
  if (asset.type === "clip") {
    const ext = path.extname((asset.filePath || "").split(/[?#]/)[0]).toLowerCase();
    if ([".mp4", ".webm", ".mov", ".mkv"].includes(ext)) return "video";
    if ([".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".opus"].includes(ext)) return "audio";
  }
  return "image";
}
