import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/ToastCenter";
import { supabase } from "../lib/supabase";
import PatientProfile from "../pages/PatientProfile";
import NotificationBell from "../components/NotificationBell";
import { generateMedicalReportPdf } from "../utils/generateMedicalReportPdf";
import { generateLabSummaryPdf } from "../utils/generateLabSummaryPdf";
import { generateXraySummaryPdf } from "../utils/generateXraySummaryPdf";
import useSuccessToast from "../utils/useSuccessToast";
import { LineChart } from "../components/LineChart";


/* ---------- UI helpers ---------- */
function Badge({ status }) {
  const raw = (status || "pending").toLowerCase();
  const s = raw === "released" ? "completed" : raw;
  const label = s === "completed" ? "Completed" : s === "in_progress" ? "In Progress" : "Pending";

  return <span className={`status-pill status-${s}`}>{label}</span>;
}

function StepCard({ number, title, status, subtitle, actions = [] }) {
  return (
    <div className="card process-step-card">
      <div className="process-step-head">
        <div className="process-step-icon">{number}</div>
        <div className="process-step-body">
          <div className="process-step-title">
            <b>{title}</b>
            <Badge status={status} />
          </div>
          {subtitle && <div className="process-step-subtitle">{subtitle}</div>}
        </div>
      </div>

      {actions.length > 0 && (
        <div className="process-step-actions">
          <div className="process-step-actions-label">Required Actions:</div>
          <div className="process-step-actions-list">
            {actions.map((a, idx) => (
              <div key={idx} className={`process-step-action ${a.done ? "done" : ""}`}>
                <span>{a.done ? "✅" : "⭕"}</span>
                <span>{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Health Progress Dashboard (vitals trends) ---------- */
function trendLabel(current, previous, formatter = (v) => String(v)) {
  if (current == null || previous == null || current === "" || previous === "") return null;
  const a = Number(current);
  const b = Number(previous);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const d = a - b;
  if (d === 0) return "—";
  const sign = d > 0 ? "↑" : "↓";
  return `${sign} ${formatter(Math.abs(d))}`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalMins = Math.floor(ms / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function toMs(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function getHeartRate(v) {
  if (!v) return null;
  const hr = v.heart_rate ?? v.pulse_rate ?? v.pr ?? v.pulse ?? null;
  if (hr === "" || hr === undefined) return null;
  return hr;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toLower(x) {
  return String(x || "").trim().toLowerCase();
}

function combineLocalISO(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  return dt.toISOString();
}

function isClinicTime(timeStr) {
  if (!timeStr) return false;
  const [hh, mm] = timeStr.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
  if (hh < 7 || hh > 15) return false;
  if (mm < 0 || mm > 59) return false;
  if (hh === 15 && mm > 0) return false;
  return true;
}

function clean(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return s || "";
}

function cleanOrNull(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function validatePassword(value) {
  if (!value || value.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(value)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(value)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(value)) return "Password must include a number.";
  return "";
}

function dayKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toDisplayDate(key) {
  if (!key) return "";
  const d = new Date(key + "T00:00:00");
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString();
}

function HealthProgressDashboard({ vitals }) {
  const list = vitals || [];
  const latest = list[0] || null;
  const previous = list[1] || null;

  const metrics = [
    {
      key: "height_cm",
      label: "Height",
      unit: "cm",
      formatter: (v) => (v != null && v !== "" ? `${v} cm` : "—"),
      trend: trendLabel(latest?.height_cm, previous?.height_cm, (d) => `${d} cm`),
    },
    {
      key: "weight_kg",
      label: "Weight",
      unit: "kg",
      formatter: (v) => (v != null && v !== "" ? `${v} kg` : "—"),
      trend: trendLabel(latest?.weight_kg, previous?.weight_kg, (d) => `${d} kg`),
    },
    {
      key: "bp",
      label: "Blood Pressure",
      unit: "mmHg",
      formatter: () =>
        latest?.systolic != null || latest?.diastolic != null
          ? `${latest?.systolic ?? "—"}/${latest?.diastolic ?? "—"}`
          : "—",
      trend:
        previous?.systolic != null && latest?.systolic != null
          ? trendLabel(latest.systolic, previous.systolic, (d) => `${d} mmHg`)
          : null,
    },
    {
      key: "temperature_c",
      label: "Temperature",
      unit: "°C",
      formatter: (v) => (v != null && v !== "" ? `${v} °C` : "—"),
      trend: trendLabel(latest?.temperature_c, previous?.temperature_c, (d) => `${d} °C`),
    },
    {
      key: "heart_rate",
      label: "Heart Rate",
      unit: "bpm",
      formatter: () => {
        const v = getHeartRate(latest);
        return v != null && v !== "" ? `${v} bpm` : "—";
      },
      trend: trendLabel(
        getHeartRate(latest),
        getHeartRate(previous),
        (d) => `${d}`
      ),
    },
  ];

  return (
    <div className="card patient-vitals-card">
      <div className="section-header">
        <div>
          <h3 className="section-title">Health Progress Dashboard</h3>
          <p className="section-subtitle">Your vitals over time. Trend vs previous reading.</p>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="clinic-empty">
          <strong>No vitals yet</strong>
          Vitals will appear here after your nurse records them during an appointment.
        </div>
      ) : (
        <>
          <div className="vitals-grid">
            {metrics.map((m) => (
              <div key={m.key} className="vitals-card">
                <div className="vitals-label">{m.label}</div>
                <div className="vitals-value">
                  {m.key === "bp" ? m.formatter() : m.formatter(latest?.[m.key])}
                </div>
                {m.trend && <div className="vitals-trend">vs last: {m.trend}</div>}
              </div>
            ))}
          </div>

          <div className="vitals-table">
            <div className="vitals-table-title">Recent Readings</div>
            <table className="clinic-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Height (cm)</th>
                  <th>Weight (kg)</th>
                  <th>BP</th>
                  <th>Temp (°C)</th>
                  <th>HR</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 10).map((v) => (
                  <tr key={v.id}>
                    <td>{v.recorded_at ? new Date(v.recorded_at).toLocaleDateString() : "—"}</td>
                    <td>{v.height_cm != null ? v.height_cm : "—"}</td>
                    <td>{v.weight_kg != null ? v.weight_kg : "—"}</td>
                    <td>
                      {v.systolic != null || v.diastolic != null
                        ? `${v.systolic ?? "—"}/${v.diastolic ?? "—"}`
                        : "—"}
                    </td>
                    <td>{v.temperature_c != null ? v.temperature_c : "—"}</td>
                    <td>{getHeartRate(v) != null ? getHeartRate(v) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- ✅ REQUIREMENTS NORMALIZER (MATCHES YOUR DB COLUMNS) ---------- */
function normalizeRequirements(row) {
  const r = row || {};

  // EXAM
  const req_physical_exam = typeof r.exam_physical === "boolean" ? r.exam_physical : null;
  const req_visual_acuity = typeof r.exam_visual_acuity === "boolean" ? r.exam_visual_acuity : null;
  const req_height_weight = typeof r.exam_height_weight === "boolean" ? r.exam_height_weight : null;

  // LAB
  const req_cbc_platelet = typeof r.lab_cbc_platelet === "boolean" ? r.lab_cbc_platelet : null;
  const req_urinalysis = typeof r.lab_urinalysis === "boolean" ? r.lab_urinalysis : null;
  const req_fecalysis = typeof r.lab_fecalysis === "boolean" ? r.lab_fecalysis : null;
  const req_drug_test = typeof r.lab_drug_test === "boolean" ? r.lab_drug_test : null;
  const req_hepatitis_b = typeof r.lab_hepatitis_b === "boolean" ? r.lab_hepatitis_b : null;
  const req_hepatitis_a = typeof r.lab_hepatitis_a === "boolean" ? r.lab_hepatitis_a : null;
  const req_ecg = typeof r.lab_ecg === "boolean" ? r.lab_ecg : null;
  const req_audiometry = typeof r.lab_audiometry === "boolean" ? r.lab_audiometry : null;
  const req_blood_typing = typeof r.lab_blood_typing === "boolean" ? r.lab_blood_typing : null;
  const req_pregnancy_test = typeof r.lab_pregnancy_test === "boolean" ? r.lab_pregnancy_test : null;
  const req_salmonella = typeof r.lab_salmonella === "boolean" ? r.lab_salmonella : null;

  // XRAY
  const req_chest_xray = typeof r.xray_chest === "boolean" ? r.xray_chest : null;
  const xray_custom_items = Array.isArray(r.xray_custom_items) ? r.xray_custom_items : [];
  const xray_custom_total = typeof r.xray_custom_total === "number" ? r.xray_custom_total : null;

  // needs_lab / needs_xray
  const needs_lab =
    typeof r.needs_lab === "boolean"
      ? r.needs_lab
      : [
          req_physical_exam,
          req_visual_acuity,
          req_height_weight,
          req_cbc_platelet,
          req_urinalysis,
          req_fecalysis,
          req_drug_test,
          req_hepatitis_b,
          req_hepatitis_a,
          req_ecg,
          req_audiometry,
          req_blood_typing,
          req_pregnancy_test,
          req_salmonella,
        ].some((v) => v === true);

  const custom_items = Array.isArray(r.lab_custom_items) ? r.lab_custom_items : [];
  const custom_total = typeof r.lab_custom_total === "number" ? r.lab_custom_total : null;

  const needs_xray =
    typeof r.needs_xray === "boolean"
      ? r.needs_xray
      : req_chest_xray === true || xray_custom_items.length > 0;

  const formSubmitted = r.form_submitted === true;
  const package_code = r.package_code ? String(r.package_code).toUpperCase() : "";
  const package_price = typeof r.package_price === "number" ? r.package_price : null;
  const total_estimate = typeof r.total_estimate === "number" ? r.total_estimate : null;
  const standard_total = typeof r.standard_total === "number" ? r.standard_total : null;
  const extra_standard_total = typeof r.extra_standard_total === "number" ? r.extra_standard_total : null;

  return {
    formSubmitted,
    package_code,
    package_price,
    total_estimate,
    standard_total,
    extra_standard_total,
    needs_lab,
    needs_xray,

    custom_items,
    custom_total,
    xray_custom_items,
    xray_custom_total,

    req_physical_exam,
    req_visual_acuity,
    req_height_weight,
    req_cbc_platelet,
    req_urinalysis,
    req_fecalysis,
    req_drug_test,
    req_hepatitis_b,
    req_hepatitis_a,
    req_ecg,
    req_audiometry,
    req_blood_typing,
    req_pregnancy_test,
    req_salmonella,
    req_chest_xray,
  };
}

const PACKAGE_PRICES = {
  A: 900,
  B: 1300,
  C: 3500,
};

const STANDARD_TEST_PRICES = {
  exam_physical: 200,
  exam_visual_acuity: 150,
  exam_height_weight: 150,
  lab_cbc_platelet: 200,
  lab_urinalysis: 80,
  lab_fecalysis: 80,
  lab_drug_test: 300,
  lab_hepatitis_b: 350,
  lab_hepatitis_a: 350,
  lab_ecg: 350,
  lab_audiometry: 350,
  lab_blood_typing: 150,
  lab_pregnancy_test: 200,
  lab_salmonella: 500,
  xray_chest: 350,
};

const CUSTOM_CATEGORIES = [
  {
    key: "blood_chemistry",
    name: "BLOOD CHEMISTRY",
    items: [
      { label: "FBS/RBS/2 PPBS-300", price: 150 },
      { label: "OGTT", price: 800 },
      { label: "BUN", price: 150 },
      { label: "CREATININE", price: 150 },
      { label: "BUA", price: 150 },
      { label: "CHOLESTEROL", price: 150 },
      { label: "TRIGLYCERIDES", price: 150 },
      { label: "HDL/LDL/VLDL (each)", price: 300 },
      { label: "BILIRUBIN (TB, DB, IB)", price: 350 },
      { label: "TOTAL PROTEIN", price: 200 },
      { label: "ALBUMIN", price: 250 },
      { label: "TPAG", price: 250 },
      { label: "HBA1 (with machine print out & graph)", price: 650 },
    ],
  },
  {
    key: "hematology",
    name: "HEMATOLOGY",
    items: [
      { label: "COMPLETE BLOOD COUNT", price: 200 },
      { label: "PLATELET COUNT", price: 100 },
      { label: "HGB & HCT", price: 100 },
      { label: "RETICULOCYTE COUNT", price: 180 },
      { label: "ESR", price: 150 },
      { label: "ABO Typing", price: 100 },
      { label: "Peripheral Blood Smear (PBS)", price: 200 },
      { label: "Malarial Smear", price: 230 },
      { label: "LE Preparation", price: 270 },
      { label: "Protime", price: 250 },
      { label: "APTT", price: 250 },
      { label: "Coombs Test", price: 900 },
      { label: "RH Factor", price: 180 },
    ],
  },
  {
    key: "thyroid",
    name: "THYROID FUNCTION TEST",
    items: [
      { label: "T3", price: 450 },
      { label: "T4", price: 450 },
      { label: "TSH", price: 450 },
      { label: "FT3/FT4 (each)", price: 450 },
      { label: "THS", price: 450 },
      { label: "T3 CLIA", price: 600 },
      { label: "T4 CLIA", price: 600 },
      { label: "TSH IRMA (AFTER 2 DAYS)", price: 1500 },
      { label: "PARATHYROID HORMONE", price: 2300 },
      { label: "FT3 RIA (AFTER 2 DAYS)", price: 1250 },
      { label: "FT4 RIA (AFTER 2 DAYS)", price: 1250 },
      { label: "THYROGLOBULIN", price: 2200 },
    ],
  },
  {
    key: "enzymes",
    name: "ENZYMES",
    items: [
      { label: "SGPT/ALT", price: 200 },
      { label: "SGOT/AST", price: 200 },
      { label: "GGTP", price: 300 },
      { label: "Alkaline Phosphatase", price: 200 },
      { label: "Acid Phosphatase", price: 250 },
      { label: "Amylase", price: 250 },
      { label: "Lipase", price: 300 },
      { label: "Total CPK", price: 550 },
      { label: "CPK-MB", price: 720 },
      { label: "CPK-MM", price: 1200 },
      { label: "TROPONIN (serum) T (edta)", price: 900 },
      { label: "LDH", price: 250 },
    ],
  },
  {
    key: "clinical_microscopy",
    name: "CLINICAL MICROSCOPY",
    items: [
      { label: "Urinalysis", price: 80 },
      { label: "Urobilinogen", price: 150 },
      { label: "Ketone/Acetone", price: 150 },
      { label: "Bile/Nitrates/Bilirubin", price: 150 },
      { label: "SUGAR", price: 100 },
      { label: "Micro-albumin Test", price: 350 },
      { label: "Pregnancy Test (Urine)", price: 100 },
      { label: "Pregnancy Test (serum)", price: 180 },
      { label: "Fecalysis", price: 80 },
      { label: "Salmonella", price: 300 },
      { label: "Occult Blood", price: 150 },
      { label: "Concentration Technique", price: null },
      { label: "Body Fluids", price: 450 },
      { label: "Cell & Diff. Count", price: 250 },
      { label: "Sugar", price: 220 },
      { label: "Protein", price: 220 },
    ],
  },
  {
    key: "hepatitis",
    name: "HEPATITIS",
    items: [
      { label: "HbsAg Screening", price: 200 },
      { label: "HbsAg w/Titer", price: 460 },
      { label: "HbsAg (ELISA) Confirmatory", price: 550 },
      { label: "Anti-HBS", price: 300 },
      { label: "HbeAg", price: 350 },
      { label: "Anti-Hbe", price: 350 },
      { label: "Anti-HBC IgM", price: 340 },
      { label: "Anti-HBC IgG", price: 340 },
      { label: "Anti-HAV IgM", price: 380 },
      { label: "Anti-HAV IgG", price: 380 },
      { label: "Anti-HCV", price: 600 },
      { label: "Hepatitis Profile", price: 1500 },
      { label: "Hepa A Profile", price: 1250 },
      { label: "Hepatitis B Profile", price: 1500 },
      { label: "Hepatitis A & B Profile", price: 2000 },
      { label: "Hepatitis A, B, C Profile", price: 3000 },
    ],
  },
  {
    key: "electrolytes",
    name: "ELECTROLYTES",
    items: [
      { label: "Sodium", price: 200 },
      { label: "Potassium", price: 200 },
      { label: "Chloride", price: 175 },
      { label: "Magnesium", price: 300 },
      { label: "Inorganic Phosphorus", price: 250 },
      { label: "Total Iron", price: 350 },
      { label: "TIBC + Total Iron", price: 550 },
      { label: "Calcium", price: 175 },
      { label: "Ionized Calcium", price: 400 },
      { label: "ABG", price: 1100 },
      { label: "Lithium (serum) (3 days)", price: 800 },
      { label: "Ammonia (green top) (3 days)", price: 1400 },
    ],
  },
  {
    key: "serology",
    name: "SEROLOGY",
    items: [
      { label: "VDRL/RPR", price: 150 },
      { label: "TPHA/SCREENING", price: 270 },
      { label: "TPHA w/titer", price: 490 },
      { label: "RPE w/titer", price: 550 },
      { label: "Widal Test", price: 250 },
      { label: "Typidot", price: 580 },
      { label: "ASO titer", price: 350 },
      { label: "Chlamdial (cervical swab)", price: 2500 },
      { label: "CRP", price: 250 },
      { label: "RA/RF Latex", price: 250 },
      { label: "C3", price: 450 },
      { label: "ANA w/titer", price: 580 },
      { label: "Dengue IgM & IgG", price: 1500 },
      { label: "Leptospiral Test (ELISA)", price: 850 },
      { label: "H. Pylori Total", price: 760 },
      { label: "NS-1", price: 1400 },
      { label: "Rubella IgM", price: 1800 },
      { label: "Rubella IgG", price: 1200 },
      { label: "CMV IgM", price: 900 },
      { label: "CMV IgG", price: 900 },
      { label: "Toxoplasma IgM", price: 900 },
      { label: "Toxoplasma IgG", price: 900 },
      { label: "HSV 1 & 2 ELISA IgM", price: 1450 },
      { label: "HSV 1 & 2 ELISA IgG", price: 1450 },
      { label: "VARICELLA IgG", price: 950 },
      { label: "VARICELLA IgM", price: 950 },
      { label: "TORCH TEST ELISA", price: 1450 },
      { label: "(IgG/IgM each)", price: 2250 },
      { label: "TROPONIN I/T QUANTITATIVE", price: 2700 },
    ],
  },
  {
    key: "hormones",
    name: "HORMONES",
    items: [
      { label: "FSH/LH (each)", price: 600 },
      { label: "Prolactin", price: 800 },
      { label: "Estrogen/Estradiol", price: 2000 },
      { label: "Progesterone", price: 1800 },
      { label: "Testosterone", price: 1800 },
      { label: "Cortisol", price: 1800 },
      { label: "Ferritin", price: 700 },
    ],
  },
  {
    key: "urine_24h",
    name: "24 HOUR URINE TEST",
    items: [
      { label: "Creatinine Total", price: 230 },
      { label: "Creatinine Clearance", price: 260 },
      { label: "Protein", price: 220 },
      { label: "Sodium / Potassium / Chloride (each)", price: 250 },
      { label: "Calcium / Magnesium (each)", price: 250 },
      { label: "Uric Acid", price: 250 },
      { label: "Amylase", price: 250 },
      { label: "Glucose", price: 200 },
    ],
  },
  {
    key: "tumor_markers",
    name: "TUMOR MARKERS",
    items: [
      { label: "AFP", price: 700 },
      { label: "CEA (COLON)", price: 650 },
      { label: "PSA (PROSTATE)", price: 1300 },
      { label: "B-HCG", price: 600 },
      { label: "CA-125 (OVARY)", price: 2000 },
      { label: "CA-15-3 (BREAST)", price: 2000 },
      { label: "CA-19-9 (PANCREAS)", price: 2500 },
      { label: "ECG", price: 300 },
    ],
  },
  {
    key: "bacteriology",
    name: "BACTERIOLOGY",
    items: [
      { label: "All Culture & Sensitivity", price: 800 },
      { label: "Culture", price: 300 },
      { label: "Gram Stain", price: 300 },
      { label: "AFB", price: 360 },
      { label: "KOH", price: 180 },
      { label: "India Ink", price: 300 },
      { label: "ARD (ADULT/PEDIA) BLOOD only", price: 1200 },
    ],
  },
  {
    key: "histopathology",
    name: "HISTOPATHOLOGY",
    items: [
      { label: "Small", price: 800 },
      { label: "Medium", price: 900 },
      { label: "Large", price: 1500 },
      { label: "XL", price: 2200 },
      { label: "TAHBSO", price: 1900 },
      { label: "Cell Block", price: 500 },
      { label: "FNAB", price: 500 },
      { label: "PAPS SMEAR", price: 800 },
    ],
  },
  {
    key: "hiv",
    name: "HIV TEST DOH ACCREDITED",
    items: [
      { label: "HIV (AIDS) Screening", price: 800 },
      { label: "HIV (AIDS) w/titer (ELISA)", price: null },
    ],
  },
  {
    key: "chem_packages",
    name: "CHEMISTRY PACKAGES",
    items: [
      { label: "Electrolytes (Na, K, Cl)", price: 250 },
      { label: "Lipid Profile (TC, TG, HDL, LDL, VLDL)", price: 450 },
      { label: "Liver Profile (OT, PT, ALP, BILI, TPAG)", price: 550 },
      { label: "Kidney Profile (CREA, BUN, BUA)", price: 350 },
      { label: "Chem 5 (FBS, BUN, CREA, BUA, TC)", price: 350 },
      { label: "Chem 6 (FBS, BUN, CREA, BUA, TC, TG)", price: 375 },
      { label: "Chem 8 (Chem 5 + TG, HDL, LDL)", price: 650 },
      { label: "Chem 10 (Chem 8 + SGPT, SGOT)", price: 950 },
      { label: "Chem 12 (Chem 10 + L, NA)", price: null },
    ],
  },
];

function makeCustomId(categoryKey, label) {
  const base = `${categoryKey}-${label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `${categoryKey}_item`;
}

const CUSTOM_ITEM_MAP = (() => {
  const map = new Map();
  CUSTOM_CATEGORIES.forEach((cat) => {
    cat.items.forEach((item) => {
      const id = makeCustomId(cat.key, item.label);
      map.set(id, { ...item, id, category: cat.name });
    });
  });
  return map;
})();

function getCustomItemsByIds(ids) {
  const list = [];
  (ids || []).forEach((id) => {
    const item = CUSTOM_ITEM_MAP.get(id);
    if (item) list.push(item);
  });
  return list;
}

function calcCustomTotal(items) {
  return items.reduce((sum, item) => sum + (typeof item.price === "number" ? item.price : 0), 0);
}

const XRAY_ITEMS = [
  { label: "ANKLE AP/LAT", price: 450 },
  { label: "APICOLORDOTIC VIEW", price: 200 },
  { label: "CERVICAL SPINE AP/LAT/OBLIQUE", price: 800 },
  { label: "LUMBAR SPINE AP/LAT", price: 800 },
  { label: "THORACIC SPINE AP/LAT", price: 800 },
  { label: "CHEST PA (ADULT/PEDIA)", price: 250 },
  { label: "CHEST PA/LAT (ADULT)", price: 400 },
  { label: "CHEST PA/LAT (PEDIA 0-7YRS OLD)", price: 350 },
  { label: "ELBOW AP/LAT", price: 380 },
  { label: "FEMUR/THIGH AP/LAT", price: 380 },
  { label: "FINGERS AP/LAT", price: 380 },
  { label: "FOOT AP/OBLIQUE", price: 450 },
  { label: "FOREARM AP/LAT", price: 450 },
  { label: "HAND AP/OBLIQUE", price: 450 },
  { label: "HUMEROUS AP/LAT", price: 380 },
  { label: "KNEE AP/LAT", price: 450 },
  { label: "LEG AP/LAT", price: 450 },
  { label: "NASAL BONE (WATER'S LAT)", price: 650 },
  { label: "PARANASAL SERIES", price: 800 },
  { label: "PELVIC", price: 450 },
  { label: "SHOULDER AP", price: 350 },
  { label: "SHOULDER AP/LAT", price: 650 },
  { label: "SKULL AP OR WATER VIEW", price: 400 },
  { label: "SKULL AP/LAT", price: 650 },
  { label: "T-CAGE AP", price: 450 },
  { label: "ABDOMINAL", price: 800 },
  { label: "LUMBO SACRAL AP/LAT", price: 800 },
  { label: "TEMPORO MANIMBULAR JOINT (TMJ)", price: null },
];

const XRAY_ITEM_MAP = (() => {
  const map = new Map();
  XRAY_ITEMS.forEach((item) => {
    const id = makeCustomId("xray", item.label);
    map.set(id, { ...item, id });
  });
  return map;
})();

function getXrayItemsByIds(ids) {
  const list = [];
  (ids || []).forEach((id) => {
    const item = XRAY_ITEM_MAP.get(id);
    if (item) list.push(item);
  });
  return list;
}

const ALL_KEYS = [
  "exam_physical",
  "exam_visual_acuity",
  "exam_height_weight",
  "lab_cbc_platelet",
  "lab_urinalysis",
  "lab_fecalysis",
  "xray_chest",
  "lab_drug_test",
  "lab_hepatitis_b",
  "lab_hepatitis_a",
  "lab_ecg",
  "lab_audiometry",
  "lab_blood_typing",
  "lab_pregnancy_test",
  "lab_salmonella",
];

const PACKAGE_MAP = {
  A: {
    exam_physical: true,
    exam_visual_acuity: true,
    exam_height_weight: true,
    lab_cbc_platelet: true,
    lab_urinalysis: true,
    lab_fecalysis: true,
    xray_chest: true,
    lab_drug_test: true,
  },
  B: {
    exam_physical: true,
    exam_visual_acuity: true,
    exam_height_weight: true,
    lab_cbc_platelet: true,
    lab_urinalysis: true,
    lab_fecalysis: true,
    xray_chest: true,
    lab_drug_test: true,
    lab_hepatitis_b: true,
  },
  C: {
    lab_hepatitis_b: true,
    lab_hepatitis_a: true,
    lab_ecg: true,
    lab_audiometry: true,
    lab_blood_typing: true,
    lab_pregnancy_test: true,
    lab_salmonella: true,
  },
};

/* ---------- ✅ Form Slip UI (patient fills this) ---------- */
function FormSlipCard({ appointment, draft, setDraft, saving, onSave, submitted }) {
  if (!appointment) return null;

  const [customOpen, setCustomOpen] = useState(false);
  const [customCategory, setCustomCategory] = useState(null);
  const [xrayOpen, setXrayOpen] = useState(false);
  const [showAddOns, setShowAddOns] = useState(false);
  const [customCategorySearch, setCustomCategorySearch] = useState("");
  const [customSearch, setCustomSearch] = useState("");
  const [xraySearch, setXraySearch] = useState("");
  const [activePackage, setActivePackage] = useState(() => {
    if (draft.package_code) return String(draft.package_code).toUpperCase();
    return Array.isArray(draft.custom_items) && draft.custom_items.length > 0 ? "CUSTOM" : "A";
  });
  const formatPeso = (value) => `PHP ${Number(value || 0).toLocaleString()}`;

  useEffect(() => {
    if (!draft.package_code) return;
    const next = String(draft.package_code).toUpperCase();
    if (next !== activePackage) setActivePackage(next);
  }, [draft.package_code, activePackage]);

  useEffect(() => {
    if (!customOpen) setCustomSearch("");
  }, [customOpen]);

  useEffect(() => {
    setCustomSearch("");
  }, [customCategory?.key]);

  useEffect(() => {
    if (!xrayOpen) setXraySearch("");
  }, [xrayOpen]);

  useEffect(() => {
    if (!showAddOns) setCustomCategorySearch("");
  }, [showAddOns]);

  const pill = (text, ok) => (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        border: `1px solid ${ok ? "rgba(34,197,94,0.30)" : "rgba(234,179,8,0.30)"}`,
        background: ok ? "rgba(34,197,94,0.12)" : "rgba(234,179,8,0.12)",
        color: ok ? "rgba(34,197,94,0.95)" : "rgba(234,179,8,0.95)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );

  const Section = ({ title, children }) => (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.9 }}>{title}</div>
      <div style={{ marginTop: 8, display: "grid", gap: 8 }}>{children}</div>
    </div>
  );

  const Check = ({ k, label }) => {
    const price = STANDARD_TEST_PRICES[k];
    const priceLabel = Number.isFinite(price) ? ` • ${formatPeso(price)}` : "";
    return (
    <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={!!draft[k]}
        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.checked }))}
      />
      <span style={{ opacity: 0.9 }}>
        {label}
        {priceLabel && <span style={{ opacity: 0.7, fontSize: 12 }}>{priceLabel}</span>}
      </span>
    </label>
  );
  };

  function applyPackage(code) {
    const next = {};
    ALL_KEYS.forEach((k) => (next[k] = false));
    const pack = PACKAGE_MAP[code] || {};
    Object.keys(pack).forEach((k) => (next[k] = !!pack[k]));
    setDraft((d) => ({ ...d, ...next, custom_items: [], package_code: code }));
    setActivePackage(code);
  }

  const selectedCustom = Array.isArray(draft.custom_items) ? draft.custom_items : [];
  const selectedCustomItems = getCustomItemsByIds(selectedCustom);
  const selectedCustomTotal = calcCustomTotal(selectedCustomItems);
  const selectedXray = Array.isArray(draft.xray_custom_items) ? draft.xray_custom_items : [];
  const selectedXrayItems = getXrayItemsByIds(selectedXray);
  const selectedXrayTotal = calcCustomTotal(selectedXrayItems);
  const packageCode = String(activePackage || "CUSTOM").toUpperCase();
  const packagePrice = PACKAGE_PRICES[packageCode] || 0;
  const standardSelectedKeys = ALL_KEYS.filter((k) => !!draft[k]);
  const standardTotal = standardSelectedKeys.reduce(
    (sum, k) => sum + (STANDARD_TEST_PRICES[k] || 0),
    0
  );
  const packageIncluded = PACKAGE_MAP[packageCode] ? Object.keys(PACKAGE_MAP[packageCode]) : [];
  const extraStandardTotal =
    packageCode === "CUSTOM"
      ? standardTotal
      : standardSelectedKeys.reduce(
          (sum, k) => sum + (packageIncluded.includes(k) ? 0 : STANDARD_TEST_PRICES[k] || 0),
          0
        );
  const addOnsTotal = (selectedCustomTotal || 0) + (selectedXrayTotal || 0) + extraStandardTotal;
  const totalEstimate = packagePrice + addOnsTotal;

  function toggleCustomItem(id) {
    setDraft((d) => {
      const current = Array.isArray(d.custom_items) ? d.custom_items : [];
      if (current.includes(id)) {
        return { ...d, custom_items: current.filter((v) => v !== id) };
      }
      return { ...d, custom_items: [...current, id] };
    });
  }

  function toggleXrayItem(id) {
    setDraft((d) => {
      const current = Array.isArray(d.xray_custom_items) ? d.xray_custom_items : [];
      if (current.includes(id)) {
        return { ...d, xray_custom_items: current.filter((v) => v !== id) };
      }
      return { ...d, xray_custom_items: [...current, id] };
    });
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 16 }}>Form Slip</b>
            {submitted ? pill("Submitted", true) : pill("Pending Submission", false)}
          </div>

          <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13, lineHeight: 1.4 }}>
            Fill this up after your appointment is approved. Your Medical Process will show the
            required lab and x-ray steps based on what you select here.
          </div>

          <div style={{ marginTop: 8, opacity: 0.8, fontSize: 13 }}>
            Appointment: <b>{appointment.appointment_type}</b> &nbsp;•&nbsp; Date:{" "}
            <b>{appointment.preferred_date}</b>
          </div>
        </div>
      </div>

      <div className="form-slip-grid">
        {/* LABORATORY REQUEST FORM */}
        <div
          className="form-slip-panel"
          style={{
            padding: 12,
            borderRadius: 14,
            background: "rgba(13,180,170,0.04)",
            border: "1px solid rgba(15,23,42,0.10)",
          }}
        >
          <b>Laboratory Request Form</b>

          <Section title="Packages">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-secondary" type="button" onClick={() => applyPackage("A")}>
                Package A • {formatPeso(PACKAGE_PRICES.A)}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => applyPackage("B")}>
                Package B • {formatPeso(PACKAGE_PRICES.B)}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => applyPackage("C")}>
                Package C • {formatPeso(PACKAGE_PRICES.C)}
              </button>
              <button className="btn" type="button" onClick={() => applyPackage("CUSTOM")}>
                Customize
              </button>
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Choose a package or use Customize to manually select tests below.
            </div>
          </Section>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
            Package price: <b>{packageCode === "CUSTOM" ? "PHP 0" : formatPeso(packagePrice)}</b> • Add‑ons:{" "}
            <b>{formatPeso(addOnsTotal)}</b> • Estimated total (cashier): <b>{formatPeso(totalEstimate)}</b>
          </div>

          <div style={{ marginTop: 8 }}>
            <button className="btn btn-secondary" type="button" onClick={() => setShowAddOns((v) => !v)}>
              {showAddOns ? "Hide add-ons" : "Add-ons (optional)"}
            </button>
          </div>

          {showAddOns && (
            <Section title="Add-ons (custom lab)">
                <input
                  className="input"
                  placeholder="Search lab categories or tests..."
                  value={customCategorySearch}
                  onChange={(e) => setCustomCategorySearch(e.target.value)}
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                  }}
                >
                  {CUSTOM_CATEGORIES.filter((cat) => {
                    const q = customCategorySearch.trim().toLowerCase();
                    if (!q) return true;
                    if (cat.name.toLowerCase().includes(q)) return true;
                    return cat.items.some((item) => item.label.toLowerCase().includes(q));
                  }).map((cat) => {
                    const catItems = cat.items.map((item) => makeCustomId(cat.key, item.label));
                    const catCount = catItems.filter((id) => selectedCustom.includes(id)).length;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setCustomCategory(cat);
                          setCustomOpen(true);
                        }}
                        style={{ textAlign: "left" }}
                      >
                        <div style={{ fontWeight: 700 }}>{cat.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{catCount} selected</div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                  Selected tests: <b>{selectedCustomItems.length}</b> • Total:{" "}
                  <b>{selectedCustomTotal ? `PHP ${selectedCustomTotal}` : "PHP 0"}</b>
                </div>
              </Section>
          )}

          <Section title="General / Physical">
            <Check k="exam_physical" label="Physical Examination" />
            <Check k="exam_visual_acuity" label="Visual acuity" />
            <Check k="exam_height_weight" label="Height & weight" />
          </Section>

          {activePackage !== "CUSTOM" && (
            <Section title="Laboratory">
              <Check k="lab_cbc_platelet" label="Complete blood count" />
              <Check k="lab_urinalysis" label="Urinalysis" />
              <Check k="lab_fecalysis" label="Fecalysis" />
              <Check k="lab_drug_test" label="Drugtest screening" />
              <Check k="lab_hepatitis_b" label="Hepatitis B Screening" />
              <Check k="lab_hepatitis_a" label="Hepatitis A" />
              <Check k="lab_ecg" label="ECG (Electrocardiogram)" />
              <Check k="lab_audiometry" label="Audiometry" />
              <Check k="lab_blood_typing" label="Blood typing" />
              <Check k="lab_pregnancy_test" label="Pregnancy test" />
              <Check k="lab_salmonella" label="Salmonella test" />
            </Section>
          )}
        </div>

        {/* X-RAY SLIP */}
        <div
          className="form-slip-panel"
          style={{
            padding: 12,
            borderRadius: 14,
            background: "rgba(13,180,170,0.04)",
            border: "1px solid rgba(15,23,42,0.10)",
          }}
        >
          <b>X-ray Slip</b>

          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <Check k="xray_chest" label="Chest X-ray" />
          </div>

          {showAddOns && (
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-secondary" type="button" onClick={() => setXrayOpen(true)}>
                Select X-ray Tests
              </button>
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                Selected: <b>{selectedXrayItems.length}</b> • Total:{" "}
                <b>{selectedXrayTotal ? `PHP ${selectedXrayTotal}` : "PHP 0"}</b>
              </div>
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>
            Note: If you suspect that you are pregnant, inform the x-ray tech, and do a pregnancy
            test first.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={onSave} disabled={saving}>
          {saving ? "Saving..." : submitted ? "Update Form Slip" : "Submit Form Slip"}
        </button>
        <div style={{ opacity: 0.75, fontSize: 13, alignSelf: "center" }}>
          Tip: You can update this later if needed.
        </div>
      </div>

      {customOpen && customCategory && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 680 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{customCategory.name}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Select tests to include in your custom package.</div>
              </div>
              <button className="btn" type="button" onClick={() => setCustomOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <input
                className="input"
                placeholder="Search tests..."
                value={customSearch}
                onChange={(e) => setCustomSearch(e.target.value)}
              />
              {customCategory.items
                .filter((item) =>
                  item.label.toLowerCase().includes(customSearch.trim().toLowerCase())
                )
                .map((item) => {
                const id = makeCustomId(customCategory.key, item.label);
                const checked = selectedCustom.includes(id);
                return (
                  <label
                    key={id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(15,23,42,0.08)",
                      background: checked ? "rgba(13,180,170,0.10)" : "rgba(255,255,255,0.6)",
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCustomItem(id)} />
                      <div style={{ fontSize: 13 }}>{item.label}</div>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {typeof item.price === "number" ? `PHP ${item.price}` : "Price TBD"}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {xrayOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 680 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>X-ray Tests</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Select X-ray procedures for this patient.</div>
              </div>
              <button className="btn" type="button" onClick={() => setXrayOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <input
                className="input"
                placeholder="Search x-ray tests..."
                value={xraySearch}
                onChange={(e) => setXraySearch(e.target.value)}
              />
              {XRAY_ITEMS.filter((item) =>
                item.label.toLowerCase().includes(xraySearch.trim().toLowerCase())
              ).map((item) => {
                const id = makeCustomId("xray", item.label);
                const checked = selectedXray.includes(id);
                return (
                  <label
                    key={id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(15,23,42,0.08)",
                      background: checked ? "rgba(13,180,170,0.10)" : "rgba(255,255,255,0.6)",
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleXrayItem(id)} />
                      <div style={{ fontSize: 13 }}>{item.label}</div>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {typeof item.price === "number" ? `PHP ${item.price}` : "Price TBD"}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- ✅ appointment lock logic (no new booking until released) ---------- */
function isReleasedByStatus(status) {
  const s = String(status || "").toLowerCase();
  return s === "released" || s === "done" || s === "completed";
}
function isNonBlockingStatus(status) {
  const s = String(status || "").toLowerCase();
  return s === "rejected" || s === "cancelled" || s === "canceled";
}
function isReleasedBySteps(stepsRow) {
  const s = String(stepsRow?.release_status || "").toLowerCase();
  return s === "completed";
}
function canDownloadReport(stepsRow) {
  return String(stepsRow?.release_status || "").toLowerCase() === "completed";
}


export default function PatientDashboard({ session, page = "dashboard" }) {
  const navigate = useNavigate();
  const patientId = session?.user?.id;
  const [profile, setProfile] = useState(null);

  function patientName() {
    const n = profile?.full_name?.trim();
    return n ? n : session?.user?.email || "—";
  }

  // request appointment
  const [type, setType] = useState("pre-employment");
  const [preferredDate, setPreferredDate] = useState("");

  // data
  const [appointments, setAppointments] = useState([]);
  const [vitals, setVitals] = useState([]);
  const [labs, setLabs] = useState([]);
  const [xrayResults, setXrayResults] = useState([]);
  const [payments, setPayments] = useState([]);

  // medical process tables
  const [activeApprovedAppt, setActiveApprovedAppt] = useState(null);
  const [stepsRow, setStepsRow] = useState(null);
  const [reqRow, setReqRow] = useState(null);
  const [doctorReport, setDoctorReport] = useState(null);
  const [requirementsByAppt, setRequirementsByAppt] = useState({});
  const [pendingReqRow, setPendingReqRow] = useState(null);
  const [requirementsList, setRequirementsList] = useState([]);
  const [stepsList, setStepsList] = useState([]);

  // ✅ booking lock state
  const [latestAppt, setLatestAppt] = useState(null);
  const [latestSteps, setLatestSteps] = useState(null);
  const [canBook, setCanBook] = useState(true);
  const [bookLockReason, setBookLockReason] = useState("");

  const [settingsTab, setSettingsTab] = useState("profile"); // profile | account | security
  const [settingsMsg, setSettingsMsg] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const { showToast } = useToast();
  useSuccessToast(settingsMsg, showToast);

  const [newPassword, setNewPassword] = useState("");

  const [activePayment, setActivePayment] = useState(null);
  const [analyticsRange, setAnalyticsRange] = useState("30d");
  const [analyticsMetric, setAnalyticsMetric] = useState("form");

  const [formSlipOpen, setFormSlipOpen] = useState(false);
  const [formSlipConfirmed, setFormSlipConfirmed] = useState(false);
  const [formSlipSaving, setFormSlipSaving] = useState(false);
  const [bookingConfirmOpen, setBookingConfirmOpen] = useState(false);
  const [bookingConfirmInfo, setBookingConfirmInfo] = useState(null);

  // ✅ form slip draft
  const [formDraft, setFormDraft] = useState({
    package_code: "A",
    // computed flags
    needs_lab: false,
    needs_xray: false,

    // EXAM / PACKAGE
    exam_physical: false,
    exam_visual_acuity: false,
    exam_height_weight: false,

    // LAB REQUEST FORM
    lab_cbc_platelet: false,
    lab_urinalysis: false,
    lab_fecalysis: false,
    lab_drug_test: false,
    lab_hepatitis_b: false,
    lab_hepatitis_a: false,
    lab_ecg: false,
    lab_audiometry: false,
    lab_blood_typing: false,
    lab_pregnancy_test: false,
    lab_salmonella: false,

    // XRAY
    xray_chest: false,

    // CUSTOM PACKAGE
    custom_items: [],

    // XRAY CUSTOM
    xray_custom_items: [],
  });


  const [savingForm, setSavingForm] = useState(false);

  // notifications
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [notifSupported, setNotifSupported] = useState(true);
  const [topbarActionsEl, setTopbarActionsEl] = useState(null);
  const MIN_YEAR = 2026;
  const todayDate = useMemo(() => new Date(), []);
  const minDate = useMemo(() => new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()), [todayDate]);
  const [monthCursor, setMonthCursor] = useState(() => new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
  const [preferredTime, setPreferredTime] = useState("");
  const CLINIC_OPEN = "07:00";
  const CLINIC_CLOSE = "15:00";

  // ui
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  useSuccessToast(msg, showToast);

  const appointmentById = useMemo (() => {
    const map = new Map();
    appointments.forEach((a) => map.set(a.id, a));
    return map;
  }, [appointments]);

  const latestVitals = vitals[0] || null;
  const latestLab = labs[0] || null;
  const latestPayment = payments[0] || null;

  const latestLabSummary = useMemo(() => {
    if (!latestLab) return null;
    const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== "";

    const cbcParts = [];
    if (hasValue(latestLab.cbc_hemoglobin)) cbcParts.push(`Hgb ${latestLab.cbc_hemoglobin}`);
    if (hasValue(latestLab.cbc_hematocrit)) cbcParts.push(`Hct ${latestLab.cbc_hematocrit}`);
    if (hasValue(latestLab.cbc_wbc_count)) cbcParts.push(`WBC ${latestLab.cbc_wbc_count}`);
    if (hasValue(latestLab.cbc_platelet)) cbcParts.push(`Plt ${latestLab.cbc_platelet}`);
    if (hasValue(latestLab.cbc)) cbcParts.push(String(latestLab.cbc));

    const uaParts = [];
    if (hasValue(latestLab.ua_color)) uaParts.push(`Color ${latestLab.ua_color}`);
    if (hasValue(latestLab.ua_transparency)) uaParts.push(`Transp ${latestLab.ua_transparency}`);
    if (hasValue(latestLab.ua_ph)) uaParts.push(`pH ${latestLab.ua_ph}`);
    if (hasValue(latestLab.ua_specific_gravity)) uaParts.push(`SG ${latestLab.ua_specific_gravity}`);
    if (hasValue(latestLab.urinalysis)) uaParts.push(String(latestLab.urinalysis));

    const feParts = [];
    if (hasValue(latestLab.fe_color)) feParts.push(`Color ${latestLab.fe_color}`);
    if (hasValue(latestLab.fe_consistency)) feParts.push(`Cons ${latestLab.fe_consistency}`);
    if (hasValue(latestLab.fe_ova_parasites)) feParts.push(`Ova ${latestLab.fe_ova_parasites}`);
    if (hasValue(latestLab.fecalysis)) feParts.push(String(latestLab.fecalysis));

    return {
      cbc: cbcParts.join(" • ") || "—",
      urinalysis: uaParts.join(" • ") || "—",
      fecalysis: feParts.join(" • ") || "—",
    };
  }, [latestLab]);

  const upcomingSummary = useMemo(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const upcoming = appointments
      .filter((a) => {
        const status = String(a.status || "").toLowerCase();
        if (["rejected", "cancelled", "canceled"].includes(status)) return false;
        const dateStr = a.scheduled_at || a.preferred_date;
        if (!dateStr) return false;
        const dt = new Date(dateStr);
        return Number.isFinite(dt.getTime()) && dt >= startOfToday;
      })
      .sort((a, b) => {
        const aDt = new Date(a.scheduled_at || a.preferred_date);
        const bDt = new Date(b.scheduled_at || b.preferred_date);
        return aDt - bDt;
      });
    return { count: upcoming.length, next: upcoming[0] || null };
  }, [appointments]);

  const latestReportSummary = useMemo(() => {
    const release = String(stepsRow?.release_status || "").toLowerCase();
    if (release === "completed") return { label: "Normal", meta: "Report released" };
    if (release === "in_progress") return { label: "In Review", meta: "Doctor reviewing" };
    if (release) return { label: release.replace(/_/g, " "), meta: "Pending release" };
    return { label: "Pending", meta: "No report yet" };
  }, [stepsRow]);

  const paymentSummary = useMemo(() => {
    const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return {
      totalPaid,
      last: payments[0] || null,
      outstanding: 0,
    };
  }, [payments]);

  const labSummaryItems = useMemo(() => {
    if (!latestLabSummary) return [];
    const items = [
      { label: "CBC", value: latestLabSummary.cbc },
      { label: "Urinalysis", value: latestLabSummary.urinalysis },
      { label: "Fecalysis", value: latestLabSummary.fecalysis },
    ].filter((item) => item.value && item.value !== "—");
    return items.slice(0, 2);
  }, [latestLabSummary]);

  const analyticsDays = useMemo(() => {
    if (analyticsRange === "7d") return 7;
    if (analyticsRange === "90d") return 90;
    return 30;
  }, [analyticsRange]);

  const analyticsStart = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - (analyticsDays - 1));
    start.setHours(0, 0, 0, 0);
    return start;
  }, [analyticsDays]);

  const formTimeSeries = useMemo(() => {
    const map = new Map();
    const byAppointment = new Map();
    for (const row of requirementsList || []) {
      if (!row?.appointment_id) continue;
      const start = row.form_started_at || row.created_at;
      const end = row.form_submitted_at;
      if (!start || !end) continue;
      const startMs = new Date(start).getTime();
      const endMs = new Date(end).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
      const existing = byAppointment.get(row.appointment_id);
      if (!existing || endMs > existing.endMs) {
        byAppointment.set(row.appointment_id, { endMs, durationMs: endMs - startMs });
      }
    }
    for (const { endMs, durationMs } of byAppointment.values()) {
      const endKey = dayKey(new Date(endMs).toISOString());
      if (!endKey) continue;
      const endDate = new Date(endKey + "T00:00:00");
      if (endDate < analyticsStart) continue;
      const mins = Math.round(durationMs / 60000);
      const existing = map.get(endKey) || { sum: 0, count: 0 };
      map.set(endKey, { sum: existing.sum + mins, count: existing.count + 1 });
    }
    const keys = Array.from(map.keys()).sort();
    return keys.map((key) => {
      const v = map.get(key);
      const avg = v.count ? Math.round(v.sum / v.count) : 0;
      return { label: toDisplayDate(key), value: avg };
    });
  }, [requirementsList, analyticsStart]);

  const testsTimeSeries = useMemo(() => {
    const map = new Map();
    const vitalsByAppt = new Map();
    const xrayByAppt = new Map();

    for (const row of vitals || []) {
      if (!row?.appointment_id || !row?.recorded_at) continue;
      const t = new Date(row.recorded_at).getTime();
      if (!Number.isFinite(t)) continue;
      const existing = vitalsByAppt.get(row.appointment_id);
      if (!existing || t < existing) vitalsByAppt.set(row.appointment_id, t);
    }

    for (const row of xrayResults || []) {
      if (!row?.appointment_id) continue;
      const t = new Date(row.updated_at || row.exam_date || row.created_at || row.recorded_at || "").getTime();
      if (!Number.isFinite(t)) continue;
      const existing = xrayByAppt.get(row.appointment_id);
      if (!existing || t > existing) xrayByAppt.set(row.appointment_id, t);
    }

    for (const [appointmentId, startMs] of vitalsByAppt.entries()) {
      const endMs = xrayByAppt.get(appointmentId);
      if (!endMs || endMs <= startMs) continue;
      const endKey = dayKey(new Date(endMs).toISOString());
      if (!endKey) continue;
      const endDate = new Date(endKey + "T00:00:00");
      if (endDate < analyticsStart) continue;
      const mins = Math.round((endMs - startMs) / 60000);
      const existing = map.get(endKey) || { sum: 0, count: 0 };
      map.set(endKey, { sum: existing.sum + mins, count: existing.count + 1 });
    }

    const keys = Array.from(map.keys()).sort();
    return keys.map((key) => {
      const v = map.get(key);
      const avg = v.count ? Math.round(v.sum / v.count) : 0;
      return { label: toDisplayDate(key), value: avg };
    });
  }, [vitals, xrayResults, analyticsStart]);

  const weightSeries = useMemo(() => {
    const rows = (vitals || [])
      .filter((v) => v?.recorded_at && v?.weight_kg != null)
      .map((v) => ({
        key: dayKey(v.recorded_at),
        value: Number(v.weight_kg),
      }))
      .filter((v) => v.key && Number.isFinite(v.value))
      .filter((v) => new Date(v.key + "T00:00:00") >= analyticsStart)
      .sort((a, b) => (a.key > b.key ? 1 : -1));
    return rows.map((v) => ({ label: toDisplayDate(v.key), value: v.value }));
  }, [vitals, analyticsStart]);

  const analyticsMetricMap = useMemo(
    () => ({
      form: {
        label: "Form Time (mins)",
        series: formTimeSeries,
        color: "#0f766e",
      },
      tests: {
        label: "Medical Tests (mins)",
        series: testsTimeSeries,
        color: "#2563eb",
      },
      weight: {
        label: "Weight Trend (kg)",
        series: weightSeries,
        color: "#f97316",
      },
    }),
    [formTimeSeries, testsTimeSeries, weightSeries]
  );

  const activeMetric = analyticsMetricMap[analyticsMetric] || analyticsMetricMap.form;

  const formTimeAverage = useMemo(() => {
    if (!formTimeSeries.length) return null;
    const total = formTimeSeries.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    return Math.round(total / formTimeSeries.length);
  }, [formTimeSeries]);

  const testsTimeAverage = useMemo(() => {
    if (!testsTimeSeries.length) return null;
    const total = testsTimeSeries.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    return Math.round(total / testsTimeSeries.length);
  }, [testsTimeSeries]);

  const weightAverage = useMemo(() => {
    if (!weightSeries.length) return null;
    const total = weightSeries.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    return Math.round((total / weightSeries.length) * 10) / 10;
  }, [weightSeries]);

  const getTrendFromSeries = useCallback((series) => {
    if (!series || series.length < 2) return { direction: "flat", label: "No trend" };
    const prev = Number(series[series.length - 2]?.value) || 0;
    const curr = Number(series[series.length - 1]?.value) || 0;
    if (!prev && !curr) return { direction: "flat", label: "No trend" };
    if (prev === curr) return { direction: "flat", label: "No change" };
    const diff = curr - prev;
    const pct = prev ? Math.round((Math.abs(diff) / prev) * 100) : 100;
    return { direction: diff > 0 ? "up" : "down", label: `${pct}%` };
  }, []);

  const metricTrend = useMemo(() => getTrendFromSeries(activeMetric.series), [activeMetric.series, getTrendFromSeries]);
  const formTrend = useMemo(() => getTrendFromSeries(formTimeSeries), [formTimeSeries, getTrendFromSeries]);
  const testsTrend = useMemo(() => getTrendFromSeries(testsTimeSeries), [testsTimeSeries, getTrendFromSeries]);

  function hasLabValue(v) {
    return v !== null && v !== undefined && String(v).trim() !== "";
  }

  function summarizeLabForHistory(lab) {
    const cbcParts = [];
    if (hasLabValue(lab.cbc_hemoglobin)) cbcParts.push(`Hgb ${lab.cbc_hemoglobin}`);
    if (hasLabValue(lab.cbc_hematocrit)) cbcParts.push(`Hct ${lab.cbc_hematocrit}`);
    if (hasLabValue(lab.cbc_wbc_count)) cbcParts.push(`WBC ${lab.cbc_wbc_count}`);
    if (hasLabValue(lab.cbc_platelet)) cbcParts.push(`Plt ${lab.cbc_platelet}`);
    if (hasLabValue(lab.cbc)) cbcParts.push(String(lab.cbc));

    const uaParts = [];
    if (hasLabValue(lab.ua_color)) uaParts.push(`Color ${lab.ua_color}`);
    if (hasLabValue(lab.ua_transparency)) uaParts.push(`Transp ${lab.ua_transparency}`);
    if (hasLabValue(lab.ua_ph)) uaParts.push(`pH ${lab.ua_ph}`);
    if (hasLabValue(lab.ua_specific_gravity)) uaParts.push(`SG ${lab.ua_specific_gravity}`);
    if (hasLabValue(lab.urinalysis)) uaParts.push(String(lab.urinalysis));

    const feParts = [];
    if (hasLabValue(lab.fe_color)) feParts.push(`Color ${lab.fe_color}`);
    if (hasLabValue(lab.fe_consistency)) feParts.push(`Cons ${lab.fe_consistency}`);
    if (hasLabValue(lab.fe_ova_parasites)) feParts.push(`Ova ${lab.fe_ova_parasites}`);
    if (hasLabValue(lab.fecalysis)) feParts.push(String(lab.fecalysis));

    return {
      cbc: cbcParts.join(" • "),
      urinalysis: uaParts.join(" • "),
      fecalysis: feParts.join(" • "),
    };
  }

  const activeApptId = activeApprovedAppt?.id || null;
  const activeVitals = useMemo(
    () => (activeApptId ? vitals.find((v) => v.appointment_id === activeApptId) : null),
    [vitals, activeApptId]
  );
  const activeLab = useMemo(
    () => (activeApptId ? labs.find((l) => l.appointment_id === activeApptId) : null),
    [labs, activeApptId]
  );
  const activeXray = useMemo(() => {
    if (!activeApptId) return null;
    const exact = xrayResults.find((x) => x.appointment_id === activeApptId);
    if (exact) return exact;
    const targetDate = activeApprovedAppt?.preferred_date ? dateOnly(activeApprovedAppt.preferred_date) : "";
    if (!targetDate) return null;
    return (
      xrayResults.find((x) => dateOnly(x.exam_date || x.updated_at || "") === targetDate) || null
    );
  }, [xrayResults, activeApptId, activeApprovedAppt?.preferred_date]);

  const DAILY_CAPACITY = 10;
  const statusKey = (appt) => String(appt?.workflow_status || appt?.status || "").toLowerCase();
  const isScheduleConfirmed = (appt) => ["approved", "ready_for_triage", "awaiting_forms"].includes(statusKey(appt));

  function dateOnly(value) {
    if (!value) return "";
    const s = String(value);
    if (s.includes("T")) return s.slice(0, 10);
    if (s.includes(" ")) return s.split(" ")[0];
    return s.slice(0, 10);
  }

  const bookedByDate = useMemo(() => {
    const map = new Map();
    appointments.forEach((a) => {
      const status = String(a.status || "").toLowerCase();
      if (status === "rejected" || status === "cancelled" || status === "canceled") return;
      if (!a.preferred_date) return;
      const key = dateOnly(a.preferred_date);
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [appointments]);

  const latestValidAppt = useMemo(() => {
    if (!latestAppt) return null;
    if (isNonBlockingStatus(latestAppt.status)) return null;
    if (isReleasedByStatus(latestAppt.status)) return null;
    return latestAppt;
  }, [latestAppt]);

  const formSlipAppointment = activeApprovedAppt || latestValidAppt;
  const formSlipLocked = formSlipAppointment ? isScheduleConfirmed(formSlipAppointment) : false;
  const formSlipReqRow = activeApprovedAppt ? reqRow : pendingReqRow;

  function dateKey(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function monthLabel(d) {
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  }

  function buildMonthDays(d) {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const current = new Date(d.getFullYear(), d.getMonth(), day);
      days.push(current);
    }
    return days;
  }

  const monthDays = useMemo(() => buildMonthDays(monthCursor), [monthCursor]);
  const todayKey = dateKey(new Date());
  useEffect(() => {
    if (!monthCursor) return;
    if (monthCursor < new Date(minDate.getFullYear(), minDate.getMonth(), 1)) {
      setMonthCursor(new Date(minDate.getFullYear(), minDate.getMonth(), 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDate]);

  const activityItems = useMemo(() => {
    return [...appointments]
      .sort((a, b) => {
        const da = new Date(a.created_at || a.preferred_date || 0).getTime();
        const db = new Date(b.created_at || b.preferred_date || 0).getTime();
        return db - da;
      })
      .slice(0, 6);
  }, [appointments]);

  function formatPreferred(value) {
    if (!value) return "—";
    const s = String(value);
    if (s.includes("T")) {
      const dt = new Date(s);
      if (!Number.isNaN(dt.getTime())) return dt.toLocaleString();
    }
    return s;
  }

  async function cancelAppointment(appt) {
    if (!appt?.id) return;
    const ok = confirm("Cancel this appointment? This will free up the slot.");
    if (!ok) return;

    const { error } = await supabase
      .from("appointments")
      .update({
        workflow_status: "rejected",
        status: "rejected",
        rejection_reason: "Cancelled by patient",
        scheduled_at: null,
      })
      .eq("id", appt.id);

    if (error) return setMsg("Failed to cancel appointment: " + error.message);
    setMsg("Appointment cancelled.");
    loadAll();
  }


  /* ---------- Notifications ---------- */
  async function loadNotifications() {
    if (!patientId) return;

    setLoadingNotifs(true);

    const { data, error } = await supabase
      .from("notifications")
      .select("id, patient_id, title, body, created_at, read_at, is_read")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (error) {
      setNotifSupported(false);
      setNotifications([]);
      setLoadingNotifs(false);
      return;
    }

    setNotifSupported(true);
    setNotifications(data || []);
    setLoadingNotifs(false);
  }

  async function markAllAsRead() {
    setLoadingNotifs(true);

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now, is_read: true })
      .eq("patient_id", patientId)
      .or("read_at.is.null,is_read.eq.false");

    if (error) {
      setMsg(`Failed to mark notifications as read: ${error.message}`);
      setLoadingNotifs(false);
      return;
    }

    await loadNotifications();
    setLoadingNotifs(false);
  }

  async function changePassword() {
    setSettingsMsg("");
    const passError = validatePassword(newPassword);
    if (passError) return setSettingsMsg(passError);

    setSavingSettings(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingSettings(false);

    if (error) return setSettingsMsg("Failed to change password: " + error.message);

    setNewPassword("");
    setSettingsMsg("Password updated successfully!");
  }

  async function requestPatientPasswordReset() {
    setSettingsMsg("");
    const email = String(session?.user?.email || "").trim().toLowerCase();
    if (!email) return setSettingsMsg("No email found for this account.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (error) return setSettingsMsg("Failed to send reset email: " + error.message);
    setSettingsMsg("Password reset email sent. Check your inbox/spam.");
  }

  async function logoutNow() {
    setSettingsMsg("");
    setSavingSettings(true);
    const { error } = await supabase.auth.signOut();
    setSavingSettings(false);
    if (error) return setSettingsMsg("Logout failed: " + error.message);
  }

  async function loadProfile() {
    const userId = session?.user?.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!error) setProfile(data || null);
  }

  async function ensureProfileFromMetadataIfMissing() {
    const userId = session?.user?.id;
    if (!userId) return;

    const meta = session?.user?.user_metadata || {};
    const email = (session?.user?.email || "").toLowerCase();

    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (!error && data?.id) return;

    const payload = {
      id: userId,
      role: "patient",
      email: email || null,

      full_name: clean(meta.full_name),
      company: cleanOrNull(meta.company),
      gender: clean(meta.gender) || null,
      birth_date: clean(meta.birth_date) || null,
      age: typeof meta.age === "number" ? meta.age : null,
      civil_status: clean(meta.civil_status) || null,
      address: clean(meta.address) || null,
      contact_no: clean(meta.contact_no) || null,

      updated_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (upErr) {
      setMsg((m) => m || `Failed to create profile: ${upErr.message}`);
    }
  }

  async function ensureAppointmentSteps(appointmentId) {
    if (!appointmentId) return { ok: false, error: "Missing appointment id." };
    const existing = await supabase
      .from("appointment_steps")
      .select("appointment_id")
      .eq("appointment_id", appointmentId)
      .maybeSingle();
    if (existing.error) return { ok: false, error: existing.error.message };
    if (existing.data) return { ok: true };

    const payload = {
      appointment_id: appointmentId,
      patient_id: patientId,
      registration_status: "completed",
      triage_status: "pending",
      lab_status: "pending",
      xray_status: "pending",
      doctor_status: "pending",
      payment_status: "pending",
      release_status: "pending",
    };

    const ins = await supabase.from("appointment_steps").insert([payload]).select("appointment_id").maybeSingle();
    if (ins.error) return { ok: false, error: ins.error.message };
    return { ok: true };
  }

  async function ensureAppointmentRequirements(appointmentId) {
    if (!appointmentId) return { ok: false, error: "Missing appointment id." };
    const existing = await supabase
      .from("appointment_requirements")
      .select("appointment_id")
      .eq("appointment_id", appointmentId)
      .maybeSingle();
    if (existing.error) return { ok: false, error: existing.error.message };
    if (existing.data) return { ok: true };

    const ins = await supabase
      .from("appointment_requirements")
      .insert([{ appointment_id: appointmentId, patient_id: patientId }])
      .select("appointment_id")
      .maybeSingle();
    if (ins.error) return { ok: false, error: ins.error.message };
    return { ok: true };
  }

  async function isSlotAvailable(dateStr, timeStr) {
    const scheduledISO = combineLocalISO(dateStr, timeStr);
    if (!scheduledISO) return { ok: false, error: "Invalid schedule." };

    const { data, error } = await supabase
      .from("appointments")
      .select("id, workflow_status, status, scheduled_at")
      .eq("scheduled_at", scheduledISO);

    if (error) return { ok: false, error: error.message };

    const occupying = ["approved", "awaiting_forms", "ready_for_triage"];
    const conflict = (data || []).some((a) => {
      const ws = toLower(a.workflow_status || a.status);
      return occupying.includes(ws);
    });

    return { ok: !conflict };
  }

  async function downloadLabSummary(labRow) {
    if (!labRow) return setMsg("Lab summary not available.");
    const appt = appointmentById.get(labRow.appointment_id) || activeApprovedAppt || null;
    const reportData = {
      patient: profile || { id: patientId, full_name: patientName(), email: session.user.email },
      appointment: appt,
      lab: labRow,
    };
    try {
      const pdfBytes = await generateLabSummaryPdf(reportData);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Lab-Tests-Summary.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setMsg("Failed to generate lab summary PDF.");
    }
  }

  async function downloadXraySummary(xrayRow) {
    if (!xrayRow) return setMsg("X-ray summary not available.");
    const appt = appointmentById.get(xrayRow.appointment_id) || activeApprovedAppt || null;
    const reportData = {
      patient: profile || { id: patientId, full_name: patientName(), email: session.user.email },
      appointment: appt,
      xray: xrayRow,
    };
    try {
      const pdfBytes = await generateXraySummaryPdf(reportData);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Xray-Summary.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setMsg("Failed to generate x-ray summary PDF.");
    }
  }

  async function downloadReport() {
    if (!stepsRow || String(stepsRow.release_status).toLowerCase() !== "completed") {
      setMsg("Medical report is not released yet.");
      return;
    }

    let reportRow = doctorReport;
    if (!reportRow && activeApprovedAppt?.id) {
      const rep = await supabase
        .from("doctor_reports")
        .select("*")
        .eq("appointment_id", activeApprovedAppt.id)
        .maybeSingle();
      if (!rep.error) reportRow = rep.data || null;
    }

    const reportData = {
      generated_at: new Date().toISOString(),
      patient: profile || { id: patientId, full_name: patientName(), email: session.user.email },
      appointment: activeApprovedAppt,
      lab: latestLab,
      xray: activeXray,
      report: reportRow,
      steps: stepsRow,
      autoSave: false,
    };

    try {
      const pdfBytes = await generateMedicalReportPdf(reportData);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Medical-Examination-Report.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setMsg("Failed to generate medical report PDF.");
    }
  }



  /* ---------- Core loads ---------- */
  async function computeBookingLock(appts) {
    const list = appts || [];
    if (list.length === 0) {
      setLatestAppt(null);
      setLatestSteps(null);
      setCanBook(true);
      setBookLockReason("");
      return;
    }

    // Because you order by created_at desc, first is latest
    const latest = list[0];
    setLatestAppt(latest);

    const latestStatus = latest.status;

    // If latest is rejected/cancelled -> allow booking
    if (isNonBlockingStatus(latestStatus)) {
      setLatestSteps(null);
      setCanBook(true);
      setBookLockReason("");
      return;
    }

    // If latest appointment already has status=released -> allow booking
    if (isReleasedByStatus(latestStatus)) {
      setLatestSteps(null);
      setCanBook(true);
      setBookLockReason("");
      return;
    }

    // Otherwise check steps.release_status (if row exists)
    const steps = await supabase
      .from("appointment_steps")
      .select("appointment_id, release_status")
      .eq("appointment_id", latest.id)
      .maybeSingle();

    if (steps.error) {
      // If we cannot read steps (RLS), be safe and lock
      setLatestSteps(null);
      setCanBook(false);
      setBookLockReason(
        "You can’t book a new appointment yet because your latest medical result is not released."
      );
      return;
    }

    setLatestSteps(steps.data || null);

    if (isReleasedBySteps(steps.data)) {
      setCanBook(true);
      setBookLockReason("");
    } else {
      setCanBook(false);
      setBookLockReason(
        "You can’t book a new appointment yet because your latest medical result is not released."
      );
    }
  }

  async function loadMedicalProcessFromLatestApproved(appts) {
    const getByStatus = (status) => (appts || []).find((x) => statusKey(x) === status);
    const ready = getByStatus("ready_for_triage") || getByStatus("approved") || getByStatus("awaiting_forms");
    if (!ready) {
      setActiveApprovedAppt(null);
      setStepsRow(null);
      setReqRow(null);
      setDoctorReport(null);
      return;
    }

    if (isNonBlockingStatus(statusKey(ready) || ready?.status)) {
      setActiveApprovedAppt(null);
      setStepsRow(null);
      setReqRow(null);
      setDoctorReport(null);
      return;
    }

    setActiveApprovedAppt(ready);

    let steps = await supabase
      .from("appointment_steps")
      .select("*")
      .eq("appointment_id", ready.id)
      .maybeSingle();

    let req = await supabase
      .from("appointment_requirements")
      .select("*")
      .eq("appointment_id", ready.id)
      .maybeSingle();

    if (steps.error) setMsg((m) => m || `Process steps not ready: ${steps.error.message}`);
    if (req.error) setMsg((m) => m || `Requirements not ready: ${req.error.message}`);

    if (!steps.error && !steps.data) {
      await ensureAppointmentSteps(ready.id);
      steps = await supabase
        .from("appointment_steps")
        .select("*")
        .eq("appointment_id", ready.id)
        .maybeSingle();
    }

    if (!req.error && !req.data) {
      await ensureAppointmentRequirements(ready.id);
      req = await supabase
        .from("appointment_requirements")
        .select("*")
        .eq("appointment_id", ready.id)
        .maybeSingle();
    }

    setStepsRow(steps.data || null);
    setReqRow(req.data || null);

    const rep = await supabase
      .from("doctor_reports")
      .select("*")
      .eq("appointment_id", ready.id)
      .maybeSingle();
    if (!rep.error) setDoctorReport(rep.data || null);

    hydrateFormDraftFromReq(req.data || null);
  }

  function hydrateFormDraftFromReq(r) {
    if (!r) return;
    setFormDraft((prev) => ({
      ...prev,

      exam_physical: !!r.exam_physical,
      exam_visual_acuity: !!r.exam_visual_acuity,
      exam_height_weight: !!r.exam_height_weight,

      lab_cbc_platelet: !!r.lab_cbc_platelet,
      lab_urinalysis: !!r.lab_urinalysis,
      lab_fecalysis: !!r.lab_fecalysis,
      lab_drug_test: !!r.lab_drug_test,
      lab_hepatitis_b: !!r.lab_hepatitis_b,
      lab_hepatitis_a: !!r.lab_hepatitis_a,
      lab_ecg: !!r.lab_ecg,
      lab_audiometry: !!r.lab_audiometry,
      lab_blood_typing: !!r.lab_blood_typing,
      lab_pregnancy_test: !!r.lab_pregnancy_test,
      lab_salmonella: !!r.lab_salmonella,

      xray_chest: !!r.xray_chest,

      custom_items: Array.isArray(r.lab_custom_items)
        ? r.lab_custom_items.map((item) => item.id).filter(Boolean)
        : [],
      xray_custom_items: Array.isArray(r.xray_custom_items)
        ? r.xray_custom_items.map((item) => item.id).filter(Boolean)
        : [],
      package_code: r.package_code ? String(r.package_code).toUpperCase() : prev.package_code,

      needs_lab:
        typeof r.needs_lab === "boolean"
          ? r.needs_lab
          : !!(
              r.exam_physical ||
              r.exam_visual_acuity ||
              r.exam_height_weight ||
              r.lab_cbc_platelet ||
              r.lab_urinalysis ||
              r.lab_fecalysis ||
              r.lab_drug_test ||
              r.lab_hepatitis_b ||
              r.lab_hepatitis_a ||
              r.lab_ecg ||
              r.lab_audiometry ||
              r.lab_blood_typing ||
              r.lab_pregnancy_test ||
              r.lab_salmonella ||
              (Array.isArray(r.lab_custom_items) && r.lab_custom_items.length > 0)
            ),

      needs_xray:
        typeof r.needs_xray === "boolean"
          ? r.needs_xray
          : !!r.xray_chest || (Array.isArray(r.xray_custom_items) && r.xray_custom_items.length > 0),
    }));
  }

  useEffect(() => {
    if (!latestValidAppt || activeApprovedAppt?.id === latestValidAppt.id) {
      setPendingReqRow(null);
      return;
    }
    let cancelled = false;
    async function loadPendingReq() {
      const req = await supabase
        .from("appointment_requirements")
        .select("*")
        .eq("appointment_id", latestValidAppt.id)
        .maybeSingle();
      if (cancelled) return;
      if (!req.error) {
        setPendingReqRow(req.data || null);
        if (req.data) hydrateFormDraftFromReq(req.data);
      }
    }
    loadPendingReq();
    return () => {
      cancelled = true;
    };
  }, [latestValidAppt?.id, activeApprovedAppt?.id]);

  async function loadAll() {
    setLoading(true);
    setMsg("");

    const a = await supabase
      .from("appointments")
      .select("id, patient_id, appointment_type, preferred_date, scheduled_at, workflow_status, status, rejection_reason, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    const v = await supabase
      .from("vitals")
      .select("*")
      .eq("patient_id", patientId)
      .order("recorded_at", { ascending: false });

    const l = await supabase
      .from("lab_results")
      .select(
        [
          "id",
          "patient_id",
          "appointment_id",
          "recorded_at",
          "cbc",
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
          "chest_xray",
          "others",
          "remarks",
          "approval_status",
          "approved_at",
        ].join(", ")
      )
      .eq("patient_id", patientId)
      .order("recorded_at", { ascending: false });

    const xr = await supabase
      .from("xray_results")
      .select("id, patient_id, appointment_id, status, updated_at, findings, remarks, exam_date")
      .eq("patient_id", patientId)
      .order("updated_at", { ascending: false });

    const p = await supabase
      .from("payments")
      .select("id, patient_id, appointment_id, recorded_at, payment_status, or_number, amount, notes")
      .eq("patient_id", patientId)
      .order("recorded_at", { ascending: false });

    const st = await supabase
      .from("appointment_steps")
      .select("appointment_id, patient_id, done_at, lab_done_at, xray_done_at, updated_at")
      .eq("patient_id", patientId)
      .order("updated_at", { ascending: false });

    const errors = [a.error, v.error, l.error, xr.error, p.error, st.error].filter(Boolean);
    if (errors.length) setMsg(errors[0].message);

    setAppointments(a.data || []);
    setVitals(v.data || []);
    setLabs(l.data || []);
    setXrayResults(xr.data || []);
    setPayments(p.data || []);
    setStepsList(st.data || []);

    if ((a.data || []).length > 0) {
      const ids = (a.data || []).map((row) => row.id).filter(Boolean);
      const { data: reqs } = await supabase
        .from("appointment_requirements")
        .select(
          [
            "appointment_id",
            "created_at",
            "form_started_at",
            "form_submitted_at",
            "lab_custom_items",
            "xray_custom_items",
            "exam_physical",
            "exam_visual_acuity",
            "exam_height_weight",
            "lab_cbc_platelet",
            "lab_urinalysis",
            "lab_fecalysis",
            "lab_drug_test",
            "lab_hepatitis_b",
            "lab_hepatitis_a",
            "lab_ecg",
            "lab_audiometry",
            "lab_blood_typing",
            "lab_pregnancy_test",
            "lab_salmonella",
            "xray_chest",
          ].join(", ")
        )
        .in("appointment_id", ids);
      const map = {};
      (reqs || []).forEach((r) => {
        map[r.appointment_id] = r;
      });
      setRequirementsByAppt(map);
      setRequirementsList(reqs || []);
    } else {
      setRequirementsByAppt({});
      setRequirementsList([]);
    }

    await loadProfile();

    // booking lock
    await computeBookingLock(a.data || []);

    await loadNotifications();
    await loadMedicalProcessFromLatestApproved(a.data || []);

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTopbarActionsEl(document.getElementById("dashboard-utility-actions"));
  }, []);

  /* ---------- Appointment request (LOCKED until released) ---------- */
  async function requestAppointment() {
    setMsg("");
    const notifyBookingError = (message) => {
      setMsg(message);
      window.alert(message);
    };

    if (!canBook) {
      return notifyBookingError(bookLockReason || "You can’t book a new appointment yet.");
    }

    if (!formSlipConfirmed) {
      return notifyBookingError("Please complete the Form Slip before booking.");
    }

    await ensureProfileFromMetadataIfMissing();

    if (!preferredDate) return notifyBookingError("Please choose an appointment date.");
    if (!preferredTime) return notifyBookingError("Please choose a preferred time.");
    if (!isClinicTime(preferredTime)) {
      return notifyBookingError("Clinic hours are 7:00 AM – 3:00 PM only.");
    }

    const day = new Date(preferredDate + "T00:00:00").getDay();
    if (day === 0) {
      return notifyBookingError("Clinic is closed on Sundays. Please choose Monday–Saturday.");
    }

    const preferredDateTime = preferredTime ? `${preferredDate} ${preferredTime}` : preferredDate;

    const availability = await isSlotAvailable(preferredDate, preferredTime);
    if (!availability.ok) {
      return notifyBookingError(availability.error || "That time slot is already booked. Please choose another.");
    }

    const scheduledISO = combineLocalISO(preferredDate, preferredTime);
    if (!scheduledISO) return notifyBookingError("Invalid schedule date/time.");

    const payload = {
      patient_id: patientId,
      appointment_type: type,
      preferred_date: preferredDateTime,
      scheduled_at: scheduledISO,
      workflow_status: "approved",
      status: "approved",
      rejection_reason: null,
    };

    const { data, error } = await supabase.from("appointments").insert([payload]).select("id").maybeSingle();
    if (error) return setMsg(`Failed to request appointment: ${error.message}`);

    if (data?.id) {
      const stepsRes = await ensureAppointmentSteps(data.id);
      if (!stepsRes.ok) setMsg((m) => m || `Appointment created, but steps missing: ${stepsRes.error}`);

      try {
        await upsertFormSlipForAppointment(data.id);
      } catch (e) {
        setMsg((m) => m || `Appointment created, but form slip not saved: ${e?.message || e}`);
      }
    }

    setMsg("Appointment approved and scheduled.");
    setBookingConfirmInfo({
      appointment_type: type,
      scheduled_at: scheduledISO,
      preferred_date: preferredDateTime,
    });
    setBookingConfirmOpen(true);
    setPreferredDate("");
    setPreferredTime("");
    setFormSlipConfirmed(false);
    loadAll();
  }

  /* ---------- ✅ Save Form Slip (upsert) ---------- */
  const computedDraft = useMemo(() => {
    const custom_item_ids = Array.isArray(formDraft.custom_items) ? formDraft.custom_items : [];
    const custom_items_detail = getCustomItemsByIds(custom_item_ids);
    const custom_total = calcCustomTotal(custom_items_detail);
    const xray_item_ids = Array.isArray(formDraft.xray_custom_items) ? formDraft.xray_custom_items : [];
    const xray_items_detail = getXrayItemsByIds(xray_item_ids);
    const xray_total = calcCustomTotal(xray_items_detail);
    const package_code = String(formDraft.package_code || "CUSTOM").toUpperCase();
    const package_price = PACKAGE_PRICES[package_code] || 0;
    const standardSelectedKeys = ALL_KEYS.filter((k) => !!formDraft[k]);
    const standard_total = standardSelectedKeys.reduce(
      (sum, k) => sum + (STANDARD_TEST_PRICES[k] || 0),
      0
    );
    const packageIncluded = PACKAGE_MAP[package_code] ? Object.keys(PACKAGE_MAP[package_code]) : [];
    const extra_standard_total =
      package_code === "CUSTOM"
        ? standard_total
        : standardSelectedKeys.reduce(
            (sum, k) => sum + (packageIncluded.includes(k) ? 0 : STANDARD_TEST_PRICES[k] || 0),
            0
          );

    const needs_lab = !!(
      formDraft.exam_physical ||
      formDraft.exam_visual_acuity ||
      formDraft.exam_height_weight ||
      formDraft.lab_cbc_platelet ||
      formDraft.lab_urinalysis ||
      formDraft.lab_fecalysis ||
      formDraft.lab_drug_test ||
      formDraft.lab_hepatitis_b ||
      formDraft.lab_hepatitis_a ||
      formDraft.lab_ecg ||
      formDraft.lab_audiometry ||
      formDraft.lab_blood_typing ||
      formDraft.lab_pregnancy_test ||
      formDraft.lab_salmonella ||
      custom_items_detail.length > 0
    );

    const needs_xray = !!formDraft.xray_chest || xray_items_detail.length > 0;
    return {
      ...formDraft,
      package_code,
      package_price,
      needs_lab,
      needs_xray,
      standard_total,
      extra_standard_total,
      total_estimate: package_price + (custom_total || 0) + (xray_total || 0) + extra_standard_total,
      custom_items: custom_item_ids,
      custom_items_detail,
      custom_total,
      xray_custom_items: xray_item_ids,
      xray_custom_items_detail: xray_items_detail,
      xray_custom_total: xray_total,
    };
  }, [formDraft]);

  useEffect(() => {
    setFormDraft((d) => {
      const needs_lab = !!(
        d.exam_physical ||
        d.exam_visual_acuity ||
        d.exam_height_weight ||
        d.lab_cbc_platelet ||
        d.lab_urinalysis ||
        d.lab_fecalysis ||
        d.lab_drug_test ||
        d.lab_hepatitis_b ||
        d.lab_hepatitis_a ||
        d.lab_ecg ||
        d.lab_audiometry ||
        d.lab_blood_typing ||
        d.lab_pregnancy_test ||
        d.lab_salmonella ||
        (Array.isArray(d.custom_items) && d.custom_items.length > 0)
      );

      const needs_xray =
        !!d.xray_chest || (Array.isArray(d.xray_custom_items) && d.xray_custom_items.length > 0);

      if (d.needs_lab === needs_lab && d.needs_xray === needs_xray) return d;
      return { ...d, needs_lab, needs_xray };
    });
  }, [
    formDraft.exam_physical,
    formDraft.exam_visual_acuity,
    formDraft.exam_height_weight,
    formDraft.lab_cbc_platelet,
    formDraft.lab_urinalysis,
    formDraft.lab_fecalysis,
    formDraft.lab_drug_test,
    formDraft.lab_hepatitis_b,
    formDraft.lab_hepatitis_a,
    formDraft.lab_ecg,
    formDraft.lab_audiometry,
    formDraft.lab_blood_typing,
    formDraft.lab_pregnancy_test,
    formDraft.lab_salmonella,
    formDraft.xray_chest,
    formDraft.custom_items,
    formDraft.xray_custom_items,
  ]);

async function saveFormSlip() {
  if (!formSlipAppointment) return;

  if (formSlipLocked) {
    setMsg("Form Slip is locked once your appointment is confirmed.");
    return;
  }

  // lock after payment
  if (String(stepsRow?.payment_status || "").toLowerCase() === "completed") {
    setMsg("Form Slip is locked because payment is completed.");
    return;
  }

  setMsg("");
  setSavingForm(true);

  const payload = {
    appointment_id: formSlipAppointment.id,
    patient_id: patientId,
    package_code: computedDraft.package_code || null,
    package_price: typeof computedDraft.package_price === "number" ? computedDraft.package_price : null,
    total_estimate: typeof computedDraft.total_estimate === "number" ? computedDraft.total_estimate : null,
    standard_total: typeof computedDraft.standard_total === "number" ? computedDraft.standard_total : null,
    extra_standard_total:
      typeof computedDraft.extra_standard_total === "number" ? computedDraft.extra_standard_total : null,
    needs_lab: computedDraft.needs_lab,
    needs_xray: computedDraft.needs_xray,

    exam_physical: !!computedDraft.exam_physical,
    exam_visual_acuity: !!computedDraft.exam_visual_acuity,
    exam_height_weight: !!computedDraft.exam_height_weight,

    lab_cbc_platelet: !!computedDraft.lab_cbc_platelet,
    lab_urinalysis: !!computedDraft.lab_urinalysis,
    lab_fecalysis: !!computedDraft.lab_fecalysis,
    lab_drug_test: !!computedDraft.lab_drug_test,
    lab_hepatitis_b: !!computedDraft.lab_hepatitis_b,
    lab_hepatitis_a: !!computedDraft.lab_hepatitis_a,
    lab_ecg: !!computedDraft.lab_ecg,
    lab_audiometry: !!computedDraft.lab_audiometry,
    lab_blood_typing: !!computedDraft.lab_blood_typing,
    lab_pregnancy_test: !!computedDraft.lab_pregnancy_test,
    lab_salmonella: !!computedDraft.lab_salmonella,
    xray_chest: !!computedDraft.xray_chest,

    lab_custom_items: computedDraft.custom_items_detail || [],
    lab_custom_total: typeof computedDraft.custom_total === "number" ? computedDraft.custom_total : null,
    xray_custom_items: computedDraft.xray_custom_items_detail || [],
    xray_custom_total: typeof computedDraft.xray_custom_total === "number" ? computedDraft.xray_custom_total : null,

    form_submitted: true,
    form_submitted_at: new Date().toISOString(),

    updated_at: new Date().toISOString(),
  };

  // ✅ UPSERT so the form shows even if row was not created yet
  let { data, error } = await supabase
    .from("appointment_requirements")
    .upsert(payload, { onConflict: "appointment_id" })
    .select("*")
    .maybeSingle();

  // If new columns aren't in DB yet, retry without them and show a clear message.
  if (error) {
    const msgLower = String(error.message || "").toLowerCase();
    const missingSubmittedCols =
      msgLower.includes("form_submitted_at") || msgLower.includes("form_submitted");
    const missingPackageCols =
      msgLower.includes("package_code") || msgLower.includes("package_price") || msgLower.includes("total_estimate");
    if (missingSubmittedCols || missingPackageCols) {
      const retryPayload = { ...payload };
      if (missingSubmittedCols) {
        delete retryPayload.form_submitted;
        delete retryPayload.form_submitted_at;
      }
      if (missingPackageCols) {
        delete retryPayload.package_code;
        delete retryPayload.package_price;
        delete retryPayload.total_estimate;
      }
      const retry = await supabase
        .from("appointment_requirements")
        .upsert(retryPayload, { onConflict: "appointment_id" })
        .select("*")
        .maybeSingle();
      data = retry.data;
      error = retry.error;
      if (!error) {
        setMsg(
          missingPackageCols
            ? "Form Slip saved. NOTE: Please run the migration to add package pricing columns for cashier totals."
            : "Form Slip saved. NOTE: Please run the migration to add form_submitted columns so the form hides after submit."
        );
      }
    }
  }

  if (error) {
    setMsg(`Failed to save Form Slip: ${error.message}`);
    setSavingForm(false);
    return;
  }

  // If update found no row, data will be null
  if (!data) {
    setMsg(
      "Form Slip row was not initialized yet. Please refresh. (Admin must create appointment_requirements when approving.)"
    );
    setSavingForm(false);
    return;
  }

  setReqRow(data);
  setMsg("Form Slip saved.");
  setSavingForm(false);
}

async function upsertFormSlipForAppointment(appointmentId) {
  const payload = {
    appointment_id: appointmentId,
    patient_id: patientId,
    package_code: computedDraft.package_code || null,
    package_price: typeof computedDraft.package_price === "number" ? computedDraft.package_price : null,
    total_estimate: typeof computedDraft.total_estimate === "number" ? computedDraft.total_estimate : null,
    standard_total: typeof computedDraft.standard_total === "number" ? computedDraft.standard_total : null,
    extra_standard_total:
      typeof computedDraft.extra_standard_total === "number" ? computedDraft.extra_standard_total : null,
    needs_lab: computedDraft.needs_lab,
    needs_xray: computedDraft.needs_xray,

    exam_physical: !!computedDraft.exam_physical,
    exam_visual_acuity: !!computedDraft.exam_visual_acuity,
    exam_height_weight: !!computedDraft.exam_height_weight,

    lab_cbc_platelet: !!computedDraft.lab_cbc_platelet,
    lab_urinalysis: !!computedDraft.lab_urinalysis,
    lab_fecalysis: !!computedDraft.lab_fecalysis,
    lab_drug_test: !!computedDraft.lab_drug_test,
    lab_hepatitis_b: !!computedDraft.lab_hepatitis_b,
    lab_hepatitis_a: !!computedDraft.lab_hepatitis_a,
    lab_ecg: !!computedDraft.lab_ecg,
    lab_audiometry: !!computedDraft.lab_audiometry,
    lab_blood_typing: !!computedDraft.lab_blood_typing,
    lab_pregnancy_test: !!computedDraft.lab_pregnancy_test,
    lab_salmonella: !!computedDraft.lab_salmonella,
    xray_chest: !!computedDraft.xray_chest,

    lab_custom_items: computedDraft.custom_items_detail || [],
    lab_custom_total: typeof computedDraft.custom_total === "number" ? computedDraft.custom_total : null,
    xray_custom_items: computedDraft.xray_custom_items_detail || [],
    xray_custom_total: typeof computedDraft.xray_custom_total === "number" ? computedDraft.xray_custom_total : null,

    form_submitted: true,
    form_submitted_at: new Date().toISOString(),

    updated_at: new Date().toISOString(),
  };

  let { data, error } = await supabase
    .from("appointment_requirements")
    .upsert(payload, { onConflict: "appointment_id" })
    .select("*")
    .maybeSingle();

  if (error) {
    const msgLower = String(error.message || "").toLowerCase();
    const missingSubmittedCols =
      msgLower.includes("form_submitted_at") || msgLower.includes("form_submitted");
    const missingPackageCols =
      msgLower.includes("package_code") ||
      msgLower.includes("package_price") ||
      msgLower.includes("total_estimate") ||
      msgLower.includes("standard_total") ||
      msgLower.includes("extra_standard_total");
    if (missingSubmittedCols || missingPackageCols) {
      const retryPayload = { ...payload };
      if (missingSubmittedCols) {
        delete retryPayload.form_submitted;
        delete retryPayload.form_submitted_at;
      }
      if (missingPackageCols) {
        delete retryPayload.package_code;
        delete retryPayload.package_price;
        delete retryPayload.total_estimate;
        delete retryPayload.standard_total;
        delete retryPayload.extra_standard_total;
      }
      const retry = await supabase
        .from("appointment_requirements")
        .upsert(retryPayload, { onConflict: "appointment_id" })
        .select("*")
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }
  }

  if (error) throw error;
  return data;
}

  /* ---------- Process steps ---------- */
  const normalizedReq = useMemo(() => normalizeRequirements(reqRow), [reqRow]);

  // ✅ UPDATED: registration -> payment -> triage -> labs/xray -> doctor -> release
  const processSteps = useMemo(() => {
    if (!activeApprovedAppt || !stepsRow) return [];

    const steps = stepsRow;
    const formReady = normalizedReq.formSubmitted;

    const paymentDone = String(steps.payment_status || "").toLowerCase() === "completed";
    const registrationDone = String(steps.registration_status || "").toLowerCase() === "completed";
    const paymentStatus = paymentDone ? "completed" : registrationDone ? "in_progress" : "pending";

    const customLabActions = (normalizedReq.custom_items || []).map((item) => ({
      label: item.label,
      done: steps.lab_status === "completed",
    }));

    const labActions = formReady
      ? [
          normalizedReq.req_physical_exam ? { label: "Physical Examination", done: steps.lab_status === "completed" } : null,
          normalizedReq.req_visual_acuity ? { label: "Visual acuity", done: steps.lab_status === "completed" } : null,
          normalizedReq.req_height_weight ? { label: "Height & weight", done: steps.lab_status === "completed" } : null,
          normalizedReq.req_cbc_platelet ? { label: "Complete blood count", done: steps.lab_status === "completed" } : null,
          normalizedReq.req_urinalysis ? { label: "Urinalysis", done: steps.lab_status === "completed" } : null,
          normalizedReq.req_fecalysis ? { label: "Fecalysis", done: steps.lab_status === "completed" } : null,
          normalizedReq.req_drug_test ? { label: "Drugtest screening", done: steps.lab_status === "completed" } : null,
          normalizedReq.req_hepatitis_b ? { label: "Hepatitis B Screening", done: steps.lab_status === "completed" } : null,
          normalizedReq.req_hepatitis_a ? { label: "Hepatitis A", done: steps.lab_status === "completed" } : null,
          normalizedReq.req_ecg ? { label: "ECG (Electrocardiogram)", done: steps.lab_status === "completed" } : null,
          normalizedReq.req_audiometry ? { label: "Audiometry", done: steps.lab_status === "completed" } : null,
          normalizedReq.req_blood_typing ? { label: "Blood typing", done: steps.lab_status === "completed" } : null,
          normalizedReq.req_pregnancy_test ? { label: "Pregnancy test", done: steps.lab_status === "completed" } : null,
          normalizedReq.req_salmonella ? { label: "Salmonella test", done: steps.lab_status === "completed" } : null,
          ...customLabActions,
        ].filter(Boolean)
      : [{ label: "Complete the Form Slip to see required lab exams", done: false }];

    const stepXrayStatus = String(steps.xray_status || "").toLowerCase();
    const recordXrayStatus = String(activeXray?.status || "").toLowerCase();
    const resolvedXrayStatus = ["completed", "released"].includes(recordXrayStatus)
      ? recordXrayStatus
      : stepXrayStatus;
    const xrayDone =
      ["completed", "released"].includes(resolvedXrayStatus) ||
      (activeXray?.updated_at && activeXray?.findings);
    const canEvaluateXray = paymentDone || xrayDone;

    const customXrayActions = (normalizedReq.xray_custom_items || []).map((item) => ({
      label: item.label,
      done: xrayDone,
    }));

    const requiresXray = normalizedReq.needs_xray;
    const formBlocksXray = !formReady && (requiresXray || !reqRow);
    const xrayActions = formBlocksXray
      ? [{ label: "Complete the Form Slip to see required X-ray exams", done: false }]
      : [
          normalizedReq.req_chest_xray
            ? { label: "Chest X-ray", done: xrayDone }
            : null,
          ...customXrayActions,
        ].filter(Boolean);

    const triageStatus = paymentDone
      ? steps.triage_status || (activeVitals ? "completed" : "pending")
      : "pending";

    const labStatus = !paymentDone
      ? "pending"
      : !formReady
      ? "pending"
      : normalizedReq.needs_lab
      ? steps.lab_status
      : "completed";

    const xrayStatus = !canEvaluateXray
      ? "pending"
      : formBlocksXray && !xrayDone
      ? "pending"
      : !requiresXray
      ? "completed"
      : xrayDone
      ? resolvedXrayStatus === "released"
        ? "released"
        : "completed"
      : steps.xray_status || "pending";

    return [
      {
        n: 1,
        title: "Registration & Check-in",
        status: steps.registration_status,
        subtitle: "Appointment confirmed and checked in to start the medical screening.",
      },
      {
        n: 2,
        title: "Payment",
        status: paymentStatus,
        subtitle: "Payment must be completed before proceeding to vital signs and tests.",
      },
      {
        n: 3,
        title: "Vital Signs Assessment",
        status: triageStatus,
        subtitle: paymentDone
          ? "Nurse records height, weight, blood pressure, heart rate, and temperature."
          : "Waiting for payment confirmation before proceeding.",
      },
      {
        n: 4,
        title: "Laboratory Tests",
        status: labStatus,
        subtitle: !paymentDone
          ? "Waiting for payment confirmation."
          : !formReady
          ? "Please complete the Form Slip first. Required lab exams will appear here after submission."
          : normalizedReq.needs_lab
          ? "Proceed with required lab examinations based on your Form Slip."
          : "Not required for this appointment.",
        actions: !paymentDone
          ? [{ label: "Waiting for payment confirmation", done: false }]
          : labActions,
      },
      {
        n: 5,
        title: "X-ray",
        status: xrayStatus,
        subtitle: !paymentDone
          ? "Waiting for payment confirmation."
          : !formReady
          ? "Please complete the Form Slip first. Required X-ray exams will appear here after submission."
          : normalizedReq.needs_xray
          ? "Proceed with required X-ray examination based on your Form Slip."
          : "Not required.",
        actions: !paymentDone
          ? [{ label: "Waiting for payment confirmation", done: false }]
          : xrayActions,
      },
      {
        n: 6,
        title: "Doctor Review",
        status: steps.doctor_status,
        subtitle: "Doctor reviews all results and provides approval/clearance.",
      },
      {
        n: 7,
        title: "Release Medical Report",
        status: steps.release_status,
        subtitle: "Final report becomes available for viewing and PDF download.",
      },
    ];
  }, [activeApprovedAppt, stepsRow, normalizedReq]);

  function pageTitle() {
    switch (page) {
      case "dashboard":
        return "Dashboard";
      case "appointments":
        return "Appointments";
      case "process":
        return "Medical Process";
      case "labs":
        return "Lab Tests";
      case "xray":
        return "X-ray Results";
      case "payments":
        return "Payments";
      case "records":
        return "Medical Records";
      case "settings":
        return "Settings";
      default:
        return "Patient";
    }
  }

  function pageSubtitle() {
    switch (page) {
      case "dashboard":
        return "Overview and notifications";
      case "appointments":
        return "Request and track appointments";
      case "process":
        return "Step-by-step examination workflow + Form Slip";
      case "labs":
        return "View your lab results history";
      case "xray":
        return "View your x-ray results history";
      case "payments":
        return "View payment status and OR details";
      case "records":
        return "Printable medical records summary";
      case "settings":
        return "Profile, account, and security";
      default:
        return "";
    }
  }

  const formMeta = useMemo(() => normalizeRequirements(reqRow), [reqRow]);
  const formSlipMeta = useMemo(() => normalizeRequirements(formSlipReqRow), [formSlipReqRow]);

  const formTimeSummary = useMemo(() => {
    if (formTimeAverage == null) return { label: "—" };
    return { label: `${formTimeAverage} mins` };
  }, [formTimeAverage]);

  const testsTimeSummary = useMemo(() => {
    const startMs = toMs(activeVitals?.recorded_at);
    const endMs = toMs(activeXray?.updated_at);
    if (!startMs) return { label: "—" };
    if (!endMs) return { label: "Pending" };
    if (endMs <= startMs) return { label: "—" };
    return { label: formatDuration(endMs - startMs) };
  }, [activeVitals, activeXray]);

  return (
    <div className="patient-dashboard-content">
      <header className="page-header no-print">
        <div className="page-header-main">
          <h1 className="page-title">{pageTitle()}</h1>
          {pageSubtitle() && <p className="page-subtitle">{pageSubtitle()}</p>}
        </div>
        <div className="page-actions">
          {page === "dashboard" && (
            <button className="btn btn-primary" type="button" onClick={() => navigate("/appointments")}>
              Book Appointment
            </button>
          )}
        </div>
      </header>

      {notifSupported && topbarActionsEl
        ? createPortal(
            <NotificationBell
              notifications={notifications}
              loading={loadingNotifs}
              onMarkAllRead={markAllAsRead}
              autoMarkReadOnOpen
            />,
            topbarActionsEl
          )
        : null}

      {msg && <p className="page-msg">{msg}</p>}

      {formSlipOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 820 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <h4 style={{ margin: 0 }}>Form Slip</h4>
              <button className="btn btn-secondary" onClick={() => setFormSlipOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <FormSlipCard
                appointment={{ appointment_type: type, preferred_date: preferredDate || "—" }}
                draft={computedDraft}
                setDraft={setFormDraft}
                saving={formSlipSaving}
                onSave={async () => {
                  setFormSlipSaving(true);
                  setFormSlipConfirmed(true);
                  setFormSlipSaving(false);
                  setFormSlipOpen(false);
                }}
                submitted={formSlipConfirmed}
              />
            </div>
          </div>
        </div>
      )}

      {bookingConfirmOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Booking Confirmed</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Your appointment is approved and scheduled. Please wait for the day of your check‑up.
                </div>
              </div>
              <button className="btn btn-secondary" onClick={() => setBookingConfirmOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.6 }}>
              <div>
                Type: <b>{bookingConfirmInfo?.appointment_type || "—"}</b>
              </div>
              <div>
                Scheduled:{" "}
                <b>{formatPreferred(bookingConfirmInfo?.scheduled_at || bookingConfirmInfo?.preferred_date)}</b>
              </div>
            </div>
          </div>
        </div>
      )}

        {/* DASHBOARD page: Health Progress (vitals) + Lab + Payment. No duplicate Latest Vitals. */}
        {page === "dashboard" && (
          <>
            <div className="summary-grid">
              <div className="summary-card">
                <div className="summary-icon">FT</div>
                <div>
                  <div className="summary-label">Form Time</div>
                  <div className="summary-value">{formTimeSummary.label}</div>
                  <div className={`summary-trend trend-${formTrend.direction}`}>
                    <span className="trend-arrow">{formTrend.direction === "up" ? "▲" : formTrend.direction === "down" ? "▼" : "—"}</span>
                    <span>{formTrend.label}</span>
                  </div>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-icon">MT</div>
                <div>
                  <div className="summary-label">Medical Tests Time</div>
                  <div className="summary-value">{testsTimeSummary.label}</div>
                  <div className={`summary-trend trend-${testsTrend.direction}`}>
                    <span className="trend-arrow">{testsTrend.direction === "up" ? "▲" : testsTrend.direction === "down" ? "▼" : "—"}</span>
                    <span>{testsTrend.label}</span>
                  </div>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-icon">AP</div>
                <div>
                  <div className="summary-label">Upcoming Appointments</div>
                  <div className="summary-value">{upcomingSummary.count || 0}</div>
                  <div className="summary-meta">
                    Next: {upcomingSummary.next ? formatPreferred(upcomingSummary.next.scheduled_at || upcomingSummary.next.preferred_date) : "—"}
                  </div>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-icon">LR</div>
                <div>
                  <div className="summary-label">Latest Report</div>
                  <div className="summary-value">{latestReportSummary.label}</div>
                  <div className="summary-meta">{latestReportSummary.meta}</div>
                </div>
              </div>
            </div>
            <div className="card analytics-card" style={{ marginTop: 16 }}>
              <div className="analytics-header">
                <div>
                  <div className="analytics-title">Overall Analytics</div>
                  <div className="section-subtitle">Based on your recorded form and test timelines.</div>
                </div>
                <div className="analytics-controls">
                  <select
                    className="analytics-filter"
                    value={analyticsMetric}
                    onChange={(e) => setAnalyticsMetric(e.target.value)}
                  >
                    <option value="form">Form Time</option>
                    <option value="tests">Medical Tests</option>
                    <option value="weight">Weight Trend</option>
                  </select>
                  <select
                    className="analytics-filter"
                    value={analyticsRange}
                    onChange={(e) => setAnalyticsRange(e.target.value)}
                  >
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                  </select>
                </div>
              </div>
              <div className="analytics-panel">
                <div className="analytics-panel-title">
                  <span>{activeMetric.label}</span>
                  <span className={`analytics-trend trend-${metricTrend.direction}`}>
                    {metricTrend.direction === "up" ? "▲" : metricTrend.direction === "down" ? "▼" : "—"} {metricTrend.label}
                  </span>
                </div>
                <LineChart data={activeMetric.series} color={activeMetric.color} />
              </div>
            </div>
            <HealthProgressDashboard vitals={vitals} />
            <div className="dashboard-lower-grid">
              <div className="card">
                <div className="section-header">
                  <div>
                    <h4 className="section-title">Lab Tests Summary</h4>
                    <p className="section-subtitle">Latest completed results</p>
                  </div>
                </div>
                {labSummaryItems.length ? (
                  <div className="summary-list">
                    {labSummaryItems.map((item) => (
                      <div key={item.label} className="summary-list-row">
                        <div>
                          <div className="summary-list-title">{item.label}</div>
                          <div className="summary-list-meta">{latestLab?.recorded_at ? new Date(latestLab.recorded_at).toLocaleDateString() : "—"}</div>
                        </div>
                        <span className="status-pill status-completed">Ready</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="clinic-empty">No lab results yet.</div>
                )}
              </div>

              <div className="card">
                <div className="section-header">
                  <div>
                    <h4 className="section-title">Payment Summary</h4>
                    <p className="section-subtitle">Latest payment status</p>
                  </div>
                </div>
                {paymentSummary.last ? (
                  <div className="payment-summary">
                    <div className="payment-summary-card">
                      <div className="payment-label">Latest Payment Status</div>
                      <div className="payment-value">{paymentSummary.last.payment_status || "—"}</div>
                      <div className="payment-meta">
                        {paymentSummary.last.recorded_at ? new Date(paymentSummary.last.recorded_at).toLocaleDateString() : "—"}
                      </div>
                    </div>
                    <div className="payment-row">
                      <span>Outstanding Balance</span>
                      <strong>{paymentSummary.outstanding.toFixed(2)}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="clinic-empty">No payment record yet.</div>
                )}
              </div>

              <div className="card">
                <div className="section-header">
                  <div>
                    <h4 className="section-title">History Activity</h4>
                    <p className="section-subtitle">Latest events</p>
                  </div>
                </div>
                <div className="activity-list">
                  {activityItems.length === 0 ? (
                    <div className="clinic-empty">No activity yet.</div>
                  ) : (
                    activityItems.map((a) => (
                      <div className="activity-item" key={a.id}>
                        <div className="activity-dot" />
                        <div className="activity-content">
                          <div className="activity-title">
                            {a.appointment_type || "Appointment"} • {a.status}
                          </div>
                          <div className="activity-subtitle">
                            Appointment date: {formatPreferred(a.preferred_date)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* APPOINTMENTS page */}
        {page === "appointments" && (
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            {!canBook && (
              <div className="card no-print" style={{ border: "1px solid rgba(234,179,8,0.25)" }}>
                <b style={{ display: "block", marginBottom: 6 }}>Booking Locked</b>
                <div style={{ opacity: 0.85, lineHeight: 1.5 }}>
                  {bookLockReason ||
                    "You can’t book a new appointment yet because your latest medical result is not released."}
                </div>
                {latestAppt && (
                  <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
                    Patient: <b>{patientName()}</b> • Latest appointment: <b>{latestAppt.appointment_type}</b> • Date:{" "}
                    <b>{formatPreferred(latestAppt.preferred_date)}</b> • Status: <b>{latestAppt.status}</b>
                    {latestSteps?.release_status ? (
                      <>
                        {" "}
                        • Release: <b>{latestSteps.release_status}</b>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            <div className="appointments-layout">
              <div className="card appointment-calendar-card">
                <div className="calendar-header">
                  <div>
                    <h4 style={{ margin: 0 }}>Appointment Calendar</h4>
                    <div className="calendar-subtitle">Yellow = fully booked day</div>
                  </div>
                  <div className="calendar-nav">
                    <button
                      className="calendar-nav-btn"
                      type="button"
                      onClick={() =>
                        setMonthCursor((d) => {
                          const next = new Date(d.getFullYear(), d.getMonth() - 1, 1);
                          return next < minDate ? minDate : next;
                        })
                      }
                      disabled={monthCursor.getFullYear() === MIN_YEAR && monthCursor.getMonth() === 0}
                    >
                      ‹
                    </button>
                    <div className="calendar-title">{monthLabel(monthCursor)}</div>
                    <button
                      className="calendar-nav-btn"
                      type="button"
                      onClick={() =>
                        setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                      }
                    >
                      ›
                    </button>
                  </div>
                </div>

                <div className="calendar-grid">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                    <div key={d} className="calendar-day-header">
                      {d}
                    </div>
                  ))}
                  {monthDays.map((d, idx) => {
                    if (!d) {
                      return <div key={`empty-${idx}`} className="calendar-day empty" />;
                    }
                    const key = dateKey(d);
                    const isPast = d < minDate;
                    const booked = bookedByDate.get(key) || 0;
                    const isFull = booked >= DAILY_CAPACITY;
                    const isToday = key === todayKey;
                    const isSunday = d.getDay() === 0;
                    const isSelected = preferredDate === key;
                    const cls = [
                      "calendar-day",
                      isToday ? "today" : "",
                      isSunday ? "sunday" : "",
                      isFull ? "full" : "",
                      booked > 0 && !isFull ? "busy" : "",
                      isSelected ? "selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <button
                        type="button"
                        key={key}
                        className={cls}
                        onClick={() => setPreferredDate(key)}
                        disabled={!canBook || isPast || isSunday}
                        title={
                          isPast
                            ? "Past date"
                            : isSunday
                            ? "Clinic is closed on Sundays"
                            : isFull
                            ? "Fully booked"
                            : booked > 0
                              ? "Limited slots"
                              : "Available"
                        }
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>

                <div className="calendar-legend">
                  <span className="legend-item available">Available</span>
                  <span className="legend-item busy">Limited</span>
                  <span className="legend-item full">Fully booked</span>
                </div>
              </div>
              <div className="card no-print appointment-request-card">
                <h4 style={{ marginTop: 0 }}>Request Appointment</h4>

                <div className="appointment-request-meta">
                  Booking as: <b>{patientName()}</b>
                </div>

                <div className="appointment-request-form">
                  <div className="field-group">
                    <label className="label">Appointment Type</label>
                    <select value={type} onChange={(e) => setType(e.target.value)} disabled={!canBook}>
                      <option value="pre-employment">Pre-employment</option>
                      <option value="ape">Annual Physical Exam (APE)</option>
                    </select>
                  </div>

                  <div className="field-row">
                    <div className="field-group">
                      <label className="label">Date</label>
                      <input
                        type="date"
                        value={preferredDate}
                        onChange={(e) => setPreferredDate(e.target.value)}
                        disabled={!canBook}
                        min={dateKey(minDate)}
                      />
                    </div>
                    <div className="field-group">
                      <label className="label">Time</label>
                      <input
                        type="time"
                        value={preferredTime}
                        onChange={(e) => setPreferredTime(e.target.value)}
                        disabled={!canBook}
                        min={CLINIC_OPEN}
                        max={CLINIC_CLOSE}
                        step="60"
                      />
                    </div>
                  </div>

                  <div className="appointment-request-tip">
                    Please fill up the form slip before submitting.
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => setFormSlipOpen(true)}
                      disabled={!canBook}
                    >
                      Fill Form Slip
                    </button>
                  </div>

                  <div className="appointment-request-hours">
                    Clinic Hours: Mon-Sat 7:00 AM - 3:00 PM
                  </div>

                  <button
                    className="btn btn-primary appointment-submit"
                    type="button"
                    onClick={requestAppointment}
                    disabled={!canBook || !preferredDate || !preferredTime || !formSlipConfirmed}
                  >
                    Submit Appointment Request
                  </button>
                </div>

                <div className="appointment-request-footer">
                  Form Slip: <b>{formSlipConfirmed ? "Completed" : "Required before booking"}</b>
                </div>

                {!canBook && (
                  <div className="appointment-request-lock">
                    You can book again once your latest medical result is <b>Released</b>.
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <h4 style={{ marginTop: 0 }}>Appointment History</h4>
              <div style={{ overflowX: "auto" }}>
                <table className="table appointment-history-table">
                  <thead>
                    <tr>
                      {/* ✅ ADD: Patient Name FIRST */}
                      <th>Patient Name</th>
                      <th>Type</th>
                      <th>Appointment Date</th>
                      <th>Status</th>
                      <th>Rejection Reason</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ opacity: 0.7 }}>
                          No appointments yet.
                        </td>
                      </tr>
                    ) : (
                      appointments.map((a) => {
                        const s = String(a.status || "").toLowerCase();
                        const canCancel = !["rejected", "cancelled", "canceled", "released"].includes(s);
                        const statusLabel =
                          s === "approved" ? "Approved" : s === "completed" ? "Completed" : s === "rejected" ? "Rejected" : s;
                        const statusTone =
                          s === "approved" || s === "completed"
                            ? "completed"
                            : s === "pending" || s === "in_progress"
                              ? "in_progress"
                              : "pending";
                        return (
                          <tr key={a.id}>
                          {/* ✅ Patient Name FIRST */}
                          <td data-label="Patient Name">
                            <b>{patientName()}</b>
                          </td>

                          <td data-label="Type">{a.appointment_type}</td>
                          <td data-label="Appointment Date">{formatPreferred(a.preferred_date)}</td>
                          <td data-label="Status">
                            <span className={`status-pill status-${statusTone}`}>{statusLabel}</span>
                          </td>
                          <td data-label="Rejection Reason">{a.status === "rejected" ? a.rejection_reason || "—" : "—"}</td>
                          <td data-label="Action" style={{ textAlign: "right" }}>
                            {canCancel ? (
                              <button className="btn btn-secondary" onClick={() => cancelAppointment(a)}>
                                Cancel
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* MEDICAL PROCESS page */}
        {page === "process" && (
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            {!formSlipAppointment ? (
              <div className="card">
                <p style={{ opacity: 0.8, margin: 0 }}>
                  Medical process will appear once your appointment is <b>confirmed by admin</b> on your booking date.
                </p>
              </div>
            ) : canDownloadReport(stepsRow) ? (
              <div className="card">
                <b>Medical Examination Process</b>
                <div style={{ marginTop: 8, opacity: 0.8, lineHeight: 1.6 }}>
                  Your medical examination is <b>completed</b> and the report is <b>released</b>.
                  <br />
                  You can now download it in <b>Medical Records</b> and book a new appointment.
                </div>
              </div>
            ) : (
              <>
                {!formSlipLocked ? (
                  <div className="card">
                    <p style={{ opacity: 0.8, margin: 0 }}>
                      You can update your form slip while your appointment schedule is pending.
                    </p>
                  </div>
                ) : null}

                {!formSlipLocked ? (
                  <FormSlipCard
                    appointment={formSlipAppointment}
                    draft={computedDraft}
                    setDraft={setFormDraft}
                    saving={savingForm}
                    onSave={saveFormSlip}
                    submitted={formSlipMeta.formSubmitted}
                  />
                ) : (
                  <div className="card">
                    <p style={{ opacity: 0.8, margin: 0 }}>
                      Form slip is locked because your appointment has been confirmed.
                    </p>
                  </div>
                )}

                {activeApprovedAppt ? (
                  stepsRow ? (
                    <>
                      <div className="card">
                        <b>Medical Examination Process</b>
                        <div style={{ opacity: 0.8, marginTop: 6 }}>
                          Patient: <b>{patientName()}</b> • Appointment: <b>{activeApprovedAppt.appointment_type}</b> • Date:{" "}
                          <b>{formatPreferred(activeApprovedAppt.preferred_date)}</b>
                        </div>
                        <div style={{ marginTop: 8, opacity: 0.8, fontSize: 13 }}>
                          Form Slip: <b>{formMeta.formSubmitted ? "Submitted" : "Not yet submitted"}</b>
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: 12 }}>
                        {processSteps.map((s) => (
                          <StepCard
                            key={s.n}
                            number={s.n}
                            title={s.title}
                            status={s.status}
                            subtitle={s.subtitle}
                            actions={s.actions || []}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="card">
                      <p style={{ opacity: 0.8, margin: 0 }}>
                        Your appointment is confirmed and the process is initializing.
                      </p>
                    </div>
                  )
                ) : null}
              </>
            )}
          </div>
        )}

        {/* LAB TESTS page */}
        {page === "labs" && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="section-header section-header-row">
              <div>
                <h3 className="section-title">Lab Tests History</h3>
                <p className="section-subtitle">Review previous lab results and remarks.</p>
              </div>
              <div className="table-actions">
                <div className="table-search">
                  <input className="input" placeholder="Search tests..." />
                </div>
                <button className="btn btn-secondary" type="button">Filters</button>
              </div>
            </div>
            <div className="lab-history-legend">
              <span>Date</span>
              <span>Appointment</span>
              <span>Tests Taken</span>
              <span>Results</span>
              <span>Remarks</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table lab-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Appointment</th>
                    <th>Tests Taken</th>
                    <th>Results</th>
                    <th>Remarks</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {labs.length === 0 ? (
                    <tr className="table-empty-row">
                      <td colSpan={6} style={{ opacity: 0.7 }}>
                        No lab results yet.
                      </td>
                    </tr>
                  ) : (
                    labs.map((lab) => {
                      const appt = appointmentById.get(lab.appointment_id);
                      const req = requirementsByAppt[lab.appointment_id];
                      const tests = [];
                      const results = [];
                      const addResult = (label, value) => {
                        if (!hasLabValue(value)) return;
                        tests.push(label);
                        results.push(`${label}: ${value}`);
                      };

                      const summary = summarizeLabForHistory(lab);
                      addResult("CBC", summary.cbc);
                      addResult("Urinalysis", summary.urinalysis);
                      addResult("Fecalysis", summary.fecalysis);
                      addResult("Blood Typing", lab.blood_typing);
                      addResult("RH", lab.rh_factor);
                      addResult("Pregnancy Test", lab.pregnancy_test);
                      addResult("HBsAg", lab.hbsag);
                      addResult("Drugtest", lab.drug_test);
                      addResult("Hepa A Test", lab.hepa_a_test);
                      addResult("FBS", lab.fbs);
                      addResult("RBS", lab.rbs);

                      if (tests.length === 0 && req) {
                        if (req.lab_cbc_platelet) tests.push("CBC");
                        if (req.lab_urinalysis) tests.push("Urinalysis");
                        if (req.lab_fecalysis) tests.push("Fecalysis");
                        if (req.lab_blood_typing) tests.push("Blood Typing");
                        if (req.lab_pregnancy_test) tests.push("Pregnancy Test");
                        if (req.lab_hepatitis_b) tests.push("HBsAg");
                        if (req.lab_hepatitis_a) tests.push("Hepa A Test");
                        if (req.lab_drug_test) tests.push("Drugtest");
                      }

                      if (Array.isArray(req?.lab_custom_items)) {
                        req.lab_custom_items.forEach((item) => {
                          if (item?.label) tests.push(item.label);
                        });
                      }

                      if (results.length === 0 && Array.isArray(req?.lab_custom_items)) {
                        req.lab_custom_items.forEach((item) => {
                          if (item?.label) results.push(`${item.label}: —`);
                        });
                      }

                      return (
                        <tr key={lab.id}>
                          <td data-label="Date">{lab.recorded_at ? new Date(lab.recorded_at).toLocaleDateString() : "—"}</td>
                          <td data-label="Appointment">{appt ? appt.appointment_type : lab.appointment_id ?? "—"}</td>
                          <td data-label="Tests Taken">
                            {tests.length ? (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {tests.map((t) => (
                                  <span
                                    key={t}
                                    style={{
                                      padding: "4px 8px",
                                      borderRadius: 999,
                                      fontSize: 12,
                                      background: "rgba(15,23,42,0.06)",
                                      border: "1px solid rgba(15,23,42,0.12)",
                                    }}
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td data-label="Results">
                            {results.length ? (
                              <div style={{ display: "grid", gap: 4 }}>
                                {results.map((r) => (
                                  <div key={r} style={{ fontSize: 12 }}>
                                    {r}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td data-label="Remarks">{lab.remarks ?? "—"}</td>
                          <td data-label="Action" style={{ textAlign: "right" }}>
                            <button className="btn btn-secondary" onClick={() => downloadLabSummary(lab)}>
                              PDF
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* XRAY RESULTS page */}
        {page === "xray" && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="section-header section-header-row">
              <div>
                <h3 className="section-title">X-ray Results History</h3>
                <p className="section-subtitle">View radiology findings and download reports.</p>
              </div>
              <div className="table-actions">
                <div className="table-search">
                  <input className="input" placeholder="Search records..." />
                </div>
                <button className="btn btn-secondary" type="button">Filters</button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table lab-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Examination</th>
                    <th>Radiology Findings</th>
                    <th>Impression</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {xrayResults.length === 0 ? (
                    <tr className="table-empty-row">
                      <td colSpan={6} style={{ opacity: 0.7 }}>
                        No x-ray results yet.
                      </td>
                    </tr>
                  ) : (
                    xrayResults.map((x) => {
                      return (
                        <tr key={x.id}>
                          <td data-label="Date">
                            {x.recorded_at ? new Date(x.recorded_at).toLocaleDateString() : "—"}
                          </td>
                          <td data-label="Examination">{x.exam_type || "Chest PA"}</td>
                          <td data-label="Radiology Findings">{x.findings || "—"}</td>
                          <td data-label="Impression">{x.impression || x.remarks || "—"}</td>
                          <td data-label="Download" style={{ textAlign: "right" }}>
                            <button className="btn btn-secondary" onClick={() => downloadXraySummary(x)}>
                              PDF
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SETTINGS page */}
        {page === "settings" && (
          <div className="settings-shell">
            <div className="card no-print settings-tabs">
              <div className="settings-tab-list">
                {["profile", "account", "security"].map((k) => (
                  <button
                    key={k}
                    onClick={() => setSettingsTab(k)}
                    className={`settings-tab ${settingsTab === k ? "active" : ""}`}
                  >
                    {k === "profile" ? "Profile" : k === "account" ? "Account" : "Security"}
                  </button>
                ))}
              </div>

              {settingsMsg && <div className="settings-msg">{settingsMsg}</div>}
            </div>

            {settingsTab === "profile" && (
              <PatientProfile
                session={session}
                onProfileUpdated={(p) => {
                  setProfile((prev) => ({ ...(prev || {}), ...(p || {}) }));
                  setSettingsMsg("Profile updated!");
                }}
              />
            )}

            {settingsTab === "account" && (
              <div className="card settings-panel">
                <h4 style={{ marginTop: 0 }}>Account</h4>
                <div className="settings-label">Email</div>
                <input className="input" readOnly value={session?.user?.email || ""} />

                <div className="settings-label" style={{ marginTop: 14 }}>
                  Change Password
                </div>
                <input
                  className="input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min 8 chars)"
                  minLength={8}
                />
                <button className="btn btn-primary" onClick={changePassword} disabled={savingSettings} style={{ marginTop: 10 }}>
                  {savingSettings ? "Updating..." : "Update Password"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={requestPatientPasswordReset}
                  disabled={savingSettings}
                  style={{ marginTop: 10, marginLeft: 8 }}
                >
                  Send reset email
                </button>
              </div>
            )}

            {settingsTab === "security" && (
              <div className="card settings-panel">
                <h4 style={{ marginTop: 0 }}>Security</h4>
                <div className="settings-label" style={{ marginBottom: 10 }}>
                  Sign out of your account.
                </div>
                <button className="btn" onClick={logoutNow} disabled={savingSettings}>
                  {savingSettings ? "Signing out..." : "Logout"}
                </button>
              </div>
            )}
          </div>
        )}


        {/* PAYMENTS page */}
        {page === "payments" && (
          <>
            <div className="summary-grid summary-grid-3">
              <div className="summary-card">
                <div className="summary-icon">OB</div>
                <div>
                  <div className="summary-label">Outstanding Balance</div>
                  <div className="summary-value">{paymentSummary.outstanding.toFixed(2)}</div>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-icon">LP</div>
                <div>
                  <div className="summary-label">Last Payment</div>
                  <div className="summary-value">
                    {paymentSummary.last?.amount != null ? paymentSummary.last.amount : "—"}
                  </div>
                  <div className="summary-meta">
                    {paymentSummary.last?.recorded_at ? new Date(paymentSummary.last.recorded_at).toLocaleDateString() : "—"}
                  </div>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-icon">TP</div>
                <div>
                  <div className="summary-label">Total Paid (YTD)</div>
                  <div className="summary-value">{paymentSummary.totalPaid.toFixed(2)}</div>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <div className="section-header section-header-row">
                <div>
                  <h3 className="section-title">Payments History</h3>
                  <p className="section-subtitle">Track your payment status and receipts.</p>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="table payments-history-table">
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>Date</th>
                      <th>Appointment</th>
                      <th>Status</th>
                      <th>OR #</th>
                      <th>Amount</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ opacity: 0.7 }}>
                          No payment records yet.
                        </td>
                      </tr>
                    ) : (
                      payments.map((p) => {
                        const appt = appointmentById.get(p.appointment_id);
                        const paymentStatus = String(p.payment_status || "").toLowerCase();
                        const paymentTone = paymentStatus === "paid" ? "completed" : "pending";
                        return (
                          <tr key={p.id}>
                            <td data-label="Patient Name">
                              <b>{patientName()}</b>
                            </td>
                            <td data-label="Date">{new Date(p.recorded_at).toLocaleString()}</td>
                            <td data-label="Appointment">{appt ? appt.appointment_type : p.appointment_id}</td>
                            <td data-label="Status">
                              <span className={`status-pill status-${paymentTone}`}>{p.payment_status}</span>
                            </td>
                            <td data-label="OR #">{p.or_number ?? "—"}</td>
                            <td data-label="Amount">{p.amount ?? "—"}</td>
                            <td data-label="Notes">{p.notes ?? "—"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* MEDICAL RECORDS page */}
        {page === "records" && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="section-header">
              <div>
                <h3 className="section-title">Medical Records</h3>
                <p className="section-subtitle">Download your released reports and summaries.</p>
              </div>
            </div>

            {!stepsRow ? (
              <p style={{ opacity: 0.7 }}>No confirmed appointment yet.</p>
            ) : (
              <>
                <div className="records-summary">
                  <div>
                    <div className="records-label">Patient</div>
                    <div className="records-value">{patientName()}</div>
                  </div>
                  <div>
                    <div className="records-label">Appointment</div>
                    <div className="records-value">{activeApprovedAppt?.appointment_type ?? "—"}</div>
                  </div>
                  <div>
                    <div className="records-label">Date</div>
                    <div className="records-value">{formatPreferred(activeApprovedAppt?.preferred_date ?? "—")}</div>
                  </div>
                  <div>
                    <div className="records-label">Release Status</div>
                    <div className="records-value">
                      {(() => {
                        const releaseRaw = String(stepsRow?.release_status || "").toLowerCase();
                        const releaseTone =
                          releaseRaw === "completed"
                            ? "completed"
                            : releaseRaw === "in_progress"
                              ? "in_progress"
                              : "pending";
                        return (
                          <span className={`status-pill status-${releaseTone}`}>
                            {stepsRow?.release_status ?? "—"}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div>
                    <div className="records-label">Release Date</div>
                    <div className="records-value">
                      {stepsRow?.release_status === "completed" ? formatPreferred(stepsRow?.updated_at) : "—"}
                    </div>
                  </div>
                </div>

                <div className="records-downloads">
                  <button
                    className="records-download-card"
                    onClick={downloadReport}
                    disabled={!canDownloadReport(stepsRow)}
                  >
                    <div className="records-download-title">Medical Exam Report</div>
                    <div className="records-download-meta">Download PDF</div>
                  </button>
                  <button
                    className="records-download-card"
                    onClick={() => latestLab && downloadLabSummary(latestLab)}
                    disabled={!latestLab}
                  >
                    <div className="records-download-title">Lab Tests Summary</div>
                    <div className="records-download-meta">Download PDF</div>
                  </button>
                  <button
                    className="records-download-card"
                    onClick={() => xrayResults[0] && downloadXraySummary(xrayResults[0])}
                    disabled={!xrayResults[0]}
                  >
                    <div className="records-download-title">X-ray Summary</div>
                    <div className="records-download-meta">Download PDF</div>
                  </button>
                </div>

                {!canDownloadReport(stepsRow) && (
                  <div className="records-note">
                    The medical report will be available once the doctor has reviewed and released it.
                  </div>
                )}

                <div className="records-tables">
                  <div className="card">
                    <div className="section-header">
                      <div>
                        <h4 className="section-title">Lab Tests Summary History</h4>
                      </div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="table lab-history-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Appointment</th>
                            <th>Results</th>
                            <th>Remarks</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {labs.length === 0 ? (
                            <tr className="table-empty-row">
                              <td colSpan={5} style={{ opacity: 0.7 }}>
                                No lab results yet.
                              </td>
                            </tr>
                          ) : (
                            labs.map((l) => {
                              const appt = appointmentById.get(l.appointment_id);
                              const summary = summarizeLabForHistory(l);
                              return (
                                <tr key={l.id}>
                                  <td data-label="Date">{new Date(l.recorded_at).toLocaleString()}</td>
                                  <td data-label="Appointment">{appt ? appt.appointment_type : l.appointment_id}</td>
                                  <td data-label="Results">
                                    {summary.cbc || summary.urinalysis || summary.fecalysis || "—"}
                                  </td>
                                  <td data-label="Remarks">{l.remarks || "—"}</td>
                                  <td data-label="Download" style={{ textAlign: "right" }}>
                                    <button className="btn btn-secondary" onClick={() => downloadLabSummary(l)}>
                                      Download PDF
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="card">
                    <div className="section-header">
                      <div>
                        <h4 className="section-title">X-ray Summary History</h4>
                      </div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="table lab-history-table">
                        <thead>
                          <tr>
                            <th>Examination</th>
                            <th>Findings</th>
                            <th>Impression</th>
                            <th>Remarks</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {xrayResults.length === 0 ? (
                            <tr className="table-empty-row">
                              <td colSpan={5} style={{ opacity: 0.7 }}>
                                No x-ray results yet.
                              </td>
                            </tr>
                          ) : (
                            xrayResults.map((x) => (
                              <tr key={x.id}>
                                <td data-label="Examination">—</td>
                                <td data-label="Findings">{x.findings || "—"}</td>
                                <td data-label="Impression">{x.impression || x.remarks || "—"}</td>
                                <td data-label="Remarks">{x.remarks || "—"}</td>
                                <td data-label="Download" style={{ textAlign: "right" }}>
                                  <button className="btn btn-secondary" onClick={() => downloadXraySummary(x)}>
                                    Download PDF
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
    </div>
  );
}
