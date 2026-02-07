import { useState } from "react";
import PatientProfile from "../components/PatientProfile"; // adjust path if different

export default function PatientSettings({ session, onProfileUpdated }) {
  const [tab, setTab] = useState("profile"); // profile | security

  // security
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const [msg, setMsg] = useState("");

  async function changePassword() {
    setMsg("");

    if (!pw1 || pw1.length < 6) return setMsg("Password must be at least 6 characters.");
    if (pw1 !== pw2) return setMsg("Passwords do not match.");

    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setSavingPw(false);

    if (error) return setMsg("Failed to change password: " + error.message);

    setPw1("");
    setPw2("");
    setMsg("Password updated!");
  }

  const email = session?.user?.email || "";

  return (
    <div className="card settings-panel" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h4 style={{ margin: 0 }}>Settings</h4>
          <div className="settings-label" style={{ marginTop: 4 }}>
            Manage your profile and security.
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <TabButton active={tab === "profile"} onClick={() => setTab("profile")}>
          Profile
        </TabButton>
        <TabButton active={tab === "security"} onClick={() => setTab("security")}>
          Security
        </TabButton>
      </div>

      <div style={{ marginTop: 12 }}>
        {tab === "profile" && (
          <PatientProfile session={session} onProfileUpdated={onProfileUpdated} />
        )}

        {tab === "security" && (
          <div className="card" style={{ padding: 14 }}>
            <b>Security</b>
            <div style={{ opacity: 0.75, marginTop: 6 }}>
              Signed in as: <span style={{ opacity: 0.95 }}>{email}</span>
            </div>

            {msg && <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{msg}</div>}

            <div style={{ marginTop: 12, display: "grid", gap: 10, maxWidth: 520 }}>
              <div>
                <label className="label">New Password</label>
                <input
                  className="input"
                  type="password"
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="label">Confirm Password</label>
                <input
                  className="input"
                  type="password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <button onClick={changePassword} disabled={savingPw}>
                {savingPw ? "Updating..." : "Update Password"}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function TabButton({ active, children, ...props }) {
  return (
    <button
      {...props}
      className={`settings-tab ${active ? "active" : ""}`}
    >
      {children}
    </button>
  );
}
