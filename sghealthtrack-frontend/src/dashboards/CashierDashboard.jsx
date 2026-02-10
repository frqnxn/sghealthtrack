import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "../components/ToastCenter";
import { supabase } from "../lib/supabase";
import NotificationBell from "../components/NotificationBell";
import useSuccessToast from "../utils/useSuccessToast";
import { DonutChart } from "../components/DonutChart";

/* ---------------- HELPERS ---------------- */
function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function toMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function toNumOrNull(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function sanitizeAmountInput(value) {
  const cleaned = String(value || "").replace(/[^\d.]/g, "");
  return cleaned.replace(/(\..*)\./g, "$1");
}
function sanitizeRefInput(value) {
  return String(value || "").replace(/[^a-zA-Z0-9-]/g, "").trim();
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
/* ---------------- CSV ---------------- */
function downloadCSV(filename, rows) {
  const list = rows || [];
  if (!list.length) return;

  const escape = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const keys = Object.keys(list[0] || {});
  const csv = [
    keys.map(escape).join(","),
    ...list.map((r) => keys.map((k) => escape(r[k])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------------- TESTS ---------------- */
function getSelectedTests(req) {
  if (!req) return [];
  const tests = [];
  const pkg = getPackageInfo(req);
  if (pkg.label) tests.push(pkg.label);
  const withPrice = (label, key) => {
    const price = STANDARD_TEST_PRICES[key];
    const suffix = Number.isFinite(price) ? ` (PHP ${price})` : "";
    tests.push(`${label}${suffix}`);
  };
  if (req.exam_physical) withPrice("Physical Examination", "exam_physical");
  if (req.exam_visual_acuity) withPrice("Visual acuity", "exam_visual_acuity");
  if (req.exam_height_weight) withPrice("Height & weight", "exam_height_weight");
  if (req.lab_cbc_platelet) withPrice("CBC & Platelet", "lab_cbc_platelet");
  if (req.lab_blood_typing) withPrice("Blood Typing", "lab_blood_typing");
  if (req.lab_urinalysis) withPrice("Urinalysis", "lab_urinalysis");
  if (req.lab_fecalysis) withPrice("Fecalysis", "lab_fecalysis");
  if (req.lab_pregnancy_test) withPrice("Pregnancy Test", "lab_pregnancy_test");
  if (req.lab_drug_test) withPrice("Drugtest screening", "lab_drug_test");
  if (req.lab_hepatitis_b) withPrice("Hepatitis B Screening", "lab_hepatitis_b");
  if (req.lab_hepatitis_a) withPrice("Hepatitis A", "lab_hepatitis_a");
  if (req.lab_ecg) withPrice("ECG (Electrocardiogram)", "lab_ecg");
  if (req.lab_audiometry) withPrice("Audiometry", "lab_audiometry");
  if (req.lab_salmonella) withPrice("Salmonella test", "lab_salmonella");
  if (req.xray_chest) withPrice("Chest X-ray", "xray_chest");
  if (Array.isArray(req.lab_custom_items) && req.lab_custom_items.length > 0) {
    req.lab_custom_items.forEach((item) => {
      if (!item?.label) return;
      const price = typeof item.price === "number" ? ` (PHP ${item.price})` : "";
      tests.push(`${item.label}${price}`);
    });
  }
  const others = String(req.lab_others_text || "").trim();
  if (others) tests.push(`Others: ${others}`);
  return tests;
}

function getPackageInfo(req) {
  const code = String(req?.package_code || "").toUpperCase();
  const price =
    typeof req?.package_price === "number"
      ? req.package_price
      : PACKAGE_PRICES[code] || 0;
  if (!code || code === "CUSTOM" || price <= 0) {
    return { code: "", label: "", price: 0 };
  }
  return { code, label: `Package ${code}`, price };
}

function computeAmountFromReq(req) {
  if (!req) return null;
  const pkg = getPackageInfo(req);
  const labTotal = Number(req.lab_custom_total || 0);
  const xrayTotal = Number(req.xray_custom_total || 0);
  const selectedStandard = Object.keys(STANDARD_TEST_PRICES).filter((k) => !!req[k]);
  const standardTotal = selectedStandard.reduce((sum, k) => sum + (STANDARD_TEST_PRICES[k] || 0), 0);
  const included = pkg.code && PACKAGE_MAP[pkg.code] ? Object.keys(PACKAGE_MAP[pkg.code]) : [];
  const extraStandardTotal = pkg.code
    ? selectedStandard.reduce((sum, k) => sum + (included.includes(k) ? 0 : STANDARD_TEST_PRICES[k] || 0), 0)
    : standardTotal;
  const addOns =
    (Number.isFinite(labTotal) ? labTotal : 0) +
    (Number.isFinite(xrayTotal) ? xrayTotal : 0) +
    extraStandardTotal;
  const total = (pkg.price || 0) + addOns;
  return total > 0 ? total : null;
}

function TestBadges({ req }) {
  const tests = getSelectedTests(req);
  if (!tests.length) return <span style={{ opacity: 0.7 }}>None selected</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {tests.map((t) => (
        <span
          key={t}
          style={{
            padding: "4px 8px",
            borderRadius: 999,
            fontSize: 12,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            opacity: 0.95,
            whiteSpace: "nowrap",
          }}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function extractGcashRef(notes) {
  const text = String(notes || "");
  const match = text.match(/GCash Ref:\s*([^\|]+)/i);
  return match ? match[1].trim() : "";
}

export default function CashierDashboard({ session, page = "payments" }) {
  const cashierId = session?.user?.id;

  const tab = page || "payments";
  const [topbarActionsEl, setTopbarActionsEl] = useState(null);
  const [cashierNotifs] = useState([]);

  /* list rows (form slips) */
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const { showToast } = useToast();
  useSuccessToast(msg, showToast);

  const [selected, setSelected] = useState(null);

  /* latest payment for selected appointment */
  const [latest, setLatest] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);

  /* record payment form */
  const [status, setStatus] = useState("completed"); // completed | unpaid
  const [orNumber, setOrNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [gcashReference, setGcashReference] = useState("");

  /* patient names */
  const [patientNameMap, setPatientNameMap] = useState({});
  const [patientCompanyMap, setPatientCompanyMap] = useState({});
  const [latestByApptId, setLatestByApptId] = useState({});

  /* report */
  const [reportLoading, setReportLoading] = useState(false);
  const [reportRows, setReportRows] = useState([]);
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");

  /* shift feature removed — report focuses on all transactions */

  async function loadPatientNames(patientIds = []) {
    const ids = Array.from(new Set((patientIds || []).filter(Boolean)));
    if (!ids.length) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    if (error) return;
    setPatientNameMap((prev) => {
      const next = { ...prev };
      (data || []).forEach((p) => (next[p.id] = p.full_name || ""));
      return next;
    });
  }

  async function loadPatientProfiles(patientIds = []) {
    const ids = Array.from(new Set((patientIds || []).filter(Boolean)));
    if (!ids.length) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, company")
      .in("id", ids);
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

  function patientNameFromId(patientId) {
    const name = patientNameMap?.[patientId];
    return name && String(name).trim() ? String(name).trim() : "(No name)";
  }

  const isLockedCompleted = useMemo(() => {
    return String(latest?.payment_status || "").toLowerCase() === "completed";
  }, [latest]);

  /* ---------------- UI FILTER: hide completed from list ---------------- */
  const visibleRows = useMemo(() => {
    return (rows || []).filter((r) => {
      const pay = latestByApptId[r.appointment_id];
      return String(pay?.payment_status || "").toLowerCase() !== "completed";
    });
  }, [rows, latestByApptId]);

  /* ---------------- FORM SLIPS + PAYMENTS ---------------- */
  async function loadSubmittedFormSlips() {
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("appointment_requirements")
      .select(
        `
        *,
        appointments!inner(
          id,
          patient_id,
          appointment_type,
          preferred_date,
          status,
          created_at
        )
      `
      )
      // ✅ Cashier should only see appointments waiting for payment
      .eq("appointments.status", "approved")
      .order("updated_at", { ascending: false });

    if (error) {
      setRows([]);
      setLoading(false);
      return setMsg(`Cannot load submitted Form Slips: ${error.message}`);
    }

    const list = (data || []).map((r) => ({
      ...r,
      appointment: r.appointments,
      appointment_id: r.appointments?.id || r.appointment_id,
      patient_id: r.appointments?.patient_id || r.patient_id,
    }));

    setRows(list);
    setLoading(false);

    await loadPatientNames(list.map((x) => x.patient_id));
    await loadLatestPaymentsForAppointments(list.map((x) => x.appointment_id));
  }

  async function loadLatestPaymentsForAppointments(appointmentIds = []) {
    const ids = Array.from(new Set((appointmentIds || []).filter(Boolean)));
    if (!ids.length) {
      setLatestByApptId({});
      return;
    }

    const { data, error } = await supabase
      .from("payments")
      .select(
        "appointment_id, recorded_at, payment_status, or_number, amount, notes, patient_id, payment_method, package_availed, package_name"
      )
      .in("appointment_id", ids)
      .order("recorded_at", { ascending: false });

    if (error) return;

    const map = {};
    for (const row of data || []) {
      if (!map[row.appointment_id]) map[row.appointment_id] = row;
    }
    setLatestByApptId(map);

    await loadPatientNames((data || []).map((p) => p.patient_id));
  }

  async function loadLatestPayment(appointmentId, fallback = null) {
    setLatest(null);
    if (!appointmentId) return;

    const { data, error } = await supabase
      .from("payments")
      .select(
        "id, recorded_at, payment_status, or_number, amount, notes, recorded_by, package_availed, package_name, payment_method"
      )
      .eq("appointment_id", appointmentId)
      .order("recorded_at", { ascending: false })
      .limit(1);

    if (error) return setMsg(`Failed to load latest payment: ${error.message}`);

    const row = data?.[0] || null;
    setLatest(row);

    if (row) {
      setPaymentMethod(row?.payment_method || "cash");
      return;
    }

    if (fallback) {
      if (fallback.amount != null) setAmount(String(fallback.amount));
    }
  }

  async function loadPaymentHistory(patientId) {
    setPaymentHistory([]);
    if (!patientId) return;
    const { data, error } = await supabase
      .from("payments")
      .select("id, recorded_at, payment_status, or_number, amount, notes, payment_method")
      .eq("patient_id", patientId)
      .order("recorded_at", { ascending: false })
      .limit(10);
    if (error) {
      setMsg(`Failed to load transaction history: ${error.message}`);
      return;
    }
    setPaymentHistory(data || []);
  }

  function clearPaymentForm() {
    setStatus("completed");
    setOrNumber("");
    setAmount("");
    setNotes("");
    setPaymentMethod("cash");
    setGcashReference("");
  }

  async function onSelect(r) {
    setSelected(r);
    setMsg("");
    clearPaymentForm();
    const computedAmount = computeAmountFromReq(r);
    await loadLatestPayment(r.appointment_id, {
      amount: computedAmount,
    });
    await loadPaymentHistory(r.patient_id);
  }

  // ✅ CRITICAL: ensure appointment_steps exists + updates payment_status correctly
  async function upsertAppointmentStepsForPaid({ appointmentId, patientId }) {
    // NOTE: onConflict requires unique constraint on appointment_steps.appointment_id
    const { error } = await supabase
      .from("appointment_steps")
      .upsert(
        {
          appointment_id: appointmentId,
          patient_id: patientId,

          // core workflow
          registration_status: "completed", // safe default after admin approved/check-in
          payment_status: "completed",
          triage_status: "pending",
          lab_status: "pending",
          xray_status: "pending",
          doctor_status: "pending",
          release_status: "pending",

          updated_at: new Date().toISOString(),
        },
        { onConflict: "appointment_id" }
      );

    return error;
  }

  async function savePayment() {
    setMsg("");

    if (!selected) return setMsg("Please select a patient first.");
    if (isLockedCompleted) return setMsg("This appointment is already COMPLETED and is locked.");

    if (String(paymentMethod).toLowerCase() === "gcash" && !gcashReference.trim()) {
      return setMsg("Reference No. is required for Gcash payments.");
    }

    const amt = toNumOrNull(amount);

    if (status === "completed") {
      if (!orNumber.trim()) return setMsg("OR Number is required when marking COMPLETED.");
      if (orNumber.trim().length < 3) return setMsg("OR Number must be at least 3 characters.");
      if (amt === null || amt <= 0) return setMsg("Amount must be a positive number.");
      if (amt > 1000000) return setMsg("Amount is too large. Please verify.");
    }

    const baseNotes = notes.trim();
    const gcashNote =
      String(paymentMethod).toLowerCase() === "gcash" && gcashReference.trim()
        ? `GCash Ref: ${gcashReference.trim()}`
        : "";
    const combinedNotes = [baseNotes, gcashNote].filter(Boolean).join(" | ");

    const pkg = getPackageInfo(selected);
    const payload = {
      appointment_id: selected.appointment_id,
      patient_id: selected.patient_id,
      recorded_by: cashierId,

      payment_status: status,
      or_number: status === "completed" ? orNumber.trim() : null,
      amount: status === "completed" ? amt : null,
      notes: combinedNotes || null,
      recorded_at: new Date().toISOString(),

      package_availed: !!pkg.label,
      package_name: pkg.label || null,
      payment_method: paymentMethod || "cash",
    };

  // 1) insert payment
  const { data: inserted, error: insErr } = await supabase
    .from("payments")
    .insert([payload])
    .select("*")
    .maybeSingle();

  if (insErr) return setMsg(`Failed to save payment: ${insErr.message}`);

  // 2) if completed => UPSERT appointment_steps (this is what nurse/lab/xray will follow)
  if (status === "completed") {
    const stepsUpsert = {
      appointment_id: selected.appointment_id,
      patient_id: selected.patient_id,

      // statuses
      registration_status: "completed", // keep if your flow expects this already done
      payment_status: "completed",
      triage_status: "pending",
      lab_status: "pending",
      xray_status: "pending",
      doctor_status: "pending",
      release_status: "pending",

      updated_at: new Date().toISOString(),
    };

    // ✅ UPSERT ensures row exists and updates even if missing
    const { error: stepErr } = await supabase
      .from("appointment_steps")
      .upsert([stepsUpsert], { onConflict: "appointment_id" });

    // optional: move appointment into clinic processing, but DO NOT mark overall completed
    const { error: apptErr } = await supabase
      .from("appointments")
      .update({ status: "in_progress" }) // ✅ important: don't use "completed" here
      .eq("id", selected.appointment_id);

    if (stepErr || apptErr) {
      setMsg(
        `Payment saved ✅ but failed to update flow: ${stepErr?.message || apptErr?.message}`
      );
    } else {
      setMsg("Payment saved ✅ Payment step marked COMPLETED ✅");
    }
  } else {
    setMsg("Payment saved ✅");
  }

  // 3) update UI instantly
  setLatest(inserted || null);
  setLatestByApptId((prev) => ({
    ...prev,
    [selected.appointment_id]: inserted || payload,
  }));

  clearPaymentForm();

  // 4) refresh
  await Promise.all([loadReport(), loadSubmittedFormSlips()]);

  // 5) done
  if (status === "completed") {
    setSelected(null);
    setLatest(null);
  }
}


  /* ---------------- REPORT ---------------- */
  async function loadReport() {
    setReportLoading(true);

    const { data, error } = await supabase
      .from("payments")
      .select(
        "id, recorded_at, payment_status, or_number, amount, notes, patient_id, appointment_id, payment_method, package_availed, package_name, appointments(appointment_type)"
      )
      .eq("payment_status", "completed")
      .order("recorded_at", { ascending: false })
      .limit(500);

    if (error) {
      setReportRows([]);
      setReportLoading(false);
      setMsg(`Failed to load report: ${error.message}`);
      return;
    }

    setReportRows(data || []);
    await loadPatientProfiles((data || []).map((r) => r.patient_id));
    setReportLoading(false);
  }

  const filteredReportRows = useMemo(() => {
    if (!reportDateFrom && !reportDateTo) return reportRows;

    const from = reportDateFrom ? new Date(`${reportDateFrom}T00:00:00`) : null;
    const to = reportDateTo ? new Date(`${reportDateTo}T23:59:59.999`) : null;

    return reportRows.filter((r) => {
      const dt = r.recorded_at ? new Date(r.recorded_at) : null;
      if (!dt) return false;
      if (from && dt < from) return false;
      if (to && dt > to) return false;
      return true;
    });
  }, [reportRows, reportDateFrom, reportDateTo]);

  const paymentStats = useMemo(() => {
    const computeStats = (days) => {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - (days - 1));
      start.setHours(0, 0, 0, 0);
      const map = new Map();
      let total = 0;

      for (const row of reportRows || []) {
        const key = dayKey(row.recorded_at);
        if (!key) continue;
        const d = new Date(key + "T00:00:00");
        if (d < start) continue;
        map.set(key, (map.get(key) || 0) + 1);
        total += 1;
      }

      const values = Array.from(map.values());
      const max = values.length ? Math.max(...values) : null;
      const avg = total ? Math.round(total / days) : null;
      return { avg, max };
    };

    return {
      last7: computeStats(7),
      last30: computeStats(30),
    };
  }, [reportRows]);

  const reportSummary = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalToday = 0,
      total7d = 0,
      totalMonth = 0,
      totalAll = 0;
    let countToday = 0,
      count7d = 0,
      countMonth = 0,
      countAll = 0;

    for (const r of filteredReportRows) {
      const dt = r.recorded_at ? new Date(r.recorded_at) : null;
      if (!dt || r.amount == null) continue;
      const amt = Number(r.amount);
      if (!Number.isFinite(amt)) continue;

      totalAll += amt;
      countAll += 1;

      if (isSameDay(dt, now)) {
        totalToday += amt;
        countToday += 1;
      }
      if (dt >= weekStart) {
        total7d += amt;
        count7d += 1;
      }
      if (dt >= monthStart) {
        totalMonth += amt;
        countMonth += 1;
      }
    }

    return {
      totalToday,
      total7d,
      totalMonth,
      totalAll,
      countToday,
      count7d,
      countMonth,
      countAll,
    };
  }, [filteredReportRows]);

  useEffect(() => {
    loadSubmittedFormSlips();
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTopbarActionsEl(document.getElementById("dashboard-utility-actions"));
  }, []);

  /* Paid/Unpaid label */
  function paymentLabelFor(pay) {
    const s = String(pay?.payment_status || "").toLowerCase();
    if (!s) return "UNPAID";
    if (s === "completed") return "PAID";
    if (s === "unpaid") return "UNPAID";
    return s.toUpperCase();
  }

  return (
    <div className="patient-dashboard-content">
      <header className="page-header no-print">
        <div className="page-header-main">
          <h1 className="page-title">Cashier</h1>
          <p className="page-subtitle">Payments and transaction reports.</p>
        </div>
        <div className="page-actions" />
      </header>

      {topbarActionsEl
        ? createPortal(
            <NotificationBell notifications={cashierNotifs} loading={false} onMarkAllRead={() => {}} />,
            topbarActionsEl
          )
        : null}

      {msg && <div style={{ marginTop: 0 }}>{msg}</div>}

      {/* ================= TAB: PAYMENTS ================= */}
      {tab === "payments" && (
        <>
          <div className="card analytics-card" style={{ marginTop: 12 }}>
            <div className="analytics-header">
              <div>
                <div className="analytics-title">Payments Volume</div>
                <div className="section-subtitle">Completed transactions per day.</div>
              </div>
            </div>
            <div className="analytics-panel" style={{ marginTop: 12 }}>
              <div className="analytics-panel-title">Avg payments per day</div>
              <div className="analytics-donuts">
                <div className="analytics-donut">
                  <DonutChart
                    value={paymentStats.last7.avg}
                    max={paymentStats.last7.max || paymentStats.last7.avg || 1}
                    label="7d avg"
                    unit=""
                    color="#4338ca"
                    size={120}
                  />
                </div>
                <div className="analytics-donut">
                  <DonutChart
                    value={paymentStats.last30.avg}
                    max={paymentStats.last30.max || paymentStats.last30.avg || 1}
                    label="30d avg"
                    unit=""
                    color="#4338ca"
                    size={120}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* LIST */}
          <div className="card" style={{ marginTop: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ opacity: 0.75, fontSize: 13 }}>
                Tip: Select patient → encode payment below.
              </div>
            </div>

            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table className="table cashier-queue-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Patient</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Needed Tests</th>
                    <th>Status</th>
                    <th>Pick</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ opacity: 0.7 }}>
                        No pending (unpaid) patients right now.
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((r, idx) => {
                      const appt = r.appointment || {};
                      const pay = latestByApptId[r.appointment_id];

                      return (
                        <tr
                          key={r.appointment_id}
                          onClick={() => onSelect(r)}
                          style={{ cursor: "pointer" }}
                        >
                          <td data-label="#">
                            <b>{idx + 1}</b>
                          </td>
                          <td data-label="Patient">
                            <b>{patientNameFromId(r.patient_id)}</b>
                          </td>
                          <td data-label="Type">{appt.appointment_type}</td>
                          <td data-label="Date">{appt.preferred_date}</td>
                          <td data-label="Needed Tests" style={{ minWidth: 320 }}>
                            <TestBadges req={r} />
                          </td>
                          <td data-label="Status">
                            <b>{paymentLabelFor(pay)}</b>
                          </td>
                          <td data-label="Pick">
                            <button
                              className="btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelect(r);
                              }}
                            >
                              Select
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

          {/* RECORD PAYMENT */}
          <div className="card" style={{ marginTop: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <h4 style={{ marginTop: 0 }}>Record Payment</h4>
              <div style={{ opacity: 0.75, fontSize: 13 }}>Encode payment once the patient is selected.</div>
            </div>

            {!selected ? (
              <div style={{ opacity: 0.8 }}>Select a patient above.</div>
            ) : (
              <>
                <div style={{ opacity: 0.9 }}>
                  <div>
                    Patient: <b>{patientNameFromId(selected.patient_id)}</b>
                  </div>
                  <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13 }}>
                    Needed Tests
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <TestBadges req={selected} />
                  </div>
                </div>

                {latest ? (
                  <div style={{ opacity: 0.85, marginTop: 12 }}>
                    <b>Latest payment</b> (saved: {new Date(latest.recorded_at).toLocaleString()}):
                    <div style={{ marginTop: 6, lineHeight: 1.6 }}>
                      <div>
                        Status: <b>{String(latest.payment_status).toUpperCase()}</b>
                        {isLockedCompleted && (
                          <span style={{ marginLeft: 10, opacity: 0.8 }}>🔒 Locked</span>
                        )}
                      </div>
                      <div>OR #: {latest.or_number ?? "—"}</div>
                      <div>Amount: {latest.amount ?? "—"}</div>
                      <div>Notes: {latest.notes ?? "—"}</div>
                      <div>
                        Method:{" "}
                        <b>
                          {(latest.payment_method || "cash")
                            .replaceAll("_", " ")
                            .toUpperCase()}
                        </b>
                      </div>
                      {String(latest.payment_method || "").toLowerCase() === "gcash" && (
                        <div>
                          Reference No: <b>{extractGcashRef(latest.notes) || "—"}</b>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ opacity: 0.7, marginTop: 10 }}>No payment recorded yet.</div>
                )}

                <div style={{ marginTop: 12 }}>
                  <b>Transaction history</b>
                  {paymentHistory.length === 0 ? (
                    <div style={{ opacity: 0.7, marginTop: 6 }}>No transactions yet.</div>
                  ) : (
                    <div style={{ marginTop: 8, overflowX: "auto" }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Status</th>
                            <th>OR No.</th>
                            <th>Amount</th>
                            <th>Method</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentHistory.map((p) => (
                            <tr key={p.id}>
                              <td>{p.recorded_at ? new Date(p.recorded_at).toLocaleString() : "—"}</td>
                              <td>{String(p.payment_status || "").toUpperCase()}</td>
                              <td>{p.or_number ?? "—"}</td>
                              <td>{p.amount != null ? toMoney(p.amount) : "—"}</td>
                              <td>{(p.payment_method || "cash").replaceAll("_", " ").toUpperCase()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="admin-form-grid">
                  <label>
                    Payment Status
                    <select
                      className="input"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      disabled={isLockedCompleted}
                    >
                      <option value="completed">Completed</option>
                      <option value="unpaid">Unpaid</option>
                    </select>
                  </label>

                  <label>
                    OR Number
                    <input
                      className="input"
                      value={orNumber}
                      onChange={(e) => setOrNumber(sanitizeRefInput(e.target.value))}
                      placeholder="e.g. OR-12345"
                      disabled={isLockedCompleted || status !== "completed"}
                    />
                  </label>

                  <label>
                    Amount
                    <input
                      className="input"
                      value={amount}
                      onChange={(e) => setAmount(sanitizeAmountInput(e.target.value))}
                      inputMode="decimal"
                      placeholder="e.g. 500"
                      disabled={isLockedCompleted || status !== "completed"}
                    />
                  </label>

                  <label>
                    Payment Method
                    <select
                      className="input"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      disabled={isLockedCompleted}
                    >
                      <option value="cash">Cash</option>
                      <option value="gcash">Gcash</option>
                    </select>
                  </label>

                  <label style={{ gridColumn: "1 / -1" }}>
                    Notes
                    <input
                      className="input"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="optional"
                      disabled={isLockedCompleted}
                    />
                  </label>
                  {String(paymentMethod).toLowerCase() === "gcash" && (
                    <label style={{ gridColumn: "1 / -1" }}>
                      Reference No.
                      <input
                        className="input"
                        value={gcashReference}
                        onChange={(e) => setGcashReference(sanitizeRefInput(e.target.value))}
                        placeholder="e.g. GCash Ref #"
                        disabled={isLockedCompleted}
                      />
                    </label>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                  <button className="btn btn-primary" onClick={savePayment} disabled={isLockedCompleted}>
                    Save payment
                  </button>
                  <button className="btn btn-secondary" onClick={clearPaymentForm} disabled={isLockedCompleted}>
                    Clear
                  </button>
                </div>
              </>
            )}

          </div>
        </>
      )}

      {/* ================= TAB: REPORT ================= */}
      {tab === "report" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <h4 style={{ marginTop: 0, marginBottom: 6 }}>Cashier Report</h4>
              <div style={{ opacity: 0.75, fontSize: 13 }}>
                Tracks completed transactions (payments table).
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="input"
                type="date"
                value={reportDateFrom}
                onChange={(e) => setReportDateFrom(e.target.value)}
                placeholder="From"
              />
              <input
                className="input"
                type="date"
                value={reportDateTo}
                onChange={(e) => setReportDateTo(e.target.value)}
                placeholder="To"
              />
              <button
                className="btn"
                onClick={() => {
                  setReportDateFrom("");
                  setReportDateTo("");
                }}
                disabled={!reportDateFrom && !reportDateTo}
              >
                Clear
              </button>
              <button className="btn btn-secondary" onClick={loadReport} disabled={reportLoading}>
                {reportLoading ? "Refreshing..." : "Refresh"}
              </button>
              <button
                className="btn"
                onClick={() =>
                  downloadCSV(
                    `cashier_report_${new Date().toISOString().slice(0, 10)}.csv`,
                    (filteredReportRows || []).map((r, idx) => {
                      const profName = patientNameFromId(r.patient_id);
                      const company = patientCompanyMap?.[r.patient_id] || "";
                      const appt = r.appointments || {};
                      const type = String(appt.appointment_type || "").toLowerCase();
                      const isPre = type.includes("pre");
                      const isApe = type.includes("ape");
                      const method = String(r.payment_method || "").toLowerCase();
                      return {
                        no: idx + 1,
                        date: r.recorded_at,
                        name: profName,
                        company,
                        or_no: r.or_number,
                        client: company ? "x" : "",
                        walkin: company ? "" : "x",
                        particular: r.package_name || r.notes || "",
                        cash: method === "cash" ? "x" : "",
                        gcash: method === "gcash" ? "x" : "",
                        charge: method === "charge" ? "x" : "",
                        amount: r.amount,
                        pre_employment: isPre ? "x" : "",
                        ape: isApe ? "x" : "",
                      };
                    })
                  )
                }
                disabled={!filteredReportRows.length}
              >
                Export CSV
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, minmax(200px, 1fr))", gap: 10 }}>
            <div className="card">
              <b>Today</b>
              <div style={{ marginTop: 8 }}>
                Total: <b>{toMoney(reportSummary.totalToday)}</b>
                <div style={{ opacity: 0.75, fontSize: 13 }}>Tx: {reportSummary.countToday}</div>
              </div>
            </div>
            <div className="card">
              <b>Last 7 days</b>
              <div style={{ marginTop: 8 }}>
                Total: <b>{toMoney(reportSummary.total7d)}</b>
                <div style={{ opacity: 0.75, fontSize: 13 }}>Tx: {reportSummary.count7d}</div>
              </div>
            </div>
            <div className="card">
              <b>This month</b>
              <div style={{ marginTop: 8 }}>
                Total: <b>{toMoney(reportSummary.totalMonth)}</b>
                <div style={{ opacity: 0.75, fontSize: 13 }}>Tx: {reportSummary.countMonth}</div>
              </div>
            </div>
            <div className="card">
              <b>Recent total</b>
              <div style={{ marginTop: 8 }}>
                Total: <b>{toMoney(reportSummary.totalAll)}</b>
                <div style={{ opacity: 0.75, fontSize: 13 }}>Tx: {reportSummary.countAll}</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Company</th>
                  <th>OR No.</th>
                  <th>Client</th>
                  <th>Walk-in</th>
                  <th>Particular</th>
                  <th>Cash</th>
                  <th>Gcash</th>
                  <th>Charge</th>
                  <th>Amount</th>
                  <th>Pre-employment</th>
                  <th>APE</th>
                </tr>
              </thead>
              <tbody>
                {filteredReportRows.length === 0 ? (
                  <tr>
                    <td colSpan="14" style={{ opacity: 0.7 }}>
                      No transactions yet.
                    </td>
                  </tr>
                ) : (
                  filteredReportRows.slice(0, 50).map((r, idx) => {
                    const company = patientCompanyMap?.[r.patient_id] || "";
                    const appt = r.appointments || {};
                    const type = String(appt.appointment_type || "").toLowerCase();
                    const isPre = type.includes("pre");
                    const isApe = type.includes("ape");
                    const method = String(r.payment_method || "").toLowerCase();

                    return (
                      <tr key={r.id}>
                        <td>{idx + 1}</td>
                        <td>{r.recorded_at ? new Date(r.recorded_at).toLocaleDateString() : "—"}</td>
                        <td>{patientNameFromId(r.patient_id)}</td>
                        <td>{company || "—"}</td>
                        <td>{r.or_number ?? "—"}</td>
                        <td>{company ? "x" : ""}</td>
                        <td>{company ? "" : "x"}</td>
                        <td>{r.package_name || r.notes || "—"}</td>
                        <td>{method === "cash" ? "x" : ""}</td>
                        <td>{method === "gcash" ? "x" : ""}</td>
                        <td>{method === "charge" ? "x" : ""}</td>
                        <td>
                          <b>{r.amount != null ? toMoney(r.amount) : "—"}</b>
                        </td>
                        <td>{isPre ? "x" : ""}</td>
                        <td>{isApe ? "x" : ""}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
              Showing latest 50 rows{reportDateFrom || reportDateTo ? " for selected date range" : ""}.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
