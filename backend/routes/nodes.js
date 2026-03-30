const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/nodes
// Returns all registered devices from the devices table
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM devices ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[API] Failed to fetch devices:', err.message);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/nodes/:id
// Returns a single device by device_id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM devices WHERE device_id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[API] Failed to fetch device:', err.message);
    res.status(500).json({ error: 'Error fetching device' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/nodes/:id/events
// Returns the last 100 critical events for a specific device
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/events', async (req, res) => {
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
    res.status(500).json({ error: 'Error fetching device events' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/nodes/fleet/anomalies
// Returns all critical anomalies in the last 24 hours across the fleet
// ─────────────────────────────────────────────────────────────────────────────
router.get('/fleet/anomalies', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM critical_events
       WHERE created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[API] Failed to fetch fleet anomalies:', err.message);
    res.status(500).json({ error: 'Error fetching fleet anomalies' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/nodes
// Manually register a device with an optional location
// Body: { device_id, location? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { device_id, location } = req.body;
  if (!device_id) return res.status(400).json({ error: 'device_id is required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO devices (device_id, location)
       VALUES ($1, $2)
       ON CONFLICT (device_id) DO UPDATE SET location = EXCLUDED.location
       RETURNING *`,
      [device_id, location || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[API] Failed to register device:', err.message);
    res.status(500).json({ error: 'Failed to register device' });
  }
});

module.exports = router;
