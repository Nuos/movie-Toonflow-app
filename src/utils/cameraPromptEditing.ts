import { productionCatalog } from "./productionCatalog";
import { simplifiedChinese } from "./simplifiedChinese";

export async function resolveCameraMentions(projectId: number, prompt: string, references: any[]) {
  const catalog = await productionCatalog(projectId);
  const entries: any[] = [...catalog.assets, ...catalog.shots.map(s=>({...s,name:s.label,type:"image",description:""}))];
  const counts: Record<string, number> = {}, labels = new Map<string,string>();
  for (const ref of references) { const type = ref.type === "audio" ? "Audio" : ref.type === "video" ? "Video" : "Picture"; counts[type] = (counts[type] || 0)+1; labels.set(`${ref.sources}:${ref.id}`, `<${type} ${counts[type]}>`); }
  // 再次编辑或调整引用顺序后，已编译的卡片也重新绑定当前槽位。
  const source = prompt.replace(/<(?:Picture|Audio|Video)\s+\d+>（[^（）\n]*?(DR-\d+-[A-Z]+-\d+)）/g, (_,code)=>`@${code}`);
  return simplifiedChinese(source.replace(/@(DR-\d+-[A-Z]+-\d+)/g, (_,code) => {
    const entry = entries.find(e => e.code === code);
    if (!entry) throw Error(`资产编号 ${code} 不属于当前项目或已删除`);
    const label = labels.get(`${entry.sources}:${entry.id}`);
    return label ? `${label}（${entry.name}，${code}）` : `${entry.name}（${code}${entry.description ? `：${entry.description}` : ""}）`;
  }));
}
