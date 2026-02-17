import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Buffer } from "buffer";
import { createClient } from "@supabase/supabase-js";
import reportRoutes from "./routes/report.js";
import archiveRoutes from "./routes/archive.js";
dotenv.config();

const app = express();
app.use(express.json());
app.use("/api/report", reportRoutes);
app.use("/api/admin/archive", archiveRoutes);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

// Supabase clients
// 1) anon client is used ONLY to validate user tokens (auth.getUser)
const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// 2) service role client is used for admin operations (bypasses RLS)
// IMPORTANT: keep this on backend only!
const supabaseService = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- HEALTH CHECK ---
app.get("/health", (req, res) => {
  res.json({ ok: true, message: "SG HealthTrack API running" });
});

// --- AUTH MIDDLEWARE ---
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return res.status(401).json({ error: "Missing Bearer token" });
    }

    const { data, error } = await supabaseAnon.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.user = data.user; // contains id, email, etc.
    next();
  } catch (err) {
    return res.status(500).json({ error: "Auth middleware failed" });
  }
}

async function requireAdmin(req, res, next) {
  try {
    // read role from profiles using SERVICE client (bypass RLS)
    const { data, error } = await supabaseService
      .from("profiles")
      .select("role")
      .eq("id", req.user.id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }

    next();
  } catch (err) {
    return res.status(500).json({ error: "Admin check failed" });
  }
}

