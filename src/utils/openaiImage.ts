import axios from "axios";
import FormData from "form-data";

export function requireOpenAIImageKey(values: Record<string, string>): string {
  const apiKey = (values.apiKey || process.env.OPENAI_API_KEY || "").replace(/^Bearer\s+/i, "").trim();
  if (!apiKey) throw new Error("GPT Image 2.5 尚未配置 API Key，请在设置 → 供应商 → OpenAI标准接口中填写；Codex 的 ChatGPT 登录不等于图片 API 凭证。");
  return apiKey;
}

export function imageDimensions(quality: string, aspectRatio: string): string {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspectRatio);
  if (!match) throw new Error("图片比例格式错误");
  const ratio = Number(match[1]) / Number(match[2]);
  if (!Number.isFinite(ratio) || ratio < 1 / 3 || ratio > 3) throw new Error("GPT Image 2.5 支持的比例范围为 1:3 至 3:1");
  const target = { "1K": 1048576, "2K": 3686400, "4K": 8294400 }[quality];
  if (!target) throw new Error("图片尺寸必须为 1K、2K 或 4K");
  const scale = Math.min(1, 3840 / Math.sqrt(target * ratio), 3840 / Math.sqrt(target / ratio));
  let w = Math.floor(Math.sqrt(target * ratio) * scale / 16) * 16;
  let h = Math.floor(Math.sqrt(target / ratio) * scale / 16) * 16;
  if (w > h * 3) w = h * 3;
  if (h > w * 3) h = w * 3;
  return `${w}x${h}`;
}

export async function requestOpenAIImage(config: { prompt: string; size: string; aspectRatio: string; referenceList?: { type: string; base64: string }[] }, model: string, values: Record<string, string>) {
  if (!['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'].includes(model)) throw new Error("不支持的 GPT Image 模型");
  const apiKey = requireOpenAIImageKey(values);
  const baseURL = (values.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const size = imageDimensions(config.size, config.aspectRatio);
  const refs = config.referenceList || [];
  const params = { model, prompt: config.prompt, size, quality: "auto", output_format: "png", n: 1 };
  let response;
  try {
    if (refs.length) {
      const form = new FormData();
      for (const [key, value] of Object.entries(params)) form.append(key, String(value));
      refs.forEach((ref, index) => {
        if (ref.type !== "image") throw new Error("图片编辑仅支持图片参考");
        const data = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/.exec(ref.base64);
        const mime = data?.[1] || "image/png";
        const raw = data?.[2] || ref.base64;
        if (!/^[A-Za-z0-9+/=\s]+$/.test(raw)) throw new Error("参考图必须为 PNG/JPEG/WebP 的 base64");
        form.append("image[]", Buffer.from(raw, "base64"), { filename: `reference-${index}.${mime.split('/')[1]}`, contentType: mime });
      });
      response = await axios.post(`${baseURL}/images/edits`, form, { headers: { ...form.getHeaders(), Authorization: `Bearer ${apiKey}` }, timeout: 600000, maxBodyLength: Infinity });
    } else {
      response = await axios.post(`${baseURL}/images/generations`, params, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 600000 });
    }
  } catch (error: any) {
    // Do not expose axios request headers (which contain the API key) in logs.
    throw new Error(error.response?.data?.error?.message || error.message || "OpenAI 图片生成失败");
  }
  const image = response.data?.data?.[0]?.b64_json;
  if (!image) throw new Error("OpenAI 未返回图片数据");
  return image as string;
}
