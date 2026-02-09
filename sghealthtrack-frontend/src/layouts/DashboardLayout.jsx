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
  { path: "/admin/appointments", label: "Appointments" },
  { path: "/admin/patients", label: "Patients" },
  { path: "/admin/companies", label: "Partner Companies" },
  { path: "/admin/users", label: "Manage Users" },
  { path: "/admin/tools", label: "Admin Tools" },
  { path: "/admin/settings", label: "Settings" },
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

export default function DashboardLayout({ session, role, onLogout }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const userEmail = session?.user?.email ?? "";
  const [profileName, setProfileName] = useState("");
  const metaName = session?.user?.user_metadata?.full_name?.trim() || "";
  const userName = metaName || profileName || userEmail;
  const isPatient = role === "patient";
  const isAdmin = role === "admin";
  const navItems =
    isPatient
      ? PATIENT_ROUTES
      : isAdmin
        ? ADMIN_ROUTES
      : role === "cashier"
          ? CASHIER_ROUTES
          : role === "lab"
            ? LAB_ROUTES
            : STAFF_ROUTES;

  useEffect(() => {
    const userId = session?.user?.id;
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
  }, [session?.user?.id, metaName]);

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

  return (
    <ToastContext.Provider value={{ showToast }}>
      <div className="dashboard-layout" data-role={role || "unknown"}>
        <Sidebar
          navItems={navItems}
          userName={userName}
          userEmail={userEmail}
          role={role}
          onLogout={onLogout}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />

        <main className="dashboard-main">
          <div className="dashboard-utility no-print">
            <div className="dashboard-utility-left">
              <button
                type="button"
                className="btn btn-hamburger"
                aria-label="Open menu"
                onClick={() => setDrawerOpen(true)}
              >
                ☰
              </button>
            </div>
            <div className="dashboard-utility-right">
              <input
                type="search"
                className="dashboard-search"
                placeholder="Search…"
                aria-label="Search"
              />
              <div id="dashboard-utility-actions" />
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
