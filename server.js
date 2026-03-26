// server.js — PrimeShippExpress API Server
require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    "http://localhost:5173",
    "http://localhost:3000",
  ],
  methods:        ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
  credentials:    true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Global rate limiter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      300,
  message:  { error: "Too many requests — please try again later." },
}));

// Strict limiter for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { error: "Too many login attempts — please wait 15 minutes." },
});

// ── Import routes ────────────────────────────────────────────────────────────
const authRoutes     = require("./routes/auth");
const shipmentRoutes = require("./routes/shipments");
const adminRoutes    = require("./routes/admin");
const trackRoutes    = require("./routes/track");

// ── Health checks ────────────────────────────────────────────────────────────
app.get("/", (_, res) => res.json({
  service:   "PrimeShippExpress API",
  version:   "1.0.0",
  status:    "online",
  timestamp: new Date().toISOString(),
}));

app.get("/health", (_, res) => res.json({ ok: true, uptime: process.uptime() }));

// ── Mount routes ─────────────────────────────────────────────────────────────
app.use("/api/auth",      authLimiter, authRoutes);   // Login / logout / me
app.use("/api/track",                  trackRoutes);  // Public tracking
app.use("/api/shipments",              shipmentRoutes);// Admin CRUD
app.use("/api/admin",                  adminRoutes);  // Admin stats / users

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: "Route not found." }));

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production"
      ? "An internal server error occurred."
      : err.message,
  });
});

// ── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  PrimeShippExpress API running on port ${PORT}`);
  console.log(`    ENV:  ${process.env.NODE_ENV}`);
  console.log(`    CORS: ${process.env.FRONTEND_URL}\n`);
});
