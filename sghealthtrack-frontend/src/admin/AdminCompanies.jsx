import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { PARTNER_COMPANIES, NON_PARTNER_NAME, slugify } from "../utils/companyPartners";

export default function AdminCompanies({ onSelectCompany }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [bulkCompanies, setBulkCompanies] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadCompanies() {
    setLoading(true);
    setMsg("");

    const { data: existing, error: loadErr } = await supabase
      .from("companies")
      .select("id, name, created_at")
      .order("name", { ascending: true });

    if (loadErr) {
      setMsg(loadErr.message);
      setCompanies([]);
      setLoading(false);
      return;
    }

    const defaults = [NON_PARTNER_NAME, ...PARTNER_COMPANIES];
    const existingNames = new Set((existing || []).map((c) => String(c.name || "").toLowerCase()));
    const missing = defaults.filter((n) => !existingNames.has(n.toLowerCase()));
    if (missing.length) {
      const { error: seedErr } = await supabase.from("companies").insert(
        missing.map((name) => ({
          name,
          slug: slugify(name),
        }))
      );
      if (seedErr) setMsg(seedErr.message);
    }

    const { data, error } = await supabase
      .from("companies")
      .select("id, name, created_at")
      .order("name", { ascending: true });

    if (error) {
      setMsg(error.message);
      setCompanies([]);
      setLoading(false);
      return;
    }

    setCompanies(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  function normalizeName(name) {
    return String(name || "").trim();
  }

  async function addCompaniesByName(names) {
    const cleaned = Array.from(
      new Set(names.map(normalizeName).filter(Boolean))
    );
    if (cleaned.length === 0) return;

    setSaving(true);
    setMsg("");

    const existing = new Set(companies.map((c) => String(c.name || "").toLowerCase()));
    const toInsert = cleaned.filter((n) => !existing.has(n.toLowerCase()));

    if (toInsert.length === 0) {
      setSaving(false);
      setMsg("Company already exists.");
      return;
    }

    const { error } = await supabase
      .from("companies")
      .insert(
        toInsert.map((name) => ({
          name,
          slug: slugify(name),
        }))
      );

    if (error) {
      setMsg(error.message);
      setSaving(false);
      return;
    }

    await loadCompanies();
    setSaving(false);
  }

  async function addCompany() {
    const name = normalizeName(newCompany);
    if (!name) return setMsg("Company name is required.");
    await addCompaniesByName([name]);
    setNewCompany("");
  }

  async function addBulkCompanies() {
    const parts = bulkCompanies
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return setMsg("Enter at least one company name.");
    await addCompaniesByName(parts);
    setBulkCompanies("");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => String(c.name || "").toLowerCase().includes(q));
  }, [companies, search]);

  const visible = useMemo(() => {
    return filtered.filter((c) => String(c.name || "").trim().toLowerCase() !== "walk-in");
  }, [filtered]);

  const partnersList = useMemo(() => {
    return visible.filter(
      (c) => String(c.name || "").trim().toLowerCase() !== NON_PARTNER_NAME.toLowerCase()
    );
  }, [visible]);

  const nonPartnerList = useMemo(() => {
    return visible.filter(
      (c) => String(c.name || "").trim().toLowerCase() === NON_PARTNER_NAME.toLowerCase()
    );
  }, [visible]);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>Partner Companies</h3>
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            Click a partner company to open details (appointments + exports)
          </div>
        </div>
      </div>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "minmax(240px, 1fr) auto", gap: 10 }}>
        <input
          placeholder="Add partner company..."
          value={newCompany}
          onChange={(e) => setNewCompany(e.target.value)}
        />
        <button className="btn btn-primary admin-company-primary" onClick={addCompany} disabled={saving}>
          {saving ? "Saving..." : "Add Company"}
        </button>
      </div>

      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "minmax(240px, 1fr) auto", gap: 10 }}>
        <textarea
          className="input"
          placeholder="Add multiple companies (one per line or comma-separated)"
          value={bulkCompanies}
          onChange={(e) => setBulkCompanies(e.target.value)}
          rows={2}
        />
        <button className="btn btn-secondary admin-company-primary" onClick={addBulkCompanies} disabled={saving}>
          {saving ? "Saving..." : "Add List"}
        </button>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          placeholder="Search partner company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 260 }}
        />
      </div>

      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Partner Company</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan="3" style={{ opacity: 0.7 }}>
                  No partner companies found.
                </td>
              </tr>
            ) : (
              <>
                <tr>
                  <td
                    colSpan="3"
                    style={{
                      fontWeight: 800,
                      background: "rgba(13,148,136,0.10)",
                      color: "rgba(13,148,136,0.95)",
                      letterSpacing: 0.3,
                      textTransform: "uppercase",
                      fontSize: 12,
                      padding: "8px 12px",
                    }}
                  >
                    Partner Companies
                  </td>
                </tr>
                {partnersList.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.name}</b>
                    </td>
                    <td>{c.created_at ? new Date(c.created_at).toLocaleString() : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-secondary admin-company-open-btn admin-company-primary" onClick={() => onSelectCompany?.(c)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td
                    colSpan="3"
                    style={{
                      fontWeight: 800,
                      background: "rgba(234,179,8,0.12)",
                      color: "rgba(234,179,8,0.95)",
                      letterSpacing: 0.3,
                      textTransform: "uppercase",
                      fontSize: 12,
                      padding: "8px 12px",
                    }}
                  >
                    Non-partners
                  </td>
                </tr>
                {nonPartnerList.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.name}</b>
                    </td>
                    <td>{c.created_at ? new Date(c.created_at).toLocaleString() : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-secondary admin-company-open-btn admin-company-primary" onClick={() => onSelectCompany?.(c)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
