import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import sgHealthtrackLogo from "./image/sghealthtrack-logo.png";

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
            <img className="auth-nav-logo" src={sgHealthtrackLogo} alt="SG HealthTrack" />
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
          <button className="auth-cta-pill" type="button" onClick={onGoSignup}>
            Book an Appointment
          </button>
        </div>
      </header>

      <section className="auth-hero">
        <div className="auth-container auth-hero-inner">
          <div className="auth-hero-content">
            <div className="auth-hero-brand">SG HealthTrack</div>
            <h1 className="auth-hero-title">Your health, monitored. Your care, connected.</h1>
            <p className="auth-hero-subtitle">
              Book in minutes, get confirmed quickly, and access your medical report online.
            </p>
            <div className="auth-hero-actions">
              <button className="auth-hero-btn" type="button" onClick={onGoSignup}>
                Book Now
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
            Schedule your next health checkup with us
          </div>
          <div className="auth-section-card">
            <div className="auth-card auth-card--wide auth-card--flat">
              <div className="auth-brand">
                <img className="auth-logo" src={sgHealthtrackLogo} alt="SG HealthTrack" />
                <div>
                  <div className="auth-title">SG HealthTrack</div>
                  <div className="auth-subtitle">Clinic Management System</div>
                </div>
              </div>
              <h2 className="auth-heading">Welcome back</h2>
              <p className="auth-help">Sign in to continue.</p>
              <form onSubmit={handleSubmit} className="auth-form auth-form--wide">
                <div className="auth-form-grid">
                  <div>
                    <label className="label">Email</label>
                    <input
                      className="input"
                      placeholder="you@email.com"
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
                      autoComplete="current-password"
                    />
                  </div>
                </div>
                <button
                  className="auth-link"
                  type="button"
                  onClick={() => onForgotPassword?.(email)}
                  style={{ marginTop: 8 }}
                >
                  Forgot password?
                </button>
                <div className="auth-form-actions">
                  <button className="auth-btn-primary" type="submit">
                    Login
                  </button>
                  <button className="auth-btn-ghost" type="button" onClick={onGoSignup}>
                    Create patient account
                  </button>
                </div>
            {msg && <div className={`auth-msg ${isSuccessMsg ? "auth-msg-success" : "auth-msg-error"}`}>{msg}</div>}
                <div className="auth-footnote">
                  Staff accounts ({staffDomain}) are created by the clinic admin only.
                </div>
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
