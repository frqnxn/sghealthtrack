import express from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

const supabaseService = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ARCHIVE_TABLES = [
  { name: "profiles", dateColumn: "created_at", filters: [{ col: "role", op: "eq", value: "patient" }] },
  { name: "patient_profiles", dateColumn: "created_at" },
  { name: "appointments", dateColumn: "created_at" },
  { name: "appointment_steps", dateColumn: "updated_at" },
  { name: "appointment_requirements", dateColumn: "updated_at" },
  { name: "appointment_notes", dateColumn: "created_at" },
  { name: "appointment_triage", dateColumn: "created_at" },
  { name: "vitals", dateColumn: "created_at" },
  { name: "lab_results", dateColumn: "created_at" },
  { name: "doctor_reports", dateColumn: "updated_at" },
  { name: "payments", dateColumn: "created_at" },
  { name: "notifications", dateColumn: "created_at" },
  { name: "activity_logs", dateColumn: "created_at" },
];

const XRAY_BUCKET = process.env.XRAY_BUCKET || "xray-results";
const XRAY_ARCHIVE_PREFIX = process.env.XRAY_ARCHIVE_PREFIX || "archive";
const DEFAULT_BATCH_SIZE = 200;

function fiveYearsAgoIso() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString();
}

function applyFilters(query, filters = []) {
  return filters.reduce((q, f) => {
    if (f.op === "not") return q.not(f.col, f.operator || "is", f.value);
    return q[f.op](f.col, f.value);
  }, query);
}

async function countMatches(table, dateColumn, cutoffIso, filters) {
  let query = supabaseService
    .from(table)
    .select("id", { count: "exact", head: true })
    .lt(dateColumn, cutoffIso)
    .is("archived_at", null);
  query = applyFilters(query, filters);
  const { count, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}

async function archiveTable(table, dateColumn, cutoffIso, nowIso, filters) {
  let query = supabaseService
    .from(table)
    .update({ archived_at: nowIso }, { count: "exact" })
    .lt(dateColumn, cutoffIso)
    .is("archived_at", null)
    .select("id");
  query = applyFilters(query, filters);
  const { count, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}

async function archiveXrayFiles(cutoffIso, nowIso, batchSize) {
  const results = {
    bucket: XRAY_BUCKET,
    moved: 0,
    updated: 0,
    dataOnlyUpdated: 0,
    skipped: 0,
    errors: [],
  };

  const { data, error } = await supabaseService
    .from("xray_results")
    .select("id, file_path")
    .lt("updated_at", cutoffIso)
    .is("archived_at", null)
    .not("file_path", "is", null)
    .limit(batchSize);

  if (error) throw new Error(`xray_results: ${error.message}`);
  if (!data?.length) return results;

  for (const row of data) {
    const filePath = String(row.file_path || "");
    if (!filePath) {
      results.skipped += 1;
      continue;
    }
    if (filePath.startsWith(`${XRAY_ARCHIVE_PREFIX}/`)) {
      const { error: updateErr } = await supabaseService
        .from("xray_results")
        .update({ archived_at: nowIso })
        .eq("id", row.id);
      if (updateErr) {
        results.errors.push({ id: row.id, file_path: filePath, error: updateErr.message });
      } else {
        results.updated += 1;
      }
      continue;
    }

    const archivePath = `${XRAY_ARCHIVE_PREFIX}/${filePath}`;
    const { error: moveErr } = await supabaseService.storage
      .from(XRAY_BUCKET)
      .move(filePath, archivePath);

    if (moveErr) {
      results.errors.push({ id: row.id, file_path: filePath, error: moveErr.message });
      continue;
    }

    const { error: updateErr } = await supabaseService
      .from("xray_results")
      .update({ file_path: archivePath, archived_at: nowIso })
      .eq("id", row.id);

    if (updateErr) {
      results.errors.push({ id: row.id, file_path: archivePath, error: updateErr.message });
      continue;
    }

    results.moved += 1;
    results.updated += 1;
  }

  const { count: dataOnlyCount, error: dataOnlyErr } = await supabaseService
    .from("xray_results")
    .update({ archived_at: nowIso }, { count: "exact" })
    .lt("updated_at", cutoffIso)
    .is("archived_at", null)
    .is("file_path", null)
    .select("id");

  if (dataOnlyErr) {
    results.errors.push({ id: null, file_path: null, error: dataOnlyErr.message });
  } else {
    results.dataOnlyUpdated = dataOnlyCount || 0;
    results.updated += results.dataOnlyUpdated;
  }

  return results;
}

router.post(
  "/run",
  requireAuth,
  requireRole(["admin"]),
  async (req, res) => {
    try {
      const dryRun = !!req.body?.dryRun;
      const includeFiles = req.body?.includeFiles !== false;
      const batchSize = Number(req.body?.batchSize) || DEFAULT_BATCH_SIZE;
      const cutoffIso = String(req.body?.cutoffIso || fiveYearsAgoIso());
      const nowIso = new Date().toISOString();

      const response = {
        ok: true,
        dryRun,
        includeFiles,
        cutoffIso,
        archivedAt: nowIso,
        tables: {},
        files: null,
      };

      for (const t of ARCHIVE_TABLES) {
        if (dryRun) {
          const matches = await countMatches(t.name, t.dateColumn, cutoffIso, t.filters);
          response.tables[t.name] = { matches };
        } else {
          const updated = await archiveTable(t.name, t.dateColumn, cutoffIso, nowIso, t.filters);
          response.tables[t.name] = { updated };
        }
      }

      if (includeFiles) {
        if (dryRun) {
          const matches = await countMatches("xray_results", "updated_at", cutoffIso, [
            { col: "file_path", op: "not", operator: "is", value: null },
          ]);
          response.files = { bucket: XRAY_BUCKET, matches };
        } else {
          response.files = await archiveXrayFiles(cutoffIso, nowIso, batchSize);
        }
      }

      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err.message || "Archive run failed" });
    }
  }
);

export default router;
