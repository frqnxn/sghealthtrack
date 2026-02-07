// Handles redirect after email confirmation. Supabase sends user here with tokens in URL.
// We let the client process the hash, then redirect to dashboard.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function clean(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return s || "";
}

function cleanOrNull(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("confirming"); // confirming | confirmed | error

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const user = data?.session?.user;
      if (user && (user.email_confirmed_at || user.confirmed_at)) {
        const meta = user?.user_metadata || {};
        const payload = {
          id: user.id,
          role: meta.role || "patient",
          email: (user.email || "").toLowerCase(),
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
        // Best-effort upsert to ensure profile exists after confirmation.
        await supabase.from("profiles").upsert(payload, { onConflict: "id" });
        await supabase.auth.signOut();
        setStatus("confirmed");
      } else {
        setStatus("error");
      }
    }

    handleCallback();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="auth-page">
      {status === "confirming" ? (
        <div className="auth-card" style={{ maxWidth: 400, textAlign: "center" }}>
          <div className="auth-brand" style={{ justifyContent: "center" }}>
            <img className="auth-logo" src="/src/image/sghealthtrack-logo.png" alt="SG HealthTrack" />
            <div>
              <div className="auth-title">SG HealthTrack</div>
              <div className="auth-subtitle">Medical Screening</div>
            </div>
          </div>
          <h2 className="auth-heading">Confirming your email…</h2>
          <p className="auth-help" style={{ marginBottom: 0 }}>
            Please wait a moment.
          </p>
        </div>
      ) : (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 420, textAlign: "center" }}>
            <div className="auth-brand" style={{ justifyContent: "center" }}>
              <img className="auth-logo" src="/src/image/sghealthtrack-logo.png" alt="SG HealthTrack" />
              <div>
                <div className="auth-title">SG HealthTrack</div>
                <div className="auth-subtitle">Medical Screening</div>
              </div>
            </div>
            <h2 className="auth-heading" style={{ marginTop: 8 }}>
              {status === "confirmed" ? "Email confirmed!" : "Email confirmation failed"}
            </h2>
            <p className="auth-help" style={{ marginBottom: 16 }}>
              {status === "confirmed"
                ? "You can now log in using your new account."
                : "Please try again or contact the clinic if the issue persists."}
            </p>
            <button className="btn btn-primary" onClick={() => navigate("/login", { replace: true })}>
              Go to login
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
