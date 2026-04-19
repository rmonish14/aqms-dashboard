# 🏭 PLMS — Predictive Life Monitoring System

A production-ready Industrial IoT & SCADA platform for real-time machine health monitoring, predictive maintenance, and autonomous control across distributed edge nodes.

---

## 1. System Architecture

```
┌─────────────────────┐     MQTT (HiveMQ)     ┌──────────────────────┐
│  ESP32 Edge Node    │ ──────────────────────▶│   Node.js Backend    │
│  (Vib, Temp, Curr)  │   plms/<nodeId>/data   │   (Express + MQTT)   │
└───────────┬─────────┘                        └───────────┬──────────┘
            │ Autonomous                           Dashboard / Alerting
            ▼ Responses                                    │
    ┌────────────────┐                            ┌────────┼────────┐
    │  Relay Control │                            ▼        ▼        ▼
    │  (Shutdown)    │                     PostgreSQL  Socket.io  REST API
    └────────────────┘                     (Render DB) (Real-time) (HTTP/:5000)
```

| Component | Technology | Purpose |
|-----------|-----------|---------|
| IoT Edge | ESP32 + Sensors | Publish telemetry (Vibration, Current, Temp) & execute commands |
| MQTT Broker | HiveMQ (cloud) | Real-time bi-directional message routing |
| Backend | Node.js + Express | REST API, MQTT threshold handler, Socket.io |
| Database | **PostgreSQL** (Render) | Persistent critical event & configuration storage |
| Real-time | Socket.io | Push live node data and immediate alerts to dashboard |
| Frontend | React + Vite | Premium industrial SCADA dashboard (Glassmorphism & Dark Mode) |

---

## 2. Database Schema (PostgreSQL)

> Tables are **auto-created on first server startup** — no manual SQL required.

```sql
-- Registered edge nodes
CREATE TABLE plms_devices (
  device_id  VARCHAR(100) PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Critical threshold breach events
CREATE TABLE plms_critical_events (
  id          SERIAL PRIMARY KEY,
  device_id   VARCHAR(100) NOT NULL,
  vib         FLOAT,
  current     FLOAT,
  temperature FLOAT,
  humidity    FLOAT,
  status      VARCHAR(50),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System configuration (JSONB, dynamic global thresholds)
CREATE TABLE plms_system_config (
  key        VARCHAR(100) PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dashboard application users
CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  username   VARCHAR(100) UNIQUE NOT NULL,
  password   TEXT NOT NULL,
  role       VARCHAR(30) DEFAULT 'operator',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. MQTT Integration

| Protocol | Value |
|----------|-------|
| Broker | `mqtt://broker.hivemq.com:1883` (or `HIVEMQ_URL` env var) |
| Telemetry Publish | `machine/sensor/<metric>` (Legacy: `plms/<nodeId>/data`) |
| Control Subscribe | `plms/<nodeId>/control` |
| Status Topic | `plms/<nodeId>/status` |

### Expected Live Payload
Edge nodes stream telemetry directly, handled dynamically by the backend:
- `vib` : Motor Vibration
- `current` : Motor Current Load
- `temp` : Operating Temperature
- `hum` : Local Humidity
- `relay` : Contactor State (`ON`/`OFF`)
- `mode` : Operating Mode (`AUTO`/`MANUAL`)
- `ml_status` : Edge AI Inference Label

### Autonomous Control & Thresholds
If an edge node is in **AUTO** mode and crosses a critical threshold safety limit (e.g. Temp > 60°C or Vibration > 5G), the Node.js backend automatically dispatches an `OFF` command to the `plms/<deviceId>/control` topic, immediately shutting off the affected machine to prevent physical damage.

---

## 4. REST API Endpoints

### Authentication — `/api/auth`
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/auth/register` | Create operator accounts |
| `POST` | `/api/auth/login` | Authenticate and retrieve JWT |

### Data Logging — `/api/database`
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/database/events` | Retrieve full history of critical threshold breaches |
| `GET` | `/api/database/tables` | View raw PostgreSQL database schema and tables |

### Configuration — `/api/config`
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/config` | Read active system thresholds |
| `PUT` | `/api/config` | Update global threshold values (hot-reloads into MQTT handler logic) |

### Fleet Mapping & Status
Nodes register their GPS coordinates dynamically via telemetry payloads, populating real-time Leaflet map overviews.

---

## 5. Web Dashboard (Frontend)

Built identically to a premium SCADA terminal:
- **Bi-directional Control:** View data and toggle equipment directly from UI node cards.
- **AI Chatbot Integration:** Built-in Llama 3.3 (via OpenRouter) answers operator questions, understands active machine faults, and can dispatch configuration changes via chat prompts.
- **Dynamic Charting:** Recharts integration displays rolling live metrics decoupled from database writes for absolute performance.

---

## 6. Environment Variables (`.env`)

Create `/.env` in the root (for backend usage):

```env
# Required
DATABASE_URL=postgresql://user:pass@host/dbname

# Optional (Defaults are managed)
PORT=5000
HIVEMQ_URL=mqtt://broker.hivemq.com:1883
JWT_SECRET=your_jwt_production_secret
SMTP_USER=kassandra.glover@ethereal.email
SMTP_PASS=ethereal_generated_password
```

---

## 7. Zero-Config Deployment (Render.com)

A `render.yaml` blueprint is included for 1-click monolithic deployment on Render.
1. Connect this GitHub repository cleanly to Render's "Blueprint" dashboard or "Web Service".
2. The setup automatically builds the Frontend (`npm run build`) and serves both the API and static React assets natively from the single Express webserver. No separate frontend hosting is required.
