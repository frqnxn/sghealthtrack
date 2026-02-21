// src/dashboards/NurseDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { useToast } from "../components/ToastCenter";
import { supabase } from "../lib/supabase";
import useSuccessToast from "../utils/useSuccessToast";

/* ---------------- UI helpers (minimal, modern) ---------------- */
function Pill({ tone = "neutral", children }) {
  const map = {
    neutral: { bg: "rgba(148,163,184,0.14)", border: "rgba(148,163,184,0.25)", color: "rgba(226,232,240,0.95)" },
    ok: { bg: "rgba(34,197,94,0.16)", border: "rgba(34,197,94,0.32)", color: "rgba(34,197,94,0.95)" },
    warn: { bg: "rgba(234,179,8,0.16)", border: "rgba(234,179,8,0.32)", color: "rgba(234,179,8,0.95)" },
    danger: { bg: "rgba(239,68,68,0.16)", border: "rgba(239,68,68,0.32)", color: "rgba(239,68,68,0.95)" },
  };
  const t = map[tone] || map.neutral;
  return (
    <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, border: `1px solid ${t.border}`, background: t.bg, color: t.color, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontWeight: 900, fontSize: 14 }}>{title}</div>
      {subtitle ? <div style={{ opacity: 0.75, fontSize: 13 }}>{subtitle}</div> : null}
    </div>
  );
}

