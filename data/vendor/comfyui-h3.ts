// Runs inside Toonflow's vendor sandbox. No API keys or cloud service required.
declare const axios: any, pollTask: any, crypto: any, exports: any;
const videoModel = (name: string, modelName: string, reference = false) => ({
  name, modelName, type: "video",
  mode: reference ? [["imageReference:9", "videoReference:3", "audioReference:3"]] : ["text", "singleImage", "startEndRequired"],
  audio: "optional",
  // Runtime metadata is supplied by localVideoCapabilities; no preset whitelist here.
  durationResolutionMap: [],
});
const vendor = {
  id: "comfyui-h3", name: "本地 Qwen Image 2.1 · H3", author: "Local deployment",
  version: "2.0", description: "Qwen Image 2.1：原生2K、50步，支持参考图编辑（保留首图比例）。H3：25步品质档默认，另有稀疏注意力和TensorRT加速档。时长、画幅和尺寸读取当前节点规格，支持自定义；帧数按17k+5对齐，预设只作建议。",
  inputs: [{ key: "baseUrl", label: "本地 H3 桥接地址", type: "url", required: true }],
  inputValues: { baseUrl: "http://127.0.0.1:10589" },
  models: [{name:"Qwen Image 2.1 · 2K 50步品质 / 参考图编辑", modelName:"qwen-image-2.1-quality", type:"image", mode:["text","singleImage","multiReference"]},
           videoModel("H3 · 品质25步 / 文生与首尾帧", "h3-quality"),
           videoModel("H3 · 多参考品质25步 / 保留参考细节", "h3-reference-quality", true),
           videoModel("H3 · 加速8步 / 稀疏注意力", "h3-fast-sol"),
           videoModel("H3 · 多参考加速4步 / TensorRT", "h3-reference-trt", true),
           videoModel("H3 · Astral 六步 + 分块精修四步", "h3-astral-reference", true),
           {name:"Z-Image Turbo 本地文生图（1K）", modelName:"z-image-turbo", type:"image", mode:["text"]},
           videoModel("H3 本地 Turbo 8步", "h3-turbo"),
           videoModel("H3 本地标准 20步", "h3-standard"),
           videoModel("H3 本地多参考 Turbo 4步", "h3-reference-turbo", true),
           videoModel("H3 本地多参考标准 20步", "h3-reference", true)],
};
const textRequest = () => { throw new Error("请另外配置文本模型，H3 是视频模型"); };
const imageRequest = async (config: any, model: any) => requestLocal(config, model);
const ttsRequest = async () => { throw new Error("H3 随视频生成音频，不提供独立 TTS"); };
const requestLocal = async (config: any, model: any): Promise<string> => {
  const base = vendor.inputValues.baseUrl.replace(/\/$/, "");
  if (base !== "http://127.0.0.1:10589") throw new Error("本地桥接地址必须为 http://127.0.0.1:10589");
  const payload = { ...config, model: model.modelName, request_id: config.request_id || crypto.randomUUID() };
  let job: any;
  try {
    job = (await axios.post(base + "/jobs", payload, { timeout: 180000 })).data;
  } catch (error: any) {
    throw new Error(error.response?.data?.error || error.message);
  }
  const result = await pollTask(async () => {
    let state: any;
    try { state = (await axios.get(base + "/jobs/" + job.id, { timeout: 180000 })).data; }
    catch (error: any) { return { completed: false, error: "状态查询失败；请勿重复提交，检查任务 " + job.id + ": " + (error.response?.data?.error || error.message) }; }
    if (state.state === "success") return { completed: true, data: state.output_url };
    if (["error", "submission_uncertain"].includes(state.state)) return { completed: false, error: state.error };
    return { completed: false };
  }, 3000, 7200000);
  if (!result.completed || !result.data) throw new Error("本地生成任务 " + job.id + ": " + (result.error || "未返回素材"));
  return result.data;
};
const videoRequest = async (config: any, model: any) => requestLocal(config, model);
exports.vendor = vendor;
exports.textRequest = textRequest;
exports.imageRequest = imageRequest;
exports.videoRequest = videoRequest;
exports.ttsRequest = ttsRequest;
exports.checkForUpdates = async () => ({ hasUpdate: false, latestVersion: "2.0", notice: "本地集成" });
exports.updateVendor = async () => "";
