// src/pages/PatientSignupProfile.jsx
import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { normalizeCompanyName } from "../utils/companyPartners";

const STAFF_DOMAIN = "@smartguys.com";
const EMAIL_EXISTS_CODES = new Set([
  "email_exists",
  "user_already_exists",
  "identity_already_exists",
  "email_conflict_identity_not_deletable",
]);

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
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (e.endsWith(STAFF_DOMAIN)) return `Staff accounts (${STAFF_DOMAIN}) are created by the admin only.`;

    if (!firstName.trim()) return "First name is required.";
    if (!lastName.trim()) return "Last name is required.";
    if (!gender) return "Gender is required.";
    if (!birthDate) return "Birth date is required.";
    if (age === "" || age < 0) return "Birth date is invalid.";
    if (!civilStatus) return "Civil status is required.";
    if (!address.trim()) return "Address is required.";
    if (!contactNo.trim()) return "Contact no. is required.";

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

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const meta = {
      role: "patient",
      full_name: fullName,
      company: normalizeCompanyName(company),
      gender,
      birth_date: birthDate,
      age: typeof age === "number" ? age : null,
      civil_status: civilStatus,
      address: address.trim(),
      contact_no: contactNo.trim(),
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
    <div className="auth-site">
      <div className="auth-topbar">
        <div className="auth-topbar-item">Landline: (+63) 7368-5241</div>
        <div className="auth-topbar-item">Globe: (+63) 917-864-6762</div>
        <div className="auth-topbar-item">Smart: (+63) 962-067-3669</div>
        <div className="auth-topbar-item">Clinic Hours: Mon–Sat, 7:00 AM – 3:00 PM</div>
      </div>

      <header className="auth-header">
        <div className="auth-container auth-header-inner">
          <div className="auth-nav-brand">
            <img className="auth-nav-logo" src="/src/image/sghealthtrack-logo.png" alt="SG HealthTrack" />
            <div>
              <div className="auth-nav-title">SG HealthTrack</div>
              <div className="auth-nav-subtitle">Diagnostic & Preventive Care</div>
            </div>
          </div>
          <nav className="auth-nav-links">
            <span className="auth-nav-link">About</span>
            <span className="auth-nav-link">Packages</span>
            <span className="auth-nav-link">Specialized Care</span>
            <span className="auth-nav-link">Promos</span>
            <span className="auth-nav-link">Blog</span>
          </nav>
          <button className="auth-cta-pill" type="button" onClick={() => (onGoLogin ?? onDone)?.()}>
            Already have an account?
          </button>
        </div>
      </header>

      <section className="auth-hero">
        <div className="auth-container auth-hero-inner">
          <div className="auth-hero-content">
            <div className="auth-hero-brand">SG HealthTrack</div>
            <h1 className="auth-hero-title">Create your account, and let care run smoothly.</h1>
            <p className="auth-hero-subtitle">
              Book fast, get confirmed, and track your lab and X‑ray progress in one place.
            </p>
            <div className="auth-hero-actions">
              <button className="auth-hero-btn" type="button" onClick={() => (onGoLogin ?? onDone)?.()}>
                Go to Login
              </button>
              <a className="auth-hero-btn ghost" href="#packages">
                View Packages
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-section">
        <div className="auth-container">
          <div className="auth-section-title">
            Create your account to start booking
          </div>
          <div className="auth-section-card">
            <div className="auth-card auth-card--wide auth-card--flat">
          <div className="auth-brand">
            <img className="auth-logo" src="/src/image/sghealthtrack-logo.png" alt="SG HealthTrack" />
            <div>
              <div className="auth-title">SG HealthTrack</div>
              <div className="auth-subtitle">Clinic Management System</div>
            </div>
          </div>

          <h2 className="auth-heading">Create Patient Account</h2>
          <p className="auth-help">
            Create your account and fill out patient information for organized records.
          </p>

          <form onSubmit={handleSignup} className="auth-form">
          {/* Top (email/password) */}
          <div style={grid2}>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                placeholder="you@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                className="input"
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="auth-footnote" style={{ marginTop: 10 }}>
            Staff accounts ({STAFF_DOMAIN}) are created by the clinic admin only.
          </div>

          <div style={{ height: 10 }} />

          {/* Patient info */}
          <div style={grid2}>
            <div>
              <label className="label">First name</label>
              <input
                className="input"
                placeholder="Juan"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Last name</label>
              <input
                className="input"
                placeholder="Dela Cruz"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Company (optional)</label>
              <input
                className="input"
                placeholder="Company name"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Contact no.</label>
              <input
                className="input"
                placeholder="09XXXXXXXXX"
                value={contactNo}
                onChange={(e) => setContactNo(e.target.value)}
              />
            </div>
          </div>

          <div style={grid3}>
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
              <label className="label">Birth date</label>
              <input
                className="input"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Age</label>
              <input className="input" value={age === "" ? "" : String(age)} readOnly />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Auto-calculated</div>
            </div>
          </div>

          <div style={grid2}>
            <div>
              <label className="label">Civil status</label>
              <select
                className="input"
                value={civilStatus}
                onChange={(e) => setCivilStatus(e.target.value)}
              >
                <option value="">Select</option>
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="widowed">Widowed</option>
                <option value="separated">Separated</option>
              </select>
            </div>
            <div>
              <label className="label">Address</label>
              <input
                className="input"
                placeholder="Complete address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          {msg && (
            <div
              className={`auth-msg ${isSuccessMsg ? "auth-msg-success" : "auth-msg-error"}`}
              style={{ whiteSpace: "pre-wrap" }}
            >
              {msg}
            </div>
          )}

          <button
            className="auth-btn-primary"
            type="submit"
            disabled={loading}
            style={{ marginTop: 12 }}
          >
            {loading ? "Creating account..." : "Create Patient Account"}
          </button>

          <button
            className="auth-link"
            type="button"
            onClick={() => (onGoLogin ?? onDone)?.()}
            disabled={loading}
            style={{ margin: "10px auto 0", display: "block", textAlign: "center" }}
          >
            Already have an account? Login
          </button>

          {showResend && (
            <button
              className="auth-btn-ghost"
              type="button"
              onClick={resendConfirmation}
              disabled={loading}
              style={{ marginTop: 10 }}
            >
              Resend Confirmation Email
            </button>
          )}

          </form>
        </div>
      </div>
    </div>
  </section>

      <section className="auth-section">
        <div className="auth-container" id="about">
          <div className="auth-section-title">About the clinic</div>
          <div className="auth-about-grid">
            <div className="auth-about-card">
              <div className="auth-about-title">Trusted screening partner</div>
              <div className="auth-about-text">
                We support pre‑employment and annual medical requirements with a streamlined, patient‑first
                process.
              </div>
            </div>
            <div className="auth-about-card">
              <div className="auth-about-title">Fast confirmations</div>
              <div className="auth-about-text">
                Book online and receive schedule updates from the clinic team without the back‑and‑forth.
              </div>
            </div>
            <div className="auth-about-card">
              <div className="auth-about-title">Secure records</div>
              <div className="auth-about-text">
                View lab progress and download your medical report once released.
              </div>
            </div>
            <div className="auth-about-card">
              <div className="auth-about-title">Complete screening flow</div>
              <div className="auth-about-text">
                Physical exam, lab tests, and X‑ray tracking built into one patient experience.
              </div>
            </div>
            <div className="auth-about-card">
              <div className="auth-about-title">Clinic‑verified updates</div>
              <div className="auth-about-text">
                Receive status changes as your results move through the workflow.
              </div>
            </div>
            <div className="auth-about-card">
              <div className="auth-about-title">Patient‑first support</div>
              <div className="auth-about-text">
                Clear reminders and a simple booking flow that reduces waiting time.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-section alt" id="packages">
        <div className="auth-container">
          <div className="auth-section-title">Featured packages</div>
          <div className="auth-packages">
            <div className="auth-package-card">
              <div className="auth-package-title">Pre-employment Basic</div>
              <div className="auth-package-text">Physical Exam • Visual Acuity • Height & Weight</div>
              <div className="auth-package-chip">CBC & Platelet</div>
              <div className="auth-package-chip">Urinalysis</div>
            </div>
            <div className="auth-package-card">
              <div className="auth-package-title">Pre-employment Plus</div>
              <div className="auth-package-text">CBC & Platelet • Urinalysis • Fecalysis</div>
              <div className="auth-package-chip">Drug Test</div>
              <div className="auth-package-chip">Hep B</div>
            </div>
            <div className="auth-package-card">
              <div className="auth-package-title">Executive Screening</div>
              <div className="auth-package-text">Physical Exam • ECG • Chest X-ray</div>
              <div className="auth-package-chip">Blood Typing</div>
              <div className="auth-package-chip">Audiometry</div>
            </div>
          </div>
        </div>
      </section>

      <footer className="auth-footer">
        <div className="auth-container auth-footer-grid">
          <div className="auth-footer-col">
            <div className="auth-footer-title">Clinic Hours</div>
            <div className="auth-footer-text">Monday – Saturday</div>
            <div className="auth-footer-text">7:00 AM – 3:00 PM</div>
          </div>
          <div className="auth-footer-col">
            <div className="auth-footer-title">Patient Care Lines</div>
            <div className="auth-footer-text">(+63) 917-864-6762</div>
            <div className="auth-footer-text">(+63) 962-067-3669</div>
          </div>
          <div className="auth-footer-col">
            <div className="auth-footer-title">Clinic Address</div>
            <div className="auth-footer-text">Calamba City, Laguna</div>
            <div className="auth-footer-text">Philippines</div>
          </div>
        </div>
      </footer>
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
