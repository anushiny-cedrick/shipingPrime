// lib/email.js
const nodemailer = require("nodemailer");

let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  _transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  return _transporter;
}

const GOLD = "#f59e0b";
const NAVY = "#0c1a2e";

function base(body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif}</style>
</head><body>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:32px 16px">
<table width="580" cellpadding="0" cellspacing="0"
  style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
  <tr><td style="background:${NAVY};padding:28px 32px;text-align:center">
    <div style="display:inline-block;background:${GOLD};color:#000;font-size:20px;
      font-weight:900;padding:10px 24px;border-radius:10px">
      ✈ PrimeShippExpress
    </div>
  </td></tr>
  <tr><td style="padding:36px 32px">${body}</td></tr>
  <tr><td style="background:#f8fafc;padding:20px 32px;text-align:center;
    border-top:1px solid #e2e8f0">
    <p style="margin:0;font-size:12px;color:#94a3b8">
      PrimeShippExpress Inc. &nbsp;·&nbsp; +1 (800) 874-2391
      &nbsp;·&nbsp; ops@primeshippexpress.com
    </p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

function row(label, value) {
  return `<tr>
    <td style="padding:9px 14px;color:#64748b;font-size:14px;
      width:130px;border-bottom:1px solid #f1f5f9">${label}</td>
    <td style="padding:9px 14px;color:#0f172a;font-size:14px;
      font-weight:600;border-bottom:1px solid #f1f5f9">${value}</td>
  </tr>`;
}

