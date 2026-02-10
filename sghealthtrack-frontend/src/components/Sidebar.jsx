// Sidebar — single nav. Desktop: fixed. Mobile: drawer + hamburger.
import { NavLink } from "react-router-dom";
import { useEffect, useMemo } from "react";
import sgHealthtrackLogo from "../image/sghealthtrack-logo.png";

const ROUTES = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/appointments", label: "Appointments" },
  { path: "/medical-process", label: "Medical Process" },
  { path: "/lab-tests", label: "Lab Tests" },
  { path: "/payments", label: "Payments" },
  { path: "/medical-records", label: "Medical Records" },
  { path: "/settings", label: "Settings" },
];

function NavIcon({ path, iconPath }) {
  const key = iconPath || path;
  // Simple inline icons so we don't add extra dependencies.
  // Icons are chosen to loosely match the Canva design.
  const stroke = "currentColor";
  const strokeWidth = 1.7;

  if (key === "/dashboard") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M5 13V5h6v8H5zm8-4h6v10h-6V9z"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (key === "/appointments" || key === "/admin/appointments" || key === "/receptionist/appointments") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <rect
          x="4"
          y="5"
          width="16"
          height="15"
          rx="2"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <path
          d="M4 10h16M9 3v4M15 3v4"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (key === "/medical-process") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M7 4h10l-2 4v9a2 2 0 01-2 2H9a2 2 0 01-2-2V4z"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10 9h4M11 12h2"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (key === "/lab-tests") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M9 3v7.5L5.5 18A3 3 0 008 22h8a3 3 0 002.5-4.5L15 10.5V3"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (key === "/xray-results") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="7"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <path
          d="M5 12h14M12 5v14M7.5 7.5l9 9M16.5 7.5l-9 9"
          fill="none"
          stroke={stroke}
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (key === "/payments" || key === "/cashier/payments") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <rect
          x="3"
          y="5"
          width="18"
          height="14"
          rx="2"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <path
          d="M3 10h18M8 14h3"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (path === "/cashier/report") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6 4h7l5 5v11H6a2 2 0 01-2-2V6a2 2 0 012-2z"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
        <path
          d="M9 13h6M9 16h4"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (key === "/medical-records") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6 4h7l5 5v11H6a2 2 0 01-2-2V6a2 2 0 012-2z"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
        <path
          d="M9 13h6M9 16h4"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (key === "/settings" || key === "/admin/settings") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 15.5A3.5 3.5 0 1012 8a3.5 3.5 0 000 7.5z"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <path
          d="M19.4 9a1 1 0 00.2-1.1l-1-1.8a1 1 0 00-1.1-.5l-1.5.4a6 6 0 00-1.4-.8L14 3.6A1 1 0 0013 3h-2a1 1 0 00-1 .6L9.4 5.2a6 6 0 00-1.4.8l-1.5-.4a1 1 0 00-1.1.5l-1 1.8A1 1 0 004 9l1.2 1a6 6 0 000 2l-1.2 1a1 1 0 00-.2 1.1l1 1.8a1 1 0 001.1.5l1.5-.4a6 6 0 001.4.8l.6 1.6a1 1 0 001 .6h2a1 1 0 001-.6l.6-1.6a6 6 0 001.4-.8l1.5.4a1 1 0 001.1-.5l1-1.8a1 1 0 00-.2-1.1l-1.2-1a6 6 0 000-2z"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (key === "/admin/patients") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M8 13a4 4 0 100-8 4 4 0 000 8zm8 2a4 4 0 100-8 4 4 0 000 8z"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <path
          d="M2 20c0-3 3-5 6-5m4 5c0-3 3-5 6-5"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (key === "/admin/users") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M8 13a4 4 0 100-8 4 4 0 000 8zm8 2a4 4 0 100-8 4 4 0 000 8z"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <path
          d="M2 20c0-3 3-5 6-5m4 5c0-3 3-5 6-5"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (key === "/admin/companies") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 20V6h8v14M12 10h8v10"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
        <path
          d="M7 9h2M7 13h2M7 17h2M15 13h2M15 17h2"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (key === "/admin/tools") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M10 6a4 4 0 016 3.6l-5.4 5.4a4 4 0 01-5.6-5.6L10.4 4A4 4 0 0110 6z"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14 10l4 4"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Fallback dot icon.
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" aria-hidden="true">
      <circle cx="3" cy="3" r="2.5" fill={stroke} />
    </svg>
  );
}

function formatRoleLabel(role) {
  const s = String(role || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "lab") return "Lab Tech";
  if (s === "cashier") return "Cashier";
  if (s === "admin") return "Admin";
  if (s === "doctor") return "Doctor";
  if (s === "patient") return "Patient";
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function Sidebar({ navItems = ROUTES, userName, userEmail, role, onLogout, open, onClose, collapsed }) {
  const roleLabel = useMemo(() => formatRoleLabel(role), [role]);
  const displayName = String(userName || userEmail || "").trim();
  const displayEmail = String(userEmail || "").trim();
  const showEmail = displayEmail && displayEmail !== displayName;
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  return (
    <>
      <div
        className="sidebar-overlay"
        role="presentation"
        aria-hidden={!open}
        onClick={onClose}
        data-open={open || undefined}
      />
      <aside
        className={`sidebar-drawer`}
        data-open={open || undefined}
        data-collapsed={collapsed || undefined}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <img src={sgHealthtrackLogo} alt="SG HealthTrack" />
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-title">SG HealthTrack</span>
            <span className="sidebar-subtitle">Medical Screening</span>
            {roleLabel ? <span className="sidebar-role">{roleLabel}</span> : null}
          </div>
        </div>
        <nav className="sidebar-nav">
              {navItems.map(({ path, label, iconPath }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={path === "/dashboard"}
                  className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
                  onClick={onClose}
                >
                  <span className="sidebar-link-inner">
                    <span className="sidebar-icon">
                      <NavIcon path={path} iconPath={iconPath} />
                    </span>
                    <span className="sidebar-label">{label}</span>
                  </span>
                </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-user-row">
            <div className="sidebar-user-meta">
              <div className="sidebar-user-name">{displayName || (role === "patient" ? "Patient" : "Staff")}</div>
              {showEmail ? <div className="sidebar-user-email">{displayEmail}</div> : null}
            </div>
          </div>
        </div>
        <div className="sidebar-footer">
          <button type="button" className="btn btn-sidebar-logout" onClick={onLogout}>
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
