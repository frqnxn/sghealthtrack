import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Nurse/Lab/Cashier: see ONLY approved appointments
router.get(
  "/approved",
  requireAuth,
  requireRole(["nurse", "lab", "cashier"]),
  async (req, res) => {
    const { data, error } = await supabase
      .from("appointments")
      .select("id, user_id, appointment_type, preferred_date, status, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ appointments: data });
  }
);

export default router;
