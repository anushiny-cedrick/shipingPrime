// routes/track.js — PUBLIC (no authentication required)
// Customers use this to track their shipments
const express  = require("express");
const supabase = require("../lib/supabase");

const router = express.Router();

// GET /api/track/:trackingId
router.get("/:trackingId", async (req, res) => {
  try {
    const tid = req.params.trackingId.trim().toUpperCase();

    // Find shipment (only return public-safe fields)
    const { data: shipment, error } = await supabase
      .from("shipments")
      .select(`
        id, tracking_id, customer_name, origin, destination,
        service_type, weight, status, progress, eta,
        current_lat, current_lng, created_at, updated_at
      `)
      .eq("tracking_id", tid)
      .single();

    if (error || !shipment)
      return res.status(404).json({
        error: `No shipment found with tracking ID: ${tid}`
      });

    // Get checkpoints
    const { data: checkpoints } = await supabase
      .from("checkpoints")
      .select("id, name, lat, lng, scheduled_time, is_done, note, sort_order, arrived_at")
      .eq("shipment_id", shipment.id)
      .order("sort_order");

    // Get last 15 location updates
    const { data: locationHistory } = await supabase
      .from("location_history")
      .select("id, lat, lng, label, note, created_at")
      .eq("shipment_id", shipment.id)
      .order("created_at", { ascending: false })
      .limit(15);

    res.json({
      shipment,
      checkpoints:     checkpoints     || [],
      locationHistory: locationHistory || [],
    });
  } catch (err) {
    console.error("Track error:", err);
    res.status(500).json({ error: "Server error." });
  }
});

module.exports = router;