export default function NurseDashboard({ session }) {
  const nurseId = session?.user?.id;
  const API_BASE = import.meta.env.VITE_API_URL || "";

  const [msg, setMsg] = useState("");
  const { showToast } = useToast();
  useSuccessToast(msg, showToast);
  const [loading, setLoading] = useState(false);

  const [queue, setQueue] = useState([]); // paid patients only
  const [patientNameMap, setPatientNameMap] = useState({});

  const [selected, setSelected] = useState(null); // { appointment_id, patient_id, ... }
  const [stepsRow, setStepsRow] = useState(null);

  // requirements + vitals history
  const [reqRow, setReqRow] = useState(null);

  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [vitalsLoading, setVitalsLoading] = useState(false);

  const [recentVitals, setRecentVitals] = useState([]);
  const [recentVitalsLoading, setRecentVitalsLoading] = useState(false);

  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [triageRow, setTriageRow] = useState(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [savingTriage, setSavingTriage] = useState(false);

  const [triageDraft, setTriageDraft] = useState({
    chief_complaint: "",
    allergies: "",
    current_medications: "",
    pregnancy_possible: false,
    last_meal_time: "",

    has_fever: false,
    has_cough: false,
    has_sore_throat: false,
    has_shortness_of_breath: false,
    has_chest_pain: false,
    has_dizziness: false,
    has_headache: false,
    has_nausea_vomiting: false,
    has_diarrhea: false,

    needs_repeat_bp: false,
    fit_for_exam: true,

    triage_notes: "",
  });

  // vitals form
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [tempC, setTempC] = useState("");

  const VITAL_RANGES = {
    height_cm: [50, 250],
    weight_kg: [2, 300],
    systolic: [70, 250],
    diastolic: [40, 150],
    heart_rate: [30, 220],
    temperature_c: [30, 45],
  };

  function sanitizeNumberInput(value, allowDecimal) {
    const cleaned = String(value || "").replace(/[^\d.]/g, "");
    const normalized = allowDecimal ? cleaned.replace(/(\..*)\./g, "$1") : cleaned.replace(/\./g, "");
    return normalized;
  }

  function withinRange(value, min, max) {
    if (!Number.isFinite(value)) return false;
    return value >= min && value <= max;
  }

  async function loadPatientNames(ids) {
    const uniq = Array.from(new Set((ids || []).filter(Boolean)));
    if (!uniq.length) return;

    const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", uniq);
    if (error) return;

    setPatientNameMap((prev) => {
      const next = { ...prev };
      (data || []).forEach((p) => (next[p.id] = p.full_name || ""));
      return next;
    });
  }

  function patientName(id) {
    return patientNameMap[id]?.trim() || "(No name)";
  }

  /* ---------------- QUEUE (DO NOT CHANGE LOGIC) ---------------- */
  async function loadPaidQueue() {
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("appointment_steps")
      .select(
        `
        appointment_id,
        payment_status,
        triage_status,
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
      .eq("payment_status", "completed")
      .neq("triage_status", "completed")
      .order("updated_at", { ascending: true });

    if (error) {
      setQueue([]);
      setLoading(false);
      return setMsg(`Failed to load paid queue: ${error.message}`);
    }

  const rows =
      (data || [])
        .map((r) => {
          const appt = r.appointments;
          if (!appt?.id) return null;
          return {
            appointment_id: r.appointment_id,
            patient_id: appt.patient_id,
            appointment_type: appt.appointment_type,
            preferred_date: appt.preferred_date,
            created_at: appt.created_at,
            status: appt.status,
            payment_status: r.payment_status,
            triage_status: r.triage_status,
          };
        })
        .filter((row) => {
          if (!row) return false;
          const s = String(row.status || "").toLowerCase();
          return s !== "rejected" && s !== "cancelled" && s !== "canceled";
        }) || [];

    setQueue(rows);
    await loadPatientNames(rows.map((x) => x.patient_id));
    setLoading(false);
  }

  async function loadVitalsHistory(row) {
    if (!row?.appointment_id || !row?.patient_id) return;
    setVitalsLoading(true);

    const { data, error } = await supabase
      .from("vitals")
      .select("id, patient_id, appointment_id, recorded_at, recorded_by, height_cm, weight_kg, systolic, diastolic, heart_rate, temperature_c")
      .eq("appointment_id", row.appointment_id)
      .eq("patient_id", row.patient_id)
      .order("recorded_at", { ascending: false })
      .limit(10);

    if (error) {
      setVitalsHistory([]);
      setVitalsLoading(false);
      return;
    }

    setVitalsHistory(data || []);
    setVitalsLoading(false);
  }

  async function loadRecentVitals() {
    if (!nurseId) return;
    setRecentVitalsLoading(true);

    const { data, error } = await supabase
      .from("vitals")
      .select("id, patient_id, recorded_at, height_cm, weight_kg, systolic, diastolic, heart_rate, temperature_c")
      .eq("recorded_by", nurseId)
      .order("recorded_at", { ascending: false })
      .limit(20);

    if (error) {
      setRecentVitals([]);
      setRecentVitalsLoading(false);
      return;
    }

    setRecentVitals(data || []);
    await loadPatientNames((data || []).map((v) => v.patient_id));
    setRecentVitalsLoading(false);
  }

  async function loadRequirements(row) {
    if (!row?.appointment_id) return;
    const { data, error } = await supabase
      .from("appointment_requirements")
      .select("*")
      .eq("appointment_id", row.appointment_id)
      .maybeSingle();

    if (error) {
      setReqRow(null);
      return;
    }
    setReqRow(data || null);
  }

  async function loadNotes(row) {
    if (!row?.appointment_id) return;
    setNotesLoading(true);

    const { data, error } = await supabase
      .from("appointment_notes")
      .select("id, appointment_id, patient_id, note_type, body, created_by, created_at")
      .eq("appointment_id", row.appointment_id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      setNotes([]);
      setNotesLoading(false);
      return;
    }

    setNotes(data || []);
    setNotesLoading(false);
  }

  async function loadTriage(row) {
    if (!row?.appointment_id) return;
    setTriageLoading(true);

    const { data, error } = await supabase
      .from("appointment_triage")
      .select("*")
      .eq("appointment_id", row.appointment_id)
      .maybeSingle();

    if (error) {
      setTriageRow(null);
      setTriageLoading(false);
      return;
    }

    setTriageRow(data || null);

    const d = data || {};
    setTriageDraft((prev) => ({
      ...prev,
      chief_complaint: d.chief_complaint || "",
      allergies: d.allergies || "",
      current_medications: d.current_medications || "",
      pregnancy_possible: !!d.pregnancy_possible,
      last_meal_time: d.last_meal_time || "",

      has_fever: !!d.has_fever,
      has_cough: !!d.has_cough,
      has_sore_throat: !!d.has_sore_throat,
      has_shortness_of_breath: !!d.has_shortness_of_breath,
      has_chest_pain: !!d.has_chest_pain,
      has_dizziness: !!d.has_dizziness,
      has_headache: !!d.has_headache,
      has_nausea_vomiting: !!d.has_nausea_vomiting,
      has_diarrhea: !!d.has_diarrhea,

      needs_repeat_bp: !!d.needs_repeat_bp,
      fit_for_exam: typeof d.fit_for_exam === "boolean" ? d.fit_for_exam : true,

      triage_notes: d.triage_notes || "",
    }));

    setTriageLoading(false);
  }

  async function saveTriage() {
    if (!selected?.appointment_id || !selected?.patient_id) return;

    setSavingTriage(true);
    setMsg("");

    const payload = {
      appointment_id: selected.appointment_id,
      patient_id: selected.patient_id,

      chief_complaint: triageDraft.chief_complaint || null,
      allergies: triageDraft.allergies || null,
      current_medications: triageDraft.current_medications || null,
      pregnancy_possible: !!triageDraft.pregnancy_possible,
      last_meal_time: triageDraft.last_meal_time || null,

      has_fever: !!triageDraft.has_fever,
      has_cough: !!triageDraft.has_cough,
      has_sore_throat: !!triageDraft.has_sore_throat,
      has_shortness_of_breath: !!triageDraft.has_shortness_of_breath,
      has_chest_pain: !!triageDraft.has_chest_pain,
      has_dizziness: !!triageDraft.has_dizziness,
      has_headache: !!triageDraft.has_headache,
      has_nausea_vomiting: !!triageDraft.has_nausea_vomiting,
      has_diarrhea: !!triageDraft.has_diarrhea,

      needs_repeat_bp: !!triageDraft.needs_repeat_bp,
      fit_for_exam: !!triageDraft.fit_for_exam,

      triage_notes: triageDraft.triage_notes || null,

      updated_by: nurseId,
      updated_at: new Date().toISOString(),
    };

    if (!triageRow?.id) {
      payload.created_by = nurseId;
      payload.created_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("appointment_triage")
      .upsert(payload, { onConflict: "appointment_id" })
      .select("*")
      .maybeSingle();

    if (error) {
      setSavingTriage(false);
      return setMsg(`Failed to save screening checklist: ${error.message}`);
    }

    setTriageRow(data || null);
    setSavingTriage(false);
    setMsg("Screening checklist saved ✅");
    setTimeout(() => setMsg(""), 1200);
  }

  async function addNote() {
    if (!selected?.appointment_id || !selected?.patient_id) return;
    const body = (newNote || "").trim();
    if (!body) return;

    setSavingNote(true);
    setMsg("");

    const payload = {
      appointment_id: selected.appointment_id,
      patient_id: selected.patient_id,
      note_type: "triage",
      body,
      created_by: nurseId,
    };

    const { error } = await supabase.from("appointment_notes").insert(payload);

    if (error) {
      setSavingNote(false);
      return setMsg(`Failed to save note: ${error.message}`);
    }

    setNewNote("");
    await loadNotes(selected);
    setSavingNote(false);
  }

  async function openPatient(row) {
    setMsg("");
    setSelected(row);
    setStepsRow(null);
    setReqRow(null);
    setVitalsHistory([]);
    setNotes([]);
    setNewNote("");
    setTriageRow(null);

    const { data, error } = await supabase
      .from("appointment_steps")
      .select("*")
      .eq("appointment_id", row.appointment_id)
      .maybeSingle();

    if (error) return setMsg(`Failed to load steps: ${error.message}`);
    setStepsRow(data || null);

    await loadVitalsHistory(row);
    await loadRequirements(row);
    await loadNotes(row);
    await loadTriage(row);
  }

  async function saveVitals() {
    if (!selected?.appointment_id) return;

    const paidNow = String(stepsRow?.payment_status || "").toLowerCase() === "completed";
    if (!paidNow) return setMsg("Payment must be completed before vitals.");

    setMsg("");

    const heightVal = Number(heightCm);
    const weightVal = Number(weightKg);
    const sysVal = Number(systolic);
    const diaVal = Number(diastolic);
    const hrVal = Number(heartRate);
    const tempVal = Number(tempC);

    if (
      !Number.isFinite(heightVal) ||
      !Number.isFinite(weightVal) ||
      !Number.isFinite(sysVal) ||
      !Number.isFinite(diaVal) ||
      !Number.isFinite(hrVal) ||
      !Number.isFinite(tempVal)
    ) {
      return setMsg("All vitals are required and must be numbers.");
    }

    if (!withinRange(heightVal, ...VITAL_RANGES.height_cm)) return setMsg("Height must be 50-250 cm.");
    if (!withinRange(weightVal, ...VITAL_RANGES.weight_kg)) return setMsg("Weight must be 2-300 kg.");
    if (!withinRange(sysVal, ...VITAL_RANGES.systolic)) return setMsg("Systolic must be 70-250.");
    if (!withinRange(diaVal, ...VITAL_RANGES.diastolic)) return setMsg("Diastolic must be 40-150.");
    if (!withinRange(hrVal, ...VITAL_RANGES.heart_rate)) return setMsg("Heart rate must be 30-220.");
    if (!withinRange(tempVal, ...VITAL_RANGES.temperature_c)) return setMsg("Temperature must be 30-45 °C.");

    const payload = {
      appointment_id: selected.appointment_id,
      patient_id: selected.patient_id,
      height_cm: heightVal,
      weight_kg: weightVal,
      systolic: sysVal,
      diastolic: diaVal,
      heart_rate: hrVal,
      temperature_c: tempVal,
    };

    const token = session?.access_token;
    if (!token) return setMsg("Session expired. Please login again.");
    const response = await fetch(`${API_BASE}/api/staff/nurse/vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return setMsg(result?.error || "Failed to save vitals.");

    setMsg("Vitals saved ✅ Patient removed from queue ✅");

    setHeightCm("");
    setWeightKg("");
    setSystolic("");
    setDiastolic("");
    setHeartRate("");
    setTempC("");

    setSelected(null);
    setStepsRow(null);
    setReqRow(null);
    setVitalsHistory([]);
    setNotes([]);
    setNewNote("");
    setTriageRow(null);

    await loadRecentVitals();
    await loadPaidQueue();
  }

  useEffect(() => {
    loadPaidQueue();
    loadRecentVitals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nurseId]);

  const paid = useMemo(
    () => String(stepsRow?.payment_status || "").toLowerCase() === "completed",
    [stepsRow]
  );

  const triageSaved = !!triageRow?.id;

  const ChecklistItem = ({ k, label }) => (
    <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={!!triageDraft[k]}
        onChange={(e) => setTriageDraft((d) => ({ ...d, [k]: e.target.checked }))}
      />
      <span style={{ opacity: 0.9 }}>{label}</span>
    </label>
  );

  const BooleanSelect = ({ label, value, onChange }) => (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ opacity: 0.75 }}>{label}</span>
      <select className="input" value={value ? "yes" : value === false ? "no" : ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );

  function requirementsSummary(r) {
    if (!r) return "No form slip / requirements found yet.";
    const items = [];
    const pushIf = (k, label) => {
      if (r[k] === true) items.push(label);
    };

    pushIf("exam_physical", "Physical Examination");
    pushIf("exam_visual_acuity", "Visual acuity");
    pushIf("exam_height_weight", "Height & weight");
    pushIf("lab_cbc_platelet", "Complete blood count");
    pushIf("lab_urinalysis", "Urinalysis");
    pushIf("lab_fecalysis", "Fecalysis");
    pushIf("lab_drug_test", "Drugtest screening");
    pushIf("lab_hepatitis_b", "Hepatitis B Screening");
    pushIf("lab_hepatitis_a", "Hepatitis A");
    pushIf("lab_ecg", "ECG (Electrocardiogram)");
    pushIf("lab_audiometry", "Audiometry");
    pushIf("lab_blood_typing", "Blood typing");
    pushIf("lab_pregnancy_test", "Pregnancy test");
    pushIf("lab_salmonella", "Salmonella test");
    pushIf("xray_chest", "Chest X-ray");

    if (!items.length) return "No lab/x-ray items checked yet.";
    return items.join(" • ");
  }

  return (
    <div className="patient-dashboard-content">
      <header className="page-header no-print">
        <div className="page-header-main">
          <h1 className="page-title">Nurse</h1>
          <p className="page-subtitle">Vitals encoding (unlocked after payment).</p>
        </div>
        <div className="page-actions" />
      </header>

      {msg && <p className="page-msg">{msg}</p>}

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {selected ? (
          <>
            <Pill tone={triageSaved ? "ok" : "warn"}>{triageSaved ? "Screening Checklist Saved" : "Screening Checklist Pending"}</Pill>
            <Pill tone={paid ? "ok" : "warn"}>{paid ? "Payment Verified" : "Payment Required"}</Pill>
          </>
        ) : (
          <Pill tone="neutral">{queue.length} in queue</Pill>
        )}
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        {/* Queue */}
        <section className="card">
          <SectionTitle
            title="Queue (Paid Patients)"
            subtitle="Patients are removed after vitals are saved."
          />

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="table nurse-queue-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Patient</th>
                  <th style={{ width: 150 }}>Type</th>
                  <th style={{ width: 140 }}>Date</th>
                  <th style={{ width: 110 }} />
                </tr>
              </thead>
              <tbody>
                {queue.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ opacity: 0.7 }}>
                      No paid patients yet.
                    </td>
                  </tr>
                ) : (
                  queue.map((r, idx) => (
                    <tr key={r.appointment_id}>
                      <td data-label="#">
                        <b>{idx + 1}</b>
                      </td>
                      <td data-label="Patient">
                        <b>{patientName(r.patient_id)}</b>
                      </td>
                      <td data-label="Type">{r.appointment_type}</td>
                      <td data-label="Date">{r.preferred_date}</td>
                      <td data-label="Action">
                        <button className="btn btn-secondary" onClick={() => openPatient(r)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Patient Panels */}
        {!selected ? (
          <section className="card">
            <div style={{ opacity: 0.75 }}>Select a patient from the queue above.</div>
          </section>
        ) : (
          <>
            {/* Patient Summary */}
            <section className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{patientName(selected.patient_id)}</div>
                  <div style={{ marginTop: 6, opacity: 0.75 }}>
                    Type: <b>{selected.appointment_type}</b> • Date: <b>{selected.preferred_date}</b>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setSelected(null);
                      setStepsRow(null);
                      setReqRow(null);
                      setVitalsHistory([]);
                      setNotes([]);
                      setNewNote("");
                      setTriageRow(null);
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Pill tone={paid ? "ok" : "warn"}>{paid ? "Payment Completed" : "Vitals Locked (Unpaid)"}</Pill>
                <Pill tone={triageSaved ? "ok" : "warn"}>{triageSaved ? "Screening Saved" : "Screening Not Saved"}</Pill>
              </div>

              <div style={{ marginTop: 12, opacity: 0.9, fontSize: 13, lineHeight: 1.6 }}>
                <b>Form Slip / Requirements:</b> <span style={{ opacity: 0.85 }}>{requirementsSummary(reqRow)}</span>
              </div>
            </section>

            <section className="card">
              <SectionTitle
                title="Screening Checklist"
                subtitle="Record basic screening and nurse assessment before/alongside vitals."
              />

              {triageLoading ? (
                <div style={{ opacity: 0.7, marginTop: 10 }}>Loading screening checklist...</div>
              ) : (
                <>
                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 10 }}>
                    <div style={{ gridColumn: "span 7" }}>
                      <div style={{ opacity: 0.75, marginBottom: 8 }}>Chief complaint</div>
                      <input
                        className="input"
                        value={triageDraft.chief_complaint}
                        onChange={(e) => setTriageDraft((d) => ({ ...d, chief_complaint: e.target.value }))}
                        placeholder="e.g., cough, dizziness, annual checkup"
                      />
                    </div>

                    <div style={{ gridColumn: "span 5" }}>
                      <div style={{ opacity: 0.75, marginBottom: 8 }}>Last meal time (optional)</div>
                      <input
                        className="input"
                        value={triageDraft.last_meal_time}
                        onChange={(e) => setTriageDraft((d) => ({ ...d, last_meal_time: e.target.value }))}
                        placeholder="e.g., 7:30 AM"
                      />
                    </div>

                    <div style={{ gridColumn: "span 6" }}>
                      <div style={{ opacity: 0.75, marginBottom: 8 }}>Allergies (optional)</div>
                      <input
                        className="input"
                        value={triageDraft.allergies}
                        onChange={(e) => setTriageDraft((d) => ({ ...d, allergies: e.target.value }))}
                        placeholder="e.g., Penicillin, seafood"
                      />
                    </div>

                    <div style={{ gridColumn: "span 6" }}>
                      <div style={{ opacity: 0.75, marginBottom: 8 }}>Current medications (optional)</div>
                      <input
                        className="input"
                        value={triageDraft.current_medications}
                        onChange={(e) => setTriageDraft((d) => ({ ...d, current_medications: e.target.value }))}
                        placeholder="e.g., Losartan, Metformin"
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: 10 }}>
                    <BooleanSelect
                      label="Pregnancy possible"
                      value={triageDraft.pregnancy_possible}
                      onChange={(val) => setTriageDraft((d) => ({ ...d, pregnancy_possible: val === "yes" }))}
                    />
                    <BooleanSelect
                      label="Needs repeat BP"
                      value={triageDraft.needs_repeat_bp}
                      onChange={(val) => setTriageDraft((d) => ({ ...d, needs_repeat_bp: val === "yes" }))}
                    />
                    <BooleanSelect
                      label="Fit for exam"
                      value={triageDraft.fit_for_exam}
                      onChange={(val) => setTriageDraft((d) => ({ ...d, fit_for_exam: val === "yes" }))}
                    />
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div style={{ opacity: 0.75, marginBottom: 8 }}>Screening checklist</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(220px, 1fr))", gap: 10 }}>
                      <ChecklistItem k="has_fever" label="Fever" />
                      <ChecklistItem k="has_cough" label="Cough" />
                      <ChecklistItem k="has_sore_throat" label="Sore throat" />
                      <ChecklistItem k="has_shortness_of_breath" label="Shortness of breath" />
                      <ChecklistItem k="has_chest_pain" label="Chest pain" />
                      <ChecklistItem k="has_dizziness" label="Dizziness" />
                      <ChecklistItem k="has_headache" label="Headache" />
                      <ChecklistItem k="has_nausea_vomiting" label="Nausea / vomiting" />
                      <ChecklistItem k="has_diarrhea" label="Diarrhea" />
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div style={{ opacity: 0.75, marginBottom: 8 }}>Screening notes</div>
                    <input
                      className="input"
                      value={triageDraft.triage_notes}
                      onChange={(e) => setTriageDraft((d) => ({ ...d, triage_notes: e.target.value }))}
                      placeholder="e.g., patient looks pale, advised rest before BP retake"
                    />
                  </div>

                  <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                    <button className="btn btn-primary" onClick={saveTriage} disabled={savingTriage}>
                      {savingTriage ? "Saving..." : triageSaved ? "Update Screening Checklist" : "Save Screening Checklist"}
                    </button>
                  </div>
                </>
              )}
            </section>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(280px, 1fr))", gap: 12 }}>
              {/* Vitals Encoding */}
              <section className="card">
                <SectionTitle title="Vitals Encoding" subtitle="Complete fields then Save Vitals to mark screening completed." />

                {!paid && <div style={{ opacity: 0.7, marginTop: 10 }}>Payment not completed — inputs disabled.</div>}

                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, minmax(120px, 1fr))", gap: 10 }}>
                  <input
                    className="input"
                    placeholder="Height (cm)"
                    value={heightCm}
                    onChange={(e) => setHeightCm(sanitizeNumberInput(e.target.value, true))}
                    inputMode="decimal"
                    disabled={!paid}
                  />
                  <input
                    className="input"
                    placeholder="Weight (kg)"
                    value={weightKg}
                    onChange={(e) => setWeightKg(sanitizeNumberInput(e.target.value, true))}
                    inputMode="decimal"
                    disabled={!paid}
                  />
                  <input
                    className="input"
                    placeholder="Systolic"
                    value={systolic}
                    onChange={(e) => setSystolic(sanitizeNumberInput(e.target.value, false))}
                    inputMode="numeric"
                    disabled={!paid}
                  />
                  <input
                    className="input"
                    placeholder="Diastolic"
                    value={diastolic}
                    onChange={(e) => setDiastolic(sanitizeNumberInput(e.target.value, false))}
                    inputMode="numeric"
                    disabled={!paid}
                  />
                  <input
                    className="input"
                    placeholder="Heart Rate"
                    value={heartRate}
                    onChange={(e) => setHeartRate(sanitizeNumberInput(e.target.value, false))}
                    inputMode="numeric"
                    disabled={!paid}
                  />
                  <input
                    className="input"
                    placeholder="Temp (°C)"
                    value={tempC}
                    onChange={(e) => setTempC(sanitizeNumberInput(e.target.value, true))}
                    inputMode="decimal"
                    disabled={!paid}
                  />
                </div>

                <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-primary" onClick={saveVitals} disabled={!paid}>
                    Save Vitals
                  </button>
                </div>
              </section>

              {/* Vitals History */}
              <section className="card">
                <SectionTitle title="Vitals History" subtitle="Last 10 vitals encoded for this appointment." />

                <div style={{ marginTop: 12 }}>
                  {vitalsLoading ? (
                    <div style={{ opacity: 0.7 }}>Loading vitals...</div>
                  ) : vitalsHistory.length === 0 ? (
                    <div style={{ opacity: 0.7 }}>No vitals encoded yet.</div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table className="table nurse-vitals-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>BP</th>
                            <th>HR</th>
                            <th>Temp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vitalsHistory.map((v) => (
                            <tr key={v.id}>
                              <td data-label="Date" style={{ whiteSpace: "nowrap" }}>
                                {v.recorded_at ? new Date(v.recorded_at).toLocaleString() : "—"}
                              </td>
                              <td data-label="BP">{v.systolic ?? "—"}/{v.diastolic ?? "—"}</td>
                              <td data-label="HR">{v.heart_rate ?? "—"}</td>
                              <td data-label="Temp">{v.temperature_c ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <section className="card">
              <SectionTitle title="Nurse Notes" subtitle="Screening observations, concerns, follow-ups. (Saved to appointment_notes)" />

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  className="input"
                  placeholder="Write a note (e.g., patient dizzy, repeat BP advised...)"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addNote();
                  }}
                  style={{ flex: "1 1 320px" }}
                />
                <button className="btn btn-secondary" onClick={addNote} disabled={savingNote || !newNote.trim()}>
                  {savingNote ? "Saving..." : "Add Note"}
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                {notesLoading ? (
                  <div style={{ opacity: 0.7 }}>Loading notes...</div>
                ) : notes.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>No notes yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {notes.map((n) => (
                      <div key={n.id} className="card" style={{ padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ display: "grid", gap: 6 }}>
                            <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.85 }}>
                              {(n.note_type || "note").toUpperCase()}
                            </div>
                            <div style={{ fontSize: 13, opacity: 0.92, lineHeight: 1.5 }}>{n.body}</div>
                          </div>

                          <div style={{ fontSize: 12, opacity: 0.65, whiteSpace: "nowrap" }}>
                            {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

          </>
        )}

        <section className="card">
          <SectionTitle title="Recent Vitals (Nurse)" subtitle="Latest vitals you recorded." />

          <div style={{ marginTop: 12 }}>
            {recentVitalsLoading ? (
              <div style={{ opacity: 0.7 }}>Loading recent vitals...</div>
            ) : recentVitals.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No vitals recorded yet.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table nurse-recent-vitals-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Date</th>
                      <th>BP</th>
                      <th>HR</th>
                      <th>Temp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentVitals.map((v) => (
                      <tr key={v.id}>
                        <td data-label="Patient">{patientName(v.patient_id)}</td>
                        <td data-label="Date" style={{ whiteSpace: "nowrap" }}>
                          {v.recorded_at ? new Date(v.recorded_at).toLocaleString() : "—"}
                        </td>
                        <td data-label="BP">{v.systolic ?? "—"}/{v.diastolic ?? "—"}</td>
                        <td data-label="HR">{v.heart_rate ?? "—"}</td>
                        <td data-label="Temp">{v.temperature_c ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
