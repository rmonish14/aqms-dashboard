const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alerts
// Returns the last 100 critical events across all devices (most recent first)
// All alerts are stored as critical_events in PostgreSQL
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM critical_events
       ORDER BY created_at DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    console.error('[API] Failed to fetch alerts:', err.message);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

module.exports = router;
