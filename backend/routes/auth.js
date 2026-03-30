const express  = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { pool }  = require('../config/db');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'aqms_jwt_secret_change_in_production';
const SALT_ROUNDS = 12;

// ── Helper: hash a plain-text password ───────────────────────────────────────
const hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Creates a new user with a bcrypt-hashed password
// Body: { username, password, role? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, password, role = 'operator' } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    // Check for duplicate username
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Hash password before storage — never store plain text
    const hashed = await hashPassword(password);

    await pool.query(
      'INSERT INTO users (username, password, role) VALUES ($1, $2, $3)',
      [username, hashed, role]
    );

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('[Auth] Register error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login  (also aliased via POST /api/login in server.js)
// Body: { username, password }
// Returns: { token, role }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, role: user.role, username: user.username });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
