// src/dashboards/RadiologistDashboard.jsx  (RADIOLOGIST)
import { useEffect, useMemo, useState } from "react";
import { useToast } from "../components/ToastCenter";
import { supabase } from "../lib/supabase";
import useSuccessToast from "../utils/useSuccessToast";

/**
 * MUST match the bucket used by RadTech upload:
 * supabase.storage.from("<BUCKET>").upload(...)
 */
const BUCKET = "xray-results";

function FieldLabel({ children }) {
  return <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>{children}</div>;
}

function Badge({ status }) {
  const s = String(status || "pending").toLowerCase();
  const label =
    s === "completed" ? "Completed" : s === "uploaded" ? "Uploaded" : s === "claimed" ? "Claimed" : "Pending";

  const bg =
    s === "completed"
      ? "rgba(34,197,94,0.16)"
      : s === "uploaded"
      ? "rgba(59,130,246,0.16)"
      : s === "claimed"
      ? "rgba(234,179,8,0.16)"
      : "rgba(148,163,184,0.12)";

  const br =
    s === "completed"
      ? "rgba(34,197,94,0.35)"
      : s === "uploaded"
      ? "rgba(59,130,246,0.35)"
      : s === "claimed"
      ? "rgba(234,179,8,0.35)"
      : "rgba(148,163,184,0.25)";

  const color =
    s === "completed"
      ? "rgba(34,197,94,0.95)"
      : s === "uploaded"
      ? "rgba(59,130,246,0.95)"
      : s === "claimed"
      ? "rgba(234,179,8,0.95)"
      : "rgba(148,163,184,0.95)";

  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        border: `1px solid ${br}`,
        background: bg,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export default function RadiologistDashboard({ session }) {
  const userId = session?.user?.id;

  const [msg, setMsg] = useState("");
  const { showToast } = useToast();
  useSuccessToast(msg, showToast);
  const [loading, setLoading] = useState(false);

  const [queue, setQueue] = useState([]);
  const [patientNameMap, setPatientNameMap] = useState({});

  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState(null); // merged queue row
  const [xrayRow, setXrayRow] = useState(null); // raw xray_results row
  const [fileUrl, setFileUrl] = useState("");
  const [fileErr, setFileErr] = useState("");

  const [findings, setFindings] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  function patientName(id) {
    return patientNameMap[id]?.trim() || "(No name)";
  }

  async function loadPatientNames(ids) {
    const uniq = Array.from(new Set((ids || []).filter(Boolean)));
    if (!uniq.length) return;

    const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", uniq);
    if (error || !data) return;

    setPatientNameMap((prev) => {
      const next = { ...prev };
      data.forEach((p) => (next[p.id] = p.full_name || ""));
      return next;
    });
  }

  /**
   * ✅ Radiologist queue source:
   * xray_results where status='uploaded' AND file_path IS NOT NULL
   * (optionally joined to appointments for search/type display)
   */
  async function loadQueue() {
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("xray_results")
      .select(
        `
        appointment_id,
        patient_id,
        status,
        file_path,
        exam_date,
        updated_at,
        appointments:appointment_id (
          id,
          appointment_type,
          status
        )
      `
      )
      .eq("status", "uploaded")
      .not("file_path", "is", null)
      .order("updated_at", { ascending: true });

    if (error) {
      setQueue([]);
      setMsg("Failed to load queue: " + error.message);
      setLoading(false);
      return;
    }

    const rows =
      (data || [])
        .map((r) => {
          const apptStatus = String(r.appointments?.status || "").toLowerCase();
          if (apptStatus === "rejected" || apptStatus === "cancelled" || apptStatus === "canceled") return null;
          return {
            appointment_id: r.appointment_id,
            patient_id: r.patient_id,
            status: r.status || "uploaded",
            file_path: r.file_path,
            exam_date: r.exam_date,
            appointment_type: r.appointments?.appointment_type || "",
          };
        })
        .filter((r) => !!r?.appointment_id && !!r?.patient_id) || [];

    setQueue(rows);
    await loadPatientNames(rows.map((x) => x.patient_id));
    setLoading(false);

    // if the currently-open case disappeared (finalized elsewhere), close it
    if (selected?.appointment_id) {
      const stillThere = rows.some((r) => r.appointment_id === selected.appointment_id);
      if (!stillThere) {
        setSelected(null);
        setXrayRow(null);
        setFileUrl("");
        setFileErr("");
        setFindings("");
        setRemarks("");
      }
    }
  }

  useEffect(() => {
    loadQueue();

    const ch = supabase
      .channel("radiologist-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "xray_results" }, loadQueue)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointment_steps" }, loadQueue)
      .subscribe();

    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredQueue = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return queue;

    return (queue || []).filter((r) => {
      const name = patientName(r.patient_id).toLowerCase();
      const type = String(r.appointment_type || "").toLowerCase();
      const date = String(r.exam_date || "").toLowerCase();
      return name.includes(q) || type.includes(q) || date.includes(q);
    });
  }, [queue, search, patientNameMap]);

  const isPdf = useMemo(() => {
    const path = xrayRow?.file_path || "";
    return path.toLowerCase().endsWith(".pdf");
  }, [xrayRow]);

  async function buildFileUrl(filePath) {
    // Prefer signed URL (works for private buckets)
    const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60 * 10);
    if (!signErr && signed?.signedUrl) return { url: signed.signedUrl, err: "" };

    // Fallback: public URL (works only if bucket/file is public)
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    if (pub?.publicUrl) return { url: pub.publicUrl, err: signErr?.message || "" };

    return { url: "", err: signErr?.message || "Failed to generate file URL." };
  }

  async function openCase(row) {
    setSelected(row);
    setMsg("");
    setSaving(false);
    setFileUrl("");
    setFileErr("");

    // Always fetch the latest xray_results row (with file_path)
    const { data, error } = await supabase
      .from("xray_results")
      .select("*")
      .eq("appointment_id", row.appointment_id)
      .maybeSingle();

    if (error) {
      setXrayRow(null);
      setMsg("Failed to load xray_results: " + error.message);
      return;
    }

    const xr = data || null;
    setXrayRow(xr);

    // Your schema already uses these columns (based on your earlier screenshots/code)
    setFindings(xr?.findings || "");
    setRemarks(xr?.remarks || "");

    if (!xr?.file_path) {
      setFileUrl("");
      setFileErr("No file_path found for this case (RadTech must upload).");
      return;
    }

    const { url, err } = await buildFileUrl(xr.file_path);
    setFileUrl(url);
    setFileErr(err || "");
    if (!url) setMsg(`Failed to generate file URL: ${err || "Object not found"}`);
  }

  async function finalize() {
    try {
      setMsg("");
      if (!userId) throw new Error("No session user. Please relogin.");
      if (!selected?.appointment_id) throw new Error("No case selected.");
      if (!xrayRow?.file_path) throw new Error("No uploaded file found for this case.");

      // ✅ REQUIRED: Findings must be filled
      if (!(findings || "").trim()) throw new Error("Findings is required before finalizing.");

      setSaving(true);

      // 1) Save radiologist data to xray_results
      // (Admin patient report should read from xray_results.findings/remarks/status)
      const { error: xrErr } = await supabase
        .from("xray_results")
        .update({
          findings: findings.trim(),
          remarks: (remarks || "").trim() || null,
          radiologist_id: userId, // keep only if your column exists
          status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("appointment_id", selected.appointment_id);

      if (xrErr) throw xrErr;

      // 2) Mark workflow completed so it dissolves everywhere
      const { error: stErr } = await supabase
        .from("appointment_steps")
        .update({ xray_status: "completed", updated_at: new Date().toISOString() })
        .eq("appointment_id", selected.appointment_id);

      if (stErr) throw stErr;

      // dissolve from radiologist UI ONLY after finalize ✅
      setSelected(null);
      setXrayRow(null);
      setFileUrl("");
      setFileErr("");
      setFindings("");
      setRemarks("");

      setMsg("Finalized ✅ Marked completed ✅");
      await loadQueue();
    } catch (e) {
      setMsg("Finalize failed: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Header */}
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ marginBottom: 6 }}>Radiologist Dashboard</h3>
          <div style={{ opacity: 0.8, fontSize: 13 }}>Queue shows X-rays uploaded by RadTech</div>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>
            Logged in as: <b>{session?.user?.email}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patient / type / exam date..."
            style={styles.input}
          />
        </div>
      </div>

      {msg ? <p style={{ margin: 0 }}>{msg}</p> : null}

      <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 14 }}>
        {/* Queue */}
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 900 }}>Radiologist Queue</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Status: uploaded • file_path present</div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{filteredQueue.length} case(s)</div>
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Type</th>
                  <th>Exam Date</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredQueue.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ opacity: 0.7 }}>
                      No uploaded cases.
                    </td>
                  </tr>
                ) : (
                  filteredQueue.map((r) => {
                    const isSelected = selected?.appointment_id === r.appointment_id;
                    return (
                      <tr
                        key={r.appointment_id}
                        style={isSelected ? { background: "rgba(255,255,255,0.04)" } : undefined}
                      >
                        <td>
                          <b>{patientName(r.patient_id)}</b>
                        </td>
                        <td>{r.appointment_type || "—"}</td>
                        <td>{r.exam_date || "—"}</td>
                        <td>
                          <Badge status={r.status} />
                        </td>
                        <td>
                          <button onClick={() => openCase(r)}>Open</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reader */}
        <div className="card" style={{ padding: 12 }}>
          {!selected ? (
            <div style={{ opacity: 0.75 }}>Select a case to read.</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>X-ray Reading</div>
                <Badge status={xrayRow?.status || selected.status} />
              </div>

              {/* ✅ Per your request: remove Appointment + Preferred Date */}
              <div style={{ marginTop: 8, opacity: 0.85, lineHeight: 1.6 }}>
                Patient: <b>{patientName(selected.patient_id)}</b>
                <br />
                Exam Date: <b>{xrayRow?.exam_date || selected.exam_date || "—"}</b>
              </div>

              {/* File preview */}
              {!xrayRow?.file_path ? (
                <div style={{ marginTop: 12, opacity: 0.8 }}>No upload found (RadTech needs to upload).</div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <FieldLabel>Uploaded X-ray (Bucket: {BUCKET})</FieldLabel>

                  {fileUrl ? (
                    <>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <a href={fileUrl} target="_blank" rel="noreferrer">
                          Open File
                        </a>
                        <span style={{ fontSize: 12, opacity: 0.75 }}>{xrayRow.file_path}</span>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        {isPdf ? (
                          <iframe
                            title="X-ray PDF"
                            src={fileUrl}
                            style={{
                              width: "100%",
                              height: 520,
                              border: "1px solid rgba(255,255,255,0.10)",
                              borderRadius: 12,
                            }}
                          />
                        ) : (
                          <img
                            src={fileUrl}
                            alt="X-ray"
                            style={{
                              width: "100%",
                              border: "1px solid rgba(255,255,255,0.10)",
                              borderRadius: 12,
                            }}
                            onError={() => {
                              // if the image tag fails, still allow open link
                              setFileErr("Preview failed to load. Use “Open File” to view.");
                            }}
                          />
                        )}
                      </div>

                      {fileErr ? <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>{fileErr}</div> : null}
                    </>
                  ) : (
                    <div style={{ opacity: 0.8 }}>Loading file preview…</div>
                  )}
                </div>
              )}

              {/* Findings / Remarks */}
              <div style={{ marginTop: 12 }}>
                <FieldLabel>
                  Findings <span style={{ opacity: 0.9 }}>(required)</span>
                </FieldLabel>
                <textarea
                  rows={6}
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  style={styles.textarea}
                  placeholder="Radiologist findings..."
                  disabled={saving}
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <FieldLabel>Remarks</FieldLabel>
                <textarea
                  rows={4}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  style={styles.textarea}
                  placeholder="Remarks / recommendations..."
                  disabled={saving}
                />
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={finalize} disabled={saving || !(findings || "").trim()}>
                  {saving ? "Saving..." : "Finalize & Mark Completed"}
                </button>

                <button
                  onClick={() => {
                    setSelected(null);
                    setXrayRow(null);
                    setFileUrl("");
                    setFileErr("");
                    setFindings("");
                    setRemarks("");
                    setMsg("");
                  }}
                  disabled={saving}
                >
                  Close
                </button>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                Finalize saves to <b>xray_results.findings</b> / <b>xray_results.remarks</b>, sets{" "}
                <b>xray_results.status = completed</b> and <b>appointment_steps.xray_status = completed</b> (then the case
                dissolves).
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  input: {
    width: 320,
    maxWidth: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    outline: "none",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "inherit",
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    outline: "none",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "inherit",
    resize: "vertical",
  },
};
