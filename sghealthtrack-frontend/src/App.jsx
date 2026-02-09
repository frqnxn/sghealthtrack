import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import sgHealthtrackLogo from "./image/sghealthtrack-logo.png";
import clinicHero from "./image/clinic-template.jpeg";

import DashboardLayout from "./layouts/DashboardLayout";
import DashboardRoot from "./pages/DashboardRoot";
import PatientPage from "./pages/PatientPage";
import AdminPage from "./pages/AdminPage";
import CashierPage from "./pages/CashierPage";
import LabPage from "./pages/LabPage";
import PatientSignupProfile from "./pages/PatientSignupProfile";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import LandingPage from "./pages/LandingPage";

import "./styles/clinic.css";

const STAFF_DOMAIN = "@smartguys.com";

function LoginPage({ staffDomain = STAFF_DOMAIN, onLogin, onGoSignup, onForgotPassword, msg }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isSuccessMsg = msg && /successful|sent|redirecting|logged in/i.test(msg);

  function handleSubmit(e) {
    e.preventDefault();
    onLogin?.({ email, password });
  }

  return (
    <div className="auth-split">
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
          />

          <label className="auth-label">Password</label>
          <input
            className="auth-input"
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <button className="auth-primary-btn" type="submit">
            Sign In →
          </button>

          {msg && <div className={`auth-msg ${isSuccessMsg ? "auth-msg-success" : "auth-msg-error"}`}>{msg}</div>}

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
  const API_BASE = import.meta.env.VITE_API_URL || "";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
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
    const emailLower = String(email || "").trim().toLowerCase();
    if (!emailLower) return setMsg("Email is required.");
    if (!password) return setMsg("Password is required.");
    const { error } = await supabase.auth.signInWithPassword({
      email: emailLower,
      password,
    });
    if (error) return setMsg(error.message);
    setMsg("Logged in!");
    navigate("/dashboard");
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
            onForgotPassword={requestPasswordReset}
            onGoSignup={() => { setMsg(""); navigate("/signup"); }}
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
        <Route path="admin/appointments" element={<AdminPage page="appointments" />} />
        <Route path="admin/patients" element={<AdminPage page="patients" />} />
        <Route path="admin/companies" element={<AdminPage page="companies" />} />
        <Route path="admin/users" element={<AdminPage page="users" />} />
        <Route path="admin/tools" element={<AdminPage page="tools" />} />
        <Route path="admin/settings" element={<AdminPage page="settings" />} />
        <Route path="cashier/payments" element={<CashierPage page="payments" />} />
        <Route path="cashier/report" element={<CashierPage page="report" />} />
        <Route path="lab/history" element={<LabPage page="history" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
