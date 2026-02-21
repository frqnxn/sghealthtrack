// src/dashboards/LabDashboard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../components/ToastCenter";
import { supabase } from "../lib/supabase";
import { NON_PARTNER_NAME } from "../utils/companyPartners";
import useSuccessToast from "../utils/useSuccessToast";

/* ---------- helpers ---------- */
function pickBool(v) {
  return typeof v === "boolean" ? v : false;
}

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const RH_OPTIONS = ["Positive", "Negative", "Pos", "Neg"];
const HBSAG_OPTIONS = ["Non-reactive", "Reactive"];
const HEPA_A_OPTIONS = ["Non-reactive", "Reactive"];
const PREG_OPTIONS = ["Negative", "Positive"];
const DRUG_TEST_OPTIONS = ["Negative", "Positive"];
const EMPTY_RESULTS = {
  cbc_platelet: "",
  cbc_hemoglobin: "",
  cbc_hematocrit: "",
  cbc_rbc_count: "",
  cbc_wbc_count: "",
  cbc_neutrophils: "",
  cbc_lymphocytes: "",
  cbc_eosinophils: "",
  cbc_monocytes: "",
  cbc_basophils: "",
  rh_factor: "",
  fbs: "",
  rbs: "",
  hepa_a_test: "",
  ua_color: "",
  ua_transparency: "",
  ua_ph: "",
  ua_specific_gravity: "",
  ua_sugar: "",
  ua_albumin: "",
  ua_bacteria: "",
  ua_wbc_hpf: "",
  ua_rbc_hpf: "",
  ua_epithelial_cells: "",
  ua_mucous_threads: "",
  ua_amorphous_urates: "",
  ua_casts: "",
  ua_crystals: "",
  fe_color: "",
  fe_consistency: "",
  fe_pus_cells_hpf: "",
  fe_rbc_hpf: "",
  fe_ova_parasites: "",
  blood_typing: "",
  urinalysis: "",
  fecalysis: "",
  pregnancy_test: "",
  hbsag: "",
  drug_test: "",
  others: "",
  remarks: "",
};

function SectionTitle({ children }) {
  return (
    <div
      style={{
        marginTop: 14,
        marginBottom: 10,
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: 0.6,
        opacity: 0.8,
      }}
    >
      {children}
    </div>
  );
}

