const { pool } = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// THRESHOLDS
// Only data that breaches at least one threshold is stored in PostgreSQL.
// ─────────────────────────────────────────────────────────────────────────────
const THRESHOLDS = {
  pm25: parseFloat(process.env.THRESHOLD_PM25) || 100,
  co2:  parseFloat(process.env.THRESHOLD_CO2)  || 1000,
  temp: parseFloat(process.env.THRESHOLD_TEMP) || 35,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: derive a human-readable status string from the payload values
// ─────────────────────────────────────────────────────────────────────────────
function deriveStatus(pm25, co2, temp) {
  const flags = [];
  if (pm25 > THRESHOLDS.pm25) flags.push(`CRITICAL_PM25(${pm25})`);
  if (co2  > THRESHOLDS.co2)  flags.push(`HAZARDOUS_CO2(${co2})`);
  if (temp > THRESHOLDS.temp) flags.push(`HIGH_TEMP(${temp})`);
  return flags.join(' | ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: upsert device registration
// ─────────────────────────────────────────────────────────────────────────────
async function upsertDevice(deviceId) {
  try {
    await pool.query(
      `INSERT INTO devices (device_id)
       VALUES ($1)
       ON CONFLICT (device_id) DO NOTHING`,
      [deviceId]
    );
  } catch (err) {
    console.error(`[MQTT] Failed to upsert device ${deviceId}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main message handler — called from server.js for every incoming MQTT message
//
// Expected topic formats:
//   aqms/<nodeId>/data    → sensor telemetry
//   aqms/<nodeId>/status  → online / offline heartbeats
//
// Expected data payload (JSON):
//   { "device_id": "device1", "pm25": number, "co2": number, "temp": number }
//   (device_id in payload is optional; nodeId from topic is used as fallback)
// ─────────────────────────────────────────────────────────────────────────────
async function handleMessage(topic, message, io) {
  const parts = topic.split('/'); // ['aqms', '<nodeId>', 'data'|'status']
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

    // Normalise field names (support both simulator & ESP32 formats)
    const deviceId    = payload.device_id   || nodeId;
    const pm25        = parseFloat(payload.pm25 ?? payload.pm2_5 ?? 0);
    const co2         = parseFloat(payload.co2  ?? 0);
    const temperature = parseFloat(payload.temp ?? payload.temperature ?? 0);
    const humidity    = parseFloat(payload.humidity ?? payload.hum ?? 0);

    console.log(`[MQTT] 📡 Data from ${deviceId}: PM2.5=${pm25} CO2=${co2} Temp=${temperature} Hum=${humidity}`);

    // 1. Register / refresh device entry
    await upsertDevice(deviceId);

    // 2. Always broadcast live data to the dashboard via Socket.io
    io.emit('node_data', { nodeId: deviceId, pm25, co2, temperature, humidity, timestamp: new Date().toISOString() });

    // 3. Threshold check — only persist to PostgreSQL if critical
    const isCritical = pm25 > THRESHOLDS.pm25 || co2 > THRESHOLDS.co2 || temperature > THRESHOLDS.temp;

    if (isCritical) {
      const status = deriveStatus(pm25, co2, temperature);
      try {
        const { rows } = await pool.query(
          `INSERT INTO critical_events (device_id, pm25, co2, temperature, status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [deviceId, pm25, co2, temperature, status]
        );

        const event = rows[0];
        console.log(`[DB] 🔴 Critical event logged for ${deviceId}: ${status}`);

        // 4. Emit real-time alert to all connected dashboard clients
        io.emit('critical_alert', event);

      } catch (err) {
        console.error(`[DB] ❌ Failed to insert critical event for ${deviceId}:`, err.message);
      }
    }
  }

  // ── STATUS packets ───────────────────────────────────────────────────────────
  if (msgType === 'status') {
    const statusText = message.toString().toLowerCase() === 'online' ? 'Online' : 'Offline';
    try {
      await upsertDevice(nodeId);
      io.emit('node_status', { nodeId, status: statusText });
      console.log(`[MQTT] ${statusText === 'Online' ? '🟢' : '🔴'} Status for ${nodeId}: ${statusText}`);

      // Log node going offline as a critical event
      if (statusText === 'Offline') {
        await pool.query(
          `INSERT INTO critical_events (device_id, status)
           VALUES ($1, $2)`,
          [nodeId, 'NODE_OFFLINE_DROP']
        );
      }
    } catch (err) {
      console.error(`[MQTT] Status update failed for ${nodeId}:`, err.message);
    }
  }
}

module.exports = { handleMessage };
