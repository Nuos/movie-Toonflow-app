import express from "express";
import { success, error } from "@/lib/responseFormat";
import { resetDatabase } from "@/utils/databaseBackup";
const router = express.Router();
export default router.get("/", async (req, res) => {
  try {
    await resetDatabase();
    res.status(200).send(success("数据库已清空并重新初始化"));
  } catch {
    res.status(500).send(error("清除失败，原数据已保留"));
  }
});
