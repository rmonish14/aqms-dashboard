const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();
const CONFIG_KEY = 'system_settings';
const DEV_PIN_KEY = 'dev_pin';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/developer/credentials
// Returns all system credentials (must supply correct PIN in header)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/credentials', async (req, res) => {
  const pin = req.headers['x-dev-pin'];
  if (!pin) return res.status(401).json({ error: 'PIN required' });

  try {
    // Get stored PIN
    const { rows } = await pool.query(
      'SELECT value FROM system_config WHERE key = $1', [DEV_PIN_KEY]
    );
    const storedPin = rows.length > 0 ? rows[0].value?.pin : '1234';

    if (pin !== String(storedPin)) {
      return res.status(403).json({ error: 'Incorrect PIN' });
    }

    // Build credential manifest from env + DB config
    const { rows: cfgRows } = await pool.query(
      'SELECT value FROM system_config WHERE key = $1', [CONFIG_KEY]
    );
    const cfg = cfgRows.length > 0 ? cfgRows[0].value : {};

    // Fetch current users
    const { rows: users } = await pool.query(
      `SELECT id, username, role, created_at FROM users ORDER BY created_at`
    );

    const credentials = {
      mqtt: {
        brokerUrl:   process.env.HIVEMQ_URL      || 'mqtt://broker.hivemq.com:1883',
        topic:       'aqms/+/data  |  aqms/+/status',
        clientId:    'aqms-backend-<random>',
        qos:         '1 (data)  /  0 (status)',
      },
      database: {
        connectionString: process.env.DATABASE_URL || '',
        type:             'PostgreSQL (Render Cloud)',
        tables:           'users, devices, sensor_readings, critical_events, system_config',
        poolMax:          10,
      },
      server: {
        port:       process.env.PORT || 5000,
        jwtSecret:  process.env.JWT_SECRET || '',
        nodeEnv:    process.env.NODE_ENV || 'development',
      },
      smtp: {
        host:     'smtp.ethereal.email',
        port:     587,
        user:     process.env.SMTP_USER || '',
        password: process.env.SMTP_PASS || '',
        secure:   false,
      },
      ai: {
        provider:  'OpenRouter',
        model:     'qwen/qwen3.6-plus-preview:free',
        keySource: 'Browser localStorage (set in AI chat settings panel)',
        apiBase:   'https://openrouter.ai/api/v1',
      },
      map: {
        provider:   'OpenStreetMap (Leaflet)',
        apiKey:     'None required — OSM is open source',
        tileServer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      },
      alertEmail: cfg.alertEmail || '',
      users,
    };

    res.json(credentials);
  } catch (err) {
    console.error('[Dev] Failed to load credentials:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/developer/credentials
// Update editable credentials (JWT secret, SMTP, alert email, MQTT broker)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/credentials', async (req, res) => {
  const pin = req.headers['x-dev-pin'];
  if (!pin) return res.status(401).json({ error: 'PIN required' });

  try {
    const { rows } = await pool.query(
      'SELECT value FROM system_config WHERE key = $1', [DEV_PIN_KEY]
    );
    const storedPin = rows.length > 0 ? rows[0].value?.pin : '1234';
    if (pin !== String(storedPin)) return res.status(403).json({ error: 'Incorrect PIN' });

    const { alertEmail, mqttBrokerUrl } = req.body;

    // Persist the editable fields to system_config
    const updates = {};
    if (alertEmail !== undefined) updates.alertEmail = alertEmail;
    if (mqttBrokerUrl !== undefined) updates.mqttBrokerUrl = mqttBrokerUrl;

    if (Object.keys(updates).length > 0) {
      await pool.query(
        `UPDATE system_config SET value = value || $1::jsonb, updated_at = NOW() WHERE key = $2`,
        [JSON.stringify(updates), CONFIG_KEY]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[Dev] Failed to update credentials:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/developer/pin
// Change the developer PIN
// ─────────────────────────────────────────────────────────────────────────────
router.put('/pin', async (req, res) => {
  const pin = req.headers['x-dev-pin'];
  if (!pin) return res.status(401).json({ error: 'PIN required' });

  try {
    const { rows } = await pool.query(
      'SELECT value FROM system_config WHERE key = $1', [DEV_PIN_KEY]
    );
    const storedPin = rows.length > 0 ? rows[0].value?.pin : '1234';
    if (pin !== String(storedPin)) return res.status(403).json({ error: 'Incorrect PIN' });

    const { newPin } = req.body;
    if (!newPin || !/^\d{4}$/.test(newPin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }

    await pool.query(
      `INSERT INTO system_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [DEV_PIN_KEY, JSON.stringify({ pin: newPin })]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[Dev] Failed to change PIN:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/developer/verify-pin
// Just verify the PIN is correct (for frontend unlock gate)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-pin', async (req, res) => {
  try {
    const { pin } = req.body;
    const { rows } = await pool.query(
      'SELECT value FROM system_config WHERE key = $1', [DEV_PIN_KEY]
    );
    const storedPin = rows.length > 0 ? rows[0].value?.pin : '1234';
    res.json({ ok: pin === String(storedPin) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
