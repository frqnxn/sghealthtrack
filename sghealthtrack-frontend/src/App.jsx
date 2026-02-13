import { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import sgHealthtrackLogo from "./image/sghealthtrack-logo.png";
import clinicHero from "./image/clinic.jpg";

import DashboardLayout from "./layouts/DashboardLayout";
import DashboardRoot from "./pages/DashboardRoot";
import PatientPage from "./pages/PatientPage";
import AdminPage from "./pages/AdminPage";
import ReceptionistPage from "./pages/ReceptionistPage";
import CashierPage from "./pages/CashierPage";
import LabPage from "./pages/LabPage";
import PatientSignupProfile from "./pages/PatientSignupProfile";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import LandingPage from "./pages/LandingPage";

import "./styles/clinic.css";

const STAFF_DOMAIN = "@smartguys.com";

function LoginPage({
  staffDomain = STAFF_DOMAIN,
  onLogin,
  onVerifyOtp,
  onResendOtp,
  onGoSignup,
  onForgotPassword,
  msg,
  otpActive,
  otpEmail,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [showConfirmed, setShowConfirmed] = useState(false);
  const isSuccessMsg = msg && /successful|sent|redirecting|logged in/i.test(msg);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setShowConfirmed(params.get("confirmed") === "1");
  }, [location.search]);

  function handleSubmit(e) {
    e.preventDefault();
    if (otpActive) {
      onVerifyOtp?.({ email: otpEmail || email, code: otpCode });
      return;
    }
    onLogin?.({ email, password });
  }

  function dismissConfirmed() {
    setShowConfirmed(false);
    navigate("/login", { replace: true });
  }

  return (
    <div className="auth-split">
      {showConfirmed && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 420, textAlign: "center" }}>
            <div className="auth-brand" style={{ justifyContent: "center" }}>
              <img className="auth-logo" src={sgHealthtrackLogo} alt="SG HealthTrack" />
              <div>
                <div className="auth-title">SG HealthTrack</div>
                <div className="auth-subtitle">Medical Screening</div>
              </div>
            </div>
            <h2 className="auth-heading" style={{ marginTop: 8 }}>
              Email confirmed!
            </h2>
            <p className="auth-help" style={{ marginBottom: 16 }}>
              You can now log in using your new account.
            </p>
            <button className="btn btn-primary" onClick={dismissConfirmed}>
              Continue to login
            </button>
          </div>
        </div>
      )}
      <div className="auth-panel auth-panel-left">
        <div className="auth-logo-row">
          <div className="auth-logo-badge">
            <img src={sgHealthtrackLogo} alt="SG HealthTrack" />
          </div>
          <div>
            <div className="auth-panel-title">Welcome back</div>
            <div className="auth-panel-subtitle">Enter your credentials to access the portal</div>
          </div>
        </div>

        <div className="auth-tabs">
          <button className="auth-tab active" type="button">Login</button>
          <button className="auth-tab" type="button" onClick={onGoSignup}>Sign up</button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form-block">
          <label className="auth-label">Email</label>
          <input
            className="auth-input"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={otpActive}
          />

          <label className="auth-label">Password</label>
          <input
            className="auth-input"
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={otpActive}
          />

          {otpActive && (
            <>
              <label className="auth-label">Email verification code</label>
              <input
                className="auth-input"
                placeholder="Enter 6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </>
          )}

          <button className="auth-primary-btn" type="submit">
            {otpActive ? "Verify Code →" : "Sign In →"}
          </button>

          {msg && <div className={`auth-msg ${isSuccessMsg ? "auth-msg-success" : "auth-msg-error"}`}>{msg}</div>}

          {otpActive && (
            <button
              className="auth-link"
              type="button"
              onClick={() => onResendOtp?.(otpEmail || email)}
            >
              Resend verification code
            </button>
          )}

          <button className="auth-link" type="button" onClick={() => onForgotPassword?.(email)}>
            Forgot password?
          </button>
          <div className="auth-footnote">
            Staff accounts ({staffDomain}) are created by the clinic admin only.
          </div>
          <a className="auth-back" href="/">Back to Home</a>
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

