import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY // ok for verifying user, but service key is better later
);

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) return res.status(401).json({ error: "Missing token" });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Invalid token" });

    req.user = data.user;
    next();
  } catch (e) {
    res.status(500).json({ error: "Auth error" });
  }
}

export function requireRole(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", req.user.id)
        .single();

      if (error || !data?.role) return res.status(403).json({ error: "No role found" });
      if (!allowedRoles.includes(data.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      req.role = data.role;
      next();
    } catch (e) {
      res.status(500).json({ error: "Role check error" });
    }
  };
}
