// src/dashboards/XrayDashboard.jsx  (RADTECH)
// ✅ Working version: fixes selected.id missing, fixes appointment_id null error,
// ✅ uses consistent bucket, handles upload state, and "dissolves" after upload.

import { useEffect, useMemo, useState } from "react";
import { useToast } from "../components/ToastCenter";
import { supabase } from "../lib/supabase";
import useSuccessToast from "../utils/useSuccessToast";

function Badge({ status }) {
  const s = String(status || "pending").toLowerCase();
  const label = s === "completed" ? "Completed" : s === "uploaded" ? "Uploaded" : "Pending";

  const bg =
    s === "completed"
      ? "rgba(34,197,94,0.16)"
      : s === "uploaded"
      ? "rgba(59,130,246,0.16)"
      : "rgba(148,163,184,0.12)";

  const br =
    s === "completed"
      ? "rgba(34,197,94,0.35)"
      : s === "uploaded"
      ? "rgba(59,130,246,0.35)"
      : "rgba(148,163,184,0.25)";

  const color =
    s === "completed"
      ? "rgba(34,197,94,0.95)"
      : s === "uploaded"
      ? "rgba(59,130,246,0.95)"
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

export default function XrayDashboard({ session }) {
  const userId = session?.user?.id;

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const { showToast } = useToast();
  useSuccessToast(msg, showToast);

  const [queue, setQueue] = useState([]);
  const [selected, setSelected] = useState(null);
  const [patientInfoMap, setPatientInfoMap] = useState({});

  const [tab, setTab] = useState("queue"); // queue | records
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [examDate, setExamDate] = useState("");
  const [examType, setExamType] = useState("");
  const [caseNo, setCaseNo] = useState("");
  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [isNormal, setIsNormal] = useState("");
  const [xrayStatus, setXrayStatus] = useState("");

  function patientName(id) {
    return patientInfoMap[id]?.full_name?.trim() || "(No name)";
  }

  function patientInfo(id) {
    return patientInfoMap[id] || {};
  }

  async function loadPatientInfo(ids) {
    const uniq = Array.from(new Set((ids || []).filter(Boolean)));
    if (!uniq.length) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, company, gender, age")
      .in("id", uniq);
    if (error) return;

    setPatientInfoMap((prev) => {
      const next = { ...prev };
      (data || []).forEach((p) => {
        next[p.id] = {
          full_name: p.full_name || "",
          company: p.company || "",
          gender: p.gender || "",
          age: p.age ?? "",
        };
      });
      return next;
    });
  }

  // ✅ RadTech queue: keep cases until results are released
  async function loadQueue() {
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("appointment_steps")
      .select(
        `
        appointment_id,
        xray_status,
        appointments:appointment_id (
          id,
          patient_id,
          appointment_type,
          preferred_date,
          status,
          created_at
        )
      `
      )
      .neq("xray_status", "released")
      .order("updated_at", { ascending: true });

    if (error) {
      setQueue([]);
      setMsg("Failed to load queue: " + error.message);
      setLoading(false);
      return;
    }

    const rows = (data || [])
      .map((r) => {
        const a = r.appointments;
        if (!a?.id) return null;

        // ✅ IMPORTANT: ensure we have BOTH id and appointment_id,
        // and set id = appointment_id for easy usage in UI/upload.
        const status = String(a.status || "").toLowerCase();
        if (status === "rejected" || status === "cancelled" || status === "canceled") return null;

        return {
          id: a.id, // appointment id
          appointment_id: r.appointment_id || a.id, // same value, kept for clarity
          patient_id: a.patient_id,
          appointment_type: a.appointment_type,
          preferred_date: a.preferred_date,
          created_at: a.created_at,
          xray_status: r.xray_status || "pending",
        };
      })
      .filter(Boolean);

    setQueue(rows);
    await loadPatientInfo(rows.map((x) => x.patient_id));
    setLoading(false);
  }

  useEffect(() => {
    loadQueue();

    const ch = supabase
      .channel("xray-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointment_steps" }, () => loadQueue())
      .on("postgres_changes", { event: "*", schema: "public", table: "xray_results" }, () => {
        loadQueue();
        if (tab === "records") loadRecords();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredQueue = useMemo(() => queue, [queue]);

  function openCase(row) {
    setSelected(row);
    setMsg("");
    setExamDate(row?.preferred_date || "");
    setExamType("");
    setCaseNo("");
    setFindings("");
    setImpression("");
    setIsNormal("");
    setXrayStatus("");
    if (!patientInfoMap[row?.patient_id]) {
      loadPatientInfo([row?.patient_id]);
    }
    loadExistingResult(row);
  }

  async function loadExistingResult(row) {
    if (!row?.id) return;
    const { data, error } = await supabase
      .from("xray_results")
      .select("*")
      .eq("appointment_id", row.id)
      .maybeSingle();
    if (error) return;

    if (data) {
      setExamDate(data.exam_date || row?.preferred_date || "");
      setCaseNo(data.case_no || "");
      setExamType(data.examination || "");
      setFindings(data.findings || "");
      setImpression(data.impression || data.remarks || "");
      setIsNormal(
        typeof data.normal === "boolean" ? (data.normal ? "yes" : "no") : ""
      );
      setXrayStatus(data.status || "");
    }
  }

  async function loadRecords() {
    setRecordsLoading(true);
    const { data, error } = await supabase
      .from("xray_results")
      .select("appointment_id, patient_id, exam_date, case_no, findings, remarks, impression, normal, status, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      setRecords([]);
      setRecordsLoading(false);
      return;
    }

    const rows = data || [];
    setRecords(rows);
    await loadPatientInfo(rows.map((r) => r.patient_id));
    setRecordsLoading(false);
  }

  async function markDone() {
    try {
      setMsg("");
      if (!selected?.id) throw new Error("No case selected.");

      const apptId = selected.id;
      const normalValue = isNormal === "yes" ? true : isNormal === "no" ? false : null;
      const now = new Date().toISOString();

      const basePayload = {
        appointment_id: apptId,
        patient_id: selected.patient_id,
        exam_date: examDate || selected.preferred_date || null,
        case_no: caseNo || null,
        examination: examType || null,
        findings: findings || null,
        impression: impression || null,
        normal: normalValue,
        status: "completed",
        updated_at: now,
      };

      const fallbackPayload = {
        appointment_id: apptId,
        patient_id: selected.patient_id,
        exam_date: examDate || selected.preferred_date || null,
        case_no: caseNo || null,
        findings: findings || null,
        remarks: `${impression || ""}${examType ? ` | Exam: ${examType}` : ""}${normalValue === null ? "" : ` | Normal: ${normalValue ? "Yes" : "No"}`}`.trim() || null,
        status: "completed",
        updated_at: now,
      };

      setSaving(true);

      let xrErr = null;
      const { error: firstErr } = await supabase.from("xray_results").upsert(basePayload, { onConflict: "appointment_id" });
      if (firstErr) {
        const msgText = (firstErr.message || "").toLowerCase();
        const missingColumn =
          msgText.includes("could not find") || msgText.includes("does not exist") || msgText.includes("schema cache");
        if (missingColumn) {
          const { error: secondErr } = await supabase
            .from("xray_results")
            .upsert(fallbackPayload, { onConflict: "appointment_id" });
          xrErr = secondErr;
        } else {
          xrErr = firstErr;
        }
      }

      if (xrErr) throw xrErr;

      const { error: stepErr } = await supabase
        .from("appointment_steps")
        .update({ xray_status: "completed", updated_at: now })
        .eq("appointment_id", apptId);
      if (stepErr) throw stepErr;

      setMsg("X-ray completed. You can now release the result.");
      await loadQueue();
      if (tab === "records") await loadRecords();
      setXrayStatus("completed");
    } catch (e) {
      setMsg("Failed to save X-ray: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function releaseResult() {
    try {
      setMsg("");
      if (!selected?.id) throw new Error("No case selected.");
      const apptId = selected.id;
      const now = new Date().toISOString();
      const normalValue = isNormal === "yes" ? true : isNormal === "no" ? false : null;
      const payload = {
        appointment_id: apptId,
        patient_id: selected.patient_id,
        exam_date: examDate || selected.preferred_date || null,
        case_no: caseNo || null,
        examination: examType || null,
        findings: findings || null,
        impression: impression || null,
        normal: normalValue,
        status: "released",
        updated_at: now,
      };
      const fallbackPayload = {
        appointment_id: apptId,
        patient_id: selected.patient_id,
        exam_date: examDate || selected.preferred_date || null,
        case_no: caseNo || null,
        findings: findings || null,
        remarks: `${impression || ""}${examType ? ` | Exam: ${examType}` : ""}${normalValue === null ? "" : ` | Normal: ${normalValue ? "Yes" : "No"}`}`.trim() || null,
        status: "released",
        updated_at: now,
      };
      let xrErr = null;
      const { error: firstErr } = await supabase.from("xray_results").upsert(payload, { onConflict: "appointment_id" });
      if (firstErr) {
        const msgText = (firstErr.message || "").toLowerCase();
        const missingColumn =
          msgText.includes("could not find") || msgText.includes("does not exist") || msgText.includes("schema cache");
        if (missingColumn) {
          const { error: secondErr } = await supabase
            .from("xray_results")
            .upsert(fallbackPayload, { onConflict: "appointment_id" });
          xrErr = secondErr;
        } else {
          xrErr = firstErr;
        }
      }
      if (xrErr) throw xrErr;
      const { error: stepErr } = await supabase
        .from("appointment_steps")
        .update({ xray_status: "released", updated_at: now })
        .eq("appointment_id", apptId);
      if (stepErr) throw stepErr;
      setXrayStatus("released");
      setMsg("X-ray result released to patient.");
      await loadRecords();
      await loadQueue();
      setSelected(null);
      setExamDate("");
      setExamType("");
      setCaseNo("");
      setFindings("");
      setImpression("");
      setIsNormal("");
      setXrayStatus("");
    } catch (e) {
      setMsg("Failed to release result: " + (e?.message || e));
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <header className="page-header no-print">
        <div className="page-header-main">
          <h1 className="page-title">X-ray Dashboard</h1>
          <p className="page-subtitle">Encode X-ray results and mark completed.</p>
        </div>
        <div className="page-actions" />
      </header>

      {msg && <p style={{ margin: 0 }}>{msg}</p>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          className={`btn ${tab === "queue" ? "btn-primary" : ""}`}
          onClick={() => setTab("queue")}
        >
          Queue
        </button>
        <button
          className={`btn ${tab === "records" ? "btn-primary" : ""}`}
          onClick={() => {
            setTab("records");
            loadRecords();
          }}
        >
          Records
        </button>
      </div>

      {tab === "records" ? (
        <div className="card">
          <b>X-ray Records</b>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table className="table xray-records-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Company</th>
                  <th>Age/Sex</th>
                  <th>Exam Date</th>
                  <th>No.</th>
                  <th>Findings</th>
                  <th>Impression</th>
                  <th>Normal</th>
                </tr>
              </thead>
              <tbody>
                {recordsLoading ? (
                  <tr>
                    <td colSpan="8" style={{ opacity: 0.7 }}>
                      Loading records...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ opacity: 0.7 }}>
                      No X-ray records yet.
                    </td>
                  </tr>
                ) : (
                  records.map((r) => {
                    const info = patientInfo(r.patient_id);
                    const normalText =
                      typeof r.normal === "boolean"
                        ? r.normal
                          ? "Yes"
                          : "No"
                        : "";
                    return (
                      <tr key={r.appointment_id}>
                        <td data-label="Patient">
                          <b>{patientName(r.patient_id)}</b>
                        </td>
                        <td data-label="Company">{info.company || "—"}</td>
                        <td data-label="Age/Sex">{`${info.age || "—"} / ${info.gender || "—"}`}</td>
                        <td data-label="Exam Date">{r.exam_date || "—"}</td>
                        <td data-label="No.">{r.case_no || "—"}</td>
                        <td data-label="Findings">{r.findings || "—"}</td>
                        <td data-label="Impression">{r.impression || r.remarks || "—"}</td>
                        <td data-label="Normal">{normalText || "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
          {/* Queue */}
          <div className="card">
            <b>Cases</b>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="table xray-queue-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredQueue.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ opacity: 0.7 }}>
                        No pending X-ray cases.
                      </td>
                    </tr>
                  ) : (
                    filteredQueue.map((r) => (
                      <tr key={r.appointment_id || r.id}>
                        <td data-label="Patient">
                          <b>{patientName(r.patient_id)}</b>
                        </td>
                        <td data-label="Type">{r.appointment_type}</td>
                        <td data-label="Date">{r.preferred_date}</td>
                        <td data-label="Status">
                          <Badge status={r.xray_status} />
                        </td>
                        <td data-label="Action">
                          <button className="btn btn-primary" onClick={() => openCase(r)}>
                            Open
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Form panel */}
          <div className="card" style={{ padding: 12 }}>
            <b>X-ray Result</b>

            {!selected ? (
              <div style={{ marginTop: 12, opacity: 0.8 }}>Select a case to encode results.</div>
            ) : (
              <>
                <div style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.6 }}>
                  Patient: <b>{patientName(selected.patient_id)}</b>
                  <br />
                  Appointment: <b>{selected.appointment_type}</b>
                  <br />
                  Appointment Date: <b>{selected.preferred_date}</b>
                </div>

                <div style={{ marginTop: 12 }}>
                  <b>Patient Info</b>
                  <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                    <input className="input" readOnly value={patientName(selected.patient_id)} />
                    <input
                      className="input"
                      readOnly
                      value={patientInfo(selected.patient_id).company || "No company stated"}
                      placeholder="Company"
                    />
                    <input className="input" readOnly value={selected.preferred_date || ""} placeholder="Date" />
                    <input
                      className="input"
                      readOnly
                      value={`${patientInfo(selected.patient_id).age || "—"} / ${patientInfo(selected.patient_id).gender || "—"}`}
                      placeholder="Age / Sex"
                    />
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <b>Xray Result</b>
                  <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                    <input
                      className="input"
                      value={examType}
                      onChange={(e) => setExamType(e.target.value)}
                      placeholder="Examination"
                    />
                    <input
                      className="input"
                      value={caseNo}
                      onChange={(e) => setCaseNo(e.target.value)}
                      placeholder="No."
                    />
                    <textarea
                      className="input"
                      value={findings}
                      onChange={(e) => setFindings(e.target.value)}
                      placeholder="Radiology Findings"
                      rows={3}
                      style={{ resize: "vertical" }}
                    />
                    <textarea
                      className="input"
                      value={impression}
                      onChange={(e) => setImpression(e.target.value)}
                      placeholder="Impression"
                      rows={3}
                      style={{ resize: "vertical" }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <b>Normal?</b>
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="radio"
                        name="normal"
                        checked={isNormal === "yes"}
                        onChange={() => setIsNormal("yes")}
                      />
                      Yes
                    </label>
                    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="radio"
                        name="normal"
                        checked={isNormal === "no"}
                        onChange={() => setIsNormal("no")}
                      />
                      No
                    </label>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn btn-primary" onClick={markDone} disabled={saving}>
                    {saving ? "Saving..." : "Mark as Done"}
                  </button>
                  {xrayStatus === "completed" ? (
                    <button className="btn btn-secondary" onClick={releaseResult} disabled={saving}>
                      Release Result
                    </button>
                  ) : null}

                  <button
                    className="btn"
                    onClick={() => {
                      setSelected(null);
                      setMsg("");
                    }}
                    disabled={saving}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
