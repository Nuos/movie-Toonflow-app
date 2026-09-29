const fs=require('node:fs');
const file=require('node:path').join(__dirname,'../data/web/index.html');let s=fs.readFileSync(file,'utf8');
const replace=(a,b)=>{if(s.includes(b))return;if(s.split(a).length!==2)throw Error('资产管理安装位置不唯一: '+a.slice(0,60));s=s.replace(a,b);};
replace('de("div",Sxs,[c(bt,','de("div",Sxs,[de("toonflow-asset-manager",{"project-id":Ae(r)?.id,onAssetsChanged:()=>{B.value=!1;m()}},null,8,["project-id"]),c(bt,');
const anchor='["role","scene","tool"].includes(Ae(P).type)?de("toonflow-character-voice"';
replace(anchor,'de("toonflow-asset-manager",{"project-id":Ae(r)?.id,"asset-id":Ae(P).assetsId,"asset-name":Ae(P).name,"asset-type":Ae(P).type,onAssetsChanged:()=>{B.value=!1;m()}},null,8,["project-id","asset-id","asset-name","asset-type"]),'+anchor);
const tag='<script src="/asset-management.js"></script>';if(!s.includes(tag)){const i=s.lastIndexOf('</body>');s=s.slice(0,i)+tag+s.slice(i);}
fs.writeFileSync(file,s);console.log('资产管理入口已安装');
