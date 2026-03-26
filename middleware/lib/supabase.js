// lib/supabase.js
const { createClient } = require("@supabase/supabase-js");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("\n❌  Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env\n");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log("✅  Supabase connected →", process.env.SUPABASE_URL);
module.exports = supabase;
