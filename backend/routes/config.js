const express = require('express');
const { pool } = require('../config/db');

const router    = express.Router();
const CONFIG_KEY = 'system_settings';

let handlerModule = null;
function getHandler() {
  if (!handlerModule) {
    try { handlerModule = require('../mqtt/handler'); } catch (_) {}
  }
  return handlerModule;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/config
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT value FROM system_config WHERE key = $1', [CONFIG_KEY]
    );

    if (rows.length === 0) {
      const defaults = buildDefaults();
      await pool.query(
        `INSERT INTO system_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
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

    // Invalidate the MQTT handler cache so next message picks up new values immediately
    const handler = getHandler();
    if (handler && handler.invalidateConfigCache) handler.invalidateConfigCache();

    res.json(rows[0].value);
  } catch (err) {
    console.error('[Config] Failed to update config:', err.message);
    res.status(500).json({ error: 'Failed to update config', details: err.message });
  }
});

function buildDefaults() {
  return {
    thresholds: {
      aqi:     150, aqiMin:  0,
      pm25:    100, pm25Min: 0,
      pm10:    150, pm10Min: 0,
      co:       35, coMin:   0,
      co2:    1000, co2Min:  300,
      temp:     40, tempMin: 0,
    },
    alertMessages: {
      pm25High: 'PM2.5 has exceeded the safe limit — check ventilation.',
      pm25Low:  'PM2.5 reading is abnormally low — sensor may be faulty.',
      pm10High: 'PM10 particulate matter is above the safe threshold.',
      pm10Low:  'PM10 reading is abnormally low — sensor may be faulty.',
      coHigh:   'CO level is dangerously high — evacuate area immediately.',
      coLow:    'CO reading is near zero — sensor fault suspected.',
      co2High:  'CO₂ level is too high — improve indoor ventilation.',
      co2Low:   'CO₂ reading is abnormally low — sensor may be offline.',
      tempHigh: 'Temperature exceeds safe operating limit.',
      tempLow:  'Temperature is abnormally low — cold stress risk.',
    },
    alertEmail: '',
    notifications: {
      emailEnabled: false,
      telegramEnabled: false,
      notifyOnWarn: true,
      notifyOnCrit: true,
    },
    mqtt: { host: 'broker.hivemq.com', port: '1883', tls: false },
  };
}

module.exports = router;
