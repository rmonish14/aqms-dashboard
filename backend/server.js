// ─────────────────────────────────────────────────────────────────────────────
// PLMS Backend — Production Server
// Database: PostgreSQL (Render-hosted) via pg pool
// Realtime:  Socket.io
// IoT:       MQTT (HiveMQ broker)
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express   = require('express');
const http      = require('http');
const cors      = require('cors');
const mqtt      = require('mqtt');
const { Server } = require('socket.io');

const { initSchema } = require('./config/db');
const { handleMessage } = require('./mqtt/handler');

// ── Express + HTTP + Socket.io ────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// ── PostgreSQL Schema Bootstrap ───────────────────────────────────────────────
// Ensure all tables exist before accepting any traffic
initSchema()
  .then(() => console.log('[Server] ✅ DB schema ready'))
  .catch((err) => {
    console.error('[Server] ❌ Fatal DB error — cannot start:', err.message);
    process.exit(1);
  });

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/nodes',     require('./routes/nodes'));
app.use('/api/alerts',    require('./routes/alerts'));
app.use('/api/config',    require('./routes/config'));
app.use('/api/critical',  require('./routes/data'));
app.use('/api/database',  require('./routes/database'));
app.use('/api/developer', require('./routes/developer'));

const emailModule = require('./routes/email');
app.use('/api/email', emailModule.router);

// Convenience alias: POST /api/login → /api/auth/login (for frontend compatibility)
const authRouter = require('./routes/auth');
app.post('/api/login', (req, res, next) => authRouter(req, res, next));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Frontend Static Serving (Production Only) ─────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[WS] Dashboard connected:', socket.id);

  // ── Relay Control ─────────────────────────────────────────────────────────
  // Frontend emits: { nodeId: 'alpha-001', state: 'ON' | 'OFF' }
  // Backend publishes MQTT to: plms/{nodeId}/control
  socket.on('relay_control', ({ nodeId, state, mode }) => {
    if (!nodeId) {
      console.warn('[WS] Invalid relay_control payload — missing nodeId');
      return;
    }
    const topic = `plms/${nodeId}/control`;
    // Forward both state and mode so ESP can switch between AUTO and MANUAL
    const payload = JSON.stringify({
      relay: state || 'OFF',
      mode:  mode  || 'MANUAL',
      ts:    new Date().toISOString()
    });
    mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error(`[MQTT] Failed to publish relay command to ${topic}:`, err.message);
      } else {
        console.log(`[RELAY] ✅ ${nodeId} → relay:${state} mode:${mode} (${topic})`);
        io.emit('relay_ack', { nodeId, state, mode, ts: new Date().toISOString() });
      }
    });
  });

  socket.on('disconnect', () => console.log('[WS] Dashboard disconnected:', socket.id));
});

// ── MQTT Client ───────────────────────────────────────────────────────────────
// Connects to HiveMQ public broker (used by both the ESP32 devices and simulator)
const MQTT_BROKER = process.env.HIVEMQ_URL || 'mqtt://broker.hivemq.com:1883';

const mqttClient = mqtt.connect(MQTT_BROKER, {
  clientId:        `plms-backend-${Math.random().toString(16).slice(2, 8)}`,
  clean:           true,
  reconnectPeriod: 5000,
  connectTimeout:  30000,
});

mqttClient.on('connect', () => {
  console.log(`[MQTT] ✅ Connected to broker at ${MQTT_BROKER}`);

  // Subscribe to all sensor data topics (ESP32 + simulator)
  mqttClient.subscribe('plms/+/data', { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] Subscribe error (data):', err);
    else      console.log('[MQTT] Subscribed → plms/+/data');
  });
  
  // Legacy support for ESP32s still running the old firmware
  mqttClient.subscribe('aqms/+/data', { qos: 1 });
  mqttClient.subscribe('aqms/+/status', { qos: 0 });
  mqttClient.subscribe('aqms/+/control/ack', { qos: 0 });

  // Subscribe to custom machine topics from the specific ESP setup
  mqttClient.subscribe('machine/sensor/+', { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] Subscribe error (machine):', err);
    else      console.log('[MQTT] Subscribed → machine/sensor/+');
  });

  // Subscribe to device status heartbeats
  mqttClient.subscribe('plms/+/status', { qos: 0 }, (err) => {
    if (err) console.error('[MQTT] Subscribe error (status):', err);
    else      console.log('[MQTT] Subscribed → plms/+/status');
  });

  // Subscribe to relay control ACK topic (ESP acknowledges command)
  mqttClient.subscribe('plms/+/control/ack', { qos: 0 }, (err) => {
    if (err) console.error('[MQTT] Subscribe error (control/ack):', err);
    else      console.log('[MQTT] Subscribed → plms/+/control/ack');
  });
});

mqttClient.on('reconnect', () => console.log('[MQTT] Reconnecting to broker...'));
mqttClient.on('error',     (err) => console.error('[MQTT] Connection error:', err.message));

// Route every incoming MQTT message through the dedicated handler module
mqttClient.on('message', async (topic, message) => {
  try {
    await handleMessage(topic, message, io, mqttClient);
  } catch (err) {
    console.error('[MQTT] Unhandled message error:', err.message);
  }
});

// ── Start Server ──────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[API] 🚀 Server running on port ${PORT}`);
});