export default function App() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [loadingRole, setLoadingRole] = useState(false);
  const [msg, setMsg] = useState("");
  const [otpState, setOtpState] = useState({ active: false, email: "" });
  const authHoldRef = useRef(false);
  const API_BASE = import.meta.env.VITE_API_URL || "";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, sess) => {
      if (authHoldRef.current && (event === "SIGNED_IN" || event === "SIGNED_OUT")) return;
      setSession(sess);
      setRole(null);
      setMsg("");
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function loadRole() {
      if (!session?.user?.id) return;
      setLoadingRole(true);
      setMsg("");
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        // fallback to backend role resolver (service client)
        try {
          const token = session?.access_token;
          if (token) {
            const resp = await fetch(`${API_BASE}/api/auth/role`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await resp.json();
            if (resp.ok && payload?.role) {
              setRole(payload.role);
              setLoadingRole(false);
              return;
            }
          }
        } catch {
          // ignore and continue with local fallback
        }
        setMsg(`Failed to load role: ${error.message}`);
        setRole(null);
        setLoadingRole(false);
        return;
      }
      const email = (session.user.email || "").trim().toLowerCase();
      const isStaffEmail = email.endsWith(STAFF_DOMAIN);

      if (!data) {
        if (isStaffEmail) {
          // Fallback: try lookup by email in case profile id mismatch
          const byEmail = await supabase
            .from("profiles")
            .select("role")
            .eq("email", email)
            .maybeSingle();
          if (!byEmail.error && byEmail.data?.role) {
            setRole(byEmail.data.role);
            setLoadingRole(false);
            return;
          }

          // Last-resort: backend role resolver (service client)
          try {
            const token = session?.access_token;
            if (token) {
              const resp = await fetch(`${API_BASE}/api/auth/role`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              const payload = await resp.json();
              if (resp.ok && payload?.role) {
                setRole(payload.role);
                setLoadingRole(false);
                return;
              }
            }
          } catch {
            // ignore and continue
          }

          setMsg("No staff profile found. Ask the admin to assign your role in profiles.");
          setRole(null);
        } else {
          setRole("patient");
        }
        setLoadingRole(false);
        return;
      }

      if (isStaffEmail && String(data.role || "").toLowerCase() === "patient") {
        // Fallback: try lookup by email if role was downgraded
        const byEmail = await supabase
          .from("profiles")
          .select("role")
          .eq("email", email)
          .maybeSingle();
        if (!byEmail.error && byEmail.data?.role && byEmail.data.role !== "patient") {
          setRole(byEmail.data.role);
          setLoadingRole(false);
          return;
        }
        try {
          const token = session?.access_token;
          if (token) {
            const resp = await fetch(`${API_BASE}/api/auth/role`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await resp.json();
            if (resp.ok && payload?.role && payload.role !== "patient") {
              setRole(payload.role);
              setLoadingRole(false);
              return;
            }
          }
        } catch {
          // ignore and continue
        }
        setMsg("Staff account misconfigured (role=patient). Please update profiles.role.");
        setRole(null);
        setLoadingRole(false);
        return;
      }

      setRole(data.role);
      setLoadingRole(false);
    }
    loadRole();
  }, [session]);

  async function signIn({ email, password }) {
    setMsg("");
    setOtpState({ active: false, email: "" });
    const emailLower = String(email || "").trim().toLowerCase();
    if (!emailLower) return setMsg("Email is required.");
    if (!password) return setMsg("Password is required.");
    authHoldRef.current = true;
    const { error } = await supabase.auth.signInWithPassword({
      email: emailLower,
      password,
    });
    if (error) {
      authHoldRef.current = false;
      return setMsg(error.message);
    }

    await supabase.auth.signOut();

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: emailLower,
      options: { shouldCreateUser: false },
    });
    if (otpError) {
      authHoldRef.current = false;
      return setMsg(`Failed to send verification code: ${otpError.message}`);
    }

    setOtpState({ active: true, email: emailLower });
    setMsg("Verification code sent to your email. Enter the 6-digit code to continue.");
  }

  async function verifyLoginOtp({ email, code }) {
    setMsg("");
    const emailLower = String(email || "").trim().toLowerCase();
    if (!emailLower) return setMsg("Email is required.");
    if (!code || String(code).trim().length < 6) return setMsg("Enter the 6-digit verification code.");

    const { data, error } = await supabase.auth.verifyOtp({
      email: emailLower,
      token: String(code).trim(),
      type: "email",
    });
    if (error) return setMsg(error.message);

    authHoldRef.current = false;
    setOtpState({ active: false, email: "" });
    if (data?.session) setSession(data.session);
    setMsg("Logged in!");
    navigate("/dashboard");
  }

  async function resendLoginOtp(email) {
    setMsg("");
    const emailLower = String(email || "").trim().toLowerCase();
    if (!emailLower) return setMsg("Email is required.");
    const { error } = await supabase.auth.signInWithOtp({
      email: emailLower,
      options: { shouldCreateUser: false },
    });
    if (error) return setMsg(`Failed to resend code: ${error.message}`);
    setMsg("Verification code resent. Check your inbox/spam.");
  }

  async function requestPasswordReset(email) {
    setMsg("");
    const emailLower = String(email || "").trim().toLowerCase();
    if (!emailLower) return setMsg("Enter your email first.");
    if (emailLower.endsWith(STAFF_DOMAIN)) {
      return setMsg("Staff accounts should contact the clinic admin for password reset.");
    }
    const { error } = await supabase.auth.resetPasswordForEmail(emailLower, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (error) return setMsg(error.message);
    setMsg("Password reset email sent. Check your inbox/spam.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMsg("");
    setRole(null);
    navigate("/login");
  }

  return (
    <Routes>
      <Route path="/login" element={
        session ? (
          <Navigate to="/dashboard" replace />
        ) : (
          <LoginPage
            staffDomain={STAFF_DOMAIN}
            msg={msg}
            onLogin={signIn}
            onVerifyOtp={verifyLoginOtp}
            onResendOtp={resendLoginOtp}
            onForgotPassword={requestPasswordReset}
            onGoSignup={() => { setMsg(""); navigate("/signup"); }}
            otpActive={otpState.active}
            otpEmail={otpState.email}
          />
        )
      } />
      <Route path="/signup" element={
        session ? (
          <Navigate to="/dashboard" replace />
        ) : (
          <PatientSignupProfile
            onDone={() => {
              setMsg("Signup successful. Please login.");
              navigate("/login");
            }}
            onGoLogin={() => navigate("/login")}
          />
        )
      } />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/" element={
        !session ? (
          <LandingPage />
        ) : (
          <DashboardLayout session={session} role={role} onLogout={signOut} />
        )
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={
          loadingRole ? (
            <div className="card"><p style={{ margin: 0 }}>Loading role…</p></div>
          ) : (
            <DashboardRoot />
          )
        } />
        <Route path="appointments" element={<PatientPage page="appointments" />} />
        <Route path="medical-process" element={<PatientPage page="process" />} />
        <Route path="lab-tests" element={<PatientPage page="labs" />} />
        <Route path="xray-results" element={<PatientPage page="xray" />} />
        <Route path="payments" element={<PatientPage page="payments" />} />
        <Route path="medical-records" element={<PatientPage page="records" />} />
        <Route path="settings" element={<PatientPage page="settings" />} />
        <Route path="admin/patients" element={<AdminPage page="patients" />} />
        <Route path="admin/companies" element={<AdminPage page="companies" />} />
        <Route path="admin/users" element={<AdminPage page="users" />} />
        <Route path="admin/tools" element={<AdminPage page="tools" />} />
        <Route path="admin/settings" element={<AdminPage page="settings" />} />
        <Route path="receptionist/appointments" element={<ReceptionistPage page="appointments" />} />
        <Route path="cashier/payments" element={<CashierPage page="payments" />} />
        <Route path="cashier/report" element={<CashierPage page="report" />} />
        <Route path="lab/history" element={<LabPage page="history" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
