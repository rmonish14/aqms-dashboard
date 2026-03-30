# 🌫️ AQMS — Air Quality Monitoring System

A production-ready Industrial IoT platform for real-time air quality monitoring across distributed sensor nodes.

---

## 1. System Architecture

```
┌─────────────────────┐     MQTT (HiveMQ)     ┌──────────────────────┐
│  ESP32 / Simulator  │ ──────────────────────▶│   Node.js Backend    │
│  (Sensor Nodes)     │   aqms/<nodeId>/data   │   (Express + MQTT)   │
└─────────────────────┘                        └───────────┬──────────┘
                                                           │
                                          ┌────────────────┼────────────────┐
                                          ▼                ▼                ▼
                                   PostgreSQL         Socket.io        REST API
                                  (Render DB)       (Real-time)     (HTTP/:5000)
                                  critical_events   critical_alert   /api/critical
                                          │                ▼
                                          └──────▶  Next.js Dashboard
                                                    (localhost:3000)
```

| Component | Technology | Purpose |
|-----------|-----------|---------|
| IoT Nodes | ESP32 / `simulator.js` | Publish sensor readings over MQTT |
| MQTT Broker | HiveMQ (cloud) | Message routing, wildcard subscriptions |
| Backend | Node.js + Express | REST API, MQTT handler, Socket.io |
| Database | **PostgreSQL** (Render) | Critical event storage only |
| Real-time | Socket.io | Push alerts to dashboard instantly |
| Frontend | Next.js + TailwindCSS | Industrial dark-mode dashboard |

---

## 2. Database Schema (PostgreSQL)

> Tables are **auto-created on first server startup** — no manual SQL required.

```sql
-- Registered sensor nodes
CREATE TABLE devices (
  id         SERIAL PRIMARY KEY,
  device_id  VARCHAR(100) UNIQUE NOT NULL,
  location   TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Critical threshold breach events (event-driven storage only)
CREATE TABLE critical_events (
  id          SERIAL PRIMARY KEY,
  device_id   VARCHAR(100) NOT NULL,
  pm25        FLOAT,
  co2         FLOAT,
  temperature FLOAT,
  status      VARCHAR(50),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System configuration (JSONB, supports deep-merge updates)
CREATE TABLE system_config (
  key        VARCHAR(100) PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Application users (bcrypt-hashed passwords)
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

| Property | Value |
|----------|-------|
| Broker | `mqtt://broker.hivemq.com:1883` (or `HIVEMQ_URL` env var) |
| Data Topic | `aqms/<nodeId>/data` |
| Status Topic | `aqms/<nodeId>/status` |
| Subscription | `aqms/+/data` (wildcard — all nodes) |

### Expected ESP32 Payload Format
```json
{
  "device_id": "device1",
  "pm25": 112.5,
  "co2": 1250,
  "temp": 36.8
}
```

### Critical Thresholds
Data is **only stored** when at least one threshold is breached:

| Metric | Default Threshold | Env Override |
|--------|------------------|--------------|
| PM2.5 | `> 100 µg/m³` | `THRESHOLD_PM25` |
| CO2 | `> 1000 ppm` | `THRESHOLD_CO2` |
| Temperature | `> 35 °C` | `THRESHOLD_TEMP` |

---

## 4. REST API Endpoints

### Authentication — `/api/auth`
| Method | Route | Body | Response |
|--------|-------|------|----------|
| `POST` | `/api/auth/register` | `{ username, password, role? }` | `201 Created` |
| `POST` | `/api/auth/login` | `{ username, password }` | `{ token, role }` |
| `POST` | `/api/login` | `{ username, password }` | Alias for above |

### Critical Events — `/api/critical`
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/critical` | Last 50 critical events (newest first) |
| `GET` | `/api/critical/device/:id` | Last 100 events for one device |
| `GET` | `/api/critical/fleet` | All events in last 24 hours |

### Devices / Nodes — `/api/nodes`
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/nodes` | List all registered devices |
| `GET` | `/api/nodes/:id` | Single device info |
| `GET` | `/api/nodes/:id/events` | Last 100 critical events for node |
| `GET` | `/api/nodes/fleet/anomalies` | 24 h fleet-wide anomalies |
| `POST` | `/api/nodes` | Register / update a device |

### Alerts — `/api/alerts`
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/alerts` | Last 100 critical events (alert view) |

### Configuration — `/api/config`
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/config` | Get system config JSON |
| `PUT` | `/api/config` | Deep-merge update system config |

### Email — `/api/email`
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/email/share` | Dispatch telemetry share email |

### Health
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/health` | Server health check |

---

## 5. Socket.io Real-time Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `node_data` | Server → Client | `{ nodeId, pm25, co2, temperature, timestamp }` |
| `node_status` | Server → Client | `{ nodeId, status: "Online"\|"Offline" }` |
| `critical_alert` | Server → Client | Full `critical_events` row (triggered on threshold breach) |

---

## 6. Environment Variables

Create `/backend/.env` (copy from `.env.example`):

```env
# Required
DATABASE_URL=postgresql://user:pass@host/dbname

# Optional (defaults shown)
PORT=5000
HIVEMQ_URL=mqtt://broker.hivemq.com:1883
JWT_SECRET=change_in_production
THRESHOLD_PM25=100
THRESHOLD_CO2=1000
THRESHOLD_TEMP=35
SMTP_USER=your@email.com
SMTP_PASS=yourpassword
```

---

## 7. Running the Project

### Prerequisites
- Node.js ≥ v18
- A PostgreSQL database (Render free tier works great)
- No local MongoDB required ✅

### Step 1 — Configure Environment
```powershell
Copy-Item backend\.env.example backend\.env
# Edit backend\.env with your DATABASE_URL
```

### Step 2 — Start the Backend
```powershell
cd backend
npm install
npm run dev
```
> API runs on `http://localhost:5000` · DB schema auto-creates on first boot

### Step 3 — Start the Simulator (optional)
In a new terminal:
```powershell
cd backend
node simulator.js
```
> Simulates 7 sensor nodes publishing to HiveMQ every 5 seconds

### Step 4 — Start the Frontend Dashboard
In a new terminal:
```powershell
cd frontend
npm install
npm run dev
```
> Dashboard available at `http://localhost:3000`

---

## 8. Project Structure

```
AQMS/
├── backend/
│   ├── config/
│   │   └── db.js            # PostgreSQL pool + schema auto-init
│   ├── mqtt/
│   │   └── handler.js       # MQTT threshold logic + DB insert + Socket.io emit
│   ├── routes/
│   │   ├── auth.js          # Register / Login (bcrypt + JWT)
│   │   ├── alerts.js        # GET /api/alerts
│   │   ├── config.js        # GET|PUT /api/config (JSONB)
│   │   ├── data.js          # GET /api/critical
│   │   ├── email.js         # POST /api/email/share
│   │   └── nodes.js         # GET|POST /api/nodes
│   ├── server.js            # Express + Socket.io + MQTT client
│   ├── simulator.js         # Multi-node MQTT data simulator
│   └── .env.example         # Environment variable template
└── frontend/                # Next.js industrial dashboard
```

---

**Design**: Industrial Dark-Mode Glassmorphism UI built with Next.js, TailwindCSS, and Recharts — delivering a premium, real-time monitoring experience.
