const express    = require('express');
const nodemailer = require('nodemailer');
const { pool }   = require('../config/db');

const router = express.Router();

// ── Nodemailer Transport ─────────────────────────────────────────────────────
// Uses Ethereal (free test SMTP). Swap for a real SMTP provider in production.
let transporter = nodemailer.createTransport({
  host: 'smtp.ethereal.email',
  port: 587,
  auth: {
    user: process.env.SMTP_USER || 'kassandra.glover@ethereal.email',
    pass: process.env.SMTP_PASS || '6yC19B4C3g6SZNXStH',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: get alert email from system_config in PostgreSQL
// ─────────────────────────────────────────────────────────────────────────────
async function getAlertEmail() {
  try {
    const { rows } = await pool.query(
      `SELECT value FROM system_config WHERE key = 'system_settings'`
    );
    return rows[0]?.value?.alertEmail || null;
  } catch (err) {
    console.error('[Email] Failed to fetch alertEmail from config:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/email/share
// Manually shares node telemetry data via email
// Body: { recipientEmail?, subject?, message?, nodeData }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/share', async (req, res) => {
  const { recipientEmail, subject, message, nodeData } = req.body;

  try {
    // Prefer a directly provided recipient, then fall back to system config
    let targetEmail = recipientEmail;
    if (!targetEmail) {
      targetEmail = await getAlertEmail();
    }

    if (!targetEmail) {
      return res.status(400).json({ error: 'No recipient email configured or provided.' });
    }

    const htmlContent = `
      <div style="font-family:sans-serif;background:#1a1a1a;color:#eee;padding:20px;border-radius:8px;">
        <h2 style="color:#60a5fa;">AQMS Data Share</h2>
        <p>${message || 'A supervisor has shared a node telemetry card with you.'}</p>
        <hr style="border-color:#333;" />
        <p><strong>Node:</strong> ${nodeData?.id || nodeData?.nodeId || 'Unknown'}</p>
        <p><strong>PM2.5:</strong> ${nodeData?.pm25 ?? nodeData?.pm2_5 ?? 'N/A'} µg/m³</p>
        <p><strong>CO2:</strong> ${nodeData?.co2 ?? 'N/A'} ppm</p>
        <p><strong>Temperature:</strong> ${nodeData?.temperature ?? nodeData?.temp ?? 'N/A'} °C</p>
        <p><strong>Status:</strong> ${nodeData?.status || 'N/A'}</p>
        <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
      </div>
    `;

    const info = await transporter.sendMail({
      from: '"AQMS Alert System" <no-reply@aqms-industrial.com>',
      to: targetEmail,
      subject: subject || 'AQMS Shared Telemetry Data',
      html: htmlContent,
    });

    console.log('[Email] Share email sent. Preview URL:', nodemailer.getTestMessageUrl(info));
    res.json({ message: 'Email dispatched successfully', previewUrl: nodemailer.getTestMessageUrl(info) });
  } catch (err) {
    console.error('[Email] Error sending share email:', err.message);
    res.status(500).json({ error: 'Failed to dispatch email.' });
  }
});

module.exports = { router, transporter };
