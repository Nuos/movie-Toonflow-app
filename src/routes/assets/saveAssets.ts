import express from "express";
import { preserveSelectedPrompt, selectImagePrompt } from "@/utils/imagePrompts";
import u from "@/utils";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { stat } from "original-fs";
const router = express.Router();

// 保存资产图片
export default router.post(
  "/",
  validateFields({
    id: z.number(),
    projectId: z.number(),
    base64: z.string().optional().nullable(),
    type: z.enum(["role", "scene", "tool"]),
    prompt: z.string().optional().nullable(),
    imageId: z.number().optional().nullable(),
    editingImageId: z.number().optional().nullable(),
  }),
  async (req, res) => {
    const { id, base64, type, prompt, projectId, imageId } = req.body;
    const asset = await u.db("o_assets").where({ id, projectId }).whereNull("archivedAt").first();
    if (!asset) return res.status(400).send(error("资产不存在或已归档"));
    if (base64) {
      //自定义上传选择的图片
      const matches = base64.match(/^data:image\/\w+;base64,(.+)$/);
      const realBase64 = matches ? matches[1] : base64;
      // 生成新的图片路径
      const savePath = `/${projectId}/${type}/${uuidv4()}.png`;
      // 写入文件
      await u.oss.writeFile(savePath, Buffer.from(realBase64, "base64"));
      // 插入图片表
      const [idData] = await u.db("o_image").insert({
        assetsId: id,
        filePath: savePath,
        type: type,
        state: "已完成",
        model: "local-upload",
        prompt: "",
      });
      await preserveSelectedPrompt(u.db, asset);
      // 更新资产表图片为新图片
      await u
        .db("o_assets")
        .where("id", id)
        .update({
          prompt: "",
          imageId: idData,
        });
    } else {
      const result = await u.db.transaction(async tx => {
        const current = await tx("o_assets").where({id,projectId}).first();
        if (!current) throw new Error("资产不存在");
        if (imageId) {
          const image = await tx("o_image").where({id:imageId,assetsId:id}).whereNull("archivedAt").first();
          if (!image) return null;
          return {prompt:await selectImagePrompt(tx,current,image),imageId};
        }
        // Blur saves must never overwrite a different image selected in another tab.
        const editingId = req.body.editingImageId === undefined ? current.imageId : req.body.editingImageId;
        if (prompt !== undefined && prompt !== null) {
          if (editingId) {
            const updated = await tx("o_image").where({id:editingId,assetsId:id}).update({prompt});
            if (!updated) return null;
          }
          if (current.imageId === editingId) await tx("o_assets").where({id}).update({prompt});
        }
        return {prompt:prompt ?? current.prompt,imageId:current.imageId};
      });
      if (!result) return res.status(400).send(error("图片不存在、已归档或不属于此资产"));
      return res.status(200).send(success(result));
    }
    res.status(200).send(success({ message: "保存资产图片成功" }));
  },
);
