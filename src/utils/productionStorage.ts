import path from "node:path";
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

/** 剧目文件的唯一物理位置。旧路径仅作为兼容链接，不保留第二份文件。 */
export function canonicalMediaPath(input: string): string {
  const rel = input.replace(/\\/g, "/").replace(/^\/+/, "");
  if (rel.split("/").includes("..")) throw Error("素材路径不得包含上级目录");
  const parts = rel.split("/"), projectId = parts[0];
  if (!/^\d+$/.test(projectId)) return rel;
  const lower = parts.map(p=>p.toLowerCase());
  let folder="media", kind="MEDIA";
  if (lower.includes("camera-clips")) { folder="shots/clips"; kind="CLIP"; }
  else if (lower.includes("role")) { folder="assets/characters"; kind="CHR"; }
  else if (lower.includes("scene")) { folder="assets/scenes"; kind="SCN"; }
  else if (lower.some(p=>["props","tool"].includes(p))) { folder="assets/props"; kind="PRP"; }
  else if (lower.includes("audio") || /\.(wav|mp3|flac|m4a|ogg|aiff)$/i.test(rel)) { folder="assets/audio"; kind="AUD"; }
  else if (lower.includes("video") || /\.(mp4|webm|mov)$/i.test(rel)) { folder="videos"; kind="VID"; }
  else if (lower.some(p=>["workflow","imageflow"].includes(p))) { folder="editing"; kind="EDIT"; }
  else if (lower.includes("assets")) { folder="shots/frames"; kind="SHOT"; }
  const code=`DR-${projectId}-${kind}-${createHash("sha256").update(rel).digest("hex").slice(0,20)}`;
  return `productions/DR-${projectId}/${folder}/${code}${path.extname(rel).toLowerCase()}`;
}
export function safeMediaPath(root: string, relative: string) {
  const resolved=path.resolve(root,relative.replace(/^[/\\]+/,""));
  if (!resolved.startsWith(path.resolve(root)+path.sep)) throw Error("素材路径越界");
  return resolved;
}
export async function linkLegacyMedia(root: string, relative: string, canonical: string) {
  if(relative.replace(/^\/+/,"")===canonical)return;
  const alias=safeMediaPath(root,relative),target=safeMediaPath(root,canonical);
  await fs.mkdir(path.dirname(alias),{recursive:true});
  try { const stat=await fs.lstat(alias); if(stat.isSymbolicLink() && path.resolve(path.dirname(alias),await fs.readlink(alias))===target)return;
    if(stat.isFile()){const [a,b]=await Promise.all([fs.readFile(alias),fs.readFile(target)]);if(!a.equals(b))throw Error("旧素材路径存在不同内容，已停止覆盖");}
    else throw Error("旧素材路径不是可迁移文件");
    await fs.unlink(alias);
  } catch(e:any){if(e.code!=="ENOENT")throw e;}
  await fs.symlink(path.relative(path.dirname(alias),target),alias);
}
export async function writeProductionMedia(root: string, relative: string, bytes: Buffer) {
  const canonical=canonicalMediaPath(relative),dest=safeMediaPath(root,canonical);
  await fs.mkdir(path.dirname(dest),{recursive:true});
  // 已有旧文件先归档，避免更新时将它误认为不同内容。
  if(canonical!==relative.replace(/^\/+/,"")){
    const old=safeMediaPath(root,relative);try{const stat=await fs.lstat(old);if(stat.isFile()){
      try{await fs.access(dest);const existing=await fs.readFile(dest);if(!existing.equals(await fs.readFile(old)))throw Error("规范目录已有不同素材，禁止覆盖");}catch(e:any){if(e.code==='ENOENT')await fs.rename(old,dest);else throw e;}
      await linkLegacyMedia(root,relative,canonical);
    }}catch(e:any){if(e.code!=='ENOENT')throw e;}
  }
  const temp=dest+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,bytes);await fs.rename(temp,dest);await linkLegacyMedia(root,relative,canonical);}finally{await fs.rm(temp,{force:true});}
  return canonical;
}
