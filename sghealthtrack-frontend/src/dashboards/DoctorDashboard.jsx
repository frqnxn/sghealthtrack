// src/dashboards/DoctorDashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../components/ToastCenter";
import { supabase } from "../lib/supabase";
import { generateMedicalReportPdf } from "../utils/generateMedicalReportPdf";
import useSuccessToast from "../utils/useSuccessToast";


const MEDICAL_HISTORY_ITEMS = [
  ["mh_allergies", "Allergies"],
  ["mh_asthma", "Asthma"],
  ["mh_chickenpox", "Chickenpox"],
  ["mh_diabetes", "Diabetes"],
  ["mh_epilepsy", "Epilepsy"],
  ["mh_german_measles", "German Measles"],
  ["mh_measles", "Measles"],
  ["mh_cancer", "Cancer"],
  ["mh_hernia", "Hernia"],
  ["mh_kidney_problem", "Kidney Problem"],
  ["mh_thyroid_problem", "Thyroid Problem"],
  ["mh_gastritis", "Gastritis"],
  ["mh_blood_problem", "Blood Problem"],
  ["mh_anemia_bleeding_clotting", "Anemia, Bleeding, Clotting"],
  ["mh_heart_disease", "Heart Disease"],
  ["mh_hepatitis", "Hepatitis"],
  ["mh_hypertension", "Hypertension"],
  ["mh_ulcers", "Ulcers"],
  ["mh_ptb", "PTB"],
  ["mh_vertigo", "Vertigo"],
  ["mh_psych_disorder", "Psychological Disorder"],
];

const PHYSICAL_EXAM_FIELDS = [
  ["physical_skin", "Skin"],
  ["physical_head", "Head"],
  ["physical_ears", "Ears"],
  ["physical_eyes", "Eyes"],
  ["physical_nose", "Nose"],
  ["physical_neck_throat", "Neck / Throat"],
  ["physical_heart", "Heart"],
  ["physical_chest_lungs", "Chest / Lungs"],
  ["physical_breast", "Breast"],
  ["physical_abdomen", "Abdomen"],
  ["physical_anal_inguinal", "Anal / Inguinal"],
  ["physical_back", "Back"],
  ["physical_extremities", "Extremities"],
  ["physical_others", "Others"],
];

const LAB_DIAG_FIELDS = [
  ["lab_hematology_result", "Hematology", "lab_hematology_findings"],
  ["lab_urinalysis_result", "Urinalysis", "lab_urinalysis_findings"],
  ["lab_fecalysis_result", "Fecalysis", "lab_fecalysis_findings"],
  ["lab_chest_xray_result", "Chest X-Ray", "lab_chest_xray_findings"],
  ["lab_ecg_result", "ECG", "lab_ecg_findings"],
  ["lab_psycho_test_result", "Psycho Test", "lab_psycho_test_findings"],
  ["lab_hbsag_result", "HBsAg", "lab_hbsag_findings"],
  ["lab_pregnancy_test_result", "Pregnancy Test", "lab_pregnancy_test_findings"],
  ["lab_blood_type_result", "Blood Type", "lab_blood_type_findings"],
  ["lab_drug_test_result", "Drug Test", "lab_drug_test_findings"],
];

const LAB_RESULT_OPTIONS = {
  lab_pregnancy_test_result: ["Negative", "Positive", "Not done"],
  lab_blood_type_result: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
  lab_drug_test_result: ["Negative", "Positive", "Not done"],
  lab_hbsag_result: ["Non-reactive", "Reactive", "Not done"],
};

function sanitizeNumberInput(value, allowDecimal = true) {
  const raw = String(value || "");
  if (allowDecimal) {
    const cleaned = raw.replace(/[^\d.]/g, "");
    const parts = cleaned.split(".");
    return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
  }
  return raw.replace(/\D/g, "");
}

// ---------- helpers ----------
function calcAge(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return String(age);
}



function kgToLbs(kg) {
  const n = Number(kg);
  if (Number.isNaN(n)) return "";
  return (n * 2.20462).toFixed(1);
}

function cmToFtIn(cm) {
  const n = Number(cm);
  if (Number.isNaN(n)) return { ft: "", inch: "" };
  const inches = n / 2.54;
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches - ft * 12);
  return { ft: String(ft), inch: String(inch) };
}

function isPdf(path) {
  return String(path || "").toLowerCase().endsWith(".pdf");
}

