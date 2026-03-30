const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/critical
// Returns the last 50 critical events, most recent first
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM critical_events
       ORDER BY created_at DESC
       LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error('[API] Failed to fetch critical events:', err.message);
    res.status(500).json({ error: 'Failed to fetch critical events' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/critical/device/:id
// Returns critical events for a specific device (last 100)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/device/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM critical_events
       WHERE device_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[API] Failed to fetch device events:', err.message);
    res.status(500).json({ error: 'Failed to fetch device events' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/critical/fleet
// Returns all critical events in the last 24 hours across the entire fleet
// ─────────────────────────────────────────────────────────────────────────────
router.get('/fleet', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM critical_events
       WHERE created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[API] Failed to fetch fleet anomalies:', err.message);
    res.status(500).json({ error: 'Failed to fetch fleet anomalies' });
  }
});

module.exports = router;
