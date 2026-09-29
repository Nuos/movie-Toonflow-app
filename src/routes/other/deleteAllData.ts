import express from "express";
import { resetDatabase } from "@/utils/databaseBackup";
import { success, error } from "@/lib/responseFormat";
const router = express.Router();
export default router.post("/", async (req, res) => {
  try {
    await resetDatabase();
    res.status(200).send(success({ message: "清空数据表成功" }));
  } catch {
    res.status(500).send(error("清除失败，原数据已保留"));
  }
});
