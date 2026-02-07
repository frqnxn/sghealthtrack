import express from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const router = express.Router();

// Example: POST /api/report/generate
// body: { data: { patient: "...", date: "...", ... } }
router.post("/generate", async (req, res) => {
  try {
    const data = req.body?.data || {};
    const outDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

    const filename = `medical_report_${Date.now()}.pdf`;
    const output = path.join(outDir, filename);

    const scriptPath = path.join(process.cwd(), "tools", "generate_medical_report_digital.py");

    const payload = JSON.stringify({ output, data });

    const py = spawn("python", [scriptPath, payload]);

    let stderr = "";
    py.stderr.on("data", (d) => (stderr += d.toString()));

    py.on("close", (code) => {
      if (code !== 0) {
        return res.status(500).json({ error: "PDF generation failed", details: stderr });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

      const stream = fs.createReadStream(output);
      stream.pipe(res);
      stream.on("end", () => {
        // cleanup
        fs.unlink(output, () => {});
      });
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
});

export default router;
