// src/dashboards/AdminDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/ToastCenter";
import { supabase } from "../lib/supabase";
import AdminCompanies from "../admin/AdminCompanies";
import AdminCompanyDetail from "../admin/AdminCompanyDetail";
import AdminFinancialDashboard from "../dashboards/AdminFinancialDashboard";
import NotificationBell from "../components/NotificationBell";
import useSuccessToast from "../utils/useSuccessToast";
import { DonutChart } from "../components/DonutChart";

/* =========================================================
   CONFIG (adjust if your schema differs)
   ========================================================= */
const PROFILE_TABLE = "profiles"; // expects: id, full_name
const PATIENT_PROFILE_TABLE = "patient_profiles"; // expects: patient_id, contact_no, address, gender, age, civil_status
const MIN_AGE = 1;
const MAX_AGE = 120;

function cleanContact(raw) {
  return String(raw || "").replace(/[^\d+]/g, "");
}

function isValidContact(raw) {
  const v = cleanContact(raw);
  if (!v) return false;
  if (v.startsWith("+63")) return /^\+63\d{10}$/.test(v);
  if (v.startsWith("09")) return /^09\d{9}$/.test(v);
  return /^\d{10,11}$/.test(v);
}

function validatePassword(value) {
  if (!value || value.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(value)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(value)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(value)) return "Password must include a number.";
  return "";
}
const PATIENT_PROFILE_SOFT_DELETE_FIELD = "is_deleted";

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

