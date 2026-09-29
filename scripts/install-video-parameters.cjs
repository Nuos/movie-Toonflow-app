// Reproducible hooks for the shipped native workbench bundle.
const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../data/web/index.html');let html=fs.readFileSync(file,'utf8');
function patch(from,to){if(html.includes(to))return;if(html.split(from).length!==2)throw Error('原生视频参数入口已变化：'+from.slice(0,70));html=html.replace(from,to);}
patch('function w(W){var q,X;const V=(q=f.value)', 'function w(W){if(f.value?.parameterCapabilities?.customDuration)return W;var q,X;const V=(q=f.value)');
patch('k.value.resolution=q[0].resolution.includes(k.value.resolution)?k.value.resolution:q[0].resolution[0]', 'k.value.resolution=(V.parameterCapabilities?.customResolution&&/^\\d+[x×]\\d+$/.test(k.value.resolution))||q[0].resolution.includes(k.value.resolution)?k.value.resolution:q[0].resolution[0]');
const anchor='content:ke(()=>[de("div",KPs,[';
const fields='e.modeOptions.parameterCapabilities?de("div",{class:"local-video-parameters",style:"display:grid;gap:8px;margin-bottom:12px"},[de("label",null,["时长（秒，可自定义）",de("input",{type:"number",min:0,step:"any",value:r.value.duration,onChange:p=>{const v=Number(p.target.value);if(Number.isFinite(v)&&v>0)a(v)}},null,40,["value"])]),de("label",null,["分辨率（预设或宽x高）",de("input",{value:r.value.resolution,onChange:p=>r.value.resolution=p.target.value},null,40,["value"])]),de("label",null,["画幅",de("select",{value:r.value.aspectRatio||"",onChange:p=>r.value.aspectRatio=p.target.value},[de("option",{value:""},"跟随提示词 / 项目"),...e.modeOptions.parameterCapabilities.aspectRatios.map(p=>de("option",{value:p},p))],40,["value"])]),de("small",null,"预设仅作建议；提交时按当前节点规格校验并对齐。")]):Pt("",!0),';
patch(anchor,anchor+fields);
patch('resolution:k.value.resolution,duration:k.value.duration,audio:k.value.audio,trackId:', 'resolution:k.value.resolution,duration:k.value.duration,aspectRatio:k.value.aspectRatio||undefined,audio:k.value.audio,trackId:');
fs.writeFileSync(file,html);console.log('原生工作台自定义视频参数已安装');
