import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Admin: view ALL appointments
router.get(
  "/",
  requireAuth,
  requireRole(["admin"]),
  async (req, res) => {
    const { data, error } = await supabase
      .from("appointments")
      .select("id, user_id, appointment_type, preferred_date, status, created_at")
      .order("created_at", { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ appointments: data });
  }
);

// Admin: update status (approved/rejected/pending)
router.patch(
  "/:id/status",
  requireAuth,
  requireRole(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["pending", "approved", "rejected"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const { data, error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ appointment: data });
  }
);

export default router;
