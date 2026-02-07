// src/pages/AuthPage.jsx
import { useState } from "react";
import sgHealthtrackLogo from "../image/sghealthtrack-logo.png";

export default function AuthPage({
  mode = "login", // "login" | "signup"
  staffDomain = "@smartguys.com",
  onSubmit,
  onSwitchMode,
  msg,
}) {
  const isLogin = mode === "login";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    onSubmit?.({ email, password });
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img className="auth-logo" src={sgHealthtrackLogo} alt="SG HealthTrack" />
          <div>
            <div className="auth-title">SG HealthTrack</div>
            <div className="auth-subtitle">Clinic Management System</div>
          </div>
        </div>

        <h2 className="auth-heading">{isLogin ? "Login" : "Create Patient Account"}</h2>
        <p className="auth-help">
          {isLogin
            ? "Sign in to continue."
            : "Patients can sign up here. Staff accounts must be created by admin."}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="label">Email</label>
          <input
            className="input"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          <label className="label" style={{ marginTop: 10 }}>
            Password
          </label>
          <input
            className="input"
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? "current-password" : "new-password"}
          />

          <button className="btn btn-primary" type="submit" style={{ marginTop: 14 }}>
            {isLogin ? "Login" : "Sign up"}
          </button>

          <button
            className="btn btn-ghost"
            type="button"
            onClick={onSwitchMode}
            style={{ marginTop: 10 }}
          >
            {isLogin ? "Create an account" : "Back to login"}
          </button>

          {msg && (
            <div
              className={`auth-msg ${/successful|sent|redirecting|logged in/i.test(msg) ? "auth-msg-success" : "auth-msg-error"}`}
            >
              {msg}
            </div>
          )}

          <div className="auth-footnote">
            Staff accounts ({staffDomain}) are created by the clinic admin only.
          </div>
        </form>
      </div>
    </div>
  );
}
