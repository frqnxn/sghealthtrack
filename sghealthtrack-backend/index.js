import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import reportRoutes from "./routes/report.js";
dotenv.config();

const app = express();
app.use(express.json());
app.use("/api/report", reportRoutes);

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
