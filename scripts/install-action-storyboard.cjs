const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../data/web/index.html');let html=fs.readFileSync(file,'utf8');
const marker='/* action-storyboard-native-v1 */';
if(!html.includes(marker)){
 const start=html.indexOf('uBs=qe({__name:"storyboardTable"'),end=html.indexOf('hBs=hr(uBs',start);
 if(start<0||end<0)throw Error('无法定位原生分镜表模块');
 const part=html.slice(start,end),needle='de("div",dBs,[';
 if(part.split(needle).length!==2)throw Error('原生分镜表渲染结构不匹配');
 const replacement=part.replace(needle,marker+'de("toonflow-action-storyboard",{"project-id":qc().project?.id,"script-id":ah().episodesId,onApplied:()=>ah().getFlowData()}),'+needle);
 html=html.slice(0,start)+replacement+html.slice(end);
}
const tag='<script src="/action-storyboard.js"></script>';
if(!html.includes(tag)){const index=html.lastIndexOf('</head>');if(index<0)throw Error('缺少 head');html=html.slice(0,index)+tag+'\n'+html.slice(index);}
fs.writeFileSync(file,html);console.log('原生分镜表完整动作编排入口已安装');