function hasValue(v) {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

function summarizeLab(lab) {
  if (!lab) return { hematology: "", urinalysis: "", fecalysis: "" };

  const hemaParts = [];
  if (hasValue(lab.cbc_hemoglobin)) hemaParts.push(`Hgb ${lab.cbc_hemoglobin}`);
  if (hasValue(lab.cbc_hematocrit)) hemaParts.push(`Hct ${lab.cbc_hematocrit}`);
  if (hasValue(lab.cbc_rbc_count)) hemaParts.push(`RBC ${lab.cbc_rbc_count}`);
  if (hasValue(lab.cbc_wbc_count)) hemaParts.push(`WBC ${lab.cbc_wbc_count}`);
  if (hasValue(lab.cbc_platelet)) hemaParts.push(`Plt ${lab.cbc_platelet}`);
  if (!hemaParts.length && hasValue(lab.cbc)) hemaParts.push(String(lab.cbc));

  const uaParts = [];
  if (hasValue(lab.ua_color)) uaParts.push(`Color ${lab.ua_color}`);
  if (hasValue(lab.ua_transparency)) uaParts.push(`Transp ${lab.ua_transparency}`);
  if (hasValue(lab.ua_ph)) uaParts.push(`pH ${lab.ua_ph}`);
  if (hasValue(lab.ua_specific_gravity)) uaParts.push(`SG ${lab.ua_specific_gravity}`);
  if (hasValue(lab.ua_wbc_hpf)) uaParts.push(`WBC ${lab.ua_wbc_hpf}`);
  if (hasValue(lab.ua_rbc_hpf)) uaParts.push(`RBC ${lab.ua_rbc_hpf}`);
  if (hasValue(lab.urinalysis)) uaParts.push(String(lab.urinalysis));

  const feParts = [];
  if (hasValue(lab.fe_color)) feParts.push(`Color ${lab.fe_color}`);
  if (hasValue(lab.fe_consistency)) feParts.push(`Cons ${lab.fe_consistency}`);
  if (hasValue(lab.fe_ova_parasites)) feParts.push(`Ova ${lab.fe_ova_parasites}`);
  if (hasValue(lab.fecalysis)) feParts.push(String(lab.fecalysis));

  return {
    hematology: hemaParts.join(" • "),
    urinalysis: uaParts.join(" • "),
    fecalysis: feParts.join(" • "),
  };
}

function formatExaminingPhysician(profile) {
  if (!profile) return "";
  const name = String(profile.full_name || "").trim();
  const license = String(profile.prc_license_no || "").trim();
  if (!name && !license) return "";
  if (name && license) return `${name} (PRC ${license})`;
  return name || `PRC ${license}`;
}

const EMPTY_REPORT = {
  report_date: "",
  company: "",
  sa_no: "",
  status: "",

  health_history: "",
  present_illness: "",
  medications: "",
  allergies_notes: "",
  operations: "",

  smoker: false,
  packs_per_day: "",
  alcohol_drinker: false,
  alcohol_years: "",

  physical_skin: "",
  physical_head: "",
  physical_ears: "",
  physical_eyes: "",
  physical_nose: "",
  physical_neck_throat: "",
  physical_heart: "",
  physical_chest_lungs: "",
  physical_breast: "",
  physical_abdomen: "",
  physical_anal_inguinal: "",
  physical_back: "",
  physical_extremities: "",
  physical_others: "",

  bp_systolic: "",
  bp_diastolic: "",
  pr: "",
  rr: "",
  temp_c: "",

  vision_wo_od: "",
  vision_wo_os: "",
  vision_wo_ou: "",
  vision_w_od: "",
  vision_w_os: "",
  vision_w_ou: "",
  vision_near_od: "",
  vision_near_os: "",
  vision_near_ou: "",

  ishihara_normal: false,
  ishihara_defective: false,

  ob_lmp: "",
  ob_score: "",
  ob_interval: "",
  ob_duration: "",
  ob_dysmenorrhea: "",

  dental_oral_prophylaxis: "",
  dental_fillings: "",
  dental_extraction: "",
  dental_others: "",
  dental_attending: "",

  lab_hematology_result: "",
  lab_hematology_findings: "",
  lab_urinalysis_result: "",
  lab_urinalysis_findings: "",
  lab_fecalysis_result: "",
  lab_fecalysis_findings: "",
  lab_chest_xray_result: "",
  lab_chest_xray_findings: "",
  lab_ecg_result: "",
  lab_ecg_findings: "",
  lab_psycho_test_result: "",
  lab_psycho_test_findings: "",
  lab_hbsag_result: "",
  lab_hbsag_findings: "",
  lab_pregnancy_test_result: "",
  lab_pregnancy_test_findings: "",
  lab_blood_type_result: "",
  lab_blood_type_findings: "",
  lab_drug_test_result: "",
  lab_drug_test_findings: "",

  evaluation: "",
  remarks: "",
  recommendations: "",

  height_ft: "",
  height_in: "",
  weight_lbs: "",
  examining_physician: "",

  mh_allergies: false,
  mh_asthma: false,
  mh_chickenpox: false,
  mh_diabetes: false,
  mh_epilepsy: false,
  mh_german_measles: false,
  mh_measles: false,
  mh_cancer: false,
  mh_hernia: false,
  mh_kidney_problem: false,
  mh_thyroid_problem: false,
  mh_gastritis: false,
  mh_blood_problem: false,
  mh_anemia_bleeding_clotting: false,
  mh_heart_disease: false,
  mh_hepatitis: false,
  mh_hypertension: false,
  mh_ulcers: false,
  mh_ptb: false,
  mh_vertigo: false,
  mh_psych_disorder: false,
};

// ---------- Error Boundary (prevents blank page) ----------
class DashboardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, err: error };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("DoctorDashboard crashed:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", padding: 18, background: "linear-gradient(180deg,#f0fdfa,#f8fafc,#fff)" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div
              style={{
                background: "white",
                borderRadius: 18,
                border: "1px solid rgba(15,23,42,0.10)",
                boxShadow: "0 12px 40px rgba(2,6,23,0.08)",
                padding: 16,
                color: "#0f172a",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 16 }}>Doctor Dashboard Error</div>
              <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
                {String(this.state.err?.message || this.state.err || "Unknown error")}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                Open DevTools → Console, copy the red error, then send it to me.
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------- UI ----------
function Card({ children, style }) {
  return (
    <div className="card" style={{ ...style }}>
      {children}
    </div>
  );
}

function Label({ children }) {
  return <label className="label">{children}</label>;
}

function Input({ value, onChange, placeholder, disabled, type = "text", ...rest }) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className="input"
      {...rest}
      style={{
        borderRadius: 10,
        border: "1px solid rgba(15,23,42,0.12)",
        background: disabled ? "rgba(148,163,184,0.12)" : "#ffffff",
        padding: "10px 12px",
        fontSize: 13,
      }}
    />
  );
}