function buildMockQrSvg({ amount, reference, orNumber }) {
  const safeAmount = Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
  const safeRef = String(reference || "").slice(0, 32);
  const safeOr = String(orNumber || "").slice(0, 24);
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="340" height="380" viewBox="0 0 340 380">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="20" y="20" width="300" height="300" rx="16" fill="#f8fafc" stroke="#e2e8f0"/>
  <g fill="#0f766e" font-family="Arial, sans-serif" font-weight="700">
    <text x="170" y="70" text-anchor="middle" font-size="22">QR PH</text>
    <text x="170" y="110" text-anchor="middle" font-size="14">Mock Payment</text>
  </g>
  <rect x="70" y="135" width="200" height="160" rx="12" fill="#ffffff" stroke="#e2e8f0"/>
  <g fill="#0f172a" font-family="Arial, sans-serif">
    <text x="170" y="170" text-anchor="middle" font-size="14">Amount</text>
    <text x="170" y="195" text-anchor="middle" font-size="22" font-weight="700">PHP ${safeAmount}</text>
    <text x="170" y="225" text-anchor="middle" font-size="12">Ref: ${safeRef}</text>
    <text x="170" y="245" text-anchor="middle" font-size="12">OR: ${safeOr}</text>
  </g>
  <g fill="#0f766e" font-family="Arial, sans-serif">
    <text x="170" y="350" text-anchor="middle" font-size="12">Scan with any QR PH app</text>
  </g>
</svg>`;
}

async function generateUniqueToken({ prefix, field, table }) {
  for (let i = 0; i < 6; i += 1) {
    const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    const token = `${prefix}-${suffix}`.toUpperCase();
    const { data, error } = await supabaseService
      .from(table)
      .select("id")
      .eq(field, token)
      .limit(1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return token;
  }
  return `${prefix}-${Date.now()}`.toUpperCase();
}

async function ensureAppointmentStepsPaid({ appointmentId, patientId, nowIso }) {
  const { data: existing, error } = await supabaseService
    .from("appointment_steps")
    .select("appointment_id")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (existing?.appointment_id) {
    const { error: updateErr } = await supabaseService
      .from("appointment_steps")
      .update({ payment_status: "completed", updated_at: nowIso })
      .eq("appointment_id", appointmentId);
    if (updateErr) throw new Error(updateErr.message);
    return;
  }

  const { error: insertErr } = await supabaseService
    .from("appointment_steps")
    .insert([
      {
        appointment_id: appointmentId,
        patient_id: patientId,
        registration_status: "completed",
        payment_status: "completed",
        triage_status: "pending",
        lab_status: "pending",
        xray_status: "pending",
        doctor_status: "pending",
        release_status: "pending",
        updated_at: nowIso,
      },
    ]);
  if (insertErr) throw new Error(insertErr.message);
}

// Public: check if an email already exists in auth
app.post("/api/auth/check-email", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "email is required" });

    const { data, error } = await supabaseService.auth.admin.getUserByEmail(email);
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ ok: true, exists: !!data?.user });
  } catch (err) {
    return res.status(500).json({ error: "Email check failed" });
  }
});

// Auth: resolve role using service client (bypasses RLS)
app.get("/api/auth/role", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const email = String(req.user?.email || "").trim().toLowerCase();
    let role = null;

    if (userId) {
      const { data, error } = await supabaseService
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      role = data?.role || null;
    }

    if (!role && email) {
      const { data, error } = await supabaseService
        .from("profiles")
        .select("role")
        .eq("email", email)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      role = data?.role || null;
    }

    return res.json({ ok: true, role });
  } catch (err) {
    return res.status(500).json({ error: "Role lookup failed" });
  }
});

// =====================================================
// PATIENT ENDPOINTS
// =====================================================

// Create appointment request (patient)
app.post("/api/appointments", requireAuth, async (req, res) => {
  try {
    const { type, preferred_date } = req.body;

    if (!type || !preferred_date) {
      return res.status(400).json({ error: "type and preferred_date are required" });
    }

    // patient_id MUST be the logged-in user
    const payload = {
      patient_id: req.user.id,
      type,
      preferred_date,
      status: "pending",
      rejection_reason: null,
    };

    // Use service client OR anon client?
    // If your RLS policy is correct, anon client works (recommended).
    // We'll use service client for stability while you're still building.
    const { data, error } = await supabaseService
      .from("appointments")
      .insert([payload])
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true, appointment: data });
  } catch (err) {
    res.status(500).json({ error: "Failed to create appointment" });
  }
});

// Patient: list own appointments
app.get("/api/appointments/me", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseService
      .from("appointments")
      .select("*")
      .eq("patient_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true, appointments: data });
  } catch (err) {
    res.status(500).json({ error: "Failed to load appointments" });
  }
});

// Patient: mock QR PH payment (auto-approved)
app.post("/api/payments/qrph/mock", requireAuth, async (req, res) => {
  try {
    const appointmentId = req.body?.appointment_id || null;
    const amount = Number(req.body?.amount);
    if (!appointmentId) return res.status(400).json({ error: "appointment_id is required" });
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }

    const { data: appt, error: apptErr } = await supabaseService
      .from("appointments")
      .select("id, patient_id, status, workflow_status")
      .eq("id", appointmentId)
      .maybeSingle();
    if (apptErr) return res.status(400).json({ error: apptErr.message });
    if (!appt || appt.patient_id !== req.user.id) {
      return res.status(403).json({ error: "Appointment not found for this user" });
    }

    const status = String(appt.workflow_status || appt.status || "").toLowerCase();
    if (["rejected", "cancelled", "canceled"].includes(status)) {
      return res.status(400).json({ error: "Cannot pay for a rejected/cancelled appointment" });
    }

    const { data: existing } = await supabaseService
      .from("payments")
      .select("id")
      .eq("appointment_id", appointmentId)
      .eq("payment_status", "completed")
      .limit(1);
    if (existing?.length) {
      return res.status(400).json({ error: "Payment already completed for this appointment" });
    }

    const referenceNo = await generateUniqueToken({ prefix: "QRPH", field: "reference_no", table: "payments" });
    const orNumber = await generateUniqueToken({ prefix: "OR", field: "or_number", table: "payments" });
    const nowIso = new Date().toISOString();

    const payload = {
      appointment_id: appointmentId,
      patient_id: req.user.id,
      recorded_by: null,
      payment_status: "completed",
      or_number: orNumber,
      reference_no: referenceNo,
      amount,
      notes: `QR PH mock payment • Ref ${referenceNo}`,
      recorded_at: nowIso,
      payment_method: "qrph",
    };

    const { data: payment, error: payErr } = await supabaseService
      .from("payments")
      .insert([payload])
      .select("*")
      .maybeSingle();
    if (payErr) return res.status(400).json({ error: payErr.message });

    await ensureAppointmentStepsPaid({ appointmentId, patientId: req.user.id, nowIso });

    const svg = buildMockQrSvg({ amount, reference: referenceNo, orNumber });
    const qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    res.json({
      ok: true,
      payment,
      qr: {
        data_url: qrDataUrl,
        amount,
        reference_no: referenceNo,
        or_number: orNumber,
        expires_at: expiresAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to generate mock QR payment" });
  }
});

// =====================================================
// STAFF ENDPOINTS (approved only)
// =====================================================
app.get("/api/staff/appointments", requireAuth, async (req, res) => {
  try {
    // verify staff role
    const { data: prof, error: profErr } = await supabaseService
      .from("profiles")
      .select("role")
      .eq("id", req.user.id)
      .maybeSingle();

    if (profErr) return res.status(400).json({ error: profErr.message });

    const role = prof?.role;
    if (!["nurse", "lab", "cashier"].includes(role)) {
      return res.status(403).json({ error: "Staff only" });
    }

    // staff sees approved only
    const { data, error } = await supabase
      .from("appointments")
      .select(`
        id,
        patient_id,
        type,
        preferred_date,
        status,
        rejection_reason,
        scheduled_at,
        workflow,
        profiles:patient_id (
          full_name
        )
      `)
      .order("preferred_date", { ascending: true });


    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true, appointments: data });
  } catch (err) {
    res.status(500).json({ error: "Failed to load staff appointments" });
  }
});

// =====================================================
// ADMIN ENDPOINTS
// =====================================================

// Admin: list ALL appointments
app.get("/api/admin/appointments", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseService
      .from("appointments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true, appointments: data });
  } catch (err) {
    res.status(500).json({ error: "Failed to load admin appointments" });
  }
});

// Admin: approve/reject appointment (with rejection reason)
app.patch(
  "/api/admin/appointments/:id/status",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const id = req.params.id;
      const { status, rejection_reason } = req.body;

      const allowed = ["pending", "approved", "rejected"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      let finalReason = null;

      if (status === "rejected") {
        if (!rejection_reason || !rejection_reason.trim()) {
          return res.status(400).json({ error: "Rejection reason is required" });
        }
        finalReason = rejection_reason.trim();
      }

      // If approved or pending, clear any old rejection reason
      const { data, error } = await supabaseService
        .from("appointments")
        .update({
          status,
          rejection_reason: finalReason,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true, appointment: data });
    } catch (err) {
      res.status(500).json({ error: "Failed to update appointment status" });
    }
  }
);

// --- START SERVER ---
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`✅ SG HealthTrack backend running on http://localhost:${port}`);
});
