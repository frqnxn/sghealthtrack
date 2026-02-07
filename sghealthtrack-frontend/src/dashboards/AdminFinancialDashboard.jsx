// src/dashboards/AdminFinancialDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { useToast } from "../components/ToastCenter";
import { supabase } from "../lib/supabase";
import useSuccessToast from "../utils/useSuccessToast";

function toMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeMethod(m) {
  const s = String(m || "").toLowerCase();
  if (s === "online_banking") return "online_banking";
  if (s === "e_wallet") return "e_wallet";
  return "cash";
}

function isoDayStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}
function isoDayEnd(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        opacity: active ? 1 : 0.75,
        border: active ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.10)",
      }}
    >
      {children}
    </button>
  );
}

export default function AdminFinancialDashboard({ session }) {
  const adminId = session?.user?.id;

  const [tab, setTab] = useState("overview"); // overview | shifts | payments | expenses | refunds
  const [msg, setMsg] = useState("");
  const { showToast } = useToast();
  useSuccessToast(msg, showToast);
  const [loading, setLoading] = useState(false);

  // Date range (default: last 30 days)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Data buckets
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [shifts, setShifts] = useState([]);

  // Optional: names
  const [cashierNameMap, setCashierNameMap] = useState({});

  async function loadCashierNames(userIds = []) {
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    if (!ids.length) return;

    // If you store staff names in profiles
    const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    if (error) return;

    setCashierNameMap((prev) => {
      const next = { ...prev };
      (data || []).forEach((r) => (next[r.id] = r.full_name || ""));
      return next;
    });
  }

  function cashierName(id) {
    const n = cashierNameMap?.[id];
    return n && String(n).trim() ? String(n).trim() : id ? String(id).slice(0, 8) + "…" : "—";
  }

  const range = useMemo(() => {
    // inclusive day range
    const fromIso = isoDayStart(new Date(dateFrom));
    const toIso = isoDayEnd(new Date(dateTo));
    return { fromIso, toIso };
  }, [dateFrom, dateTo]);

  async function loadAll() {
    setMsg("");
    setLoading(true);

    const { fromIso, toIso } = range;

    // Payments (COMPLETED only)
    const pReq = supabase
      .from("payments")
      .select(
        "id, recorded_at, payment_status, amount, or_number, payment_method, shift_id, recorded_by, patient_id, appointment_id"
      )
      .eq("payment_status", "completed")
      .gte("recorded_at", fromIso)
      .lte("recorded_at", toIso)
      .order("recorded_at", { ascending: false })
      .limit(2000);

    // Expenses (non-void)
    const eReq = supabase
      .from("cashier_expenses")
      .select(
        "id, spent_at, amount, expense_method, category, vendor, receipt_no, notes, is_void, shift_id, cashier_id"
      )
      .gte("spent_at", fromIso)
      .lte("spent_at", toIso)
      .order("spent_at", { ascending: false })
      .limit(2000);

    // Refunds (if table exists)
    const rReq = supabase
      .from("cashier_refunds")
      .select(
        "id, refunded_at, amount, refund_method, reason, is_void, shift_id, cashier_id, payment_id"
      )
      .gte("refunded_at", fromIso)
      .lte("refunded_at", toIso)
      .order("refunded_at", { ascending: false })
      .limit(2000);

    // Shifts
    const sReq = supabase
      .from("cashier_shifts")
      .select("id, cashier_id, opened_at, closed_at, opening_float, closing_cash, notes")
      .gte("opened_at", fromIso)
      .lte("opened_at", toIso)
      .order("opened_at", { ascending: false })
      .limit(2000);

    const [pRes, eRes, rRes, sRes] = await Promise.all([pReq, eReq, rReq, sReq]);

    // Handle “refunds table doesn't exist”
    if (pRes.error) setMsg(`Payments load failed: ${pRes.error.message}`);
    if (eRes.error) setMsg((prev) => prev || `Expenses load failed: ${eRes.error.message}`);
    if (sRes.error) setMsg((prev) => prev || `Shifts load failed: ${sRes.error.message}`);

    setPayments(pRes.data || []);
    setExpenses(eRes.data || []);
    setShifts(sRes.data || []);
    setRefunds(rRes.error ? [] : rRes.data || []);

    // Load cashier names for nice UI
    const cashierIds = [
      ...(pRes.data || []).map((x) => x.recorded_by),
      ...(eRes.data || []).map((x) => x.cashier_id),
      ...(sRes.data || []).map((x) => x.cashier_id),
      ...(rRes.error ? [] : (rRes.data || []).map((x) => x.cashier_id)),
    ];
    await loadCashierNames(cashierIds);

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------- SUMMARY COMPUTATIONS ----------
  const paymentSummary = useMemo(() => {
    let total = 0,
      cash = 0,
      ewallet = 0,
      online = 0,
      count = 0;

    for (const p of payments) {
      const amt = toNum(p.amount);
      total += amt;
      count += 1;
      const m = normalizeMethod(p.payment_method);
      if (m === "cash") cash += amt;
      else if (m === "e_wallet") ewallet += amt;
      else online += amt;
    }
    return { total, cash, ewallet, online, count };
  }, [payments]);

  const expenseSummary = useMemo(() => {
    let total = 0,
      cash = 0,
      ewallet = 0,
      online = 0,
      count = 0;

    for (const e of expenses) {
      if (e.is_void) continue;
      const amt = toNum(e.amount);
      total += amt;
      count += 1;
      const m = normalizeMethod(e.expense_method);
      if (m === "cash") cash += amt;
      else if (m === "e_wallet") ewallet += amt;
      else online += amt;
    }
    return { total, cash, ewallet, online, count };
  }, [expenses]);

  const refundSummary = useMemo(() => {
    let total = 0,
      cash = 0,
      ewallet = 0,
      online = 0,
      count = 0;

    for (const r of refunds) {
      if (r.is_void) continue;
      const amt = toNum(r.amount);
      total += amt;
      count += 1;
      const m = normalizeMethod(r.refund_method);
      if (m === "cash") cash += amt;
      else if (m === "e_wallet") ewallet += amt;
      else online += amt;
    }
    return { total, cash, ewallet, online, count };
  }, [refunds]);

  const netSummary = useMemo(() => {
    const grossIn = paymentSummary.total;
    const totalOut = expenseSummary.total + refundSummary.total;
    return { grossIn, totalOut, net: grossIn - totalOut };
  }, [paymentSummary.total, expenseSummary.total, refundSummary.total]);

  // Shift-level rollups (best when payments/expenses/refunds have shift_id)
  const shiftRollups = useMemo(() => {
    const payByShift = new Map();
    const expByShift = new Map();
    const refByShift = new Map();

    for (const p of payments) {
      const sid = p.shift_id || null;
      if (!sid) continue;
      payByShift.set(sid, (payByShift.get(sid) || 0) + toNum(p.amount));
    }
    for (const e of expenses) {
      if (e.is_void) continue;
      const sid = e.shift_id || null;
      if (!sid) continue;
      expByShift.set(sid, (expByShift.get(sid) || 0) + toNum(e.amount));
    }
    for (const r of refunds) {
      if (r.is_void) continue;
      const sid = r.shift_id || null;
      if (!sid) continue;
      refByShift.set(sid, (refByShift.get(sid) || 0) + toNum(r.amount));
    }

    return shifts.map((s) => {
      const inPay = payByShift.get(s.id) || 0;
      const outExp = expByShift.get(s.id) || 0;
      const outRef = refByShift.get(s.id) || 0;
      return {
        ...s,
        collections: inPay,
        expenses: outExp,
        refunds: outRef,
        net: inPay - outExp - outRef,
      };
    });
  }, [shifts, payments, expenses, refunds]);

  // --------- UI ----------
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ marginBottom: 6 }}>Admin Financial Dashboard</h3>
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            Collections, expenses, refunds, and shift reconciliation across a date range.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ fontSize: 13 }}>
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ marginLeft: 8 }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ marginLeft: 8 }}
            />
          </label>
        </div>
      </div>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
          Overview
        </TabButton>
        <TabButton active={tab === "shifts"} onClick={() => setTab("shifts")}>
          Shifts
        </TabButton>
        <TabButton active={tab === "payments"} onClick={() => setTab("payments")}>
          Payments
        </TabButton>
        <TabButton active={tab === "expenses"} onClick={() => setTab("expenses")}>
          Expenses
        </TabButton>
        <TabButton active={tab === "refunds"} onClick={() => setTab("refunds")}>
          Refunds
        </TabButton>
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4 style={{ marginTop: 0 }}>Overview</h4>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
              gap: 10,
              marginTop: 10,
            }}
          >
            <div className="card">
              <b>Collections</b>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{toMoney(paymentSummary.total)}</div>
                <div style={{ opacity: 0.75, fontSize: 13 }}>Tx: {paymentSummary.count}</div>
                <div style={{ opacity: 0.75, fontSize: 13 }}>
                  Cash: {toMoney(paymentSummary.cash)} • E-wallet: {toMoney(paymentSummary.ewallet)} • Online:{" "}
                  {toMoney(paymentSummary.online)}
                </div>
              </div>
            </div>

            <div className="card">
              <b>Outgoing</b>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{toMoney(netSummary.totalOut)}</div>
                <div style={{ opacity: 0.75, fontSize: 13 }}>
                  Expenses: {toMoney(expenseSummary.total)} • Refunds: {toMoney(refundSummary.total)}
                </div>
              </div>
            </div>

            <div className="card">
              <b>Net</b>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{toMoney(netSummary.net)}</div>
                <div style={{ opacity: 0.75, fontSize: 13 }}>
                  Net = Collections - (Expenses + Refunds)
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
            Tip: For clinic transparency, keep voids instead of deletes (audit trail).
          </div>
        </div>
      )}

      {/* SHIFTS */}
      {tab === "shifts" && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4 style={{ marginTop: 0 }}>Shifts</h4>
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            Requires `shift_id` stored on payments/expenses/refunds to compute accurate per-shift totals.
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Opened</th>
                  <th>Closed</th>
                  <th>Cashier</th>
                  <th>Opening</th>
                  <th>Closing</th>
                  <th>Collections</th>
                  <th>Expenses</th>
                  <th>Refunds</th>
                  <th>Net</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {shiftRollups.length === 0 ? (
                  <tr>
                    <td colSpan="10" style={{ opacity: 0.7 }}>
                      No shifts in range.
                    </td>
                  </tr>
                ) : (
                  shiftRollups.slice(0, 50).map((s) => (
                    <tr key={s.id}>
                      <td>{s.opened_at ? new Date(s.opened_at).toLocaleString() : "—"}</td>
                      <td>{s.closed_at ? new Date(s.closed_at).toLocaleString() : "—"}</td>
                      <td>{cashierName(s.cashier_id)}</td>
                      <td>{toMoney(s.opening_float)}</td>
                      <td>{toMoney(s.closing_cash)}</td>
                      <td>
                        <b>{toMoney(s.collections)}</b>
                      </td>
                      <td>{toMoney(s.expenses)}</td>
                      <td>{toMoney(s.refunds)}</td>
                      <td>
                        <b>{toMoney(s.net)}</b>
                      </td>
                      <td style={{ maxWidth: 260, opacity: 0.85 }}>{s.notes ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
              Showing up to 50 shifts.
            </div>
          </div>
        </div>
      )}

      {/* PAYMENTS */}
      {tab === "payments" && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4 style={{ marginTop: 0 }}>Payments</h4>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>OR #</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Cashier</th>
                  <th>Shift</th>
                  <th>Appointment</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ opacity: 0.7 }}>
                      No payments in range.
                    </td>
                  </tr>
                ) : (
                  payments.slice(0, 100).map((p) => (
                    <tr key={p.id}>
                      <td>{p.recorded_at ? new Date(p.recorded_at).toLocaleString() : "—"}</td>
                      <td>{p.or_number ?? "—"}</td>
                      <td>
                        <b>{toMoney(p.amount)}</b>
                      </td>
                      <td>{normalizeMethod(p.payment_method).replaceAll("_", " ").toUpperCase()}</td>
                      <td>{cashierName(p.recorded_by)}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{p.shift_id ? String(p.shift_id).slice(0, 8) + "…" : "—"}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{p.appointment_id ? String(p.appointment_id).slice(0, 8) + "…" : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
              Showing latest 100 payments.
            </div>
          </div>
        </div>
      )}

      {/* EXPENSES */}
      {tab === "expenses" && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4 style={{ marginTop: 0 }}>Expenses</h4>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Category</th>
                  <th>Vendor</th>
                  <th>Receipt</th>
                  <th>Cashier</th>
                  <th>Shift</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ opacity: 0.7 }}>
                      No expenses in range.
                    </td>
                  </tr>
                ) : (
                  expenses.slice(0, 100).map((e) => (
                    <tr key={e.id} style={{ opacity: e.is_void ? 0.55 : 1 }}>
                      <td>{e.spent_at ? new Date(e.spent_at).toLocaleString() : "—"}</td>
                      <td>
                        <b>{toMoney(e.amount)}</b>
                      </td>
                      <td>{normalizeMethod(e.expense_method).replaceAll("_", " ").toUpperCase()}</td>
                      <td>{e.category ?? "—"}</td>
                      <td>{e.vendor ?? "—"}</td>
                      <td>{e.receipt_no ?? "—"}</td>
                      <td>{cashierName(e.cashier_id)}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{e.shift_id ? String(e.shift_id).slice(0, 8) + "…" : "—"}</td>
                      <td>{e.is_void ? "VOID" : "ACTIVE"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
              Showing latest 100 expenses.
            </div>
          </div>
        </div>
      )}

      {/* REFUNDS */}
      {tab === "refunds" && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4 style={{ marginTop: 0 }}>Refunds</h4>

          {refunds.length === 0 ? (
            <div style={{ opacity: 0.8 }}>
              No refunds found in range.
              <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
                If you haven’t created the table yet, create `cashier_refunds` then refresh.
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Reason</th>
                    <th>Cashier</th>
                    <th>Shift</th>
                    <th>Payment</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.slice(0, 100).map((r) => (
                    <tr key={r.id} style={{ opacity: r.is_void ? 0.55 : 1 }}>
                      <td>{r.refunded_at ? new Date(r.refunded_at).toLocaleString() : "—"}</td>
                      <td>
                        <b>{toMoney(r.amount)}</b>
                      </td>
                      <td>{normalizeMethod(r.refund_method).replaceAll("_", " ").toUpperCase()}</td>
                      <td style={{ maxWidth: 320 }}>{r.reason ?? "—"}</td>
                      <td>{cashierName(r.cashier_id)}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.shift_id ? String(r.shift_id).slice(0, 8) + "…" : "—"}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.payment_id ? String(r.payment_id).slice(0, 8) + "…" : "—"}</td>
                      <td>{r.is_void ? "VOID" : "ACTIVE"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
                Showing latest 100 refunds.
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 12, opacity: 0.7, fontSize: 13 }}>
        Logged in as: <b>{session?.user?.email}</b>
      </div>
    </div>
  );
}
