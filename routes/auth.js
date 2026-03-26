// routes/auth.js
const express      = require("express");
const bcrypt       = require("bcryptjs");
const jwt          = require("jsonwebtoken");
const supabase     = require("../lib/supabase");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: "Username and password are required." });

    // Find by username OR email
    const { data: user, error } = await supabase
      .from("admin_users")
      .select("*")
      .or(`username.eq.${username.toLowerCase().trim()},email.eq.${username.toLowerCase().trim()}`)
      .eq("is_active", true)
      .single();

    if (error || !user)
      return res.status(401).json({ error: "Invalid username or password." });

    // Check password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ error: "Invalid username or password." });

    // Sign JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    // Record last login
    await supabase
      .from("admin_users")
      .update({ last_login: new Date().toISOString() })
      .eq("id", user.id);

    return res.json({
      token,
      user: {
        id:        user.id,
        username:  user.username,
        email:     user.email,
        role:      user.role,
        full_name: user.full_name,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login." });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/me", requireAuth, (req, res) => {
  const { password, ...safe } = req.user;
  res.json({ user: safe });
});

// ── POST /api/auth/change-password ────────────────────────────────────────────
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: "Both current and new passwords are required." });
    if (newPassword.length < 8)
      return res.status(400).json({ error: "New password must be at least 8 characters." });

    // Get current hash
    const { data: user } = await supabase
      .from("admin_users")
      .select("password")
      .eq("id", req.user.id)
      .single();

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid)
      return res.status(401).json({ error: "Current password is incorrect." });

    const hashed = await bcrypt.hash(newPassword, 12);
    await supabase
      .from("admin_users")
      .update({ password: hashed, updated_at: new Date().toISOString() })
      .eq("id", req.user.id);

    res.json({ message: "Password changed successfully." });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Server error." });
  }
});

module.exports = router;
