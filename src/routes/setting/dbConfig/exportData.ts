import express from "express";
import { error } from "@/lib/responseFormat";
import { exportDatabase } from "@/utils/databaseBackup";

const router = express.Router();
export default router.get("/", async (req, res) => {
  try {
    const data = await exportDatabase();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename=toonflow-backup-${data.exportTime}.json`);
    res.status(200).send(JSON.stringify(data, null, 2));
  } catch {
    res.status(500).send(error("数据库导出失败"));
  }
});
