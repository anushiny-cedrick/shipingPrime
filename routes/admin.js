// routes/admin.js
const express                    = require("express");
const bcrypt                     = require("bcryptjs");
const supabase                   = require("../lib/supabase");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const statuses = ["pending","in_transit","customs","on_hold","delivered","cancelled"];
    const results  = await Promise.all(
      statuses.map(s =>
        supabase
          .from("shipments")
          .select("*", { count: "exact", head: true })
          .eq("status", s)
      )
    );
    const total = await supabase
      .from("shipments")
      .select("*", { count: "exact", head: true });

    const stats = { total: total.count || 0 };
    statuses.forEach((s, i) => { stats[s] = results[i].count || 0; });

    res.json(stats);
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Failed to load stats." });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get("/users", requireRole("super_admin"), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("admin_users")
      .select("id, username, email, role, full_name, is_active, last_login, created_at")
      .order("created_at");

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to load users." });
  }
});

// ── POST /api/admin/users — create admin ──────────────────────────────────────
router.post("/users", requireRole("super_admin"), async (req, res) => {
  try {
    const { username, email, password, role, full_name } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ error: "username, email and password are required." });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters." });

    const hashed = await bcrypt.hash(password, 12);
    const now    = new Date().toISOString();

    const { data, error } = await supabase
      .from("admin_users")
      .insert({
        username:   username.toLowerCase().trim(),
        email:      email.toLowerCase().trim(),
        password:   hashed,
        role:       role      || "dispatcher",
        full_name:  full_name || "",
        is_active:  true,
        created_at: now,
        updated_at: now,
      })
      .select("id, username, email, role, full_name, is_active")
      .single();

    if (error) {
      if (error.code === "23505")
        return res.status(409).json({ error: "Username or email already exists." });
      throw error;
    }

    res.status(201).json(data);
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ error: "Failed to create user." });
  }
});

// ── PATCH /api/admin/users/:id ────────────────────────────────────────────────
router.patch("/users/:id", requireRole("super_admin"), async (req, res) => {
  try {
    const { role, is_active, full_name } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (role      !== undefined) updates.role      = role;
    if (is_active !== undefined) updates.is_active = is_active;
    if (full_name !== undefined) updates.full_name = full_name;

    const { data, error } = await supabase
      .from("admin_users")
      .update(updates)
      .eq("id", req.params.id)
      .select("id, username, email, role, full_name, is_active")
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to update user." });
  }
});

module.exports = router;
