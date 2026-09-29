declare const createOpenAICompatible: any, exports: any;
const vendor = {
  id: "local-text", name: "本地文本模型 · RTX 5090", version: "1.0", author: "Local deployment",
  description: "四款 Q4_K_M 本地文本模型，32K 上下文，支持工具调用。按需加载一个模型，空闲60秒释放内存；通过网关与 ComfyUI 串行使用显卡。",
  inputs: [{key:"baseUrl",label:"本地 API 地址",type:"url",required:true}],
  inputValues: {baseUrl:"http://127.0.0.1:10590/v1"},
  models: [
    {name:"Qwen3.5 9B · Q4_K_M", modelName:"qwen3.5-9b",type:"text",think:false},
    {name:"Qwen3.5 27B · Q4_K_M",modelName:"qwen3.5-27b",type:"text",think:false},
    {name:"Qwen3 30B-A3B Instruct · Q4_K_M",modelName:"qwen3-30b-a3b",type:"text",think:false},
    {name:"GLM-4.7-Flash · Q4_K_M",modelName:"glm-4.7-flash",type:"text",think:false},
  ],
};
exports.vendor=vendor;
exports.textRequest=(model:any)=>{
  if(vendor.inputValues.baseUrl!=="http://127.0.0.1:10590/v1") throw new Error("请使用本地 GPU 调度网关 http://127.0.0.1:10590/v1");
  return createOpenAICompatible({name:"local-text",baseURL:vendor.inputValues.baseUrl,apiKey:"local-only"}).chatModel(model.modelName);
};
exports.imageRequest=exports.videoRequest=exports.ttsRequest=()=>{throw new Error("请使用本地 ComfyUI 供应商生成图片或视频");};
exports.checkForUpdates=async()=>({hasUpdate:false,latestVersion:"1.0",notice:"本地文本模型"});
exports.updateVendor=async()=>"";
