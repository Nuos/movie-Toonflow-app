import express from "express";
import { success, error } from "@/lib/responseFormat";
import { importDatabase } from "@/utils/databaseBackup";

const router = express.Router();
export default router.post("/", async (req, res) => {
  try {
    await importDatabase(req.body?.tables);
    res.status(200).send(success("数据库导入成功"));
  } catch (err: any) {
    res.status(400).send(error(err?.message || "导入失败，原数据已保留"));
  }
});
