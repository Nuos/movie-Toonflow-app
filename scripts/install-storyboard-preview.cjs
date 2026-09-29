const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../data/web/index.html');
let html = fs.readFileSync(file, 'utf8');
const marker = '/* storyboard-media-preview-v1 */';
if (!html.includes(marker)) {
  const start = html.indexOf('iPs=qe({__name:"preview",setup(e){');
  const end = html.indexOf(',rPs=hr(iPs,', start);
  if (start < 0 || end < 0 || html.indexOf('iPs=qe({__name:"preview",setup(e){', start+1) >= 0) throw Error('分镜预览安装位置不匹配');
  html = html.slice(0,start) + 'iPs=qe({__name:"preview",setup(){'+marker+'const{project:t}=yr(qc()),n=vt("episodesId");window.ToonflowPreviewZip=fUn;return()=>de("toonflow-storyboard-preview",{"project-id":t.value?.id,"script-id":n.value})}})' + html.slice(end);
}
for (const tag of ['<link rel="stylesheet" href="/storyboard-preview.css">','<script src="/storyboard-preview.js"></script>']) if(!html.includes(tag)) {const i=html.lastIndexOf('</head>');if(i<0)throw Error('缺少 head');html=html.slice(0,i)+tag+'\n'+html.slice(i);};
fs.writeFileSync(file,html);console.log('分镜资产预览已安装');
