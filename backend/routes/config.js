const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

const CONFIG_KEY = 'system_settings';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/config
// Returns the system configuration JSON from PostgreSQL
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT value FROM system_config WHERE key = $1',
      [CONFIG_KEY]
    );

    if (rows.length === 0) {
      // Seed default config if missing
      const defaults = {
        thresholds:    { aqi: 150, pm25: 100, co2: 1000, temp: 35 },
        alertEmail:    '',
        notifications: {
          emailEnabled: false,
          telegramEnabled: false,
          notifyOnWarn: true,
          notifyOnCrit: true,
        },
        mqtt: { host: 'broker.hivemq.com', port: '1883', tls: false },
      };

      await pool.query(
        `INSERT INTO system_config (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO NOTHING`,
        [CONFIG_KEY, JSON.stringify(defaults)]
      );

      return res.json(defaults);
    }

    res.json(rows[0].value);
  } catch (err) {
    console.error('[Config] Failed to fetch config:', err.message);
    res.status(500).json({ error: 'Failed to fetch config', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/config
// Deep-merges the request body into the existing config
// Body: partial config object (e.g. { alertEmail: "..." })
// ─────────────────────────────────────────────────────────────────────────────
router.put('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE system_config
       SET value = value || $1::jsonb, updated_at = NOW()
       WHERE key = $2
       RETURNING value`,
      [JSON.stringify(req.body), CONFIG_KEY]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Config not found. Run the server once to initialise.' });
    }

    res.json(rows[0].value);
  } catch (err) {
    console.error('[Config] Failed to update config:', err.message);
    res.status(500).json({ error: 'Failed to update config', details: err.message });
  }
});

module.exports = router;
