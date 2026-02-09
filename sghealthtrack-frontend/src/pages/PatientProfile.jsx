// src/dashboards/PatientProfile.jsx (or wherever this component lives)
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { normalizeCompanyName } from "../utils/companyPartners";

function calcAge(birthDateStr) {
  if (!birthDateStr) return "";
  const birth = new Date(birthDateStr);
  if (Number.isNaN(birth.getTime())) return "";
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age < 0 ? "" : age;
}

function clean(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return s || "";
}
function cleanOrNull(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}
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

// When user signed up but email confirmation was ON, we stored these in auth metadata.
// This reads them and uses them to auto-fill + auto-save a profiles row on first login.
function getMeta(session) {
  const u = session?.user;
  const m = u?.user_metadata || {};
  return {
    email: (u?.email || "").toLowerCase(),
    role: m.role || "patient",
    full_name: m.full_name || "",
    company: m.company ?? "",
    gender: m.gender || "",
    birth_date: m.birth_date || "",
    civil_status: m.civil_status || "",
    address: m.address || "",
    contact_no: m.contact_no || "",
    age: typeof m.age === "number" ? m.age : null,
  };
}

export default function PatientProfile({ session, onProfileUpdated }) {
  const userId = session?.user?.id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // form fields
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [civilStatus, setCivilStatus] = useState("");
  const [address, setAddress] = useState("");
  const [contactNo, setContactNo] = useState("");

  const age = useMemo(() => calcAge(birthDate), [birthDate]);

  async function ensureProfileFromMetadataIfMissing() {
    if (!userId) return;

    const meta = getMeta(session);

    // Only try auto-create if there is meaningful metadata to use
    const hasAny =
      clean(meta.full_name) ||
      clean(meta.gender) ||
      clean(meta.birth_date) ||
      clean(meta.civil_status) ||
      clean(meta.address) ||
      clean(meta.contact_no) ||
      clean(meta.company);

    if (!hasAny) return;

    // Upsert is safe: if row exists it updates missing columns too.
    // This fixes the “after signup, profile is empty” problem.
    const payload = {
      id: userId,
      role: "patient",
      email: meta.email || null,

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

    // If RLS allows patient to upsert own profile (typical), this will work.
    // If it fails, we silently ignore and just load existing data.
    await supabase.from("profiles").upsert(payload, { onConflict: "id" });
  }

  async function loadProfile() {
    if (!userId) return;
    setLoading(true);
    setMsg("");

    // 1) Try to load profile from DB
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, role, full_name, company, gender, birth_date, age, civil_status, address, contact_no"
      )
      .eq("id", userId)
      .maybeSingle();

    // If table/policy temporarily fails, still try metadata fill for UI
    if (error) {
      // Fallback: fill UI from metadata so it’s not blank
      const meta = getMeta(session);
      setFullName(meta.full_name || "");
      setCompany(meta.company || "");
      setGender(meta.gender || "");
      setBirthDate(meta.birth_date || "");
      setCivilStatus(meta.civil_status || "");
      setAddress(meta.address || "");
      setContactNo(meta.contact_no || "");
      setLoading(false);
      setMsg(`Failed to load profile: ${error.message}`);
      return;
    }

    // 2) If profile row is missing OR mostly empty, auto-create/update from metadata
    const p = data || null;

    const isMissing = !p;
    const isMostlyEmpty =
      p &&
      !clean(p.full_name) &&
      !clean(p.gender) &&
      !clean(p.birth_date) &&
      !clean(p.civil_status) &&
      !clean(p.address) &&
      !clean(p.contact_no) &&
      !clean(p.company);

    if (isMissing || isMostlyEmpty) {
      await ensureProfileFromMetadataIfMissing();

      // re-read after upsert
      const reread = await supabase
        .from("profiles")
        .select(
          "id, role, full_name, company, gender, birth_date, age, civil_status, address, contact_no"
        )
        .eq("id", userId)
        .maybeSingle();

      if (!reread.error) {
        const pr = reread.data || {};
        setFullName(pr.full_name || "");
        setCompany(pr.company || "");
        setGender(pr.gender || "");
        setBirthDate(pr.birth_date || "");
        setCivilStatus(pr.civil_status || "");
        setAddress(pr.address || "");
        setContactNo(pr.contact_no || "");
        setLoading(false);

        // Let header/sidebar update immediately (name instead of email)
        onProfileUpdated?.({
          full_name: pr.full_name || "",
        });

        return;
      }
    }

    // Normal: load from profiles row
    const pr = p || {};
    setFullName(pr.full_name || "");
    setCompany(pr.company || "");
    setGender(pr.gender || "");
    setBirthDate(pr.birth_date || "");
    setCivilStatus(pr.civil_status || "");
    setAddress(pr.address || "");
    setContactNo(pr.contact_no || "");

    setLoading(false);

    // Update header/sidebar name immediately if available
    if (clean(pr.full_name)) {
      onProfileUpdated?.({ full_name: pr.full_name });
    }
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function saveProfile() {
    if (!userId) return;

    setMsg("");
    if (!fullName.trim()) return setMsg("Full name is required.");
    if (!gender) return setMsg("Gender is required.");
    if (!birthDate) return setMsg("Birth date is required.");
    if (age === "" || age < MIN_AGE || age > MAX_AGE) return setMsg("Birth date is invalid.");
    if (!civilStatus) return setMsg("Civil status is required.");
    if (!address.trim()) return setMsg("Address is required.");
    if (!contactNo.trim()) return setMsg("Contact no. is required.");
    if (!isValidContact(contactNo)) {
      return setMsg("Contact no. must be a valid PH number (09XXXXXXXXX or +63XXXXXXXXXX).");
    }

    setSaving(true);

    const payload = {
      id: userId,
      role: "patient",
      full_name: fullName.trim(),
      company: normalizeCompanyName(company),
      gender,
      birth_date: birthDate,
      age: typeof age === "number" ? age : null,
      civil_status: civilStatus,
      address: address.trim(),
      contact_no: cleanContact(contactNo),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });

    if (error) {
      setSaving(false);
      setMsg(`Failed to save profile: ${error.message}`);
      return;
    }

    setSaving(false);
    setMsg("Profile updated!");
    onProfileUpdated?.(payload);
  }

  return (
    <div className="card profile-shell">
      <div className="profile-header">
        <div>
          <h4 style={{ margin: 0 }}>My Profile</h4>
          <div className="profile-subtitle">Update your personal details.</div>
        </div>
        <button className="btn btn-primary" onClick={saveProfile} disabled={saving || loading}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {msg && <p style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{msg}</p>}
      {loading && <p style={{ opacity: 0.75 }}>Loading...</p>}

      <div className="card profile-card">
        <b>Patient Information</b>

        <div className="profile-form-grid">
          <div className="profile-span-2">
            <label className="label">Full Name</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div>
            <label className="label">Company</label>
            <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>

          <div>
            <label className="label">Gender</label>
            <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Select…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </div>

          <div>
            <label className="label">Birth Date</label>
            <input className="input" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>

          <div>
            <label className="label">Age</label>
            <input className="input" readOnly value={age === "" ? "" : String(age)} />
          </div>

          <div>
            <label className="label">Civil Status</label>
            <select className="input" value={civilStatus} onChange={(e) => setCivilStatus(e.target.value)}>
              <option value="">Select…</option>
              <option value="single">Single</option>
              <option value="married">Married</option>
              <option value="widowed">Widowed</option>
              <option value="separated">Separated</option>
            </select>
          </div>

          <div className="profile-span-2">
            <label className="label">Address</label>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div>
            <label className="label">Contact No.</label>
            <input
              className="input"
              value={contactNo}
              onChange={(e) => setContactNo(cleanContact(e.target.value))}
              inputMode="numeric"
              maxLength={13}
              type="tel"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
