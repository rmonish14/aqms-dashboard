const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Pool } = require('pg');

// ── PostgreSQL Connection Pool ────────────────────────────────────────────────
// SSL is required for Render-hosted PostgreSQL (cloud) but not for local dev
const isRenderDb = (process.env.DATABASE_URL || '').includes('render.com');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRenderDb ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000, // Increased to 30s to allow Render DB spin-up
});

pool.on('connect', () => {
  console.log('[DB] ✅ PostgreSQL pool connection established');
});

pool.on('error', (err) => {
  console.error('[DB] ❌ Unexpected PostgreSQL pool error:', err.message);
});

// ── Schema Initialisation ─────────────────────────────────────────────────────
// PLMS Essential Tables Only — minimal, clean schema.
const initSchema = async () => {
  const sql = `
    -- Drop legacy PLMS tables if they exist (one-time migration cleanup)
    DROP TABLE IF EXISTS devices CASCADE;
    DROP TABLE IF EXISTS critical_events CASCADE;
    DROP TABLE IF EXISTS system_config CASCADE;
    DROP TABLE IF EXISTS plms_devices CASCADE;

    -- 1. PLMS: Critical predictive sensor events (only stored on threshold breach)
    CREATE TABLE IF NOT EXISTS plms_critical_events (
      id          SERIAL PRIMARY KEY,
      device_id   VARCHAR(100) NOT NULL,
      vib         FLOAT,
      current     FLOAT,
      temperature FLOAT,
      humidity    FLOAT,
      status      VARCHAR(50),
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. PLMS: System configuration key-value store
    CREATE TABLE IF NOT EXISTS plms_system_config (
      key        VARCHAR(100) PRIMARY KEY,
      value      JSONB        NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO plms_system_config (key, value)
    VALUES (
      'plms_system_settings',
      '{"thresholds":{"vib":5,"current":20,"temp":60,"hum":50},"alertEmail":""}'
    )
    ON CONFLICT (key) DO NOTHING;

    -- 4. Device registry (all MQTT nodes that have ever connected)
    CREATE TABLE IF NOT EXISTS plms_devices (
      device_id  VARCHAR(100) PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Application users
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
    console.log('[DB] ✅ PostgreSQL schema initialised (PLMS essential tables only)');
  } catch (err) {
    console.error('[DB] ❌ Schema initialisation error:', err.message || err);
    throw err;
  }
};

module.exports = { pool, initSchema };
