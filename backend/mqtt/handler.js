const { pool } = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// LIVE THRESHOLD CACHE
// Loaded from PostgreSQL every 30 seconds — no server restart needed.
// ─────────────────────────────────────────────────────────────────────────────
let cachedConfig = null;
let lastConfigLoad = 0;
const CONFIG_TTL_MS = 30_000; // refresh every 30s
const CONFIG_KEY    = 'system_settings';

async function getConfig() {
  const now = Date.now();
  if (cachedConfig && (now - lastConfigLoad) < CONFIG_TTL_MS) return cachedConfig;

  try {
    const { rows } = await pool.query(
      'SELECT value FROM system_config WHERE key = $1', [CONFIG_KEY]
    );
    if (rows.length > 0) {
      cachedConfig    = rows[0].value;
      lastConfigLoad  = now;
      console.log('[MQTT] ✅ Thresholds refreshed from DB');
    }
  } catch (err) {
    console.error('[MQTT] ⚠ Could not load config from DB — using cached/defaults:', err.message);
  }

  // Absolute fallback if DB is unreachable and cache is empty
  if (!cachedConfig) {
    cachedConfig = {
      thresholds: {
        pm25: 100, pm25Min: 0,
        pm10: 150, pm10Min: 0,
        co:   35,  coMin:   0,
        co2:  1000, co2Min: 300,
        temp: 40,  tempMin: 0,
        aqi:  150, aqiMin:  0,
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
      }
    };
  }

  return cachedConfig;
}