function Select({ value, onChange, disabled, options = [] }) {
  return (
    <select
      value={value ?? ""}
      onChange={onChange}
      disabled={disabled}
      className="input"
      style={{
        borderRadius: 10,
        border: "1px solid rgba(15,23,42,0.12)",
        background: disabled ? "rgba(148,163,184,0.12)" : "#ffffff",
        padding: "10px 12px",
        fontSize: 13,
      }}
    >
      <option value="">Select</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
function Select({ value, onChange, disabled, options = [] }) {
  return (
    <select
      value={value ?? ""}
      onChange={onChange}
      disabled={disabled}
      className="input"
      style={{
        borderRadius: 10,
        border: "1px solid rgba(15,23,42,0.12)",
        background: disabled ? "rgba(148,163,184,0.12)" : "#ffffff",
        padding: "10px 12px",
        fontSize: 13,
      }}
    >
      <option value="">Select</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function Textarea({ value, onChange, placeholder, rows = 5, disabled }) {
  return (
    <textarea
      value={value ?? ""}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className="input"
      style={{
        resize: "vertical",
        borderRadius: 10,
        border: "1px solid rgba(15,23,42,0.12)",
        background: disabled ? "rgba(148,163,184,0.12)" : "#ffffff",
        padding: "10px 12px",
        fontSize: 13,
      }}
    />
  );
}

function PrimaryButton({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      type="button"
      className="clinic-btn clinic-btn-primary"
      style={{ padding: "10px 14px", fontWeight: 800 }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      type="button"
      className="clinic-btn clinic-btn-secondary"
      style={{ padding: "10px 14px", fontWeight: 800 }}
    >
      {children}
    </button>
  );
}

function ReportLoadingSkeleton() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="clinic-skeleton" style={{ width: 100, height: 36 }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="clinic-skeleton" style={{ height: 44 }} />
        ))}
      </div>
      <div className="clinic-skeleton" style={{ height: 120 }} />
      <div style={{ fontSize: 13, color: "var(--text-muted, rgba(15,23,42,0.7))" }}>
        Loading patient report…
      </div>
    </div>
  );
}

// ---------- Component ----------
export default function DoctorDashboard({ session }) {
  const userId = session?.user?.id;

  const [msg, setMsg] = useState("");
  const { showToast } = useToast();
  useSuccessToast(msg, showToast);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [loadingCase, setLoadingCase] = useState(false);

  const [tab, setTab] = useState("queue"); // queue | records
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const [queue, setQueue] = useState([]);
  const [patientNameMap, setPatientNameMap] = useState({});
  const [doctorProfile, setDoctorProfile] = useState(null);
  const queueRefreshRef = useRef(null);
  const lastQueueLoadRef = useRef(0);

  const [selected, setSelected] = useState(null);
  const selectedRef = useRef(null);

  // merged data
  const [patient, setPatient] = useState(null);
  const [appointment, setAppointment] = useState(null);
  const [steps, setSteps] = useState(null);
  const [lab, setLab] = useState(null);
  const [xray, setXray] = useState(null);

  // doctor inputs
  const [report, setReport] = useState(EMPTY_REPORT);
  const [saving, setSaving] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [latestVitals, setLatestVitals] = useState(null);
  const [triage, setTriage] = useState(null);
  const formDisabled = saving || readOnly;

  const examiningPhysician = useMemo(() => formatExaminingPhysician(doctorProfile), [doctorProfile]);

  useEffect(() => {
    if (!examiningPhysician) return;
    setReport((prev) => ({ ...prev, examining_physician: examiningPhysician }));
  }, [examiningPhysician]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  function patientName(id) {
    return patientNameMap[id]?.trim() || "(No name)";
  }

  function setReportField(key, value) {
    setReport((prev) => ({ ...prev, [key]: value }));
  }

  function toggleReportField(key) {
    setReport((prev) => ({ ...prev, [key]: !prev[key] }));
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
   * ✅ FIXED queue query (no updated_at ordering)
   */
  async function loadQueue() {
    if (selectedRef.current) {
      return;
    }
    const now = Date.now();
    if (now - lastQueueLoadRef.current < 500) {
      return;
    }
    lastQueueLoadRef.current = now;

    setLoadingQueue(true);
    setMsg("");

    if (!userId) {
      setQueue([]);
      setLoadingQueue(false);
      return;
    }

    const { data, error } = await supabase
      .from("appointment_steps")
      .select(
        `
        appointment_id,
        lab_status,
        xray_status,
        doctor_status,
        appointments:appointment_id (
          id,
          patient_id,
          appointment_type,
          preferred_date,
          created_at,
          assigned_doctor_id,
          status
        )
      `
      )
      .eq("lab_status", "completed")
      .in("xray_status", ["completed", "released"])
      .or("doctor_status.is.null,doctor_status.neq.completed")
      .or(`assigned_doctor_id.is.null,assigned_doctor_id.eq.${userId}`, { foreignTable: "appointments" })
      .order("appointment_id", { ascending: true });

    if (error) {
      setQueue([]);
      setMsg("Failed to load doctor queue: " + error.message);
      setLoadingQueue(false);
      return;
    }

    const rows =
      (data || [])
        .map((r) => {
          const a = r.appointments;
          if (!a?.id) return null;
          const status = String(a.status || "").toLowerCase();
          if (status === "rejected" || status === "cancelled" || status === "canceled") return null;
          return {
            appointment_id: r.appointment_id,
            patient_id: a.patient_id,
            appointment_type: a.appointment_type,
            preferred_date: a.preferred_date,
            created_at: a.created_at,
          };
        })
        .filter(Boolean) || [];

    setQueue(rows);
    await loadPatientNames(rows.map((x) => x.patient_id));
    setLoadingQueue(false);
  }

  async function loadRecords() {
    if (!userId) {
      setRecords([]);
      return;
    }
    setRecordsLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("doctor_reports")
      .select(
        `
        appointment_id,
        patient_id,
        report_date,
        report_status,
        status,
        evaluation,
        remarks,
        recommendations,
        company,
        updated_at,
        appointments:appointment_id (
          patient_id,
          appointment_type,
          preferred_date
        )
      `
      )
      .eq("doctor_id", userId)
      .eq("report_status", "released")
      .order("updated_at", { ascending: false });

    if (error) {
      setRecords([]);
      setMsg("Failed to load doctor records: " + error.message);
      setRecordsLoading(false);
      return;
    }

    const rows = (data || []).map((row) => ({
      ...row,
      patient_id: row.patient_id || row.appointments?.patient_id || null,
      appointment_type: row.appointments?.appointment_type || "",
      preferred_date: row.appointments?.preferred_date || "",
      company_name: row.company || "",
    }));
    setRecords(rows);
    await loadPatientNames(rows.map((x) => x.patient_id));
    setRecordsLoading(false);
  }

  useEffect(() => {
    loadQueue();

    const scheduleQueueRefresh = () => {
      if (queueRefreshRef.current) {
        clearTimeout(queueRefreshRef.current);
      }
      queueRefreshRef.current = setTimeout(() => {
        loadQueue();
      }, 300);
    };

    const scheduleRecordsRefresh = () => {
      if (tab !== "records") return;
      loadRecords();
    };

    const ch = supabase
      .channel("doctor-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointment_steps" }, scheduleQueueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_results" }, scheduleQueueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "xray_results" }, scheduleQueueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_reports" }, scheduleRecordsRefresh)
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      if (queueRefreshRef.current) {
        clearTimeout(queueRefreshRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    async function loadDoctorProfile() {
      if (!userId) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, prc_license_no")
        .eq("id", userId)
        .maybeSingle();
      if (error) return;
      setDoctorProfile(data || null);
    }
    loadDoctorProfile();
  }, [userId]);

  const filteredQueue = useMemo(() => queue, [queue]);

  async function openCase(row, options = {}) {
    setReadOnly(!!options.readOnly);
    setLoadingCase(true);
    setSelected(row);
    setMsg("");
    setPatient(null);
    setAppointment(null);
    setSteps(null);
    setLab(null);
    setXray(null);
    setReport(EMPTY_REPORT);
    setLatestVitals(null);
    setTriage(null);

    try {
      // 1) appointment
      const { data: appt, error: apptErr } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", row.appointment_id)
        .maybeSingle();

      if (apptErr) throw new Error("Failed to load appointment: " + apptErr.message);
      if (appt?.assigned_doctor_id && appt.assigned_doctor_id !== userId) {
        throw new Error("This booking is assigned to another doctor.");
      }
      setAppointment(appt || null);

      // 2) steps
      const { data: st, error: stErr } = await supabase
        .from("appointment_steps")
        .select("*")
        .eq("appointment_id", row.appointment_id)
        .maybeSingle();

      if (stErr) throw new Error("Failed to load appointment_steps: " + stErr.message);
      setSteps(st || null);

      // 3) patient profile
      const patientId = appt?.patient_id || row.patient_id;
      let prof = null;
      if (patientId) {
        const { data: profData, error: profErr } = await supabase.from("profiles").select("*").eq("id", patientId).maybeSingle();
        if (profErr) throw new Error("Failed to load patient profile: " + profErr.message);
        prof = profData || null;
        setPatient(prof || null);
      }

      // 3b) latest vitals
      const { data: vitRow, error: vitErr } = await supabase
        .from("vitals")
        .select("*")
        .eq("appointment_id", row.appointment_id)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (vitErr) throw new Error("Failed to load vitals: " + vitErr.message);
      setLatestVitals(vitRow || null);

      // 3c) triage
      const { data: triRow, error: triErr } = await supabase
        .from("appointment_triage")
        .select("*")
        .eq("appointment_id", row.appointment_id)
        .maybeSingle();
      if (triErr) throw new Error("Failed to load screening: " + triErr.message);
      setTriage(triRow || null);

      // 4) lab_results
      const { data: labRow, error: labErr } = await supabase
        .from("lab_results")
        .select("*")
        .eq("appointment_id", row.appointment_id)
        .maybeSingle();

      if (labErr) throw new Error("Failed to load lab_results: " + labErr.message);
      setLab(labRow || null);

      // 5) xray_results
      const { data: xrayRow, error: xrayErr } = await supabase
        .from("xray_results")
        .select("*")
        .eq("appointment_id", row.appointment_id)
        .maybeSingle();

      if (xrayErr) throw new Error("Failed to load xray_results: " + xrayErr.message);
      setXray(xrayRow || null);


      // 6) doctor_reports (editable form)
      const { data: reportRow, error: repErr } = await supabase
        .from("doctor_reports")
        .select("*")
        .eq("appointment_id", row.appointment_id)
        .maybeSingle();
      if (repErr) throw new Error("Failed to load doctor report: " + repErr.message);

      const birth = prof?.birth_date || prof?.birthdate || "";
      const age = calcAge(birth);
      const reportDate = appt?.preferred_date || row?.preferred_date || new Date().toISOString().slice(0, 10);
      const company = appt?.company_name || appt?.company || prof?.company || "";
      const saNo = appt?.sa_no || "";

      const { ft, inch } = cmToFtIn(vitRow?.height_cm);
      const weightLbs = kgToLbs(vitRow?.weight_kg);

      const labSummary = summarizeLab(labRow || {});
      const bloodTypeParts = [];
      if (hasValue(labRow?.blood_typing)) bloodTypeParts.push(labRow.blood_typing);
      if (hasValue(labRow?.rh_factor)) bloodTypeParts.push(`RH ${labRow.rh_factor}`);

      const base = {
        ...EMPTY_REPORT,
        report_date: reportDate,
        company,
        sa_no: saNo,
        status: appt?.status || "",

        health_history: triRow?.triage_notes || "",
        present_illness: triRow?.chief_complaint || "",
        medications: triRow?.current_medications || "",
        allergies_notes: triRow?.allergies || "",

        bp_systolic: vitRow?.systolic != null ? String(vitRow.systolic) : "",
        bp_diastolic: vitRow?.diastolic != null ? String(vitRow.diastolic) : "",
        pr: vitRow?.heart_rate != null ? String(vitRow.heart_rate) : "",
        temp_c: vitRow?.temperature_c != null ? String(vitRow.temperature_c) : "",
        rr: "",

        lab_hematology_result: labSummary.hematology || "",
        lab_urinalysis_result: labSummary.urinalysis || "",
        lab_fecalysis_result: labSummary.fecalysis || "",
        lab_hbsag_result: labRow?.hbsag || "",
        lab_pregnancy_test_result: labRow?.pregnancy_test || "",
        lab_blood_type_result: bloodTypeParts.join(" • ") || labRow?.blood_type || "",
        lab_drug_test_result: labRow?.drug_test || "",

        lab_chest_xray_result: xrayRow?.impression || xrayRow?.remarks || "",
        lab_chest_xray_findings: xrayRow?.findings || "",

        evaluation: "",
        remarks: "",
        recommendations: "",

        height_ft: ft,
        height_in: inch,
        weight_lbs: weightLbs,
        examining_physician: examiningPhysician || "",
      };

      const merged = { ...base };
      if (reportRow) {
        Object.keys(merged).forEach((k) => {
          const v = reportRow[k];
          if (typeof merged[k] === "boolean") {
            if (typeof v === "boolean") merged[k] = v;
          } else if (v !== null && v !== undefined && v !== "") {
            merged[k] = v;
          }
        });
      }

      setReport(merged);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("openCase error:", e);
      setMsg(e?.message || "Failed to open case.");
    } finally {
      setLoadingCase(false);
    }
  }

  async function downloadPdf() {
    try {
      setMsg("");
      if (!selected?.appointment_id) throw new Error("No case selected.");
      if (!patient) throw new Error("Patient data not loaded.");
      if (!appointment) throw new Error("Appointment data not loaded.");

      const pdfData = {
        patient,
        appointment,
        steps,
        lab,
        xray,
        report,
        doctor: {
          evaluation: report.evaluation?.trim() || "",
          remarks: report.remarks?.trim() || "",
          recommendation: report.recommendations?.trim() || "",
          doctorEmail: session?.user?.email || "",
        },
      };

      await generateMedicalReportPdf(pdfData);
      setMsg("PDF generated.");
    } catch (e) {
      setMsg("PDF error: " + (e?.message || e));
    }
  }

  async function saveDraft() {
    try {
      setMsg("");
      if (!userId) throw new Error("No session user. Please relogin.");
      if (!selected?.appointment_id) throw new Error("No case selected.");
      if (appointment?.assigned_doctor_id && appointment.assigned_doctor_id !== userId) {
        throw new Error("This booking is assigned to another doctor.");
      }

      setSaving(true);
      const nowIso = new Date().toISOString();
      const reportPayload = {
        appointment_id: selected.appointment_id,
        patient_id: appointment?.patient_id || selected.patient_id,
        doctor_id: userId,
        report_status: "draft",
        updated_at: nowIso,
        created_at: nowIso,
        ...report,
        examining_physician: examiningPhysician || report.examining_physician || "",
      };

      const { error: repErr } = await supabase
        .from("doctor_reports")
        .upsert(reportPayload, { onConflict: "appointment_id" });
      if (repErr) throw repErr;

      setMsg("Draft saved.");
    } catch (e) {
      setMsg("Save draft failed: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function finalizeAndComplete() {
    try {
      setMsg("");
      if (!userId) throw new Error("No session user. Please relogin.");
      if (!selected?.appointment_id) throw new Error("No case selected.");
      if (!String(report.evaluation || "").trim()) throw new Error("Evaluation is required.");
      if (appointment?.assigned_doctor_id && appointment.assigned_doctor_id !== userId) {
        throw new Error("This booking is assigned to another doctor.");
      }

      setSaving(true);

      const nowIso = new Date().toISOString();
      const reportPayload = {
        appointment_id: selected.appointment_id,
        patient_id: appointment?.patient_id || selected.patient_id,
        doctor_id: userId,
        report_status: "draft",
        updated_at: nowIso,
        created_at: nowIso,
        ...report,
        examining_physician: examiningPhysician || report.examining_physician || "",
      };

      const { error: repErr } = await supabase
        .from("doctor_reports")
        .upsert(reportPayload, { onConflict: "appointment_id" });
      if (repErr) throw repErr;

      const doctorNotesCombined = [
        `EVALUATION: ${String(report.evaluation || "").trim()}`,
        String(report.remarks || "").trim() ? `REMARKS: ${String(report.remarks || "").trim()}` : "",
        String(report.recommendations || "").trim()
          ? `RECOMMENDATION: ${String(report.recommendations || "").trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const { error: labUpdErr } = await supabase
        .from("lab_results")
        .update({
          doctor_notes: doctorNotesCombined,
          approval_status: "approved",
          approved_by: userId,
          approved_at: new Date().toISOString(),
        })
        .eq("appointment_id", selected.appointment_id);

      if (labUpdErr) throw labUpdErr;

      const { error: stErr } = await supabase
        .from("appointment_steps")
        .update({ doctor_status: "completed" })
        .eq("appointment_id", selected.appointment_id);

      if (stErr) throw stErr;

      const { data: updatedSteps } = await supabase
        .from("appointment_steps")
        .select("*")
        .eq("appointment_id", selected.appointment_id)
        .maybeSingle();

      if (updatedSteps) setSteps(updatedSteps);

      if (String(updatedSteps?.release_status || "").toLowerCase() === "completed") {
        setSelected(null);
        setPatient(null);
        setAppointment(null);
        setSteps(null);
        setLab(null);
        setXray(null);
        setReport(EMPTY_REPORT);
        setLatestVitals(null);
        setTriage(null);
        await loadQueue();
        setMsg("Finalized and released ✅");
      } else {
        setMsg("Finalized ✅ Please release the medical report to complete the case.");
      }
    } catch (e) {
      setMsg("Finalize failed: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function releaseReport() {
    try {
      setMsg("");
      if (!userId) throw new Error("No session user. Please relogin.");
      if (!selected?.appointment_id) throw new Error("No case selected.");
      if (appointment?.assigned_doctor_id && appointment.assigned_doctor_id !== userId) {
        throw new Error("This booking is assigned to another doctor.");
      }

      setSaving(true);
      const nowIso = new Date().toISOString();

      const { error: repErr } = await supabase
        .from("doctor_reports")
        .update({ report_status: "released", released_at: nowIso })
        .eq("appointment_id", selected.appointment_id);
      if (repErr) throw repErr;

      const { error: stErr } = await supabase
        .from("appointment_steps")
        .update({ release_status: "completed", updated_at: nowIso })
        .eq("appointment_id", selected.appointment_id);

      if (stErr) throw stErr;

      setMsg("Medical report released. Patient can download and book again.");
      if (tab === "records") {
        await loadRecords();
      }
    } catch (e) {
      setMsg("Release failed: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  const patientHeader = useMemo(() => {
    const fullName = patient?.full_name || patientName(selected?.patient_id);
    const gender = patient?.gender || "";
    const birth = patient?.birth_date || patient?.birthdate || "";
    const age = calcAge(birth);
    return { fullName, gender, birth, age };
  }, [patient, selected, patientNameMap]);

  const companyName = report.company || appointment?.company_name || appointment?.company || "";
  const saNo = report.sa_no || appointment?.sa_no || "";

  const content = useMemo(() => {
    if (!selected) return null;
    const safeDate = report.report_date || appointment?.preferred_date || selected?.preferred_date || "";
    const reportDate = safeDate || new Date().toISOString().slice(0, 10);
    return {
      reportDate,
      address: patient?.address || "",
      contact: patient?.contact_no || patient?.phone || "",
      heightFt: report.height_ft || "",
      heightIn: report.height_in || "",
      weight: report.weight_lbs || "",
      status: report.status || appointment?.status || "",
    };
  }, [selected, appointment, patient, report]);


  return (
    <DashboardErrorBoundary>
      <div style={{ minHeight: "100vh", padding: 18 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <header className="page-header no-print">
            <div className="page-header-main">
              <h1 className="page-title">Doctor Dashboard</h1>
              <p className="page-subtitle">Ready = lab completed + xray completed, doctor not completed</p>
            </div>
            <div className="page-actions" />
          </header>

          {msg ? <Card style={{ marginBottom: 12, borderColor: "rgba(20,184,166,0.25)" }}>{msg}</Card> : null}

          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <SecondaryButton
                onClick={() => setTab("queue")}
                disabled={tab === "queue"}
              >
                Queue
              </SecondaryButton>
              <SecondaryButton
                onClick={() => {
                  setTab("records");
                  loadRecords();
                }}
                disabled={tab === "records"}
              >
                Records
              </SecondaryButton>
            </div>

            {tab === "records" ? (
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>Doctor Records</div>
                  <div style={{ fontSize: 12, color: "rgba(15,23,42,0.70)" }}>{records.length} record(s)</div>
                </div>

                <div style={{ marginTop: 12, overflowX: "auto" }}>
                  <table className="clinic-table">
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Company</th>
                        <th>Type</th>
                        <th>Appointment Date</th>
                        <th>Report Date</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {recordsLoading ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 12, color: "rgba(15,23,42,0.70)" }}>
                            Loading records...
                          </td>
                        </tr>
                      ) : records.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 12, color: "rgba(15,23,42,0.70)" }}>
                            No released records yet.
                          </td>
                        </tr>
                      ) : (
                        records.map((r) => (
                          <tr key={r.appointment_id}>
                            <td style={{ fontWeight: 800 }}>{patientName(r.patient_id)}</td>
                            <td>{r.company_name || "—"}</td>
                            <td>{r.appointment_type || "—"}</td>
                            <td>{r.preferred_date || "—"}</td>
                            <td>{r.report_date || "—"}</td>
                            <td>{r.report_status || r.status || "—"}</td>
                            <td>
                              <SecondaryButton
                                onClick={() => {
                                  setTab("queue");
                                  openCase(r, { readOnly: true });
                                }}
                              >
                                View
                              </SecondaryButton>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <>
            {/* Queue */}
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontWeight: 900, color: "#0f172a" }}>Doctor Queue</div>
                <div style={{ fontSize: 12, color: "rgba(15,23,42,0.70)" }}>{filteredQueue.length} case(s)</div>
              </div>

              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table className="clinic-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Type</th>
                      <th>Date</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQueue.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: 12, color: "rgba(15,23,42,0.70)" }}>
                          No ready cases.
                        </td>
                      </tr>
                    ) : (
                      filteredQueue.map((r) => {
                        const isSelected = selected?.appointment_id === r.appointment_id;
                        return (
                          <tr
                            key={r.appointment_id}
                            style={{
                              background: isSelected ? "rgba(20,184,166,0.06)" : "transparent",
                            }}
                          >
                            <td style={{ fontWeight: 800 }}>{patientName(r.patient_id)}</td>
                            <td>{r.appointment_type || "—"}</td>
                            <td>{r.preferred_date || "—"}</td>
                            <td>
                              <PrimaryButton onClick={() => openCase(r)} disabled={loadingCase}>
                                {loadingCase && isSelected ? "Opening..." : "Open"}
                              </PrimaryButton>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Report */}
            <Card>
              {!selected ? (
                <div className="clinic-empty">
                  <strong>No case selected</strong>
                  Select a case from the queue to encode the final report.
                </div>
              ) : loadingCase ? (
                <ReportLoadingSkeleton />
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>
                      Physical / Medical Examination Report
                      {readOnly ? <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>(Read-only)</span> : null}
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <SecondaryButton onClick={downloadPdf}>Download PDF</SecondaryButton>
                      <SecondaryButton onClick={saveDraft} disabled={formDisabled}>
                        {saving ? "Saving..." : "Save Draft"}
                      </SecondaryButton>
                      <SecondaryButton
                        onClick={releaseReport}
                        disabled={formDisabled || String(steps?.doctor_status || "").toLowerCase() !== "completed"}
                      >
                        {saving ? "Releasing..." : "Release Medical Report"}
                      </SecondaryButton>
                      <PrimaryButton onClick={finalizeAndComplete} disabled={formDisabled}>
                        {saving ? "Saving..." : "Finalize & Mark Completed"}
                      </PrimaryButton>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                    <div style={{ display: "grid", gap: 12 }}>
                      <div>
                        <b>Patient Information</b>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                          <div>
                            <Label>Date</Label>
                            <Input value={content?.reportDate || ""} disabled />
                          </div>
                          <div>
                            <Label>Company</Label>
                            <Input value={companyName || ""} disabled />
                          </div>
                          <div>
                            <Label>Patient’s name</Label>
                            <Input value={patientHeader.fullName || ""} disabled />
                          </div>
                          <div>
                            <Label>SA No</Label>
                            <Input value={saNo || ""} disabled />
                          </div>
                          <div>
                            <Label>Gender</Label>
                            <Input value={patientHeader.gender || ""} disabled />
                          </div>
                          <div>
                            <Label>Birth Date</Label>
                            <Input value={patientHeader.birth || ""} disabled />
                          </div>
                          <div>
                            <Label>Status</Label>
                            <Input value={content?.status || ""} disabled />
                          </div>
                          <div>
                            <Label>Age</Label>
                            <Input value={patientHeader.age || ""} disabled />
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                          <div>
                            <Label>Address</Label>
                            <Input value={content?.address || ""} disabled />
                          </div>
                          <div>
                            <Label>Contact No.</Label>
                            <Input value={content?.contact || ""} disabled />
                          </div>
                        </div>
                      </div>

                      <div>
                        <b>Medical History</b>
                        <div style={{ marginTop: 8 }}>
                          <Label>Health history (Previous Ailment)</Label>
                          <Textarea
                            value={report.health_history}
                            onChange={(e) => setReportField("health_history", e.target.value)}
                            rows={3}
                            disabled={formDisabled}
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginTop: 10 }}>
                          {MEDICAL_HISTORY_ITEMS.map(([key, label]) => (
                            <label key={key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                              <input type="checkbox" checked={!!report[key]} onChange={() => toggleReportField(key)} disabled={formDisabled} />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <b>Social History</b>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                          <div>
                            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                              <input type="checkbox" checked={!!report.smoker} onChange={() => toggleReportField("smoker")} disabled={formDisabled} />
                              Smoker
                            </label>
                            <Input
                              value={report.packs_per_day}
                              onChange={(e) => setReportField("packs_per_day", sanitizeNumberInput(e.target.value, false))}
                              placeholder="No. of packs/day"
                              disabled={formDisabled}
                              inputMode="numeric"
                            />
                          </div>
                          <div>
                            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                              <input type="checkbox" checked={!!report.alcohol_drinker} onChange={() => toggleReportField("alcohol_drinker")} disabled={formDisabled} />
                              Alcohol drinker
                            </label>
                            <Input
                              value={report.alcohol_years}
                              onChange={(e) => setReportField("alcohol_years", sanitizeNumberInput(e.target.value, false))}
                              placeholder="No. of years"
                              disabled={formDisabled}
                              inputMode="numeric"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <b>Present Illness</b>
                        <Textarea value={report.present_illness} onChange={(e) => setReportField("present_illness", e.target.value)} rows={3} disabled={formDisabled} />
                      </div>
                      <div>
                        <b>Medication (previously and presently taking)</b>
                        <Textarea value={report.medications} onChange={(e) => setReportField("medications", e.target.value)} rows={3} disabled={formDisabled} />
                      </div>
                      <div>
                        <b>Allergies (food, medicines, environmental, etc.)</b>
                        <Textarea value={report.allergies_notes} onChange={(e) => setReportField("allergies_notes", e.target.value)} rows={3} disabled={formDisabled} />
                      </div>
                      <div>
                        <b>Operation / Hospitalization</b>
                        <Textarea value={report.operations} onChange={(e) => setReportField("operations", e.target.value)} rows={3} disabled={formDisabled} />
                      </div>

                      <div>
                        <b>Physical Examination</b>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                          {PHYSICAL_EXAM_FIELDS.map(([key, label]) => (
                            <div key={key}>
                              <Label>{label}</Label>
                              <Input value={report[key]} onChange={(e) => setReportField(key, e.target.value)} disabled={formDisabled} />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <b>Vital Signs</b>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 8 }}>
                          <div>
                            <Label>BP (mmHg)</Label>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                              <Input
                                value={report.bp_systolic}
                                onChange={(e) => setReportField("bp_systolic", sanitizeNumberInput(e.target.value, false))}
                                placeholder="Systolic"
                                disabled={formDisabled}
                                inputMode="numeric"
                              />
                              <Input
                                value={report.bp_diastolic}
                                onChange={(e) => setReportField("bp_diastolic", sanitizeNumberInput(e.target.value, false))}
                                placeholder="Diastolic"
                                disabled={formDisabled}
                                inputMode="numeric"
                              />
                            </div>
                          </div>
                          <div>
                            <Label>PR (bpm)</Label>
                            <Input
                              value={report.pr}
                              onChange={(e) => setReportField("pr", sanitizeNumberInput(e.target.value, false))}
                              disabled={formDisabled}
                              inputMode="numeric"
                            />
                          </div>
                          <div>
                            <Label>RR (/min)</Label>
                            <Input
                              value={report.rr}
                              onChange={(e) => setReportField("rr", sanitizeNumberInput(e.target.value, false))}
                              disabled={formDisabled}
                              inputMode="numeric"
                            />
                          </div>
                          <div>
                            <Label>Temp (°C)</Label>
                            <Input
                              value={report.temp_c}
                              onChange={(e) => setReportField("temp_c", sanitizeNumberInput(e.target.value, true))}
                              disabled={formDisabled}
                              inputMode="decimal"
                            />
                          </div>
                          <div>
                            <Label>Height (ft)</Label>
                            <Input
                              value={report.height_ft}
                              onChange={(e) => setReportField("height_ft", sanitizeNumberInput(e.target.value, false))}
                              disabled={formDisabled}
                              inputMode="numeric"
                            />
                          </div>
                          <div>
                            <Label>Height (inch)</Label>
                            <Input
                              value={report.height_in}
                              onChange={(e) => setReportField("height_in", sanitizeNumberInput(e.target.value, false))}
                              disabled={formDisabled}
                              inputMode="numeric"
                            />
                          </div>
                          <div>
                            <Label>Weight (lbs.)</Label>
                            <Input
                              value={report.weight_lbs}
                              onChange={(e) => setReportField("weight_lbs", sanitizeNumberInput(e.target.value, true))}
                              disabled={formDisabled}
                              inputMode="decimal"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <b>Visual Acuity</b>
                        <div style={{ overflowX: "auto", marginTop: 8 }}>
                          <table className="clinic-table">
                            <thead>
                              <tr>
                                <th />
                                <th>OD</th>
                                <th>OS</th>
                                <th>OU</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td>W/o Glasses</td>
                                <td><Input value={report.vision_wo_od} onChange={(e) => setReportField("vision_wo_od", e.target.value)} disabled={formDisabled} /></td>
                                <td><Input value={report.vision_wo_os} onChange={(e) => setReportField("vision_wo_os", e.target.value)} disabled={formDisabled} /></td>
                                <td><Input value={report.vision_wo_ou} onChange={(e) => setReportField("vision_wo_ou", e.target.value)} disabled={formDisabled} /></td>
                              </tr>
                              <tr>
                                <td>W/ Glasses</td>
                                <td><Input value={report.vision_w_od} onChange={(e) => setReportField("vision_w_od", e.target.value)} disabled={formDisabled} /></td>
                                <td><Input value={report.vision_w_os} onChange={(e) => setReportField("vision_w_os", e.target.value)} disabled={formDisabled} /></td>
                                <td><Input value={report.vision_w_ou} onChange={(e) => setReportField("vision_w_ou", e.target.value)} disabled={formDisabled} /></td>
                              </tr>
                              <tr>
                                <td>Near</td>
                                <td><Input value={report.vision_near_od} onChange={(e) => setReportField("vision_near_od", e.target.value)} disabled={formDisabled} /></td>
                                <td><Input value={report.vision_near_os} onChange={(e) => setReportField("vision_near_os", e.target.value)} disabled={formDisabled} /></td>
                                <td><Input value={report.vision_near_ou} onChange={(e) => setReportField("vision_near_ou", e.target.value)} disabled={formDisabled} /></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div>
                        <b>Ishihara Test</b>
                        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={!!report.ishihara_normal}
                              onChange={() => {
                                toggleReportField("ishihara_normal");
                                setReportField("ishihara_defective", false);
                              }}
                              disabled={formDisabled}
                            />
                            Normal
                          </label>
                          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={!!report.ishihara_defective}
                              onChange={() => {
                                toggleReportField("ishihara_defective");
                                setReportField("ishihara_normal", false);
                              }}
                              disabled={formDisabled}
                            />
                            Defective
                          </label>
                        </div>
                      </div>

                      <div>
                        <b>OB / Gyne</b>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 8 }}>
                          <div>
                            <Label>LMP</Label>
                            <Input value={report.ob_lmp} onChange={(e) => setReportField("ob_lmp", e.target.value)} disabled={formDisabled} />
                          </div>
                          <div>
                            <Label>OB Score</Label>
                            <Input value={report.ob_score} onChange={(e) => setReportField("ob_score", e.target.value)} disabled={formDisabled} />
                          </div>
                          <div>
                            <Label>Interval</Label>
                            <Input value={report.ob_interval} onChange={(e) => setReportField("ob_interval", e.target.value)} disabled={formDisabled} />
                          </div>
                          <div>
                            <Label>Duration</Label>
                            <Input value={report.ob_duration} onChange={(e) => setReportField("ob_duration", e.target.value)} disabled={formDisabled} />
                          </div>
                          <div>
                            <Label>Dysmenorrhea</Label>
                            <Input value={report.ob_dysmenorrhea} onChange={(e) => setReportField("ob_dysmenorrhea", e.target.value)} disabled={formDisabled} />
                          </div>
                        </div>
                      </div>

                      <div>
                        <b>Dental Examination</b>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 8 }}>
                          <div>
                            <Label>Oral Prophylaxis</Label>
                            <Input value={report.dental_oral_prophylaxis} onChange={(e) => setReportField("dental_oral_prophylaxis", e.target.value)} disabled={formDisabled} />
                          </div>
                          <div>
                            <Label>Fillings</Label>
                            <Input value={report.dental_fillings} onChange={(e) => setReportField("dental_fillings", e.target.value)} disabled={formDisabled} />
                          </div>
                          <div>
                            <Label>Extraction</Label>
                            <Input value={report.dental_extraction} onChange={(e) => setReportField("dental_extraction", e.target.value)} disabled={formDisabled} />
                          </div>
                          <div>
                            <Label>Others</Label>
                            <Input value={report.dental_others} onChange={(e) => setReportField("dental_others", e.target.value)} disabled={formDisabled} />
                          </div>
                          <div>
                            <Label>Attending Dentist</Label>
                            <Input value={report.dental_attending} onChange={(e) => setReportField("dental_attending", e.target.value)} disabled={formDisabled} />
                          </div>
                        </div>
                      </div>

                      <div>
                        <b>Laboratory and Diagnostic Examination</b>
                        <div style={{ overflowX: "auto", marginTop: 8 }}>
                          <table className="clinic-table">
                            <thead>
                              <tr>
                                <th>Test</th>
                                <th>Result</th>
                                <th>Findings</th>
                              </tr>
                            </thead>
                            <tbody>
                              {LAB_DIAG_FIELDS.map(([resKey, label, findKey]) => (
                                <tr key={resKey}>
                                  <td>{label}</td>
                                  <td>
                                    {LAB_RESULT_OPTIONS[resKey] ? (
                                      <Select
                                        value={report[resKey]}
                                        onChange={(e) => setReportField(resKey, e.target.value)}
                                        disabled={formDisabled}
                                        options={LAB_RESULT_OPTIONS[resKey]}
                                      />
                                    ) : (
                                      <Input value={report[resKey]} onChange={(e) => setReportField(resKey, e.target.value)} disabled={formDisabled} />
                                    )}
                                  </td>
                                  <td>
                                    <Input value={report[findKey]} onChange={(e) => setReportField(findKey, e.target.value)} disabled={formDisabled} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div>
                        <b>Evaluations</b>
                        <Textarea value={report.evaluation} onChange={(e) => setReportField("evaluation", e.target.value)} rows={4} disabled={formDisabled} />
                      </div>
                      <div>
                        <b>Remarks</b>
                        <Textarea value={report.remarks} onChange={(e) => setReportField("remarks", e.target.value)} rows={4} disabled={formDisabled} />
                      </div>
                      <div>
                        <b>Recommendations</b>
                        <Textarea value={report.recommendations} onChange={(e) => setReportField("recommendations", e.target.value)} rows={4} disabled={formDisabled} />
                      </div>

                      <div>
                        <b>Examining Physician</b>
                        <Input value={report.examining_physician} disabled />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardErrorBoundary>
  );
}

/**
 * (Optional) If you ever need to sanitize URLs,
 * keep this as a passthrough for now.
 */
function x_tf(url) {
  return url;
}
