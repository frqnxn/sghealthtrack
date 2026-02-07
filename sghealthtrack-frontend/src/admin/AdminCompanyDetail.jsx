// src/admin/AdminCompanyDetail.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

function toLower(v) {
  return String(v || "").toLowerCase();
}

function formatWorkflowLabel(value) {
  const s = String(value || "").trim();
  if (!s) return "—";
  const lower = s.toLowerCase();
  if (lower === "ready_for_triage") return "Ready for Screening";
  if (lower === "awaiting_forms") return "Awaiting Forms";
  const spaced = lower.replace(/_/g, " ").replace(/\btriage\b/g, "screening");
  return spaced.replace(/\b\w/g, (m) => m.toUpperCase());
}

function fmtDate(v) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString();
  } catch {
    return String(v);
  }
}

function fmtDateTime(v) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function downloadCSV(filename, rows) {
  const header = Object.keys(rows[0] || {});
  const esc = (s) => {
    const v = String(s ?? "");
    const q = v.replace(/"/g, '""');
    return `"${q}"`;
  };

  const lines = [
    header.join(","),
    ...rows.map((r) => header.map((k) => esc(r[k])).join(",")),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function Drawer({ open, title, onClose, children, width = 460 }) {
  if (!open) return null;

  return (
    <>
      <div
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 9998,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width,
          maxWidth: "96vw",
          zIndex: 9999,
          padding: 12,
        }}
      >
        <div className="card" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div
            style={{
              padding: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              borderBottom: "1px solid rgba(148,163,184,0.18)",
            }}
          >
            <div style={{ fontWeight: 900 }}>{title}</div>
            <button className="btn" onClick={onClose} style={{ padding: "6px 10px" }}>
              ✕
            </button>
          </div>

          <div style={{ padding: 14, overflow: "auto" }}>{children}</div>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 800, opacity: 0.92, marginBottom: 8 }}>{title}</div>
      <div className="card" style={{ padding: 12 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, mono = false }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, padding: "6px 0" }}>
      <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: mono ? "monospace" : undefined }}>{value ?? "—"}</div>
    </div>
  );
}

