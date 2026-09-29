import type { RequestHandler } from "express";
import { simplifyContent } from "../utils/simplifiedChinese";

/** 登录、供应商配置和签名回调不经过内容转换。 */
export const chineseContent: RequestHandler = (req, res, next) => {
  if (!/^\/api\/(?:project|novel|script|assets|assetsGenerate|artStyle|production|cornerScape|promptStandards|cameraStudio|characterVoices)(?:\/|$)/.test(req.path)) return next();
  req.body = simplifyContent(req.body);
  const json = res.json.bind(res);
  res.json = ((body: unknown) => json(simplifyContent(body))) as typeof res.json;
  next();
};
