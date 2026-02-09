// src/pages/PatientSignupProfile.jsx
import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { normalizeCompanyName } from "../utils/companyPartners";
import sgHealthtrackLogo from "../image/sghealthtrack-logo.png";
import clinicHero from "../image/clinic.jpg";

const STAFF_DOMAIN = "@smartguys.com";
const EMAIL_EXISTS_CODES = new Set([
  "email_exists",
  "user_already_exists",
  "identity_already_exists",
  "email_conflict_identity_not_deletable",
]);
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

export default function PatientSignupProfile({ onDone, onGoLogin }) {
  // auth
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // patient info
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [civilStatus, setCivilStatus] = useState("");
  const [address, setAddress] = useState("");
  const [contactNo, setContactNo] = useState("");

  // ui
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [showResend, setShowResend] = useState(false);
  const isSuccessMsg = msg && /successful|resent|account created|redirecting/i.test(msg);

  const age = useMemo(() => calcAge(birthDate), [birthDate]);

  function validate() {
    const e = email.trim().toLowerCase();
    if (!e) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Please enter a valid email address.";
    if (!password) return "Password is required.";
    const passError = validatePassword(password);
    if (passError) return passError;
    if (e.endsWith(STAFF_DOMAIN)) return `Staff accounts (${STAFF_DOMAIN}) are created by the admin only.`;

    if (!firstName.trim()) return "First name is required.";
    if (!lastName.trim()) return "Last name is required.";
    if (!gender) return "Gender is required.";
    if (!birthDate) return "Birth date is required.";
    if (age === "" || age < MIN_AGE || age > MAX_AGE) return "Birth date is invalid.";
    if (!civilStatus) return "Civil status is required.";
    if (!address.trim()) return "Address is required.";
    if (!contactNo.trim()) return "Contact no. is required.";
    if (!isValidContact(contactNo)) return "Contact no. must be a valid PH number (09XXXXXXXXX or +63XXXXXXXXXX).";

    return null;
  }

  async function handleSignup(e) {
    e.preventDefault();
    setMsg("");
    setShowResend(false);

    const v = validate();
    if (v) return setMsg(v);

    const emailLower = email.trim().toLowerCase();
    setLoading(true);

    const fullName = [firstName, middleName, lastName]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");
    const meta = {
      role: "patient",
      full_name: fullName,
      company: normalizeCompanyName(company),
      gender,
      birth_date: birthDate,
      age: typeof age === "number" ? age : null,
      civil_status: civilStatus,
      address: address.trim(),
      contact_no: cleanContact(contactNo),
    };

    const redirectTo = `${window.location.origin}/auth/callback`;

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: emailLower,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: meta,
      },
    });

    if (signUpErr) {
      setLoading(false);
      // Log once in dev so we can map exact error codes if needed.
      // eslint-disable-next-line no-console
      console.error("Supabase signup error:", signUpErr);
      const code = signUpErr?.code;
      if (code && EMAIL_EXISTS_CODES.has(code)) {
        return setMsg("Email already exists. Please log in or use a different email.");
      }
      return setMsg(signUpErr.message);
    }

    // Supabase can return a user with empty identities when the email already exists
    // (prevents email enumeration). Treat that as "already exists".
    const identities = signUpData?.user?.identities;
    if (Array.isArray(identities) && identities.length === 0) {
      setLoading(false);
      return setMsg("Email already exists. Please log in or use a different email.");
    }

    const hasSessionNow = !!signUpData?.session;
    setLoading(false);

    if (hasSessionNow) {
      // If email confirmation is OFF, create profile immediately.
      const userId = signUpData?.user?.id;
      const profilePayload = {
        id: userId,
        role: "patient",
        email: emailLower,
        full_name: meta.full_name,
        company: meta.company,
        gender: meta.gender,
        birth_date: meta.birth_date,
        age: meta.age,
        civil_status: meta.civil_status,
        address: meta.address,
        contact_no: meta.contact_no,
        updated_at: new Date().toISOString(),
      };
      // Ignore failure here; the callback page will retry after confirmation.
      await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" });

      setMsg("Signup successful! Redirecting…");
      onDone?.();
      return;
    }

    setShowResend(true);
    setMsg(
      "Account created!\n\n" +
        "Please confirm your email to activate your account.\n\n" +
        "1) Check Inbox / Spam / Promotions\n" +
        "2) Click the confirmation link\n" +
        "3) Then login\n\n" +
        "If you didn’t receive the email, click “Resend Confirmation Email”."
    );
  }

  async function resendConfirmation() {
    setMsg("");
    const emailLower = email.trim().toLowerCase();
    if (!emailLower) return setMsg("Please enter your email first.");

    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: emailLower,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);

    if (error) return setMsg("Failed to resend confirmation email: " + error.message);

    setMsg(
      "Confirmation email resent!\n\n" +
        "Please check Inbox / Spam / Promotions. After confirming, return to login."
    );
  }

  return (
    <div className="auth-split">
      <div className="auth-panel auth-panel-left">
        <div className="auth-logo-row">
          <div className="auth-logo-badge">
            <img src={sgHealthtrackLogo} alt="SG HealthTrack" />
          </div>
          <div>
            <div className="auth-panel-title">Create account</div>
            <div className="auth-panel-subtitle">Fill in your details to start booking</div>
          </div>
        </div>

        <div className="auth-tabs">
          <button className="auth-tab" type="button" onClick={() => (onGoLogin ?? onDone)?.()}>
            Login
          </button>
          <button className="auth-tab active" type="button">
            Sign up
          </button>
        </div>

        <form onSubmit={handleSignup} className="auth-form-block auth-form-stack">
          <div className="auth-grid-2">
            <div>
              <label className="auth-label">Email</label>
              <input
                className="auth-input"
                placeholder="you@gmail.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="auth-label">Password</label>
              <input
                className="auth-input"
                placeholder="••••••••"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="auth-footnote">
            Staff accounts ({STAFF_DOMAIN}) are created by the clinic admin only.
          </div>

          <div className="auth-grid-3">
            <div>
              <label className="auth-label">First name</label>
              <input
                className="auth-input"
                placeholder="Juan"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <label className="auth-label">Middle name (optional)</label>
              <input
                className="auth-input"
                placeholder="Santos"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
              />
            </div>
            <div>
              <label className="auth-label">Last name</label>
              <input
                className="auth-input"
                placeholder="Dela Cruz"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="auth-grid-2">
            <div>
              <label className="auth-label">Company (optional)</label>
              <input
                className="auth-input"
                placeholder="Company name"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div>
              <label className="auth-label">Contact no.</label>
              <input
                className="auth-input"
                placeholder="09XXXXXXXXX"
                value={contactNo}
                onChange={(e) => setContactNo(cleanContact(e.target.value))}
                inputMode="numeric"
                maxLength={13}
                type="tel"
              />
            </div>
            <div>
              <label className="auth-label">Gender</label>
              <select className="auth-input" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
            <div>
              <label className="auth-label">Birth date</label>
              <input
                className="auth-input"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            <div>
              <label className="auth-label">Age</label>
              <input className="auth-input" value={age === "" ? "" : String(age)} readOnly />
              <div className="auth-hint">Auto-calculated</div>
            </div>
            <div>
              <label className="auth-label">Civil status</label>
              <select className="auth-input" value={civilStatus} onChange={(e) => setCivilStatus(e.target.value)}>
                <option value="">Select</option>
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="widowed">Widowed</option>
                <option value="separated">Separated</option>
              </select>
            </div>
          </div>

          <div>
            <label className="auth-label">Address</label>
            <input
              className="auth-input"
              placeholder="Complete address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="auth-form-actions">
            <button className="auth-primary-btn" type="submit" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </button>
            <button className="auth-outline-btn" type="button" onClick={() => (onGoLogin ?? onDone)?.()}>
              Back to Login
            </button>
          </div>

          {msg && (
            <div className={`auth-msg ${isSuccessMsg ? "auth-msg-success" : "auth-msg-error"}`} style={{ whiteSpace: "pre-wrap" }}>
              {msg}
            </div>
          )}

          {showResend && (
            <button className="auth-link" type="button" onClick={resendConfirmation}>
              Resend Confirmation Email
            </button>
          )}
        </form>
      </div>

      <div className="auth-panel auth-panel-right">
        <img src={clinicHero} alt="Clinic interior" />
        <div className="auth-hero-overlay">
          <h2>Streamlined Healthcare Management</h2>
          <p>
            Access patient records, manage appointments, and track diagnostic results securely in one place.
          </p>
          <div className="auth-hero-tags">
            <span>24/7 System Access</span>
            <span>Secure Records</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const grid2 = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const grid3 = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  marginTop: 12,
};