// Force-expire the cache so the next message picks up new config immediately
// Called by the config PUT route after a save (optional enhancement)
function invalidateConfigCache() {
  lastConfigLoad = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: upsert device registration
// ─────────────────────────────────────────────────────────────────────────────
async function upsertDevice(deviceId) {
  try {
    await pool.query(
      `INSERT INTO devices (device_id) VALUES ($1) ON CONFLICT (device_id) DO NOTHING`,
      [deviceId]
    );
  } catch (err) {
    console.error(`[MQTT] Failed to upsert device ${deviceId}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: check a single metric against high + low limits
// Returns an alert object or null
// ─────────────────────────────────────────────────────────────────────────────
function checkMetric({ nodeId, metric, value, high, low, msgHigh, msgLow }) {
  if (value > high) {
    return {
      id:        `${nodeId}-${metric}-high-${Date.now()}`,
      nodeId,
      metric,
      value,
      limit:     high,
      direction: 'high',
      message:   msgHigh || `${metric.toUpperCase()} exceeded limit (${value} > ${high})`,
      severity:  'critical',
      timestamp: new Date().toISOString(),
    };
  }
  if (low !== undefined && low !== null && value <= low && value >= 0) {
    return {
      id:        `${nodeId}-${metric}-low-${Date.now()}`,
      nodeId,
      metric,
      value,
      limit:     low,
      direction: 'low',
      message:   msgLow || `${metric.toUpperCase()} is below minimum threshold (${value} ≤ ${low})`,
      severity:  'warning',
      timestamp: new Date().toISOString(),
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main message handler
// ─────────────────────────────────────────────────────────────────────────────
async function handleMessage(topic, message, io) {
  const parts = topic.split('/');
  if (parts.length < 3) return;

  const nodeId  = parts[1];
  const msgType = parts[2];

  // ── DATA packets ────────────────────────────────────────────────────────────
  if (msgType === 'data') {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch {
      console.error(`[MQTT] ❌ Invalid JSON from ${nodeId}`);
      return;
    }

    const deviceId    = payload.device_id   || nodeId;
    const pm25        = parseFloat(payload.pm25 ?? payload.pm2_5 ?? 0);
    const pm10        = parseFloat(payload.pm10  ?? 0);
    const co          = parseFloat(payload.co    ?? 0);
    const co2         = parseFloat(payload.co2   ?? 0);
    const temperature = parseFloat(payload.temp  ?? payload.temperature ?? 0);
    const humidity    = parseFloat(payload.humidity ?? payload.hum ?? 0);
    const lat         = payload.lat  != null ? parseFloat(payload.lat)  : null;
    const long        = payload.lon  != null ? parseFloat(payload.lon)  :  // ESP sends 'lon'
                        payload.long != null ? parseFloat(payload.long) : null;
    const relay      = payload.relay      ?? null;   // 'ON' | 'OFF' | null
    const mode       = payload.mode       ?? null;   // 'AUTO' | 'MANUAL' | null
    const air_status = payload.air_status ?? null;   // ML label from ESP edge model

    console.log(`[MQTT] 📡 ${deviceId}: PM2.5=${pm25} PM10=${pm10} CO=${co} CO2=${co2} Temp=${temperature} Hum=${humidity} Relay=${relay} Mode=${mode} ML=${air_status}`);

    await upsertDevice(deviceId);

    // Broadcast live telemetry to dashboard (relay, mode, air_status passthrough)
    io.emit('node_data', { nodeId: deviceId, pm25, pm10, co, co2, temperature, humidity, lat, long, relay, mode, air_status, timestamp: new Date().toISOString() });

    // ── Load current thresholds + messages from DB ─────────────────────────
    const cfg = await getConfig();
    const T   = cfg.thresholds   || {};
    const M   = cfg.alertMessages || {};

    // ── Evaluate all metrics against high + low limits ──────────────────────
    const checks = [
      checkMetric({ nodeId: deviceId, metric: 'pm25',        value: pm25,        high: T.pm25  ?? 100, low: T.pm25Min  ?? 0,   msgHigh: M.pm25High,  msgLow: M.pm25Low  }),
      checkMetric({ nodeId: deviceId, metric: 'pm10',        value: pm10,        high: T.pm10  ?? 150, low: T.pm10Min  ?? 0,   msgHigh: M.pm10High,  msgLow: M.pm10Low  }),
      checkMetric({ nodeId: deviceId, metric: 'co',          value: co,          high: T.co    ?? 35,  low: T.coMin    ?? 0,   msgHigh: M.coHigh,    msgLow: M.coLow    }),
      checkMetric({ nodeId: deviceId, metric: 'co2',         value: co2,         high: T.co2   ?? 1000,low: T.co2Min   ?? 300, msgHigh: M.co2High,   msgLow: M.co2Low   }),
      checkMetric({ nodeId: deviceId, metric: 'temperature', value: temperature, high: T.temp  ?? 40,  low: T.tempMin  ?? 0,   msgHigh: M.tempHigh,  msgLow: M.tempLow  }),
    ].filter(Boolean);

    // ── Emit each breach as a new_alert event ──────────────────────────────
    for (const alert of checks) {
      console.log(`[ALERT] ${alert.severity.toUpperCase()} — ${alert.nodeId} ${alert.metric}: ${alert.value} (${alert.direction} limit: ${alert.limit})`);
      io.emit('new_alert', alert);

      // Persist to critical_events table
      try {
        await pool.query(
          `INSERT INTO critical_events (device_id, pm25, co2, temperature, status)
           VALUES ($1, $2, $3, $4, $5)`,
          [deviceId, pm25, co2, temperature, `${alert.metric.toUpperCase()}_${alert.direction.toUpperCase()}_BREACH`]
        );
      } catch (err) {
        console.error(`[DB] Failed to log critical event:`, err.message);
      }
    }
  }

  // ── STATUS packets ───────────────────────────────────────────────────────────
  if (msgType === 'status') {
    const statusText = message.toString().toLowerCase() === 'online' ? 'online' : 'offline';
    try {
      await upsertDevice(nodeId);
      io.emit('node_status', { nodeId, status: statusText });
      console.log(`[MQTT] ${statusText === 'online' ? '🟢' : '🔴'} Status for ${nodeId}: ${statusText}`);

      if (statusText === 'offline') {
        await pool.query(
          `INSERT INTO critical_events (device_id, status) VALUES ($1, $2)`,
          [nodeId, 'NODE_OFFLINE_DROP']
        );
        io.emit('new_alert', {
          id:        `${nodeId}-offline-${Date.now()}`,
          nodeId,
          metric:    'connectivity',
          direction: 'offline',
          message:   `Node ${nodeId} has gone offline — no heartbeat received.`,
          severity:  'critical',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`[MQTT] Status update failed for ${nodeId}:`, err.message);
    }
  }
}

module.exports = { handleMessage, invalidateConfigCache };
