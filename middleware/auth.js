// middleware/auth.js
const jwt = require("jsonwebtoken");
const supabase = require("./lib/supabase");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ error: "No token provided." });

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify user still exists and is active in DB
    const { data: user, error } = await supabase
      .from("admin_users")
      .select("id, username, email, role, is_active")
      .eq("id", decoded.id)
      .single();

    if (error || !user)
      return res.status(401).json({ error: "User not found." });
    if (!user.is_active)
      return res.status(403).json({ error: "Account has been disabled." });

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError")
      return res.status(401).json({ error: "Session expired. Please log in again." });
    return res.status(401).json({ error: "Invalid token." });
  }
}

// Role guard — use after requireAuth
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user)
      return res.status(401).json({ error: "Not authenticated." });
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: "You do not have permission for this action." });
    next();
  };
}

module.exports = { requireAuth, requireRole };