/* ---------------------------------------------------------
   Small helpers
--------------------------------------------------------- */
function toLower(x) {
  return String(x || "").trim().toLowerCase();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// "YYYY-MM-DD"
function toDateKey(d) {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isToday(value) {
  return toDateKey(value) === toDateKey(new Date());
}

function isFormDoneFromReq(req) {
  if (!req) return false;
  if (req.form_submitted === true || req.form_submitted_at) return true;
  const keys = [
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
  ];
  if (keys.some((k) => req[k] === true)) return true;
  if (Array.isArray(req.lab_custom_items) && req.lab_custom_items.length > 0) return true;
  return Array.isArray(req.xray_custom_items) && req.xray_custom_items.length > 0;
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return String(d);
  }
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function toMs(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
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

function detailLabel(key) {
  return String(key || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatDetailValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function renderDetails(details) {
  if (!details) return <span style={{ opacity: 0.7 }}>—</span>;
  if (typeof details === "string") return <span>{details}</span>;
  if (Array.isArray(details)) return <span>{details.join(", ")}</span>;
  const entries = Object.entries(details || {});
  if (!entries.length) return <span style={{ opacity: 0.7 }}>—</span>;
  return (
    <div className="audit-details">
      {entries.map(([key, value]) => (
        <div key={key} className="audit-detail-row">
          <span className="audit-detail-key">{detailLabel(key)}:</span>
          <span className="audit-detail-value">{formatDetailValue(value)}</span>
        </div>
      ))}
    </div>
  );
}

function formatDoctorLabel(doctor) {
  if (!doctor) return "Select a doctor";
  const name = doctor.full_name || "Doctor";
  const license = doctor.prc_license_no ? ` (PRC ${doctor.prc_license_no})` : "";
  return `${name}${license}`;
}

// Build ISO from date ("YYYY-MM-DD") and time ("HH:MM")
function combineLocalISO(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  return dt.toISOString();
}

// Generate time slots (e.g., 06:00-16:00 every 30 mins)
function generateSlots({ start = "07:00", end = "15:00", stepMins = 30 } = {}) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  let cur = sh * 60 + sm;
  const endM = eh * 60 + em;

  const out = [];
  while (cur <= endM) {
    const hh = Math.floor(cur / 60);
    const mm = cur % 60;
    out.push(`${pad2(hh)}:${pad2(mm)}`);
    cur += stepMins;
  }
  return out;
}

function downloadCSV(filename, rows) {
  // rows = array of objects
  const safe = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    // escape quotes and wrap if needed
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const headers = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r || {}).forEach((k) => set.add(k));
      return set;
    }, new Set())
  );

  const lines = [];
  lines.push(headers.map(safe).join(","));
  for (const r of rows) {
    lines.push(headers.map((h) => safe(r?.[h])).join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------
   Modal shell
--------------------------------------------------------- */
function Modal({ open, title, onClose, children, footer, width = "min(920px, 96vw)" }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{
          width,
          maxHeight: "88vh",
          overflow: "auto",
          padding: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
          <button className="btn" onClick={onClose} style={{ padding: "6px 10px" }}>
            ✕
          </button>
        </div>

        <div style={{ marginTop: 12 }}>{children}</div>
        {footer ? <div style={{ marginTop: 14 }}>{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Right-side Drawer (Patient details)
--------------------------------------------------------- */
function Drawer({ open, title, onClose, children, width = 460 }) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
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
      {/* Panel */}
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

/* ---------------------------------------------------------
   Patient Edit Modal
--------------------------------------------------------- */
function PatientEditModal({ open, onClose, patientRow, onSave }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [fullName, setFullName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [address, setAddress] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [civilStatus, setCivilStatus] = useState("");

  const [packageAvailed, setPackageAvailed] = useState(false);
  const [packageName, setPackageName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash"); // cash | online_banking | e_wallet

  useEffect(() => {
    if (!open) return;
    setErr("");
    setSaving(false);
    setFullName(patientRow?.full_name || "");
    setContactNo(patientRow?.contact_no || "");
    setAddress(patientRow?.address || "");
    setGender(patientRow?.gender || "");
    setAge(patientRow?.age ?? "");
    setCivilStatus(patientRow?.civil_status || "");
  }, [open, patientRow]);

  async function handleSave() {
    if (!patientRow?.patient_id) return;
    setSaving(true);
    setErr("");

    try {
      const patient_id = patientRow.patient_id;
      const ageNum = age === "" ? null : Number(age);

      if (contactNo.trim() && !isValidContact(contactNo)) {
        throw new Error("Contact no. must be a valid PH number (09XXXXXXXXX or +63XXXXXXXXXX).");
      }
      if (ageNum !== null && (!Number.isFinite(ageNum) || ageNum < MIN_AGE || ageNum > MAX_AGE)) {
        throw new Error("Age must be between 1 and 120.");
      }

      // Update profile name
      if (fullName.trim()) {
        const { error: e1 } = await supabase
          .from(PROFILE_TABLE)
          .update({ full_name: fullName.trim() })
          .eq("id", patient_id);

        // If RLS blocks it, surface a clear message
        if (e1) throw new Error(`Cannot update ${PROFILE_TABLE}.full_name: ${e1.message}`);
      }

      // Upsert patient_profile fields
      const payload = {
        patient_id,
        contact_no: contactNo.trim() ? cleanContact(contactNo) : null,
        address: address.trim() || null,
        gender: gender.trim() || null,
        age: ageNum,
        civil_status: civilStatus.trim() || null,
      };

      const { error: e2 } = await supabase.from(PATIENT_PROFILE_TABLE).upsert([payload], { onConflict: "patient_id" });

      if (e2) throw new Error(`Cannot upsert ${PATIENT_PROFILE_TABLE}: ${e2.message}`);

      await onSave?.();
      onClose?.();
    } catch (e) {
      setErr(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Edit Patient Information"
      onClose={onClose}
      width="min(640px, 96vw)"
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-approve" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      }
    >
      {!patientRow ? null : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Patient ID: <span style={{ fontFamily: "monospace" }}>{patientRow.patient_id}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Full Name</div>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Contact No</div>
              <input
                value={contactNo}
                onChange={(e) => setContactNo(cleanContact(e.target.value))}
                style={{ width: "100%" }}
                inputMode="numeric"
                maxLength={13}
              />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Address</div>
            <input value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: "100%" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Gender</div>
              <input value={gender} onChange={(e) => setGender(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Age</div>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value.replace(/[^\d]/g, ""))}
                style={{ width: "100%" }}
                min={1}
                max={120}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Civil Status</div>
              <input value={civilStatus} onChange={(e) => setCivilStatus(e.target.value)} style={{ width: "100%" }} />
            </div>
          </div>

          {err ? <div style={{ color: "rgba(248,113,113,0.95)", fontSize: 13 }}>{err}</div> : null}

          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Note: If this save fails, it’s usually because of Supabase RLS permissions. You may need admin policies for{" "}
            <b>{PROFILE_TABLE}</b> and <b>{PATIENT_PROFILE_TABLE}</b>.
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------
   Availability Calendar (month view + booked times)
--------------------------------------------------------- */
function AvailabilityCalendar({
  monthCursor,
  onMonthChange,
  selectedDateKey,
  onSelectDateKey,
  bookedMap,
}) {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const monthLabel = firstOfMonth.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>{monthLabel}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={() => onMonthChange(new Date(year, month - 1, 1))}
            style={{ padding: "6px 10px" }}
            title="Previous month"
          >
            ←
          </button>
          <button
            className="btn"
            onClick={() => onMonthChange(new Date(year, month + 1, 1))}
            style={{ padding: "6px 10px" }}
            title="Next month"
          >
            →
          </button>
        </div>
      </div>

      <div
        className="calendar-grid calendar-weekdays"
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
          fontSize: 12,
          opacity: 0.75,
        }}
      >
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((x) => (
          <div key={x} style={{ textAlign: "center" }}>
            {x}
          </div>
        ))}
      </div>

      <div
        className="calendar-grid calendar-days"
        style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}
      >
        {cells.map((d, idx) => {
          if (!d) return <div key={`b-${idx}`} style={{ height: 42 }} />;

          const key = toDateKey(d);
          const isSelected = selectedDateKey === key;
          const bookedCount = (bookedMap?.[key] || []).length;

          const isSunday = d.getDay() === 0;
          const isDisabled = isSunday;

          return (
            <button
              key={key}
              className="btn"
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) return;
                onSelectDateKey(key);
              }}
              style={{
                height: 42,
                padding: 0,
                position: "relative",
                opacity: isDisabled ? 0.35 : 1,
                cursor: isDisabled ? "not-allowed" : "pointer",
                borderRadius: 12,
                border: isSelected ? "1px solid rgba(59,130,246,0.55)" : undefined,
                boxShadow: isSelected ? "0 0 0 2px rgba(59,130,246,0.15) inset" : undefined,
              }}
              title={isDisabled ? "Closed on Sundays" : bookedCount ? `${bookedCount} booked slot(s)` : "No bookings"}
            >
              <div style={{ fontWeight: 700 }}>{d.getDate()}</div>
              {bookedCount > 0 ? (
                <div
                  style={{
                    position: "absolute",
                    right: 8,
                    bottom: 7,
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 999,
                    background: "rgba(148,163,184,0.14)",
                    border: "1px solid rgba(148,163,184,0.25)",
                    opacity: 0.9,
                  }}
                >
                  {bookedCount}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
        Tip: numbers show how many scheduled slots exist on that date.
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Admin Dashboard
--------------------------------------------------------- */
export default function AdminDashboard({ session, page = "patients", appointmentsBasePath = "/admin/appointments" }) {
  const navigate = useNavigate();
  const tab = page || "patients";
  const [topbarActionsEl, setTopbarActionsEl] = useState(null);
  const [staffList, setStaffList] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("admin_staff_accounts") || "[]");
    } catch {
      return [];
    }
  });
  const [staffForm, setStaffForm] = useState({
    full_name: "",
    email: "",
    role: "nurse",
    status: "active",
  });
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [adminPwMsg, setAdminPwMsg] = useState("");
  const [adminPwSaving, setAdminPwSaving] = useState(false);
  const { showToast } = useToast();
  useSuccessToast(adminPwMsg, showToast);

  // Companies
  const [selectedCompany, setSelectedCompany] = useState(null);

  // Global message
  const [msg, setMsg] = useState("");
  useSuccessToast(msg, showToast);

  // appointments inbox
  const [appointments, setAppointments] = useState([]);
  const [requirementsMap, setRequirementsMap] = useState({});
  const [loading, setLoading] = useState(false);

  // Filters
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Patients summary (view)
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsMsg, setPatientsMsg] = useState("");

  // NEW: Patients search
  const [patientsSearch, setPatientsSearch] = useState("");

  // NEW: Patient drawer + edit
  const [patientDrawerOpen, setPatientDrawerOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientHistory, setPatientHistory] = useState({ vitals: [], labs: [], xrays: [] });
  const [patientHistoryLoading, setPatientHistoryLoading] = useState(false);

  const [editPatientOpen, setEditPatientOpen] = useState(false);

  // manual notification
  const [notifyPatientId, setNotifyPatientId] = useState("");
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyBody, setNotifyBody] = useState("");

  // audit logs
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Patient name cache
  const [patientNameMap, setPatientNameMap] = useState({});

  /* --------------------------
   * Approve Modal State
   * -------------------------- */
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveAppt, setApproveAppt] = useState(null);

  const [usePreferredDate, setUsePreferredDate] = useState(true);
  const [approveDate, setApproveDate] = useState("");
  const [approveTime, setApproveTime] = useState("08:00");
  const [assignedDoctorId, setAssignedDoctorId] = useState("");
  const [doctorList, setDoctorList] = useState([]);
  const [doctorLoading, setDoctorLoading] = useState(false);

  // Calendar availability
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [calendarMonthCursor, setCalendarMonthCursor] = useState(() => new Date());
  const [calendarSelectedDateKey, setCalendarSelectedDateKey] = useState("");
  const [bookedMap, setBookedMap] = useState({});
  const [availabilityMsg, setAvailabilityMsg] = useState("");
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const DAILY_CAPACITY = 100;

  /* --------------------------
   * Reject Modal State
   * -------------------------- */
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectAppt, setRejectAppt] = useState(null);
  const [rejectPreset, setRejectPreset] = useState("No available slot");
  const [rejectCustom, setRejectCustom] = useState("");
  const [rejectError, setRejectError] = useState("");

  /* --------------------------
   * Helpers
   * -------------------------- */
  function patientNameFromId(patientId) {
    const name = patientNameMap?.[patientId];
    return name && String(name).trim() ? String(name).trim() : "(No name)";
  }

  function isDoctorScheduled(doctorId, dateKey, timeKey, ignoreAppointmentId = null) {
    if (!doctorId || !dateKey || !timeKey) return false;
    const target = `${dateKey} ${timeKey}`;
    return (appointments || []).some((a) => {
      if (!a?.scheduled_at) return false;
      if (ignoreAppointmentId && a.id === ignoreAppointmentId) return false;
      if (a.assigned_doctor_id !== doctorId) return false;
      const statusKey = toLower(a.workflow_status || a.status);
      if (["rejected", "cancelled"].includes(statusKey)) return false;
      const dt = new Date(a.scheduled_at);
      if (Number.isNaN(dt.getTime())) return false;
      const key = `${toDateKey(dt)} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
      return key === target;
    });
  }

  function resetApproveState() {
    setApproveOpen(false);
    setApproveAppt(null);
    setUsePreferredDate(true);
    setApproveDate("");
    setApproveTime("08:00");
    setAssignedDoctorId("");
    setAvailabilityMsg("");
    setAvailabilityLoading(false);
  }

  function resetRejectState() {
    setRejectOpen(false);
    setRejectAppt(null);
    setRejectPreset("No available slot");
    setRejectCustom("");
    setRejectError("");
  }

  function openApproveModal(a) {
    resetRejectState();

    setApproveAppt(a);
    setApproveOpen(true);

    const pref = a?.preferred_date ? String(a.preferred_date).slice(0, 10) : "";
    setUsePreferredDate(true);
    setApproveDate(pref || toDateKey(new Date()));
    setApproveTime("08:00");
    setAssignedDoctorId(a?.assigned_doctor_id || "");

    const base = pref ? new Date(pref) : new Date();
    setMonthCursor(new Date(base.getFullYear(), base.getMonth(), 1));
  }

  function openRejectModal(appt) {
    resetApproveState();

    setRejectAppt(appt);
    setRejectPreset("No available slot");
    setRejectCustom("");
    setRejectError("");
    setRejectOpen(true);
  }

  function closeApproveModal() {
    resetApproveState();
  }

  function closeRejectModal() {
    resetRejectState();
  }

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
    // keep selectedPatient so edit can open, but you can null it if you want
  }

  /* --------------------------
   * Name loading (profiles -> fallback to view)
   * -------------------------- */
  async function loadPatientNames(patientIds = []) {
    const ids = Array.from(new Set((patientIds || []).filter(Boolean)));
    if (ids.length === 0) return;

    const missing = ids.filter((id) => !(id in patientNameMap));
    if (missing.length === 0) return;

    const prof = await supabase.from("profiles").select("id, full_name").in("id", missing);

    if (!prof.error) {
      setPatientNameMap((prev) => {
        const next = { ...prev };
        (prof.data || []).forEach((p) => (next[p.id] = (p.full_name || "").trim()));
        return next;
      });
      return;
    }


    const { data: vdata, error: verr } = await supabase
      .from("admin_patient_summary")
      .select("patient_id, full_name")
      .in("patient_id", missing);

    if (verr) return;

    setPatientNameMap((prev) => {
      const next = { ...prev };
      (vdata || []).forEach((p) => (next[p.patient_id] = (p.full_name || "").trim()));
      return next;
    });
  }

  /* --------------------------
   * Load: appointments
   * -------------------------- */
  async function loadAppointments() {
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("appointments")
      .select(
        "id, appointment_type, preferred_date, scheduled_at, workflow_status, status, rejection_reason, patient_id, created_at, assigned_doctor_id"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(`Failed to load appointments: ${error.message}`);
      setAppointments([]);
      setRequirementsMap({});
      setLoading(false);
      return;
    }

    const rows = data || [];
    setAppointments(rows);
    setRequirementsMap({});
    setLoading(false);

    await loadPatientNames(rows.map((a) => a.patient_id));

    const ids = rows.map((a) => a.id).filter(Boolean);
    if (ids.length) {
      const { data: reqs, error: reqErr } = await supabase
        .from("appointment_requirements")
        .select(
          [
            "appointment_id",
            "form_submitted",
            "form_submitted_at",
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
            "lab_custom_items",
            "xray_custom_items",
          ].join(", ")
        )
        .in("appointment_id", ids);
      if (!reqErr) {
        const next = {};
        (reqs || []).forEach((r) => {
          next[r.appointment_id] = r;
        });
        setRequirementsMap(next);
      } else {
        setRequirementsMap({});
        setMsg((m) => m || `Cannot read form slip status: ${reqErr.message}`);
      }
    }
  }

  /* --------------------------
   * Load: admin patient summary
   * -------------------------- */
  async function loadPatients() {
    setPatientsLoading(true);
    setPatientsMsg("");

    const { data, error } = await supabase
      .from("admin_patient_summary")
      .select("*")
      .order("appointment_created_at", { ascending: false, nullsFirst: false });

    if (error) {
      setPatientsMsg(`Failed to load patient summary: ${error.message}`);
      setPatients([]);
      setPatientsLoading(false);
      return;
    }

    setPatients(data || []);
    setPatientsLoading(false);

    await loadPatientNames((data || []).map((x) => x.patient_id));
  }

  /* --------------------------
   * Load: logs
   * -------------------------- */
  async function loadLogs() {
    setLogsLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("activity_logs")
      .select("id, created_at, actor_role, actor_id, patient_id, entity_type, entity_id, action, details")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      setMsg(`Failed to load audit logs: ${error.message}`);
      setLogs([]);
      setLogsLoading(false);
      return;
    }

    setLogs(data || []);
    setLogsLoading(false);

    await loadPatientNames((data || []).map((x) => x.patient_id));
  }

  useEffect(() => {
    loadAppointments();
    loadLogs();
    loadPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadDoctors() {
      setDoctorLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, prc_license_no, is_active, role")
        .eq("role", "doctor")
        .order("full_name", { ascending: true });
      setDoctorLoading(false);
      if (error) {
        setMsg((m) => m || `Failed to load doctors: ${error.message}`);
        setDoctorList([]);
        return;
      }
      setDoctorList((data || []).filter((d) => d.is_active !== false));
    }
    loadDoctors();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("admin-appointments-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => loadAppointments()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointment_requirements" },
        () => loadAppointments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTopbarActionsEl(document.getElementById("dashboard-utility-actions"));
  }, []);

  useEffect(() => {
    localStorage.setItem("admin_staff_accounts", JSON.stringify(staffList));
  }, [staffList]);

  function addStaff() {
    const name = staffForm.full_name.trim();
    const email = staffForm.email.trim().toLowerCase();
    if (!name || !email) return;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    setStaffList((prev) => [
      ...prev,
      {
        id,
        full_name: name,
        email,
        role: staffForm.role,
        status: staffForm.status,
        created_at: new Date().toISOString(),
      },
    ]);
    setStaffForm({ full_name: "", email: "", role: "nurse", status: "active" });
  }

  function removeStaff(id) {
    setStaffList((prev) => prev.filter((s) => s.id !== id));
  }

  async function changeAdminPassword() {
    setAdminPwMsg("");
    const passError = validatePassword(adminNewPassword);
    if (passError) return setAdminPwMsg(passError);
    setAdminPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: adminNewPassword });
    setAdminPwSaving(false);
    if (error) return setAdminPwMsg("Failed to update password: " + error.message);
    setAdminNewPassword("");
    setAdminPwMsg("Password updated successfully.");
  }

  /* --------------------------
   * Notifications
   * -------------------------- */
  async function createNotification(patient_id, title, body = null) {
    const payload = { patient_id, title, body, is_read: false, read_at: null };
    const { error } = await supabase.from("notifications").insert([payload]);
    return error || null;
  }

  /* =========================================================
   * Ensure steps + requirements exist when APPROVED
   * ========================================================= */
  function defaultRequirementsForType(appointment_type) {
    const t = toLower(appointment_type);
    if (t === "ape") {
      return {
        needs_lab: true,
        needs_xray: true,
        exam_physical: true,
        exam_visual_acuity: true,
        exam_height_weight: true,
        lab_cbc_platelet: true,
        lab_urinalysis: true,
        lab_fecalysis: true,
        lab_drug_test: true,
        lab_hepatitis_b: true,
        xray_chest: true,
      };
    }
    return {
      needs_lab: true,
      needs_xray: true,
      exam_physical: true,
      exam_visual_acuity: true,
      exam_height_weight: true,
      lab_cbc_platelet: true,
      lab_urinalysis: true,
      lab_fecalysis: true,
      lab_drug_test: true,
      xray_chest: true,
    };
  }

  async function ensureAppointmentSteps(appointment) {
    const apptId = appointment.id;

    const existing = await supabase.from("appointment_steps").select("*").eq("appointment_id", apptId).maybeSingle();
    if (existing.error) {
      setMsg((m) => m || `Cannot read appointment_steps: ${existing.error.message}`);
      return { ok: false };
    }
    if (existing.data) return { ok: true };

    const payload = {
      appointment_id: apptId,
      patient_id: appointment.patient_id,
      registration_status: "completed",
      triage_status: "pending",
      lab_status: "pending",
      xray_status: "pending",
      doctor_status: "pending",
      payment_status: "pending",
      release_status: "pending",
    };

    const ins = await supabase.from("appointment_steps").insert([payload]).select("*").maybeSingle();
    if (ins.error) {
      setMsg((m) => m || `Failed to create appointment_steps: ${ins.error.message}`);
      return { ok: false };
    }
    return { ok: true };
  }

  async function ensureAppointmentRequirements(appointment) {
    const apptId = appointment.id;

    const existing = await supabase
      .from("appointment_requirements")
      .select("*")
      .eq("appointment_id", apptId)
      .maybeSingle();

    if (existing.error) {
      setMsg((m) => m || `Cannot read appointment_requirements: ${existing.error.message}`);
      return { ok: false };
    }
    if (existing.data) return { ok: true };

    const req = defaultRequirementsForType(appointment.appointment_type);
    const ins = await supabase
      .from("appointment_requirements")
      .insert([{ appointment_id: apptId, patient_id: appointment.patient_id, ...req }])
      .select("*")
      .maybeSingle();

    if (ins.error) {
      setMsg((m) => m || `Failed to create appointment_requirements: ${ins.error.message}`);
      return { ok: false };
    }
    return { ok: true };
  }

  async function onAfterApproved(appointment, scheduled_at) {
    await ensureAppointmentSteps(appointment);
    await ensureAppointmentRequirements(appointment);

    await createNotification(
      appointment.patient_id,
      "Appointment Approved",
      `Your appointment was approved and scheduled at ${new Date(scheduled_at).toLocaleString()}. Please complete the required forms.`
    );
  }

  async function onAfterRejected(appointment, rr) {
    await createNotification(appointment.patient_id, "Appointment Rejected", `Reason: ${rr}`);
  }

  /* =========================================================
   * Availability loader for calendar (monthly)
   * ========================================================= */
  async function loadAvailabilityForMonth(cursorDate) {
    setAvailabilityLoading(true);
    setAvailabilityMsg("");

    const y = cursorDate.getFullYear();
    const m = cursorDate.getMonth();
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    const end = new Date(y, m + 1, 1, 0, 0, 0, 0);

    const occupying = ["approved", "awaiting_forms", "ready_for_triage"];

    const { data, error } = await supabase
      .from("appointments")
      .select("id, scheduled_at, workflow_status, status")
      .gte("scheduled_at", start.toISOString())
      .lt("scheduled_at", end.toISOString());

    if (error) {
      setAvailabilityMsg(`Failed to load availability: ${error.message}`);
      setBookedMap({});
      setAvailabilityLoading(false);
      return;
    }

    const map = {};
    (data || []).forEach((a) => {
      const ws = toLower(a.workflow_status || a.status);
      if (!occupying.includes(ws)) return;
      if (!a.scheduled_at) return;

      const dt = new Date(a.scheduled_at);
      const dateKey = toDateKey(dt);
      const time = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;

      map[dateKey] = map[dateKey] || [];
      map[dateKey].push(time);
    });

    Object.keys(map).forEach((k) => {
      map[k] = Array.from(new Set(map[k])).sort();
    });

    setBookedMap(map);
    setAvailabilityLoading(false);
  }

  useEffect(() => {
    if (!approveOpen) return;
    loadAvailabilityForMonth(monthCursor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveOpen, monthCursor]);

  useEffect(() => {
    if (tab !== "appointments") return;
    loadAvailabilityForMonth(calendarMonthCursor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, calendarMonthCursor]);

  useEffect(() => {
    if (!approveOpen) return;
    if (!usePreferredDate) return;
    const pref = approveAppt?.preferred_date ? String(approveAppt.preferred_date).slice(0, 10) : "";
    if (pref) setApproveDate(pref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usePreferredDate, approveAppt, approveOpen]);

  useEffect(() => {
  const channel = supabase
    .channel("admin-live-refresh")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vitals" },
      () => loadPatients()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "lab_results" },
      () => loadPatients()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "xray_results" },
      () => loadPatients()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      () => loadPatients()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  /* =========================================================
   * Update appointment status (auto-remove on approve/reject)
   * ========================================================= */
  async function setWorkflowStatus(
    appointment,
    nextWorkflow,
    rejectionReason = null,
    scheduled_at_override = null,
    extraFields = {}
  ) {
    setMsg("");

    const workflow_status = toLower(nextWorkflow);

    let rr = rejectionReason;
    if (workflow_status === "rejected") {
      if (!rr || !rr.trim()) {
        setMsg("Rejection reason is required.");
        return;
      }
      rr = rr.trim();
    } else {
      rr = null;
    }

    let scheduled_at = appointment.scheduled_at || null;
    if (workflow_status === "approved") {
      scheduled_at = scheduled_at_override || scheduled_at;
      if (!scheduled_at) {
        setMsg("Schedule is required to approve.");
        return;
      }
    }

    const legacyStatus = workflow_status === "ready_for_triage" ? "approved" : workflow_status;

    const { error } = await supabase
      .from("appointments")
      .update({
        workflow_status,
        status: legacyStatus,
        rejection_reason: rr,
        scheduled_at,
        ...extraFields,
      })
      .eq("id", appointment.id);

    if (error) {
      setMsg(`Failed to update appointment: ${error.message}`);
      return;
    }

    if (workflow_status === "approved" || workflow_status === "rejected") {
      setAppointments((prev) => prev.filter((x) => x.id !== appointment.id));
    } else {
      setAppointments((prev) =>
        prev.map((x) =>
          x.id === appointment.id ? { ...x, workflow_status, status: legacyStatus, rejection_reason: rr, scheduled_at } : x
        )
      );
    }

    if (workflow_status === "approved") {
      await onAfterApproved(appointment, scheduled_at);
    } else if (workflow_status === "rejected") {
      await onAfterRejected(appointment, rr);
    }

    loadLogs();
    loadPatients();

    setMsg(`Updated appointment to "${formatWorkflowLabel(workflow_status)}".`);
  }

  async function confirmApproveFromModal() {
    if (!approveAppt) return;

    const chosenDate = approveDate;
    const chosenTime = approveTime;

    if (!chosenDate) return setMsg("Please select a schedule date.");
    if (!chosenTime) return setMsg("Please select a schedule time.");

    const day = new Date(chosenDate + "T00:00:00").getDay();
    if (day === 0) {
      setMsg("Clinic is closed on Sundays. Please choose Monday–Saturday.");
      return;
    }

    const booked = bookedMap?.[chosenDate] || [];
    if (booked.includes(chosenTime)) {
      setMsg("That time slot is already booked. Please pick another.");
      return;
    }

    const scheduledISO = combineLocalISO(chosenDate, chosenTime);
    if (!scheduledISO) {
      setMsg("Invalid schedule date/time.");
      return;
    }

    if (assignedDoctorId) {
      const conflicting = isDoctorScheduled(assignedDoctorId, chosenDate, chosenTime, approveAppt?.id);
      if (conflicting) {
        setMsg("Selected doctor has a conflicting appointment at this time.");
        return;
      }
    }

    const assignPayload = assignedDoctorId
      ? {
          assigned_doctor_id: assignedDoctorId,
          assigned_at: new Date().toISOString(),
          assigned_by_admin_id: session?.user?.id || null,
        }
      : {};

    await setWorkflowStatus(approveAppt, "approved", null, scheduledISO, assignPayload);
    closeApproveModal();
  }

  async function confirmRejectFromModal() {
    if (!rejectAppt) return;

    const finalReason = rejectPreset === "Other" ? rejectCustom.trim() : String(rejectPreset || "").trim();

    if (!finalReason) {
      setRejectError("Please enter a rejection reason.");
      return;
    }

    await setWorkflowStatus(rejectAppt, "rejected", finalReason);
    closeRejectModal();
  }

  async function confirmArrival(appointment) {
    if (!appointment) return;
    let req = requirementsMap[appointment.id];
    if (!req) {
      const { data } = await supabase
        .from("appointment_requirements")
        .select(
          [
            "appointment_id",
            "form_submitted",
            "form_submitted_at",
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
            "lab_custom_items",
            "xray_custom_items",
          ].join(", ")
        )
        .eq("appointment_id", appointment.id)
        .maybeSingle();
      if (data) {
        setRequirementsMap((prev) => ({ ...prev, [appointment.id]: data }));
        req = data;
      }
    }

    if (!isFormDoneFromReq(req)) {
      setMsg("Patient has not completed the Form Slip yet.");
      return;
    }

    await ensureAppointmentSteps(appointment);
    await ensureAppointmentRequirements(appointment);
    await setWorkflowStatus(appointment, "ready_for_triage");
    setAppointments((prev) => prev.filter((x) => x.id !== appointment.id));

    await createNotification(
      appointment.patient_id,
      "Booking confirmed",
      "Your appointment is confirmed for today. You can now proceed to your medical screening."
    );
  }

  async function openSlotForNoShow(appointment) {
    if (!appointment?.id) return;
    const ok = window.confirm("Mark as no-show and reopen this slot?");
    if (!ok) return;

    const { error } = await supabase
      .from("appointments")
      .update({
        workflow_status: "rejected",
        status: "rejected",
        rejection_reason: "No show",
        scheduled_at: null,
      })
      .eq("id", appointment.id);

    if (error) {
      setMsg(`Failed to reopen slot: ${error.message}`);
      return;
    }

    setAppointments((prev) => prev.filter((x) => x.id !== appointment.id));
    loadAvailabilityForMonth(calendarMonthCursor);
  }

  /* --------------------------
   * Manual Notification
   * -------------------------- */
  async function sendManualNotification() {
    setMsg("");

    const pid = notifyPatientId.trim();
    const t = notifyTitle.trim();

    if (!pid) return setMsg("Patient ID is required.");
    if (!t) return setMsg("Title is required.");

    const err = await createNotification(pid, t, notifyBody.trim() || null);
    if (err) return setMsg(`Failed to send notification: ${err.message}`);

    setMsg("Notification sent.");
    setNotifyTitle("");
    setNotifyBody("");
  }

  function quickFillPatientId(pid) {
    setNotifyPatientId(pid);
    if (!notifyTitle) setNotifyTitle("Clinic Update");
  }

  /* =========================================================
   * Patients: filtered + export + edit/delete
   * ========================================================= */
  const filteredPatients = useMemo(() => {
    const q = patientsSearch.trim().toLowerCase();
    if (!q) return patients;

    return (patients || []).filter((p) => {
      const text = [
        p.full_name,
        p.patient_id,
        p.contact_no,
        p.address,
        p.gender,
        p.civil_status,
        p.appointment_type,
        p.appointment_status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    });
  }, [patients, patientsSearch]);

  function exportPatientsCSV() {
    const rows = (filteredPatients || []).map((p) => ({
      patient_id: p.patient_id,
      full_name: p.full_name || patientNameFromId(p.patient_id),
      contact_no: p.contact_no,
      address: p.address,
      gender: p.gender,
      age: p.age,
      civil_status: p.civil_status,
      appointment_type: p.appointment_type,
      preferred_date: p.preferred_date ? String(p.preferred_date).slice(0, 10) : null,
      appointment_status: p.appointment_status,
      appointment_created_at: p.appointment_created_at,
      vitals_created_at: p.vitals_created_at || p.recorded_at,
      lab_recorded_at: p.lab_recorded_at,
      xray_exam_date: p.xray_exam_date,
      xray_status: p.xray_status,
    }));

    const today = new Date();
    const stamp = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
    downloadCSV(`patients_summary_${stamp}.csv`, rows);
  }

  async function deletePatient(patientRow) {
    if (!patientRow?.patient_id) return;
    const patient_id = patientRow.patient_id;

    // confirm without window.prompt/alert: use a minimal modal-style confirm
    // Here we’ll do a simple confirm() to keep it quick.
    // If you want: I can convert this to a proper modal too.
    // eslint-disable-next-line no-restricted-globals
    const ok = window.confirm("Delete this patient profile? This cannot be easily undone.");
    if (!ok) return;

    setMsg("");

    // Try soft delete first (if field exists) else hard delete
    // NOTE: This deletes from PATIENT_PROFILE_TABLE only (safer). If you also want to delete auth user/profile, do it via admin functions.
    const { error: softErr } = await supabase
      .from(PATIENT_PROFILE_TABLE)
      .update({ [PATIENT_PROFILE_SOFT_DELETE_FIELD]: true })
      .eq("patient_id", patient_id);

    if (softErr) {
      // fallback hard delete
      const { error: hardErr } = await supabase.from(PATIENT_PROFILE_TABLE).delete().eq("patient_id", patient_id);
      if (hardErr) {
        setMsg(`Failed to delete patient: ${hardErr.message}`);
        return;
      }
    }

    setMsg("Patient profile deleted.");
    await loadPatients();
    setPatientDrawerOpen(false);
  }

  /* =========================================================
   * Appointments: filtering
   * ========================================================= */
  const filteredAppointments = useMemo(() => {
    let list = [...appointments];
    const statusKey = (x) => toLower(x.workflow_status || x.status);

    // Once confirmed (ready_for_triage), remove from admin queue list
    list = list.filter((a) => statusKey(a) !== "ready_for_triage");
    // Hide no-show records from history list
    list = list.filter((a) => (a.rejection_reason || "").toLowerCase() !== "no show");
    // Hide rejected/canceled appointments from the admin list
    list = list.filter((a) => !["rejected", "canceled"].includes(statusKey(a)));

    if (filter === "inbox") {
      list = list.filter((a) => statusKey(a) === "pending");
    } else if (filter !== "all") {
      list = list.filter((a) => statusKey(a) === filter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const text = [
          a.appointment_type,
          a.workflow_status,
          a.status,
          a.patient_id,
          patientNameFromId(a.patient_id),
          a.rejection_reason,
          a.preferred_date,
          a.scheduled_at,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return text.includes(q);
      });
    }

    list.sort((a, b) => {
      const aDate = toMs(a.scheduled_at) || toMs(a.preferred_date) || toMs(a.created_at) || null;
      const bDate = toMs(b.scheduled_at) || toMs(b.preferred_date) || toMs(b.created_at) || null;
      if (aDate == null && bDate == null) return 0;
      if (aDate == null) return 1;
      if (bDate == null) return -1;
      return aDate - bDate;
    });

    return list;
  }, [appointments, filter, search, patientNameMap]);

  const bookedByDate = useMemo(() => {
    const occupying = ["approved", "awaiting_forms", "ready_for_triage"];
    const map = {};
    (appointments || []).forEach((a) => {
      const ws = toLower(a.workflow_status || a.status);
      if (!occupying.includes(ws)) return;
      if (!a.scheduled_at) return;
      const d = new Date(a.scheduled_at);
      const key = toDateKey(d);
      map[key] = map[key] || [];
      map[key].push(a);
    });
    return map;
  }, [appointments]);

  const calendarSelectedBookings = useMemo(() => {
    if (!calendarSelectedDateKey) return [];
    return bookedByDate[calendarSelectedDateKey] || [];
  }, [bookedByDate, calendarSelectedDateKey]);

  const importantAlerts = useMemo(() => {
    const list = [];
    Object.keys(bookedByDate).forEach((key) => {
      const count = bookedByDate[key]?.length || 0;
      if (count >= DAILY_CAPACITY) {
        list.push({ key, count, type: count > DAILY_CAPACITY ? "over" : "full" });
      }
    });
    list.sort((a, b) => String(a.key).localeCompare(String(b.key)));
    return list;
  }, [bookedByDate, DAILY_CAPACITY]);

  const adminNotifs = useMemo(() => {
    return importantAlerts.map((a, idx) => ({
      id: `${a.key}-${a.type}-${idx}`,
      title: a.type === "over" ? "Capacity exceeded" : "Capacity full",
      body: `${a.key}: ${a.count} booked (limit ${DAILY_CAPACITY}).`,
      created_at: new Date(`${a.key}T00:00:00`).toISOString(),
      is_read: false,
    }));
  }, [importantAlerts, DAILY_CAPACITY]);

  /* =========================================================
   * Approve modal: availability derived
   * ========================================================= */
  const selectedBookedTimes = useMemo(() => {
    if (!approveDate) return [];
    return bookedMap?.[approveDate] || [];
  }, [bookedMap, approveDate]);

  const selectedDoctor = useMemo(() => {
    return doctorList.find((d) => d.id === assignedDoctorId) || null;
  }, [doctorList, assignedDoctorId]);

  const doctorAvailability = useMemo(() => {
    if (!assignedDoctorId || !approveDate || !approveTime) return null;
    const conflict = isDoctorScheduled(assignedDoctorId, approveDate, approveTime, approveAppt?.id);
    return conflict ? "busy" : "available";
  }, [assignedDoctorId, approveDate, approveTime, approveAppt, appointments]);

  const suggestedFreeTimes = useMemo(() => {
    if (!approveDate) return [];
    const booked = new Set(bookedMap?.[approveDate] || []);
    const all = generateSlots({ start: "07:00", end: "15:00", stepMins: 30 });
    return all.filter((t) => !booked.has(t));
  }, [bookedMap, approveDate]);

  /* --------------------------
   * Patient volume analytics
   * -------------------------- */
  const patientVolume = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let daily = 0;
    let weekly = 0;
    let monthly = 0;

    for (const a of appointments || []) {
      const dt = a?.created_at ? new Date(a.created_at) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
      if (dt >= todayStart) daily += 1;
      if (dt >= weekStart) weekly += 1;
      if (dt >= monthStart) monthly += 1;
    }

    return { daily, weekly, monthly };
  }, [appointments]);

  const volumeStats = useMemo(() => {
    const computeStats = (days) => {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - (days - 1));
      start.setHours(0, 0, 0, 0);
      const map = new Map();
      let total = 0;

      for (const a of appointments || []) {
        const key = dayKey(a?.created_at);
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
  }, [appointments]);

  /* =========================================================
   * UI
   * ========================================================= */
  return (
    <div className="patient-dashboard-content">
      <header className="page-header no-print">
        <div className="page-header-main">
          <h1 className="page-title">{tab === "appointments" ? "Receptionist Dashboard" : "Admin Dashboard"}</h1>
          <p className="page-subtitle">
            {tab === "appointments"
              ? "Manage patient appointments and booking requests."
              : "Manage appointments, patients, partner companies, and tools."}
          </p>
        </div>
        <div className="page-actions" />
      </header>

      {topbarActionsEl
        ? createPortal(
            <NotificationBell notifications={adminNotifs} loading={false} onMarkAllRead={() => {}} />,
            topbarActionsEl
          )
        : null}

      <div>
        {msg && <p style={{ marginTop: 0 }}>{msg}</p>}

          {/* ===================== APPOINTMENTS TAB ===================== */}
        {tab === "appointments" && (
            <>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="analytics-header">
              <div>
                <h4 style={{ marginTop: 0, marginBottom: 6 }}>Patient Volume</h4>
                <div style={{ opacity: 0.75, fontSize: 13 }}>
                  Based on appointment creation timestamps.
                </div>
              </div>
            </div>
            <div className="analytics-panel" style={{ marginTop: 12 }}>
              <div className="analytics-panel-title">Avg appointments per day</div>
              <div className="analytics-donuts">
                <div className="analytics-donut">
                  <DonutChart
                    value={volumeStats.last7.avg}
                    max={volumeStats.last7.max || volumeStats.last7.avg || 1}
                    label="7d avg"
                    unit=""
                    color="#0f766e"
                    size={120}
                  />
                </div>
                <div className="analytics-donut">
                  <DonutChart
                    value={volumeStats.last30.avg}
                    max={volumeStats.last30.max || volumeStats.last30.avg || 1}
                    label="30d avg"
                    unit=""
                    color="#0f766e"
                    size={120}
                  />
                </div>
              </div>
            </div>
            <div
              className="admin-volume-grid"
              style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(200px, 1fr))", gap: 10 }}
            >
              <div className="card">
                <b>Today</b>
                <div style={{ marginTop: 8 }}>
                  Patients: <b>{patientVolume.daily}</b>
                </div>
              </div>
              <div className="card">
                <b>Last 7 days</b>
                <div style={{ marginTop: 8 }}>
                  Patients: <b>{patientVolume.weekly}</b>
                </div>
              </div>
              <div className="card">
                <b>This month</b>
                <div style={{ marginTop: 8 }}>
                  Patients: <b>{patientVolume.monthly}</b>
                </div>
              </div>
            </div>
          </div>

          <div className="card schedule-monitor" style={{ marginTop: 12 }}>
            <div className="schedule-header">
              <div>
                <h4 style={{ margin: 0 }}>Schedule Monitor</h4>
                <div className="schedule-subtitle">Track daily capacity and quickly manage no-shows.</div>
              </div>
              <div className="schedule-legend">
                <span className="schedule-dot schedule-available" />
                <span>Available</span>
                <span className="schedule-dot schedule-limited" />
                <span>Limited</span>
                <span className="schedule-dot schedule-full" />
                <span>Full</span>
              </div>
            </div>
            <div className="admin-schedule-grid schedule-grid" style={{ marginTop: 12 }}>
              <AvailabilityCalendar
                monthCursor={calendarMonthCursor}
                onMonthChange={setCalendarMonthCursor}
                selectedDateKey={calendarSelectedDateKey}
                onSelectDateKey={setCalendarSelectedDateKey}
                bookedMap={bookedMap}
              />

              <div className="card schedule-details-card">
                <div className="schedule-details-title">Day Details</div>
                {!calendarSelectedDateKey ? (
                  <div className="schedule-empty">Select a date from the calendar.</div>
                ) : (
                  <>
                    <div className="schedule-kpis">
                      <div className="schedule-kpi">
                        <span>Date</span>
                        <strong>{calendarSelectedDateKey}</strong>
                      </div>
                      <div className="schedule-kpi">
                        <span>Booked</span>
                        <strong>
                          {calendarSelectedBookings.length} / {DAILY_CAPACITY}
                        </strong>
                      </div>
                      <div className="schedule-kpi">
                        <span>Available</span>
                        <strong>{Math.max(0, DAILY_CAPACITY - calendarSelectedBookings.length)}</strong>
                      </div>
                    </div>

                    {calendarSelectedBookings.length === 0 ? (
                      <div className="schedule-empty">No bookings for this date.</div>
                    ) : (
                      <div className="schedule-bookings">
                        {calendarSelectedBookings.map((a) => (
                          <div key={a.id} className="card schedule-booking-card">
                            <div className="schedule-booking-name">{patientNameFromId(a.patient_id)}</div>
                            <div className="schedule-booking-meta">
                              {a.appointment_type || "—"} • {fmtDateTime(a.scheduled_at)}
                            </div>
                            <div className="schedule-booking-status">
                              Status: <b>{formatWorkflowLabel(a.workflow_status || a.status)}</b>
                            </div>
                            <div className="schedule-booking-actions">
                              <button className="btn btn-secondary" onClick={() => openSlotForNoShow(a)}>
                                Open Slot (No‑show)
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          {/* Manual Notification */}
          <div className="card" style={{ marginTop: 12 }}>
            <h4 style={{ marginTop: 0 }}>Send Notification (Specific Patient)</h4>

            <div className="admin-form-grid">
              <input
                className="input"
                placeholder="Patient ID (uuid)"
                value={notifyPatientId}
                onChange={(e) => setNotifyPatientId(e.target.value)}
              />
              <input
                className="input"
                placeholder="Title"
                value={notifyTitle}
                onChange={(e) => setNotifyTitle(e.target.value)}
              />
            </div>

            <textarea
              className="input"
              placeholder="Body (optional)"
              value={notifyBody}
              onChange={(e) => setNotifyBody(e.target.value)}
              rows={3}
              style={{ width: "100%", marginTop: 10 }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <button className="btn btn-primary" onClick={sendManualNotification}>
                Send
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="admin-filter-bar">
            <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="inbox">Inbox (Pending only)</option>
              <option value="all">All (history)</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="awaiting_forms">Awaiting Forms</option>
              <option value="ready_for_triage">Ready for Screening</option>
              <option value="released">Released</option>
            </select>

            <input
              className="input"
              placeholder="Search (name, type, status, patient_id, date...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Table */}
          <div style={{ marginTop: 14, overflowX: "auto" }}>
            <table className="table admin-appointments-table">
              <thead>
                <tr>
                  <th>Patient Name</th>
                  <th>Type</th>
                  <th>Scheduled</th>
                  <th>Form Slip</th>
                  <th>Lab Tests</th>
                  <th>X-ray</th>
                  <th>Workflow</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredAppointments.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ opacity: 0.7 }}>
                      No appointments found.
                    </td>
                  </tr>
                ) : (
                  filteredAppointments.map((a) => {
                    const ws = toLower(a.workflow_status || a.status);
                    const req = requirementsMap[a.id];
                    const formDone = isFormDoneFromReq(req);
                    const formText = req ? (formDone ? "Done" : "Not yet") : "Checking...";
                    const canConfirmToday = ws === "approved" && formDone;
                    const labList = [
                      req?.exam_physical ? "Physical Exam" : null,
                      req?.exam_visual_acuity ? "Visual Acuity" : null,
                      req?.exam_height_weight ? "Height & Weight" : null,
                      req?.lab_cbc_platelet ? "CBC & Platelet" : null,
                      req?.lab_urinalysis ? "Urinalysis" : null,
                      req?.lab_fecalysis ? "Fecalysis" : null,
                      req?.lab_drug_test ? "Drug Test" : null,
                      req?.lab_hepatitis_b ? "Hep B" : null,
                      req?.lab_hepatitis_a ? "Hep A" : null,
                      req?.lab_ecg ? "ECG" : null,
                      req?.lab_audiometry ? "Audiometry" : null,
                      req?.lab_blood_typing ? "Blood Typing" : null,
                      req?.lab_pregnancy_test ? "Pregnancy Test" : null,
                      req?.lab_salmonella ? "Salmonella" : null,
                    ].filter(Boolean);
                    const customLab = Array.isArray(req?.lab_custom_items) ? req.lab_custom_items : [];
                    const xrayList = [req?.xray_chest ? "Chest X-ray" : null].filter(Boolean);
                    const customXray = Array.isArray(req?.xray_custom_items) ? req.xray_custom_items : [];
                    return (
                      <tr key={a.id}>
                        <td data-label="Patient Name">
                          <b>{patientNameFromId(a.patient_id)}</b>
                        </td>
                        <td data-label="Type">{a.appointment_type}</td>
                        <td data-label="Scheduled">{fmtDateTime(a.scheduled_at)}</td>
                        <td data-label="Form Slip">
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              fontSize: 12,
                              background: formDone ? "rgba(34,197,94,0.12)" : "rgba(234,179,8,0.12)",
                              border: `1px solid ${formDone ? "rgba(34,197,94,0.35)" : "rgba(234,179,8,0.35)"}`,
                              color: formDone ? "rgba(34,197,94,0.9)" : "rgba(234,179,8,0.9)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formText}
                          </span>
                        </td>
                        <td data-label="Lab Tests">
                          {(labList.length || customLab.length) ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {labList.map((item) => (
                                <span
                                  key={item}
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: 999,
                                    fontSize: 12,
                                    background: "rgba(15,23,42,0.06)",
                                    border: "1px solid rgba(15,23,42,0.12)",
                                  }}
                                >
                                  {item}
                                </span>
                              ))}
                              {customLab.map((item) => (
                                <span
                                  key={item.id || item.label}
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: 999,
                                    fontSize: 12,
                                    background: "rgba(13,180,170,0.10)",
                                    border: "1px solid rgba(13,180,170,0.28)",
                                  }}
                                >
                                  {item.label}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ opacity: 0.7 }}>—</span>
                          )}
                        </td>
                        <td data-label="X-ray">
                          {xrayList.length || customXray.length ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {xrayList.map((item) => (
                                <span
                                  key={item}
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: 999,
                                    fontSize: 12,
                                    background: "rgba(15,23,42,0.06)",
                                    border: "1px solid rgba(15,23,42,0.12)",
                                  }}
                                >
                                  {item}
                                </span>
                              ))}
                              {customXray.map((item) => (
                                <span
                                  key={item.id || item.label}
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: 999,
                                    fontSize: 12,
                                    background: "rgba(13,180,170,0.10)",
                                    border: "1px solid rgba(13,180,170,0.28)",
                                  }}
                                >
                                  {item.label}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ opacity: 0.7 }}>—</span>
                          )}
                        </td>
                        <td data-label="Workflow">
                          <b>{formatWorkflowLabel(ws)}</b>
                        </td>
                        <td data-label="Actions">
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              className="btn btn-primary"
                              onClick={() => confirmArrival(a)}
                              disabled={!canConfirmToday}
                              title={
                                canConfirmToday
                                  ? "Confirm patient for today and start medical process."
                                  : "Available only on the booking date after the Form Slip is completed."
                              }
                            >
                              Confirm Today
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
            </>
        )}

      {/* ===================== PATIENTS TAB ===================== */}
        {tab === "patients" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 10,
              alignItems: "start",
            }}
          >
            <div>
              <h4 style={{ margin: 0 }}>Patients Summary</h4>
              <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
                Pulled from <b>admin_patient_summary</b> (profile + latest appointment + latest vitals/labs/xray).
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button onClick={exportPatientsCSV} disabled={patientsLoading || filteredPatients.length === 0}>
                Export CSV
              </button>
            </div>
          </div>

          {/* Search */}
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "minmax(260px, 1fr) auto",
              gap: 10,
              alignItems: "center",
            }}
          >
            <input
              placeholder="Search patients (name, id, contact, address, status...)"
              value={patientsSearch}
              onChange={(e) => setPatientsSearch(e.target.value)}
              style={{ width: "100%" }}
            />
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Showing <b>{filteredPatients.length}</b> / {patients.length}
            </div>
          </div>

          {patientsMsg && <p style={{ marginTop: 10 }}>{patientsMsg}</p>}

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table className="table admin-patients-table">
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
                      No patient rows found.
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
                      <td data-label="Patient">
                        <b>{p.full_name || patientNameFromId(p.patient_id)}</b>
                        <div style={{ fontSize: 12, opacity: 0.7, fontFamily: "monospace" }}>{p.patient_id}</div>
                      </td>

                      <td data-label="Contact">
                        <div style={{ fontSize: 13 }}>{p.contact_no || "—"}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{p.address || "—"}</div>
                      </td>

                      <td data-label="Sex / Age">
                        <div style={{ fontSize: 13 }}>
                          {(p.gender || "—")} • {(p.age ?? "—")}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{p.civil_status || "—"}</div>
                      </td>

                      <td data-label="Latest Appointment">
                        <div style={{ fontSize: 13 }}>
                          <b>{p.appointment_type || "—"}</b> • {fmtDate(p.preferred_date)}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          Status: <b>{p.appointment_status || "—"}</b>
                        </div>
                      </td>

                      <td data-label="Vitals" style={{ fontSize: 13 }}>
                        {p.vitals_created_at || p.recorded_at ? (
                          <>
                            <div>
                              BP:{" "}
                              <b>
                                {p.systolic ?? "—"}/{p.diastolic ?? "—"}
                              </b>
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

                      <td data-label="Labs" style={{ fontSize: 13 }}>
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

                      <td data-label="X-ray" style={{ fontSize: 13 }}>
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

            <p style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
              Tip: Click a patient row to open the details drawer (full vitals/labs/x-ray fields from the summary view).
            </p>
          </div>
        </div>
        )}

      {/* ===================== COMPANIES TAB ===================== */}
        {tab === "companies" && (
      <>
        {!selectedCompany ? (
          <AdminCompanies onSelectCompany={(c) => setSelectedCompany(c)} />
        ) : (
          <AdminCompanyDetail
            company={selectedCompany}
            onBack={() => setSelectedCompany(null)}
          />
        )}
      </>
        )}


      {/* ===================== ADMIN TOOLS TAB ===================== */}
        {tab === "tools" && (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <h4 style={{ margin: 0 }}>Audit Trail (Latest 100)</h4>
            </div>

            <div style={{ marginTop: 10, overflowX: "auto" }}>
              <table className="table admin-audit-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Actor Role</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Patient Name</th>
                    <th>Patient</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ opacity: 0.7 }}>
                        No logs yet.
                      </td>
                    </tr>
                  ) : (
                    logs.map((x) => (
                      <tr key={x.id}>
                        <td data-label="Date">{fmtDateTime(x.created_at)}</td>
                        <td data-label="Actor Role">
                          <b>{x.actor_role}</b>
                        </td>
                        <td data-label="Action">{x.action}</td>
                        <td data-label="Entity">{x.entity_type}</td>
                        <td data-label="Patient Name">
                          <b>{x.patient_id ? patientNameFromId(x.patient_id) : "—"}</b>
                        </td>
                        <td data-label="Patient" style={{ fontFamily: "monospace", fontSize: 12 }}>
                          {x.patient_id || "—"}
                        </td>
                        <td data-label="Details" style={{ maxWidth: 380 }}>{renderDetails(x.details)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
        )}

          {tab === "users" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="card">
                <h4 style={{ marginTop: 0 }}>Staff Accounts</h4>
                <div className="admin-staff-form-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.6fr 0.6fr auto", gap: 10 }}>
                  <input
                    className="input"
                    placeholder="Full name"
                    value={staffForm.full_name}
                    onChange={(e) => setStaffForm((s) => ({ ...s, full_name: e.target.value }))}
                  />
                  <input
                    className="input"
                    placeholder="Email"
                    value={staffForm.email}
                    onChange={(e) => setStaffForm((s) => ({ ...s, email: e.target.value }))}
                  />
                  <select
                    className="input"
                    value={staffForm.role}
                    onChange={(e) => setStaffForm((s) => ({ ...s, role: e.target.value }))}
                  >
                    <option value="nurse">Nurse</option>
                    <option value="doctor">Doctor</option>
                    <option value="lab">Lab</option>
                    <option value="cashier">Cashier</option>
                    <option value="admin">Admin</option>
                  </select>
                  <select
                    className="input"
                    value={staffForm.status}
                    onChange={(e) => setStaffForm((s) => ({ ...s, status: e.target.value }))}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <button className="btn btn-primary" onClick={addStaff} type="button">
                    Add Staff
                  </button>
                </div>

                <div style={{ marginTop: 12, overflowX: "auto" }}>
                  <table className="table admin-staff-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {staffList.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ opacity: 0.7 }}>
                            No staff accounts yet.
                          </td>
                        </tr>
                      ) : (
                        staffList.map((s) => (
                          <tr key={s.id}>
                            <td data-label="Name">{s.full_name}</td>
                            <td data-label="Email">{s.email}</td>
                            <td data-label="Role">{s.role}</td>
                            <td data-label="Status">{s.status}</td>
                            <td data-label="Created">{fmtDateTime(s.created_at)}</td>
                            <td data-label="Action" style={{ textAlign: "right" }}>
                              <button className="btn" onClick={() => removeStaff(s.id)}>
                                Remove
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
          )}

          {tab === "settings" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="card">
                <h4 style={{ marginTop: 0 }}>Admin Settings</h4>
                <div style={{ marginBottom: 12 }}>
                  <div className="settings-label">Change Password</div>
                  <div className="admin-settings-password" style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) auto", gap: 10, marginTop: 6 }}>
                    <input
                      className="input"
                      type="password"
                      placeholder="New password (min 8 chars)"
                      value={adminNewPassword}
                      onChange={(e) => setAdminNewPassword(e.target.value)}
                      minLength={8}
                    />
                    <button className="btn btn-primary" onClick={changeAdminPassword} disabled={adminPwSaving}>
                      {adminPwSaving ? "Updating..." : "Update"}
                    </button>
                  </div>
                  {adminPwMsg && <div style={{ marginTop: 8, fontSize: 13 }}>{adminPwMsg}</div>}
                </div>
                <div className="admin-settings-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(200px, 1fr))", gap: 12 }}>
                  <label>
                    Clinic contact number
                    <input className="input" placeholder="e.g. (+63) 917-864-6762" />
                  </label>
                  <label>
                    Clinic contact email
                    <input className="input" placeholder="clinic@example.com" />
                  </label>
                  <label>
                    Clinic hours
                    <input className="input" placeholder="Mon–Sat • 7:00 AM – 3:00 PM" />
                  </label>
                  <label>
                    Clinic address
                    <input className="input" placeholder="Calamba City, Laguna" />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Report footer note
                    <input className="input" placeholder="e.g. Please bring a valid ID on your visit." />
                  </label>
                </div>
                <button className="btn btn-primary" style={{ marginTop: 12 }}>
                  Save Settings
                </button>
              </div>
            </div>
          )}
      </div>

      {/* ===================== APPROVE MODAL ===================== */}
      <Modal
        open={approveOpen}
        title="Approve Appointment"
        onClose={closeApproveModal}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" onClick={closeApproveModal}>
              Cancel
            </button>
            <button className="btn btn-approve" onClick={confirmApproveFromModal}>
              Approve
            </button>
          </div>
        }
      >
        {!approveAppt ? null : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
            {/* Left */}
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Appointment Details</div>

              <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.6 }}>
                <div>
                  Patient: <b>{patientNameFromId(approveAppt.patient_id)}</b>
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, fontFamily: "monospace" }}>{approveAppt.patient_id}</div>
                <div>
                  Type: <b>{approveAppt.appointment_type}</b>
                </div>
                <div>
                  Appointment Date: <b>{fmtDate(approveAppt.preferred_date)}</b>
                </div>
              </div>

              <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Assign Doctor</div>
                <select
                  value={assignedDoctorId}
                  onChange={(e) => setAssignedDoctorId(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">Select doctor…</option>
                  {(doctorList || []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {formatDoctorLabel(d)}
                    </option>
                  ))}
                </select>
                {doctorLoading ? <div style={{ fontSize: 12, opacity: 0.7 }}>Loading doctors…</div> : null}
                {assignedDoctorId ? (
                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                    Availability:{" "}
                    <b>
                      {doctorAvailability === "available"
                        ? "Available"
                        : doctorAvailability === "busy"
                        ? "Conflict at this time"
                        : "—"}
                    </b>
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  id="usepref"
                  type="checkbox"
                  checked={usePreferredDate}
                  onChange={(e) => setUsePreferredDate(e.target.checked)}
                />
                <label htmlFor="usepref" style={{ cursor: "pointer", fontSize: 13, opacity: 0.9 }}>
                  Use patient appointment date
                </label>
              </div>

              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Final Schedule Date</div>
                  <input
                    type="date"
                    value={approveDate}
                    onChange={(e) => setApproveDate(e.target.value)}
                    disabled={usePreferredDate}
                    style={{ width: "100%" }}
                    title={usePreferredDate ? "Turn off 'Use patient appointment date' to change date." : ""}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Final Schedule Time</div>
                  <input
                    type="time"
                    value={approveTime}
                    onChange={(e) => setApproveTime(e.target.value)}
                    min="07:00"
                    max="15:00"
                    step="1800"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
                Clinic hours: Monday–Saturday <b>7:00 AM – 3:00 PM</b>. Sunday is closed.
              </div>

              {availabilityMsg ? <div style={{ marginTop: 10, fontSize: 13 }}>{availabilityMsg}</div> : null}
              {availabilityLoading ? (
                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>Loading availability…</div>
              ) : null}
            </div>

            {/* Right */}
            <div style={{ display: "grid", gap: 12 }}>
              <AvailabilityCalendar
                monthCursor={monthCursor}
                onMonthChange={setMonthCursor}
                selectedDateKey={approveDate}
                onSelectDateKey={(key) => {
                  if (!usePreferredDate) setApproveDate(key);
                }}
                bookedMap={bookedMap}
              />

              <div className="card" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ fontWeight: 800 }}>
                    Availability for <span style={{ opacity: 0.85 }}>{approveDate || "—"}</span>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Booked times</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {selectedBookedTimes.length === 0 ? (
                        <span style={{ opacity: 0.7, fontSize: 13 }}>None</span>
                      ) : (
                        selectedBookedTimes.map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: 12,
                              padding: "4px 10px",
                              borderRadius: 999,
                              border: "1px solid rgba(148,163,184,0.25)",
                              background: "rgba(148,163,184,0.14)",
                            }}
                          >
                            {t}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Suggested available times</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 140, overflow: "auto" }}>
                      {suggestedFreeTimes.length === 0 ? (
                        <span style={{ opacity: 0.7, fontSize: 13 }}>No slots found</span>
                      ) : (
                        suggestedFreeTimes.slice(0, 20).map((t) => (
                          <button
                            key={t}
                            className="btn"
                            onClick={() => setApproveTime(t)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 999,
                              opacity: approveTime === t ? 1 : 0.85,
                            }}
                            title="Click to set time"
                          >
                            {t}
                          </button>
                        ))
                      )}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>Showing up to 20 suggestions.</div>
                  </div>
                </div>

                <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
                  Final schedule will be saved as <b>scheduled_at</b> and used by downstream steps.
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ===================== REJECT MODAL ===================== */}
      <Modal
        open={rejectOpen}
        title="Reject Appointment"
        onClose={closeRejectModal}
        width="min(560px, 96vw)"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button className="btn" onClick={closeRejectModal}>
              Cancel
            </button>
            <button className="btn btn-reject" onClick={confirmRejectFromModal}>
              Reject
            </button>
          </div>
        }
      >
        {!rejectAppt ? null : (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.6 }}>
              <div>
                Patient: <b>{patientNameFromId(rejectAppt.patient_id)}</b>
              </div>
              <div>
                Type: <b>{rejectAppt.appointment_type}</b> • Appointment Date: <b>{fmtDate(rejectAppt.preferred_date)}</b>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Reason</div>

              <select value={rejectPreset} onChange={(e) => setRejectPreset(e.target.value)} style={{ width: "100%" }}>
                <option>No available slot</option>
                <option>Clinic closed / Holiday</option>
                <option>Missing requirements / incomplete details</option>
                <option>Doctor unavailable</option>
                <option>Duplicate booking</option>
                <option>Other</option>
              </select>

              {rejectPreset === "Other" && (
                <textarea
                  rows={3}
                  value={rejectCustom}
                  onChange={(e) => setRejectCustom(e.target.value)}
                  placeholder="Type the reason..."
                  style={{ width: "100%" }}
                />
              )}

              {rejectError ? (
                <div style={{ marginTop: 6, fontSize: 13, color: "rgba(248,113,113,0.95)" }}>{rejectError}</div>
              ) : null}
            </div>
          </div>
        )}
      </Modal>

      {/* ===================== PATIENT DETAILS DRAWER ===================== */}
      <Drawer
        open={patientDrawerOpen}
        title={selectedPatient ? (selectedPatient.full_name || patientNameFromId(selectedPatient.patient_id)) : "Patient Details"}
        onClose={closePatientDrawer}
      >
        {!selectedPatient ? (
          <div style={{ opacity: 0.75 }}>No patient selected.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className="btn btn-approve"
                onClick={() => {
                  setEditPatientOpen(true);
                }}
              >
                Edit
              </button>

              <button className="btn btn-reject" onClick={() => deletePatient(selectedPatient)}>
                Delete
              </button>

              <button
                className="btn"
                onClick={() => {
                  quickFillPatientId(selectedPatient.patient_id);
                  navigate(appointmentsBasePath);
                  setMsg("Patient ID copied to notification form. You can send a clinic update.");
                }}
              >
                Notify
              </button>
            </div>

            <Section title="Identity">
              <Field label="Patient ID" value={selectedPatient.patient_id} mono />
              <Field label="Full Name" value={selectedPatient.full_name || patientNameFromId(selectedPatient.patient_id)} />
              <Field label="Contact No" value={selectedPatient.contact_no || "—"} />
              <Field label="Address" value={selectedPatient.address || "—"} />
              <Field label="Gender" value={selectedPatient.gender || "—"} />
              <Field label="Age" value={selectedPatient.age ?? "—"} />
              <Field label="Civil Status" value={selectedPatient.civil_status || "—"} />
            </Section>

            <Section title="Latest Appointment">
              <Field label="Type" value={selectedPatient.appointment_type || "—"} />
              <Field label="Appointment Date" value={fmtDate(selectedPatient.preferred_date)} />
              <Field label="Status" value={selectedPatient.appointment_status || "—"} />
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
              {/* Add more lab fields if your view provides them */}
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
              {/* Add more xray fields if your view provides them */}
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

            <div style={{ marginTop: 14, fontSize: 12, opacity: 0.7 }}>
              This drawer shows summary fields plus full history from vitals, labs, and x-ray tables.
            </div>
          </>
        )}
      </Drawer>

      {/* ===================== EDIT PATIENT MODAL ===================== */}
      <PatientEditModal
        open={editPatientOpen}
        onClose={() => setEditPatientOpen(false)}
        patientRow={selectedPatient}
        onSave={async () => {
          await loadPatients();
          // refresh selection to updated row
          const updated = (patients || []).find((x) => x.patient_id === selectedPatient?.patient_id);
          if (updated) setSelectedPatient(updated);
        }}
      />
    </div>
  );
}