const templates = {
  // ── New shipment confirmed ─────────────────────────────────
  created(s) {
    return {
      subject: `📦 Shipment Confirmed — ${s.tracking_id}`,
      html: base(`
        <h2 style="margin:0 0 8px;color:${NAVY};font-size:22px;font-weight:800">
          Your Shipment is Confirmed!
        </h2>
        <p style="color:#64748b;margin:0 0 24px;font-size:14px;line-height:1.7">
          Great news — your shipment has been registered in our system
          and will be processed shortly.
        </p>
        <table width="100%" style="background:#f8fafc;border-radius:10px;
          border:1px solid #e2e8f0;border-collapse:collapse;margin-bottom:24px">
          ${row("Tracking ID", `<span style="color:${GOLD};font-family:monospace;
            font-size:17px;font-weight:900">${s.tracking_id}</span>`)}
          ${row("From", s.origin)}
          ${row("To", s.destination)}
          ${row("Service", s.service_type)}
          ${row("Weight", s.weight || "—")}
          ${row("Est. Arrival", s.eta || "To be confirmed")}
        </table>
        <div style="background:#fef9ee;border:1px solid #fde68a;border-radius:10px;
          padding:16px 20px">
          <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6">
            💡 <strong>Track your shipment anytime</strong> — just visit our website
            and enter your tracking number:
            <strong style="font-family:monospace;color:${GOLD}">${s.tracking_id}</strong>
          </p>
        </div>
      `),
    };
  },

  // ── Status changed ────────────────────────────────────────
  statusChanged(s, oldStatus, note) {
    const statusColors = {
      in_transit: "#3b82f6", customs: "#f59e0b", delivered: "#10b981",
      on_hold: "#f97316", cancelled: "#ef4444", pending: "#94a3b8",
    };
    const col = statusColors[s.status] || "#64748b";
    return {
      subject: `🔄 Shipment Update — ${s.tracking_id} is now ${s.status.replace(/_/g," ")}`,
      html: base(`
        <h2 style="margin:0 0 8px;color:${NAVY};font-size:22px;font-weight:800">
          Status Update
        </h2>
        <p style="color:#64748b;margin:0 0 24px;font-size:14px">
          Your shipment <strong>${s.tracking_id}</strong> has been updated.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
          <tr>
            <td width="44%" style="background:#f1f5f9;border-radius:10px;
              padding:16px;text-align:center">
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;
                letter-spacing:1px;margin-bottom:6px">Previous Status</div>
              <div style="font-weight:700;color:#64748b;font-size:15px">
                ${(oldStatus||"—").replace(/_/g," ")}
              </div>
            </td>
            <td width="12%" style="text-align:center;font-size:22px;color:#cbd5e1">→</td>
            <td width="44%" style="background:#fef9ee;border:2px solid ${col};
              border-radius:10px;padding:16px;text-align:center">
              <div style="font-size:11px;color:#92400e;text-transform:uppercase;
                letter-spacing:1px;margin-bottom:6px">New Status</div>
              <div style="font-weight:900;color:${col};font-size:15px;
                text-transform:uppercase">
                ${s.status.replace(/_/g," ")}
              </div>
            </td>
          </tr>
        </table>
        ${note ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;
          border-radius:10px;padding:14px 18px;margin-bottom:18px">
          <p style="margin:0;font-size:14px;color:#166534">📍 ${note}</p>
        </div>` : ""}
        <p style="font-size:14px;color:#64748b;margin:0">
          Delivery progress: <strong style="color:${GOLD}">${s.progress}%</strong>
        </p>
      `),
    };
  },

  // ── Location update ───────────────────────────────────────
  locationUpdated(s, locationLabel, note) {
    return {
      subject: `📍 Location Update — ${s.tracking_id}`,
      html: base(`
        <h2 style="margin:0 0 8px;color:${NAVY};font-size:22px;font-weight:800">
          Live Location Update
        </h2>
        <p style="color:#64748b;margin:0 0 24px;font-size:14px">
          Your shipment <strong>${s.tracking_id}</strong> has reached a new location.
        </p>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;
          padding:22px;margin-bottom:22px;text-align:center">
          <div style="font-size:11px;color:#3b82f6;text-transform:uppercase;
            letter-spacing:1.5px;margin-bottom:8px;font-weight:700">
            📍 Current Location
          </div>
          <div style="font-size:20px;font-weight:900;color:#1e40af">
            ${locationLabel}
          </div>
          ${note ? `<div style="margin-top:10px;font-size:13px;color:#64748b">${note}</div>` : ""}
        </div>
        <table width="100%" style="background:#f8fafc;border-radius:10px;
          border:1px solid #e2e8f0;border-collapse:collapse">
          ${row("Route", `${s.origin} → ${s.destination}`)}
          ${row("Progress", `${s.progress || 0}% complete`)}
          ${row("ETA", s.eta || "TBC")}
        </table>
      `),
    };
  },

  // ── Delivered ────────────────────────────────────────────
  delivered(s) {
    return {
      subject: `✅ Delivered! — ${s.tracking_id}`,
      html: base(`
        <div style="text-align:center;padding:20px 0 32px">
          <div style="font-size:60px;margin-bottom:14px">✅</div>
          <h2 style="margin:0 0 10px;color:${NAVY};font-size:26px;font-weight:800">
            Package Delivered!
          </h2>
          <p style="color:#64748b;margin:0;font-size:15px">
            Shipment <strong>${s.tracking_id}</strong> has been successfully delivered.
          </p>
        </div>
        <table width="100%" style="background:#f0fdf4;border-radius:10px;
          border:1px solid #bbf7d0;border-collapse:collapse;margin-bottom:24px">
          ${row("From", s.origin)}
          ${row("To", s.destination)}
          ${row("Customer", s.customer_name)}
          ${row("Delivered on",
            new Date().toLocaleDateString("en-GB",
              { day:"2-digit", month:"long", year:"numeric" })
          )}
        </table>
        <div style="text-align:center;padding:10px">
          <p style="margin:0;font-size:14px;color:#64748b">
            Thank you for choosing PrimeShippExpress! 🚀<br>
            We look forward to serving you again.
          </p>
        </div>
      `),
    };
  },
};

async function sendEmail(to, template) {
  if (!to) return false;
  const t = getTransporter();
  if (!t) {
    console.log("⚠️  Email not configured — skipping send to:", to);
    return false;
  }
  try {
    await t.sendMail({
      from:    process.env.EMAIL_FROM || "PrimeShippExpress <noreply@primeshippexpress.com>",
      to,
      subject: template.subject,
      html:    template.html,
    });
    console.log(`📧  Email → ${to}: ${template.subject}`);
    return true;
  } catch (e) {
    console.error("📧  Email error:", e.message);
    return false;
  }
}

module.exports = { sendEmail, templates };
