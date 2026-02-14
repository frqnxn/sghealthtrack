// Single nav: left sidebar only. No top nav bar.
// Optional subtle utility row (search, profile, logout) inside main.
import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { ToastCenter, ToastContext } from "../components/ToastCenter";
import { supabase } from "../lib/supabase";

const PATIENT_ROUTES = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/appointments", label: "Appointments" },
  { path: "/medical-process", label: "Medical Process" },
  { path: "/lab-tests", label: "Lab Tests" },
  { path: "/xray-results", label: "X-ray Results" },
  { path: "/payments", label: "Payments" },
  { path: "/medical-records", label: "Medical Records" },
  { path: "/settings", label: "Settings" },
];

const ADMIN_ROUTES = [
  { path: "/admin/patients", label: "Patients" },
  { path: "/admin/companies", label: "Partner Companies" },
  { path: "/admin/users", label: "Manage Users" },
  { path: "/admin/tools", label: "Admin Tools" },
  { path: "/admin/settings", label: "Settings" },
];

const RECEPTIONIST_ROUTES = [
  { path: "/receptionist/appointments", label: "Appointments", iconPath: "/appointments" },
];

const CASHIER_ROUTES = [
  { path: "/cashier/payments", label: "Payments" },
  { path: "/cashier/report", label: "Report" },
];

const LAB_ROUTES = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/lab/history", label: "Lab History" },
];

const STAFF_ROUTES = [{ path: "/dashboard", label: "Dashboard" }];

function formatRoleLabel(role) {
  const s = String(role || "").toLowerCase();
  if (s === "cashier") return "Cashier";
  if (s === "admin") return "Admin";
  if (s === "doctor") return "Doctor";
  if (s === "patient") return "Patient";
  if (s === "lab") return "Lab";
  if (s === "nurse") return "Nurse";
  if (s === "receptionist") return "Receptionist";
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function DashboardLayout({ session, role, onLogout }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const toastTimerRef = useRef(null);
  const userEmail = session?.user?.email ?? "";
  const [profileName, setProfileName] = useState("");
  const metaName = session?.user?.user_metadata?.full_name?.trim() || "";
  const userName = metaName || profileName || userEmail;
  const displayName = String(userName || "").trim();
  const avatarInitial = (displayName || userEmail || "U").trim().charAt(0).toUpperCase();
  const roleLabel = formatRoleLabel(role);
  const isPatient = role === "patient";
  const isAdmin = role === "admin";
  const navItems =
    isPatient
      ? PATIENT_ROUTES
      : isAdmin
        ? ADMIN_ROUTES
      : role === "receptionist"
          ? RECEPTIONIST_ROUTES
          : role === "cashier"
            ? CASHIER_ROUTES
            : role === "lab"
              ? LAB_ROUTES
              : STAFF_ROUTES;

  useEffect(() => {
    const userId = session?.user?.id;
    if (!isPatient) {
      setPrivacyOpen(false);
      setPrivacyChecked(false);
    } else if (userId) {
      const key = `sghealthtrack_privacy_ack_${userId}`;
      const acknowledged = localStorage.getItem(key) === "true";
      setPrivacyOpen(!acknowledged);
      setPrivacyChecked(false);
    } else {
      setPrivacyOpen(false);
      setPrivacyChecked(false);
    }
    if (!userId || metaName) return;
    let cancelled = false;

    async function loadProfileName() {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data?.full_name) {
        setProfileName(String(data.full_name).trim());
      }
    }

    loadProfileName();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, metaName, isPatient]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = (message, variant = "success") => {
    if (!message) return;
    setToast({ message, variant });
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 2500);
  };

  const handleMenuToggle = () => {
    if (window.innerWidth <= 900) {
      setDrawerOpen(true);
      return;
    }
    setSidebarCollapsed((prev) => !prev);
  };

  const handlePrivacyAccept = () => {
    const userId = session?.user?.id;
    if (!userId) return;
    const key = `sghealthtrack_privacy_ack_${userId}`;
    localStorage.setItem(key, "true");
    setPrivacyOpen(false);
    setPrivacyChecked(false);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      <div
        className="dashboard-layout"
        data-role={role || "unknown"}
        data-collapsed={sidebarCollapsed ? "true" : undefined}
      >
        {isPatient && privacyOpen && (
          <div className="privacy-overlay">
            <div className="privacy-modal">
              <div className="privacy-header">
                <h3>Data Privacy Statement</h3>
                <p>Please review and accept our data privacy statement before continuing.</p>
              </div>
              <div className="privacy-body">
                SG HealthTrack collects personal and medical information to provide diagnostic services, manage appointments,
                and deliver reports securely. We process data only for legitimate clinical purposes, follow applicable privacy laws,
                and use reasonable safeguards to protect your information.
              </div>
              <div className="privacy-body">
                By accepting, you consent to the collection, use, and storage of your data for these purposes. You may request access,
                correction, or deletion of your data by contacting the clinic.
              </div>
              <label className="privacy-check">
                <input
                  type="checkbox"
                  checked={privacyChecked}
                  onChange={(e) => setPrivacyChecked(e.target.checked)}
                />
                <span>I agree to the data privacy statement.</span>
              </label>
              <div className="privacy-actions">
                <button className="btn btn-primary" disabled={!privacyChecked} onClick={handlePrivacyAccept}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}
        <Sidebar
          navItems={navItems}
          userName={userName}
          userEmail={userEmail}
          role={role}
          onLogout={onLogout}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          collapsed={sidebarCollapsed}
        />

        <main className="dashboard-main">
          <div className="dashboard-utility no-print">
            <div className="dashboard-utility-left">
              <button
                type="button"
                className="btn btn-hamburger"
                aria-label="Toggle menu"
                onClick={handleMenuToggle}
              >
                ☰
              </button>
              <input
                type="search"
                className="dashboard-search"
                placeholder="Search…"
                aria-label="Search"
              />
            </div>
            <div className="dashboard-utility-right" style={{ paddingTop: 4 }}>
              <div id="dashboard-utility-actions" />
              <div className="dashboard-user">
                <div className="dashboard-user-info">
                  <div className="dashboard-user-name">{displayName || "User"}</div>
                  {roleLabel ? <div className="dashboard-user-role">{roleLabel}</div> : null}
                </div>
                <div className="dashboard-user-avatar" aria-hidden="true">
                  {avatarInitial}
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-content">
            <Outlet context={{ session, role, showToast }} />
          </div>
        </main>
        <ToastCenter toast={toast} />
      </div>
    </ToastContext.Provider>
  );
}