export default function AdminCompanyDetail({ company, onBack }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientDrawerOpen, setPatientDrawerOpen] = useState(false);
  const [patientHistory, setPatientHistory] = useState({ vitals: [], labs: [], xrays: [] });
  const [patientHistoryLoading, setPatientHistoryLoading] = useState(false);

  async function loadPatients() {
    if (!company?.id) return;
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("admin_patient_summary")
      .select("*")
      .order("appointment_created_at", { ascending: false, nullsFirst: false });

    if (error) {
      setMsg(error.message);
      setPatients([]);
      setLoading(false);
      return;
    }

    const targetName = String(company?.name || "").trim().toLowerCase();
    const filtered = (data || []).filter((p) => {
      const companyName = String(p.company || p.company_name || "").trim().toLowerCase();
      return targetName && companyName === targetName;
    });

    setPatients(filtered);
    setLoading(false);
  }

  useEffect(() => {
    loadPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  async function loadPatientHistory(patientId) {
    if (!patientId) return;
    setPatientHistoryLoading(true);
    const vit = await supabase
      .from("vitals")
      .select("*")
      .eq("patient_id", patientId)
      .order("recorded_at", { ascending: false });
    const lab = await supabase
      .from("lab_results")
      .select("*")
      .eq("patient_id", patientId)
      .order("recorded_at", { ascending: false });
    const xr = await supabase
      .from("xray_results")
      .select("*")
      .eq("patient_id", patientId)
      .order("updated_at", { ascending: false });

    setPatientHistory({
      vitals: vit.error ? [] : vit.data || [],
      labs: lab.error ? [] : lab.data || [],
      xrays: xr.error ? [] : xr.data || [],
    });
    setPatientHistoryLoading(false);
  }

  function openPatientDrawer(pRow) {
    setSelectedPatient(pRow);
    setPatientDrawerOpen(true);
    loadPatientHistory(pRow?.patient_id);
  }

  function closePatientDrawer() {
    setPatientDrawerOpen(false);
  }

  const filteredPatients = useMemo(() => {
    let rows = patients.slice();

    if (status !== "all") {
      rows = rows.filter((p) => toLower(p.appointment_status || p.workflow_status || p.status) === status);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((p) => {
        const name = toLower(p.full_name);
        return (
          name.includes(q) ||
          toLower(p.patient_id).includes(q) ||
          toLower(p.contact_no).includes(q) ||
          toLower(p.address).includes(q) ||
          toLower(p.appointment_type).includes(q) ||
          toLower(p.appointment_status).includes(q)
        );
      });
    }

    return rows;
  }, [patients, search, status]);

  function exportPatientsCSV() {
    if (filteredPatients.length === 0) return;
    const rows = filteredPatients.map((p) => ({
      company: company?.name || "",
      patient_id: p.patient_id,
      full_name: p.full_name || "",
      contact_no: p.contact_no || "",
      address: p.address || "",
      gender: p.gender || "",
      age: p.age ?? "",
      civil_status: p.civil_status || "",
      appointment_type: p.appointment_type || "",
      preferred_date: p.preferred_date || "",
      appointment_status: p.appointment_status || "",
      appointment_created_at: p.appointment_created_at || "",
      height_cm: p.height_cm ?? "",
      weight_kg: p.weight_kg ?? "",
      systolic: p.systolic ?? "",
      diastolic: p.diastolic ?? "",
      heart_rate: p.heart_rate ?? "",
      temperature_c: p.temperature_c ?? "",
      vitals_recorded_at: p.vitals_created_at || p.recorded_at || "",
      blood_typing: p.blood_typing ?? "",
      cbc_platelet: p.cbc_platelet ?? "",
      lab_recorded_at: p.lab_recorded_at ?? "",
      xray_status: p.xray_status ?? "",
      xray_case_no: p.xray_case_no ?? "",
      xray_exam_date: p.xray_exam_date ?? "",
    }));
    downloadCSV(`${company?.name || "company"}-patients.csv`, rows);
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>Partner Company: {company?.name}</h3>
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            View patients and export summary files for this partner company.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        </div>
      </div>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1fr) auto auto",
          gap: 10,
          alignItems: "center",
        }}
      >
        <input
          placeholder="Search patients (name, id, contact, address, status...)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%" }}
        />

        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="awaiting_forms">Awaiting Forms</option>
          <option value="ready_for_triage">Ready for Screening</option>
          <option value="rejected">Rejected</option>
          <option value="released">Released</option>
        </select>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-secondary" onClick={exportPatientsCSV} disabled={filteredPatients.length === 0}>
            Export Patients CSV
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14, overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Contact</th>
              <th>Sex / Age</th>
              <th>Latest Appointment</th>
              <th>Vitals</th>
              <th>Labs</th>
              <th>X-ray</th>
            </tr>
          </thead>

          <tbody>
            {filteredPatients.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ opacity: 0.7 }}>
                  No patients for this company.
                </td>
              </tr>
            ) : (
              filteredPatients.map((p) => (
                <tr
                  key={p.patient_id}
                  style={{ cursor: "pointer" }}
                  onClick={() => openPatientDrawer(p)}
                  title="Click to open patient details"
                >
                  <td>
                    <b>{p.full_name || "—"}</b>
                    <div style={{ fontSize: 12, opacity: 0.7, fontFamily: "monospace" }}>{p.patient_id}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>{p.contact_no || "—"}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{p.address || "—"}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>
                      {(p.gender || "—")} • {(p.age ?? "—")}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{p.civil_status || "—"}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>
                      <b>{p.appointment_type || "—"}</b> • {fmtDate(p.preferred_date)}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Status: <b>{formatWorkflowLabel(p.appointment_status || p.workflow_status || p.status)}</b>
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {p.vitals_created_at || p.recorded_at ? (
                      <>
                        <div>
                          BP: <b>{p.systolic ?? "—"}/{p.diastolic ?? "—"}</b>
                        </div>
                        <div>
                          HR: <b>{p.heart_rate ?? "—"}</b> • Temp: <b>{p.temperature_c ?? "—"}</b>
                        </div>
                        <div style={{ opacity: 0.75, fontSize: 12 }}>
                          H/W: {p.height_cm ?? "—"} / {p.weight_kg ?? "—"}
                        </div>
                      </>
                    ) : (
                      <span style={{ opacity: 0.7 }}>—</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {p.lab_recorded_at ? (
                      <>
                        <div>
                          Blood typing: <b>{p.blood_typing ?? "—"}</b>
                        </div>
                        <div>
                          CBC platelet: <b>{p.cbc_platelet ?? "—"}</b>
                        </div>
                        <div style={{ opacity: 0.75, fontSize: 12 }}>Updated: {fmtDateTime(p.lab_recorded_at)}</div>
                      </>
                    ) : (
                      <span style={{ opacity: 0.7 }}>—</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {p.xray_exam_date || p.xray_status ? (
                      <>
                        <div>
                          Status: <b>{p.xray_status ?? "—"}</b>
                        </div>
                        <div>
                          Case: <b>{p.xray_case_no ?? "—"}</b>
                        </div>
                        <div style={{ opacity: 0.75, fontSize: 12 }}>Exam: {fmtDate(p.xray_exam_date)}</div>
                      </>
                    ) : (
                      <span style={{ opacity: 0.7 }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
        Patients in this filtered view: <b>{filteredPatients.length}</b>
      </div>

      <Drawer
        open={patientDrawerOpen}
        title={selectedPatient ? (selectedPatient.full_name || "Patient Details") : "Patient Details"}
        onClose={closePatientDrawer}
      >
        {!selectedPatient ? (
          <div style={{ opacity: 0.75 }}>No patient selected.</div>
        ) : (
          <>
            <Section title="Identity">
              <Field label="Patient ID" value={selectedPatient.patient_id} mono />
              <Field label="Full Name" value={selectedPatient.full_name || "—"} />
              <Field label="Contact No" value={selectedPatient.contact_no || "—"} />
              <Field label="Address" value={selectedPatient.address || "—"} />
              <Field label="Gender" value={selectedPatient.gender || "—"} />
              <Field label="Age" value={selectedPatient.age ?? "—"} />
              <Field label="Civil Status" value={selectedPatient.civil_status || "—"} />
            </Section>

            <Section title="Latest Appointment">
              <Field label="Type" value={selectedPatient.appointment_type || "—"} />
              <Field label="Appointment Date" value={fmtDate(selectedPatient.preferred_date)} />
              <Field label="Status" value={formatWorkflowLabel(selectedPatient.appointment_status || selectedPatient.workflow_status || selectedPatient.status)} />
              <Field label="Created" value={fmtDateTime(selectedPatient.appointment_created_at)} />
            </Section>

            <Section title="Vitals">
              <Field label="Recorded" value={fmtDateTime(selectedPatient.vitals_created_at || selectedPatient.recorded_at)} />
              <Field label="Blood Pressure" value={`${selectedPatient.systolic ?? "—"}/${selectedPatient.diastolic ?? "—"}`} />
              <Field label="Heart Rate" value={selectedPatient.heart_rate ?? "—"} />
              <Field label="Temperature (°C)" value={selectedPatient.temperature_c ?? "—"} />
              <Field label="Height (cm)" value={selectedPatient.height_cm ?? "—"} />
              <Field label="Weight (kg)" value={selectedPatient.weight_kg ?? "—"} />
              {patientHistoryLoading ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>Loading full vitals history...</div>
              ) : patientHistory.vitals.length ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Vitals history</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {patientHistory.vitals.map((v) => (
                      <div key={v.id} style={{ fontSize: 12, opacity: 0.9 }}>
                        {fmtDateTime(v.recorded_at)} • BP {v.systolic ?? "—"}/{v.diastolic ?? "—"} • HR {v.heart_rate ?? "—"} • Temp {v.temperature_c ?? "—"}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </Section>

            <Section title="Labs">
              <Field label="Recorded" value={fmtDateTime(selectedPatient.lab_recorded_at)} />
              <Field label="Blood Typing" value={selectedPatient.blood_typing ?? "—"} />
              <Field label="CBC Platelet" value={selectedPatient.cbc_platelet ?? "—"} />
              {patientHistoryLoading ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>Loading full lab history...</div>
              ) : patientHistory.labs.length ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Lab history</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {patientHistory.labs.map((l) => (
                      <div key={l.id} style={{ fontSize: 12, opacity: 0.9 }}>
                        {fmtDateTime(l.recorded_at)} • CBC {l.cbc ?? "—"} • Urinalysis {l.urinalysis ?? "—"} • Fecalysis {l.fecalysis ?? "—"} • Remarks {l.remarks ?? "—"}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </Section>

            <Section title="X-ray">
              <Field label="Status" value={selectedPatient.xray_status ?? "—"} />
              <Field label="Case No" value={selectedPatient.xray_case_no ?? "—"} />
              <Field label="Exam Date" value={fmtDate(selectedPatient.xray_exam_date)} />
              {patientHistoryLoading ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>Loading full x-ray history...</div>
              ) : patientHistory.xrays.length ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>X-ray history</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {patientHistory.xrays.map((x) => (
                      <div key={x.id} style={{ fontSize: 12, opacity: 0.9 }}>
                        {fmtDateTime(x.updated_at || x.exam_date)} • Status {x.status ?? "—"} • Findings {x.findings ?? "—"}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </Section>
          </>
        )}
      </Drawer>
    </div>
  );
}
