// routes/shipments.js — ADMIN PROTECTED
const express             = require("express");
const supabase            = require("../lib/supabase");
const { requireAuth }     = require("../middleware/auth");
const { sendEmail, templates } = require("../lib/email");

const router = express.Router();
router.use(requireAuth); // all routes below need a valid JWT

// ── Helper: auto-generate tracking ID ────────────────────────────────────────
async function generateTrackingId() {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("shipments")
    .select("*", { count: "exact", head: true });
  const num = String((count || 0) + 1).padStart(4, "0");
  return `PSE-${year}-${num}`;
}

// ── GET /api/shipments — list all ────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { status, search, page = 1, limit = 100 } = req.query;
    const from = (parseInt(page) - 1) * parseInt(limit);
    const to   = from + parseInt(limit) - 1;

    let query = supabase
      .from("shipments")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status && status !== "all")
      query = query.eq("status", status);

    if (search) {
      query = query.or(
        `tracking_id.ilike.%${search}%,` +
        `customer_name.ilike.%${search}%,` +
        `origin.ilike.%${search}%,` +
        `destination.ilike.%${search}%,` +
        `customer_email.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ shipments: data || [], total: count || 0 });
  } catch (err) {
    console.error("List shipments error:", err);
    res.status(500).json({ error: "Failed to fetch shipments." });
  }
});

// ── GET /api/shipments/:id — single with checkpoints + history ───────────────
router.get("/:id", async (req, res) => {
  try {
    const { data: shipment, error } = await supabase
      .from("shipments")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !shipment)
      return res.status(404).json({ error: "Shipment not found." });

    const [{ data: checkpoints }, { data: locationHistory }] = await Promise.all([
      supabase.from("checkpoints")
        .select("*")
        .eq("shipment_id", req.params.id)
        .order("sort_order"),
      supabase.from("location_history")
        .select("*")
        .eq("shipment_id", req.params.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    res.json({
      ...shipment,
      checkpoints:     checkpoints     || [],
      locationHistory: locationHistory || [],
    });
  } catch (err) {
    console.error("Get shipment error:", err);
    res.status(500).json({ error: "Server error." });
  }
});

// ── POST /api/shipments — create new ─────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const {
      customer_name, customer_email, customer_phone,
      origin, destination, service_type, weight,
      status, progress, eta, priority, notes,
      current_lat, current_lng, checkpoints,
    } = req.body;

    if (!customer_name || !origin || !destination)
      return res.status(400).json({
        error: "customer_name, origin and destination are required."
      });

    const tracking_id = await generateTrackingId();
    const now         = new Date().toISOString();

    // Insert shipment
    const { data: shipment, error } = await supabase
      .from("shipments")
      .insert({
        tracking_id,
        customer_name,
        customer_email: customer_email || "",
        customer_phone: customer_phone || "",
        origin, destination,
        service_type: service_type || "Air Freight",
        weight:    weight    || "",
        status:    status    || "pending",
        progress:  progress  || 0,
        eta:       eta       || null,
        priority:  priority  || "medium",
        notes:     notes     || "",
        current_lat: parseFloat(current_lat) || 0,
        current_lng: parseFloat(current_lng) || 0,
        created_at:  now,
        updated_at:  now,
      })
      .select()
      .single();

    if (error) throw error;

    // Insert checkpoints
    if (checkpoints && checkpoints.length > 0) {
      const cpRows = checkpoints.map((cp, i) => ({
        shipment_id:    shipment.id,
        name:           cp.name       || "",
        lat:            parseFloat(cp.lat)  || 0,
        lng:            parseFloat(cp.lng)  || 0,
        scheduled_time: cp.time       || null,
        is_done:        cp.done       || false,
        note:           cp.note       || "",
        sort_order:     i,
        arrived_at:     null,
        created_at:     now,
      }));
      const { error: cpError } = await supabase.from("checkpoints").insert(cpRows);
      if (cpError) console.error("Checkpoint insert error:", cpError);
    }

    // Initial location history entry
    await supabase.from("location_history").insert({
      shipment_id: shipment.id,
      lat:   parseFloat(current_lat) || 0,
      lng:   parseFloat(current_lng) || 0,
      label: origin,
      note:  "Shipment created",
      created_at: now,
    });

    // Send confirmation email to customer
    if (customer_email) {
      sendEmail(customer_email, templates.created(shipment));
    }

    res.status(201).json(shipment);
  } catch (err) {
    console.error("Create shipment error:", err);
    res.status(500).json({ error: "Failed to create shipment." });
  }
});

// ── PUT /api/shipments/:id — full update ──────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const { checkpoints, locationHistory, id: _id, ...fields } = req.body;

    // Fetch old record for change detection
    const { data: old } = await supabase
      .from("shipments")
      .select("status, customer_email")
      .eq("id", req.params.id)
      .single();

    const now = new Date().toISOString();
    const { data: shipment, error } = await supabase
      .from("shipments")
      .update({ ...fields, updated_at: now })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Replace checkpoints if provided
    if (checkpoints !== undefined) {
      await supabase.from("checkpoints").delete().eq("shipment_id", req.params.id);

      if (checkpoints.length > 0) {
        const cpRows = checkpoints.map((cp, i) => ({
          shipment_id:    req.params.id,
          name:           cp.name   || "",
          lat:            parseFloat(cp.lat) || 0,
          lng:            parseFloat(cp.lng) || 0,
          scheduled_time: cp.time   || null,
          is_done:        cp.done   || false,
          note:           cp.note   || "",
          sort_order:     i,
          arrived_at:     cp.done ? now : null,
          created_at:     now,
        }));
        await supabase.from("checkpoints").insert(cpRows);
      }
    }

    // Email if status changed
    if (old && old.status !== fields.status && old.customer_email) {
      if (fields.status === "delivered") {
        sendEmail(old.customer_email, templates.delivered(shipment));
      } else {
        sendEmail(old.customer_email, templates.statusChanged(shipment, old.status, fields.notes));
      }
    }

    res.json(shipment);
  } catch (err) {
    console.error("Update shipment error:", err);
    res.status(500).json({ error: "Failed to update shipment." });
  }
});

// ── PATCH /api/shipments/:id/location — update live position ─────────────────
router.patch("/:id/location", async (req, res) => {
  try {
    const { lat, lng, label, note, status, progress } = req.body;

    if (lat === undefined || lng === undefined)
      return res.status(400).json({ error: "lat and lng are required." });

    const now     = new Date().toISOString();
    const updates = {
      current_lat: parseFloat(lat),
      current_lng: parseFloat(lng),
      updated_at:  now,
    };
    if (status   !== undefined) updates.status   = status;
    if (progress !== undefined) updates.progress = parseInt(progress);

    const { data: shipment, error } = await supabase
      .from("shipments")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Log to location history
    await supabase.from("location_history").insert({
      shipment_id: req.params.id,
      lat:         parseFloat(lat),
      lng:         parseFloat(lng),
      label:       label || "Location updated",
      note:        note  || "",
      created_at:  now,
    });

    // Auto-tick matching checkpoint
    if (label) {
      const keyword = label.split(",")[0].toLowerCase();
      const { data: cps } = await supabase
        .from("checkpoints")
        .select("id, name")
        .eq("shipment_id", req.params.id)
        .eq("is_done", false);

      if (cps && cps.length > 0) {
        const match = cps.find(cp => cp.name.toLowerCase().includes(keyword));
        if (match) {
          await supabase
            .from("checkpoints")
            .update({ is_done: true, arrived_at: now, note: note || "Arrived" })
            .eq("id", match.id);
        }
      }
    }

    // Email customer about location update
    if (shipment.customer_email) {
      sendEmail(
        shipment.customer_email,
        templates.locationUpdated(shipment, label || `${lat}, ${lng}`, note)
      );
    }

    res.json({ ...shipment, message: "Location updated successfully." });
  } catch (err) {
    console.error("Location update error:", err);
    res.status(500).json({ error: "Failed to update location." });
  }
});

// ── DELETE /api/shipments/:id ─────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    // Checkpoints and location_history auto-delete via CASCADE
    const { error } = await supabase
      .from("shipments")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ message: "Shipment deleted successfully." });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete shipment." });
  }
});

module.exports = router;