/* ================== MAIN ================== */
export default function LabDashboard({ session, page = "queue" }) {
  const userId = session?.user?.id;
  const isHistory = page === "history";

  const [appointments, setAppointments] = useState([]);
  const [patientNameMap, setPatientNameMap] = useState({});
  const [patientCompanyMap, setPatientCompanyMap] = useState({});
  const [selected, setSelected] = useState(null);
  const [labHistory, setLabHistory] = useState([]);
  const [labHistoryLoading, setLabHistoryLoading] = useState(false);
  const [labHistoryQuery, setLabHistoryQuery] = useState("");
  const [selectedHistory, setSelectedHistory] = useState(null);

  const [reqRow, setReqRow] = useState(null);
  const [existingLabRow, setExistingLabRow] = useState(null);
  const [stepRow, setStepRow] = useState(null); // appointment_steps row
  const [formKey, setFormKey] = useState(0);
  const [openSection, setOpenSection] = useState("cbc");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const { showToast } = useToast();
  useSuccessToast(msg, showToast);

  // Results form state (for default values on load)
  const [results, setResults] = useState(EMPTY_RESULTS);
  const formValuesRef = useRef({ ...EMPTY_RESULTS });

  const apptId = selected?.id;

  function readFormValues() {
    return formValuesRef.current || {};
  }

  /* ---------- fields ---------- */
  function NumberField({ label, keyName, placeholder = "0", disabled }) {
    return (
      <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
        <label className="label">{label}</label>
        <input
          className="input"
          type="text"
          inputMode="decimal"
          pattern="[0-9.]*"
          autoComplete="off"
          defaultValue={results[keyName] ?? ""}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            const sanitized = raw
              .replace(/[^0-9.]/g, "")
              .replace(/(\..*)\./g, "$1");
            if (sanitized !== raw) {
              e.target.value = sanitized;
            }
            formValuesRef.current[keyName] = sanitized;
          }}
        />
      </div>
    );
  }

  function TextField({ label, keyName, placeholder = "e.g. Normal / Findings", disabled }) {
    return (
      <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
        <label className="label">{label}</label>
        <input
          className="input"
          type="text"
          autoComplete="off"
          defaultValue={results[keyName] ?? ""}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            formValuesRef.current[keyName] = e.target.value;
          }}
        />
      </div>
    );
  }

  function SelectField({ label, keyName, options, placeholder = "Select...", disabled }) {
    return (
      <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
        <label className="label">{label}</label>
        <select
          className="input"
          defaultValue={results[keyName] ?? ""}
          disabled={disabled}
          onChange={(e) => {
            formValuesRef.current[keyName] = e.target.value;
          }}
        >
          <option value="">{placeholder}</option>
          {options.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      </div>
    );
  }

  function TextAreaField({ label, keyName, placeholder = "Optional notes...", disabled }) {
    return (
      <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
        <label className="label">{label}</label>
        <textarea
          style={{
            minHeight: 140,
            resize: "vertical",
            lineHeight: 1.5,
          }}
          className="input"
          autoComplete="off"
          defaultValue={results[keyName] ?? ""}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            formValuesRef.current[keyName] = e.target.value;
          }}
        />
      </div>
    );
  }

  /* ---------- load patient names ---------- */
  async function loadPatientNames(ids) {
    const uniq = Array.from(new Set((ids || []).filter(Boolean)));
    if (uniq.length === 0) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, company")
      .in("id", uniq);

    if (error) return;

    setPatientNameMap((prev) => {
      const next = { ...prev };
      (data || []).forEach((p) => (next[p.id] = p.full_name || ""));
      return next;
    });

    setPatientCompanyMap((prev) => {
      const next = { ...prev };
      (data || []).forEach((p) => (next[p.id] = p.company || ""));
      return next;
    });
  }

  function patientName(id) {
    return patientNameMap[id]?.trim() || "(No name)";
  }

  function patientCompany(id) {
    const company = (patientCompanyMap[id] || "").trim();
    return company || NON_PARTNER_NAME;
  }

  /* ---------- load appointment details ---------- */
  async function loadForAppointment(row) {
    if (!row?.id) return;
    setSelected(row);
    setMsg("");
    setReqRow(null);
    setExistingLabRow(null);
    setStepRow(null);
    setResults(EMPTY_RESULTS);
    formValuesRef.current = { ...EMPTY_RESULTS };

    const [reqRes, labRes, stepRes] = await Promise.all([
      supabase.from("appointment_requirements").select("*").eq("appointment_id", row.id).maybeSingle(),
      supabase
        .from("lab_results")
        .select(
          [
            "appointment_id",
            "cbc_platelet",
            "cbc_hemoglobin",
            "cbc_hematocrit",
            "cbc_rbc_count",
            "cbc_wbc_count",
            "cbc_neutrophils",
            "cbc_lymphocytes",
            "cbc_eosinophils",
            "cbc_monocytes",
            "cbc_basophils",
            "blood_typing",
            "rh_factor",
            "fbs",
            "rbs",
            "hepa_a_test",
            "urinalysis",
            "ua_color",
            "ua_transparency",
            "ua_ph",
            "ua_specific_gravity",
            "ua_sugar",
            "ua_albumin",
            "ua_bacteria",
            "ua_wbc_hpf",
            "ua_rbc_hpf",
            "ua_epithelial_cells",
            "ua_mucous_threads",
            "ua_amorphous_urates",
            "ua_casts",
            "ua_crystals",
            "fecalysis",
            "fe_color",
            "fe_consistency",
            "fe_pus_cells_hpf",
            "fe_rbc_hpf",
            "fe_ova_parasites",
            "pregnancy_test",
            "hbsag",
            "drug_test",
            "others",
            "remarks",
          ].join(", ")
        )
        .eq("appointment_id", row.id)
        .maybeSingle(),
      supabase.from("appointment_steps").select("*").eq("appointment_id", row.id).maybeSingle(),
    ]);

    if (reqRes.error) setMsg(`Failed to load form slip: ${reqRes.error.message}`);
    if (labRes.error) setMsg(`Failed to load existing lab results: ${labRes.error.message}`);
    if (stepRes.error) setMsg(`Failed to load appointment steps: ${stepRes.error.message}`);

    setReqRow(reqRes.data || null);
    setExistingLabRow(labRes.data || null);
    setStepRow(stepRes.data || null);

    const initial = labRes.data ? { ...EMPTY_RESULTS, ...labRes.data } : { ...EMPTY_RESULTS };
    setResults(initial);
    formValuesRef.current = { ...initial };
    setFormKey((k) => k + 1);
  }

  /* ---------- load approved appointments ---------- */
  async function loadApprovedAppointments() {
  setLoading(true);
  setMsg("");

  const { data, error } = await supabase
    .from("appointment_steps")
    .select(
      `
      appointment_id,
      payment_status,
      triage_status,
      lab_status,
      done_at,
      updated_at,
      appointments:appointment_id (
        id,
        patient_id,
        appointment_type,
        preferred_date,
        workflow_status,
        status,
        created_at
      )
    `
    )
    .order("updated_at", { ascending: true, nullsFirst: false }); // FIFO from latest step updates

  if (error) {
    setMsg("Failed to load lab queue: " + error.message);
    setAppointments([]);
    setLoading(false);
    return;
  }

  const rows =
    (data || [])
      .map((r) => {
        const appt = r.appointments;
        if (!appt?.id) return null;
        return {
          id: appt.id,
          patient_id: appt.patient_id,
          appointment_type: appt.appointment_type,
          preferred_date: appt.preferred_date,
          workflow_status: appt.workflow_status,
          status: appt.status,
          created_at: appt.created_at,
          payment_status: r.payment_status,
          triage_status: r.triage_status,
          // extra: useful to display
          triage_done_at: r.done_at,
          lab_status: r.lab_status,
        };
      })
      .filter((row) => {
        if (!row) return false;
        const paymentStatus = String(row.payment_status || "").toLowerCase();
        const triageStatus = String(row.triage_status || "").toLowerCase();
        const labStatus = String(row.lab_status || "").toLowerCase();
        const workflowStatus = String(row.workflow_status || "").toLowerCase();
        const status = String(row.status || "").toLowerCase();

        const notCanceled = !["rejected", "cancelled", "canceled"].includes(status);
        const inFlow = ["approved", "arrived", "awaiting_forms", "ready_for_triage", "in_progress"].includes(workflowStatus) || status === "approved" || status === "in_progress";

        return (
          notCanceled &&
          inFlow &&
          paymentStatus === "completed" &&
          triageStatus === "completed" &&
          labStatus !== "completed"
        );
      }) || [];

  setAppointments(rows);
  await loadPatientNames(rows.map((a) => a.patient_id));
  setLoading(false);
}

  async function loadLabHistory() {
    setLabHistoryLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("lab_results")
      .select(
        `
        id,
        appointment_id,
        patient_id,
        recorded_at,
        cbc_platelet,
        cbc_hemoglobin,
        cbc_hematocrit,
        cbc_rbc_count,
        cbc_wbc_count,
        cbc_neutrophils,
        cbc_lymphocytes,
        cbc_eosinophils,
        cbc_monocytes,
        cbc_basophils,
        blood_typing,
        rh_factor,
        fbs,
        rbs,
        hepa_a_test,
        urinalysis,
        ua_color,
        ua_transparency,
        ua_ph,
        ua_specific_gravity,
        ua_sugar,
        ua_albumin,
        ua_bacteria,
        ua_wbc_hpf,
        ua_rbc_hpf,
        ua_epithelial_cells,
        ua_mucous_threads,
        ua_amorphous_urates,
        ua_casts,
        ua_crystals,
        fecalysis,
        fe_color,
        fe_consistency,
        fe_pus_cells_hpf,
        fe_rbc_hpf,
        fe_ova_parasites,
        pregnancy_test,
        hbsag,
        drug_test,
        remarks,
        appointments:appointment_id (
          appointment_type,
          preferred_date
        )
      `
      )
      .order("recorded_at", { ascending: false })
      .limit(200);

    if (error) {
      setLabHistory([]);
      setLabHistoryLoading(false);
      return setMsg(`Failed to load lab history: ${error.message}`);
    }

    setLabHistory(data || []);
    await loadPatientNames((data || []).map((row) => row.patient_id));
    setLabHistoryLoading(false);
  }

  useEffect(() => {
    if (isHistory) {
      loadLabHistory();
      return;
    }

    loadApprovedAppointments();
    const channel = supabase
      .channel("lab-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointment_steps" },
        () => loadApprovedAppointments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHistory]);

  /* ---------- determine requested tests from appointment_requirements ---------- */
  const requested = useMemo(() => {
    const r = reqRow || {};
    return {
      physical_exam: pickBool(r.exam_physical),
      visual_acuity: pickBool(r.exam_visual_acuity),
      height_weight: pickBool(r.exam_height_weight),
      cbc_platelet: pickBool(r.lab_cbc_platelet),
      urinalysis: pickBool(r.lab_urinalysis),
      fecalysis: pickBool(r.lab_fecalysis),
      drug_test: pickBool(r.lab_drug_test),
      hepatitis_b: pickBool(r.lab_hepatitis_b),
      hepatitis_a: pickBool(r.lab_hepatitis_a),
      ecg: pickBool(r.lab_ecg),
      audiometry: pickBool(r.lab_audiometry),
      blood_typing: pickBool(r.lab_blood_typing),
      pregnancy_test: pickBool(r.lab_pregnancy_test),
      salmonella: pickBool(r.lab_salmonella),
      custom_items: Array.isArray(r.lab_custom_items) ? r.lab_custom_items : [],
    };
  }, [reqRow]);

  const cbcFields = [
    "cbc_hemoglobin",
    "cbc_hematocrit",
    "cbc_rbc_count",
    "cbc_wbc_count",
    "cbc_neutrophils",
    "cbc_lymphocytes",
    "cbc_eosinophils",
    "cbc_monocytes",
    "cbc_basophils",
    "cbc_platelet",
  ];

  const urinalysisFields = [
    "ua_color",
    "ua_transparency",
    "ua_ph",
    "ua_specific_gravity",
    "ua_sugar",
    "ua_albumin",
    "ua_bacteria",
    "ua_wbc_hpf",
    "ua_rbc_hpf",
    "ua_epithelial_cells",
    "ua_mucous_threads",
    "ua_amorphous_urates",
    "ua_casts",
    "ua_crystals",
    "pregnancy_test",
    "urinalysis",
  ];

  const fecalysisFields = [
    "fe_color",
    "fe_consistency",
    "fe_pus_cells_hpf",
    "fe_rbc_hpf",
    "fe_ova_parasites",
    "fecalysis",
  ];

  const otherFields = [
    "blood_typing",
    "rh_factor",
    "fbs",
    "rbs",
    "hepa_a_test",
    "hbsag",
    "drug_test",
  ];

  function countFilled(keys) {
    const values = readFormValues();
    let filled = 0;
    keys.forEach((key) => {
      if (String(values[key] ?? "").trim()) filled += 1;
    });
    return filled;
  }

  const cbcCount = countFilled(cbcFields);
  const urinalysisCount = countFilled(urinalysisFields);
  const fecalysisCount = countFilled(fecalysisFields);
  const otherCount = countFilled(otherFields);

  function SectionCard({ id, title, meta, children }) {
    const isOpen = openSection === id;
    return (
      <div className="card" style={{ padding: 12 }}>
        <button
          type="button"
          className="btn"
          onClick={() => setOpenSection(isOpen ? "" : id)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "8px 10px",
          }}
        >
          <span style={{ fontWeight: 800 }}>{title}</span>
          <span style={{ opacity: 0.75, fontSize: 12 }}>{meta}</span>
        </button>
        {isOpen ? <div style={{ marginTop: 10 }}>{children}</div> : null}
      </div>
    );
  }
  const customLabels = useMemo(() => {
    return (requested.custom_items || [])
      .map((item) => String(item?.label || "").trim().toLowerCase())
      .filter(Boolean);
  }, [requested.custom_items]);

  function hasCustomLabel(target) {
    const needle = String(target || "").trim().toLowerCase();
    if (!needle) return false;
    return customLabels.some((label) => label === needle || label.includes(needle));
  }

  const anyRequested = useMemo(() => {
    return (
      requested.physical_exam ||
      requested.visual_acuity ||
      requested.height_weight ||
      requested.cbc_platelet ||
      requested.blood_typing ||
      requested.urinalysis ||
      requested.fecalysis ||
      requested.drug_test ||
      requested.hepatitis_b ||
      requested.hepatitis_a ||
      requested.ecg ||
      requested.audiometry ||
      requested.pregnancy_test ||
      requested.salmonella ||
      (requested.custom_items || []).length > 0
    );
  }, [requested]);

  const labStepStatus = useMemo(() => {
    return (stepRow?.lab_status || "PENDING").toUpperCase();
  }, [stepRow]);

  /* ---------- validation (prevents wrong encoding) ---------- */
  function isValidNumberString(s) {
    const v = String(s ?? "").trim();
    if (!v) return true; // allow empty if user hasn't encoded yet
    return !Number.isNaN(Number(v));
  }

  function validateBeforeSave() {
    // if field is requested, enforce type
    const values = readFormValues();
    const numericKeys = [
      "cbc_platelet",
      "cbc_hemoglobin",
      "cbc_hematocrit",
      "cbc_rbc_count",
      "cbc_wbc_count",
      "cbc_neutrophils",
      "cbc_lymphocytes",
      "cbc_eosinophils",
      "cbc_monocytes",
      "cbc_basophils",
      "ua_ph",
      "ua_specific_gravity",
      "fbs",
      "rbs",
    ];

    for (const key of numericKeys) {
      if (!isValidNumberString(values[key])) {
        return `${key.replaceAll("_", " ")} must be a number.`;
      }
    }

    if (requested.cbc_platelet && !isValidNumberString(values.cbc_platelet))
      return "CBC & Platelet must be a number.";
    if (requested.blood_typing && values.blood_typing && !BLOOD_TYPES.includes(values.blood_typing))
      return "Blood Typing must be selected from the dropdown.";
    if (requested.blood_typing && values.rh_factor && !RH_OPTIONS.includes(values.rh_factor))
      return "RH factor must be selected from the dropdown.";
    if (requested.pregnancy_test && values.pregnancy_test && !PREG_OPTIONS.includes(values.pregnancy_test))
      return "Pregnancy Test must be selected from the dropdown.";
    if (requested.hepatitis_a && values.hepa_a_test && !HEPA_A_OPTIONS.includes(values.hepa_a_test))
      return "Hepatitis A test must be selected from the dropdown.";
    if (requested.hepatitis_b && values.hbsag && !HBSAG_OPTIONS.includes(values.hbsag))
      return "Hepatitis B Screening must be selected from the dropdown.";
    if (requested.drug_test && values.drug_test && !DRUG_TEST_OPTIONS.includes(values.drug_test))
      return "Drug Test must be selected from the dropdown.";

    return "";
  }

  function buildLabPayload() {
    const values = readFormValues();
    return {
      appointment_id: selected.id,
      patient_id: selected.patient_id,
      recorded_by: userId,
      recorded_at: new Date().toISOString(),

      // Keep as strings to avoid breaking existing schema if columns are text.
      // Number inputs still prevent letters.
      cbc_platelet: values.cbc_platelet || null,
      cbc_hemoglobin: values.cbc_hemoglobin || null,
      cbc_hematocrit: values.cbc_hematocrit || null,
      cbc_rbc_count: values.cbc_rbc_count || null,
      cbc_wbc_count: values.cbc_wbc_count || null,
      cbc_neutrophils: values.cbc_neutrophils || null,
      cbc_lymphocytes: values.cbc_lymphocytes || null,
      cbc_eosinophils: values.cbc_eosinophils || null,
      cbc_monocytes: values.cbc_monocytes || null,
      cbc_basophils: values.cbc_basophils || null,
      blood_typing: values.blood_typing || null,
      rh_factor: values.rh_factor || null,
      fbs: values.fbs || null,
      rbs: values.rbs || null,
      hepa_a_test: values.hepa_a_test || null,
      urinalysis: values.urinalysis || null,
      ua_color: values.ua_color || null,
      ua_transparency: values.ua_transparency || null,
      ua_ph: values.ua_ph || null,
      ua_specific_gravity: values.ua_specific_gravity || null,
      ua_sugar: values.ua_sugar || null,
      ua_albumin: values.ua_albumin || null,
      ua_bacteria: values.ua_bacteria || null,
      ua_wbc_hpf: values.ua_wbc_hpf || null,
      ua_rbc_hpf: values.ua_rbc_hpf || null,
      ua_epithelial_cells: values.ua_epithelial_cells || null,
      ua_mucous_threads: values.ua_mucous_threads || null,
      ua_amorphous_urates: values.ua_amorphous_urates || null,
      ua_casts: values.ua_casts || null,
      ua_crystals: values.ua_crystals || null,
      fecalysis: values.fecalysis || null,
      fe_color: values.fe_color || null,
      fe_consistency: values.fe_consistency || null,
      fe_pus_cells_hpf: values.fe_pus_cells_hpf || null,
      fe_rbc_hpf: values.fe_rbc_hpf || null,
      fe_ova_parasites: values.fe_ova_parasites || null,
      pregnancy_test: values.pregnancy_test || null,
      hbsag: values.hbsag || null,
      drug_test: values.drug_test || null,
      others: values.others || null,
      remarks: values.remarks || null,
    };
  }

  /* ---------- save results only (do NOT mark complete) ---------- */
  async function saveResultsOnly() {
    if (!selected) return;
    setMsg("");

    if (!userId) {
      setMsg("Session user not found. Please logout/login again.");
      return;
    }

    const validationError = validateBeforeSave();
    if (validationError) return setMsg(validationError);

    const payload = buildLabPayload();

    const { error } = await supabase.from("lab_results").upsert(payload, { onConflict: "appointment_id" });

    if (error) {
      setMsg("Failed to save lab results: " + error.message);
      return;
    }

    setMsg("Lab results saved (not marked done yet).");
    showToast("Lab results saved.");
    await loadForAppointment(selected);
  }

  /* ---------- mark lab done (updates appointment_steps.lab_status) ---------- */
  async function markLabDone() {
    if (!selected) return;
    setMsg("");

    const validationError = validateBeforeSave();
    if (validationError) return setMsg(validationError);

    // Ensure lab results are stored for admin summary before marking complete
    const payload = buildLabPayload();
    const { error: labSaveErr } = await supabase
      .from("lab_results")
      .upsert(payload, { onConflict: "appointment_id" });
    if (labSaveErr) return setMsg("Failed to save lab results: " + labSaveErr.message);

    const base = { lab_status: "completed" };
    const tryUpdates = [
      { ...base, lab_done_at: new Date().toISOString(), lab_done_by: userId || null },
      { ...base },
    ];

    for (const updatePayload of tryUpdates) {
      const { error } = await supabase.from("appointment_steps").update(updatePayload).eq("appointment_id", selected.id);

      if (!error) {
        setMsg("Lab completed successfully. Patient removed from queue.");
        await loadApprovedAppointments();
        setSelected(null);
        setReqRow(null);
        setExistingLabRow(null);
        setStepRow(null);
        setResults(EMPTY_RESULTS);
        return;
      }

      const msgText = (error?.message || "").toLowerCase();
      const missingColumn =
        msgText.includes("could not find") || msgText.includes("does not exist") || msgText.includes("schema cache");

      if (!missingColumn) {
        setMsg("Failed to mark lab done: " + error.message);
        return;
      }
    }

    setMsg("Failed to mark lab done: appointment_steps table columns mismatch.");
  }

  /* ================== UI ================== */
  const subtitle = isHistory
    ? "Lab tests history and encoded results."
    : "Approved appointments (encode results → save, and/or mark lab done).";

  const filteredLabHistory = useMemo(() => {
    const q = labHistoryQuery.trim().toLowerCase();
    if (!q) return labHistory;
    return (labHistory || []).filter((row) => {
      const name = patientName(row.patient_id).toLowerCase();
      const company = patientCompany(row.patient_id).toLowerCase();
      const type = (row.appointments?.appointment_type || "").toLowerCase();
      const date = (row.appointments?.preferred_date || "").toLowerCase();
      return name.includes(q) || company.includes(q) || type.includes(q) || date.includes(q);
    });
  }, [labHistory, labHistoryQuery, patientNameMap, patientCompanyMap]);

  const selectedHistoryRows = useMemo(() => {
    if (!selectedHistory?.patient_id) return [];
    return (labHistory || []).filter((row) => row.patient_id === selectedHistory.patient_id);
  }, [labHistory, selectedHistory]);

  const selectedHistorySummary = useMemo(() => {
    const row = selectedHistory;
    if (!row) return [];
    return [
      { label: "Hemoglobin", value: row.cbc_hemoglobin || "—" },
      { label: "Hematocrit", value: row.cbc_hematocrit || "—" },
      { label: "RBC Count", value: row.cbc_rbc_count || "—" },
      { label: "WBC Count", value: row.cbc_wbc_count || "—" },
      { label: "Platelet", value: row.cbc_platelet || "—" },
      { label: "Urinalysis", value: row.urinalysis || "—" },
      { label: "Fecalysis", value: row.fecalysis || "—" },
      { label: "Drug Test", value: row.drug_test || "—" },
      { label: "HBsAg", value: row.hbsag || "—" },
      { label: "Blood Typing", value: row.blood_typing || "—" },
      { label: "Pregnancy Test", value: row.pregnancy_test || "—" },
    ];
  }, [selectedHistory]);

  return (
    <div className="patient-dashboard-content">
      <header className="page-header no-print">
        <div className="page-header-main">
          <h1 className="page-title">Laboratory</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        <div className="page-actions" />
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
        {msg && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg}</p>}

        {isHistory ? (
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <b>Lab Tests History</b>
              <input
                className="input"
                style={{ maxWidth: 260 }}
                placeholder="Search patient or company"
                value={labHistoryQuery}
                onChange={(e) => setLabHistoryQuery(e.target.value)}
              />
            </div>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="table lab-history-admin-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Company</th>
                    <th>Type</th>
                    <th>Appointment Date</th>
                    <th>Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {labHistoryLoading ? (
                    <tr>
                      <td colSpan="5" style={{ opacity: 0.7 }}>
                        Loading lab history...
                      </td>
                    </tr>
                  ) : filteredLabHistory.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ opacity: 0.7 }}>
                        No lab results yet.
                      </td>
                    </tr>
                  ) : (
                    filteredLabHistory.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Patient">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: "4px 10px" }}
                            onClick={() => setSelectedHistory(row)}
                          >
                            {patientName(row.patient_id)}
                          </button>
                        </td>
                        <td data-label="Company">{patientCompany(row.patient_id)}</td>
                        <td data-label="Type">{row.appointments?.appointment_type || "—"}</td>
                        <td data-label="Appointment Date">{row.appointments?.preferred_date || "—"}</td>
                        <td data-label="Recorded" style={{ whiteSpace: "nowrap" }}>
                          {row.recorded_at ? new Date(row.recorded_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {selectedHistory ? (
              <div className="card" style={{ marginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 800 }}>
                    {patientName(selectedHistory.patient_id)}
                    <span style={{ opacity: 0.7, fontWeight: 600 }}> • {patientCompany(selectedHistory.patient_id)}</span>
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={() => setSelectedHistory(null)}>
                    Close
                  </button>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 13, opacity: 0.9 }}>
                  <div>
                    Appointment Date: <b>{selectedHistory.appointments?.preferred_date || "—"}</b>
                  </div>
                  <div>
                    Type: <b>{selectedHistory.appointments?.appointment_type || "—"}</b>
                  </div>
                  <div>
                    Recorded: <b>{selectedHistory.recorded_at ? new Date(selectedHistory.recorded_at).toLocaleString() : "—"}</b>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: 0.6, opacity: 0.7 }}>LAB RESULTS</div>
                  <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                    {selectedHistorySummary.map((item) => (
                      <div key={item.label} className="card" style={{ padding: 10 }}>
                        <div style={{ fontSize: 11, opacity: 0.7 }}>{item.label}</div>
                        <div style={{ fontWeight: 700 }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: 0.6, opacity: 0.7 }}>HISTORY</div>
                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                    {selectedHistoryRows.map((row) => (
                      <div key={row.id} className="card" style={{ padding: 10 }}>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {row.recorded_at ? new Date(row.recorded_at).toLocaleString() : "—"} • {row.appointments?.appointment_type || "—"}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13 }}>
                          CBC {row.cbc_platelet ?? "—"} • UA {row.urinalysis || "—"} • Fecalysis {row.fecalysis || "—"} • Drug {row.drug_test || "—"}
                        </div>
                        {row.remarks ? (
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>Remarks: {row.remarks}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="card">
              <b>Approved Appointments</b>
              <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="table lab-queue-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Type</th>
                    <th>Appointment Date</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ opacity: 0.7 }}>
                          No approved appointments yet.
                        </td>
                      </tr>
                    ) : (
                      appointments.map((a) => (
                        <tr key={a.id}>
                          <td data-label="Patient">
                            <b>{patientName(a.patient_id)}</b>
                          </td>
                          <td data-label="Type">{a.appointment_type}</td>
                          <td data-label="Appointment Date">{a.preferred_date}</td>
                          <td data-label="Status">
                            <b>{a.status}</b>
                          </td>
                          <td data-label="Action">
                            <button type="button" className="btn btn-primary" onClick={() => loadForAppointment(a)}>
                              Select
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <b>Lab Processing</b>

              {!selected ? (
                <div style={{ marginTop: 10, opacity: 0.8 }}>Select an appointment above.</div>
              ) : (
                <>
                  <div style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.6 }}>
                    Selected: <b>{patientName(selected.patient_id)}</b> • <b>{selected.appointment_type}</b> •{" "}
                    <b>{selected.preferred_date}</b>
                    <br />
                    Lab step status: <b>{labStepStatus}</b>
                  </div>

                  {!reqRow ? (
                    <div style={{ marginTop: 12, opacity: 0.8 }}>
                      No Form Slip / Laboratory Request Form submitted yet for this appointment.
                    </div>
                  ) : !anyRequested ? (
                    <div style={{ marginTop: 12, opacity: 0.8 }}>
                      Form Slip exists, but no lab tests were selected.
                    </div>
                  ) : (
                    <div
                      key={formKey}
                      className="lab-processing-grid"
                      style={{
                        marginTop: 12,
                        display: "grid",
                        gridTemplateColumns: "minmax(320px, 1fr) minmax(280px, 0.9fr)",
                        gap: 14,
                      }}
                    >
                      <div className="card">
                        <b>Laboratory Request Form</b>
                        <div style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>
                          Encode results following the clinic format.
                        </div>

                        {requested.cbc_platelet && (
                          <SectionCard
                            id="cbc"
                            title="A. Complete Blood Count"
                            meta={`${cbcCount}/${cbcFields.length} filled`}
                          >
                            <NumberField label="Hemoglobin" keyName="cbc_hemoglobin" placeholder="e.g. 148" />
                            <NumberField label="Hematocrit" keyName="cbc_hematocrit" placeholder="e.g. 0.45" />
                            <NumberField label="RBC Count" keyName="cbc_rbc_count" placeholder="e.g. 4.92" />
                            <NumberField label="WBC Count" keyName="cbc_wbc_count" placeholder="e.g. 7.6" />
                            <SectionTitle>DIFFERENTIAL COUNT</SectionTitle>
                            <NumberField label="Neutrophils" keyName="cbc_neutrophils" placeholder="e.g. 0.66" />
                            <NumberField label="Lymphocytes" keyName="cbc_lymphocytes" placeholder="e.g. 0.24" />
                            <NumberField label="Eosinophils" keyName="cbc_eosinophils" placeholder="e.g. 0.01" />
                            <NumberField label="Monocytes" keyName="cbc_monocytes" placeholder="e.g. 0.10" />
                            <NumberField label="Basophils" keyName="cbc_basophils" placeholder="e.g. 0.00" />
                            <NumberField label="Platelet" keyName="cbc_platelet" placeholder="e.g. 250" />
                          </SectionCard>
                        )}

                        {requested.urinalysis && (
                          <SectionCard
                            id="urinalysis"
                            title="B. Urinalysis"
                            meta={`${urinalysisCount}/${urinalysisFields.length} filled`}
                          >
                            <TextField label="Color" keyName="ua_color" placeholder="e.g. Yellow" />
                            <TextField label="Transparency" keyName="ua_transparency" placeholder="e.g. Clear" />
                            <NumberField label="pH" keyName="ua_ph" placeholder="e.g. 6.0" />
                            <NumberField label="Specific Gravity" keyName="ua_specific_gravity" placeholder="e.g. 1.015" />
                            <TextField label="Sugar" keyName="ua_sugar" placeholder="e.g. Negative" />
                            <TextField label="Albumin" keyName="ua_albumin" placeholder="e.g. Negative" />
                            <TextField label="Bacteria" keyName="ua_bacteria" placeholder="e.g. None" />
                            <TextField label="WBC / hpf" keyName="ua_wbc_hpf" placeholder="e.g. 0-2" />
                            <TextField label="RBC / hpf" keyName="ua_rbc_hpf" placeholder="e.g. 0-2" />
                            <TextField label="Epithelial Cells" keyName="ua_epithelial_cells" placeholder="e.g. Rare" />
                            <TextField label="Mucous Threads" keyName="ua_mucous_threads" placeholder="e.g. Moderate" />
                            <TextField label="Amorphous Urates" keyName="ua_amorphous_urates" placeholder="e.g. None" />
                            <TextField label="Casts" keyName="ua_casts" placeholder="e.g. None" />
                            <TextField label="Crystals" keyName="ua_crystals" placeholder="e.g. None" />
                            {requested.pregnancy_test && (
                              <SelectField
                                label="Pregnancy Test"
                                keyName="pregnancy_test"
                                options={PREG_OPTIONS}
                                placeholder="Select result"
                              />
                            )}
                            <TextField label="Urinalysis Notes" keyName="urinalysis" placeholder="Optional notes" />
                          </SectionCard>
                        )}

                        {requested.fecalysis && (
                          <SectionCard
                            id="fecalysis"
                            title="C. Fecalysis"
                            meta={`${fecalysisCount}/${fecalysisFields.length} filled`}
                          >
                            <TextField label="Color" keyName="fe_color" placeholder="e.g. Brown" />
                            <TextField label="Consistency" keyName="fe_consistency" placeholder="e.g. Soft" />
                            <TextField label="Pus Cells / hpf" keyName="fe_pus_cells_hpf" placeholder="e.g. 0-2" />
                            <TextField label="RBC / hpf" keyName="fe_rbc_hpf" placeholder="e.g. 0-2" />
                            <TextField label="Ova/Parasites" keyName="fe_ova_parasites" placeholder="e.g. None found" />
                            <TextField label="Fecalysis Notes" keyName="fecalysis" placeholder="Optional notes" />
                          </SectionCard>
                        )}

                        {(requested.blood_typing ||
                          requested.hepatitis_a ||
                          requested.hepatitis_b ||
                          requested.drug_test ||
                          hasCustomLabel("fbs") ||
                          hasCustomLabel("rbs")) && (
                          <SectionCard
                            id="other"
                            title="Other Tests"
                            meta={`${otherCount}/${otherFields.length} filled`}
                          >
                            {requested.blood_typing && (
                              <>
                                <SelectField
                                  label="Abo Typing"
                                  keyName="blood_typing"
                                  options={BLOOD_TYPES}
                                  placeholder="Select blood type"
                                />
                                <SelectField
                                  label="RH Factor"
                                  keyName="rh_factor"
                                  options={RH_OPTIONS}
                                  placeholder="Select RH"
                                />
                              </>
                            )}
                            {hasCustomLabel("fbs") && (
                              <NumberField label="FBS (mg/dL)" keyName="fbs" placeholder="e.g. 90" />
                            )}
                            {hasCustomLabel("rbs") && (
                              <NumberField label="RBS (mg/dL)" keyName="rbs" placeholder="e.g. 110" />
                            )}
                            {requested.hepatitis_a && (
                              <SelectField
                                label="Hepa A Test"
                                keyName="hepa_a_test"
                                options={HEPA_A_OPTIONS}
                                placeholder="Select result"
                              />
                            )}
                            {requested.hepatitis_b && (
                              <SelectField
                                label="Hepa B Test (HBsAg)"
                                keyName="hbsag"
                                options={HBSAG_OPTIONS}
                                placeholder="Select result"
                              />
                            )}
                            {requested.drug_test && (
                              <SelectField
                                label="Drug Test"
                                keyName="drug_test"
                                options={DRUG_TEST_OPTIONS}
                                placeholder="Select result"
                              />
                            )}
                          </SectionCard>
                        )}

                        {(requested.physical_exam ||
                          requested.visual_acuity ||
                          requested.height_weight ||
                          requested.hepatitis_a ||
                          requested.ecg ||
                          requested.audiometry ||
                          requested.salmonella) && (
                          <>
                            <SectionTitle>REQUESTED (NO LAB INPUT)</SectionTitle>
                            <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.5 }}>
                              {[
                                requested.physical_exam ? "Physical Examination" : null,
                                requested.visual_acuity ? "Visual acuity" : null,
                                requested.height_weight ? "Height & weight" : null,
                                requested.hepatitis_a ? "Hepatitis A" : null,
                                requested.ecg ? "ECG (Electrocardiogram)" : null,
                                requested.audiometry ? "Audiometry" : null,
                                requested.salmonella ? "Salmonella test" : null,
                              ]
                                .filter(Boolean)
                                .join(" • ")}
                            </div>
                          </>
                        )}

                        {Array.isArray(requested.custom_items) && requested.custom_items.length > 0 && (
                          <>
                            <SectionTitle>CUSTOM TESTS (ENCODE IN REMARKS)</SectionTitle>
                            <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.6 }}>
                              {requested.custom_items
                                .map((item) => `${item.label}${typeof item.price === "number" ? ` (PHP ${item.price})` : ""}`)
                                .join(" • ")}
                            </div>
                          </>
                        )}

                        <SectionTitle>REMARKS</SectionTitle>
                        <TextAreaField
                          label="Remarks"
                          keyName="remarks"
                          placeholder="Optional notes (sample hemolyzed, repeat advised…)"
                        />
                      </div>

                      <div className="card">
                        <b>Status / Actions</b>

                        <div style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.6, fontSize: 13 }}>
                          Existing lab row: <b>{existingLabRow ? "Yes" : "No"}</b>
                          <br />
                          You can mark the patient as done even if results aren’t encoded yet.
                          <br />
                          Later: upload softcopy + notify patient.
                        </div>

                        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button type="button" className="btn btn-primary" onClick={markLabDone}>
                            Mark Lab Done
                          </button>
                          <button type="button" className="btn" onClick={saveResultsOnly}>
                            Save Results
                          </button>
                        </div>

                        <div style={{ marginTop: 12, opacity: 0.7, fontSize: 12, lineHeight: 1.5 }}>
                          Next: add file upload → notify patient → patient can view softcopy.
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
