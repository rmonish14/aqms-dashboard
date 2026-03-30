require('dotenv').config();
const { Pool } = require('pg');

// ── PostgreSQL Connection Pool ────────────────────────────────────────────────
// Reads DATABASE_URL from environment. Falls back to the Render-hosted DB.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Render-hosted PostgreSQL
  },
  max: 10,               // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  console.log('[DB] ✅ PostgreSQL pool connection established');
});

pool.on('error', (err) => {
  console.error('[DB] ❌ Unexpected PostgreSQL pool error:', err.message);
});

// ── Schema Initialisation ─────────────────────────────────────────────────────
// Creates all required tables on startup if they don't exist.
const initSchema = async () => {
  const sql = `
    -- 1. Registered devices / nodes
    CREATE TABLE IF NOT EXISTS devices (
      id         SERIAL PRIMARY KEY,
      device_id  VARCHAR(100) UNIQUE NOT NULL,
      location   TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Critical sensor events (only stored when thresholds are breached)
    CREATE TABLE IF NOT EXISTS critical_events (
      id          SERIAL PRIMARY KEY,
      device_id   VARCHAR(100) NOT NULL,
      pm25        FLOAT,
      co2         FLOAT,
      temperature FLOAT,
      status      VARCHAR(50),
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. System configuration key-value store (JSONB for flexible settings)
    CREATE TABLE IF NOT EXISTS system_config (
      key        VARCHAR(100) PRIMARY KEY,
      value      JSONB        NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    );

    -- Seed default system settings if absent
    INSERT INTO system_config (key, value)
    VALUES (
      'system_settings',
      '{"thresholds":{"aqi":150,"pm25":100,"co2":1000,"temp":35},"alertEmail":""}'
    )
    ON CONFLICT (key) DO NOTHING;

    -- 4. Application users
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      username   VARCHAR(100) UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      role       VARCHAR(30) DEFAULT 'operator',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(sql);
    console.log('[DB] ✅ PostgreSQL schema initialised');
  } catch (err) {
    console.error('[DB] ❌ Schema initialisation error:', err.message || err);
    throw err; // Surface the error so the process knows DB setup failed
  }
};

module.exports = { pool, initSchema };
