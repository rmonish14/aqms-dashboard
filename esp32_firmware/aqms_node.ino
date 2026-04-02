#include <aruni-project-1_inferencing.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ── WiFi ───────────────────────────────────────────────────────────────────────
const char* WIFI_SSID = "MONISH";  
const char* WIFI_PASS = "12345678";

// ── MQTT ───────────────────────────────────────────────────────────────────────
const char* MQTT_BROKER = "broker.hivemq.com";
const int   MQTT_PORT   = 1883;
const char* NODE_ID     = "alpha-001";

// FIX 1: Build topics as char arrays (String concat unreliable in callbacks)
char DATA_TOPIC[64];
char STATUS_TOPIC[64];
char CONTROL_TOPIC[64];   // ← FIX 3: topic to receive relay commands

// ── DHT ────────────────────────────────────────────────────────────────────────
#define DHTPIN  2
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// ── Relay ──────────────────────────────────────────────────────────────────────
#define RELAY_PIN 4
String relayState = "OFF";   // "ON" | "OFF"
String relayMode  = "MANUAL"; // "MANUAL" | "AUTO"
const float AUTO_TEMP_THRESHOLD = 30.0; // °C — must match NodeCard.tsx

// ── MQTT client ────────────────────────────────────────────────────────────────
WiFiClient espClient;
PubSubClient mqtt(espClient);

// ── ML buffer (2 features) ─────────────────────────────────────────────────────
float features[2];

// ── Timing ────────────────────────────────────────────────────────────────────
unsigned long lastPublish   = 0;
unsigned long lastHeartbeat = 0;
const unsigned long PUBLISH_INTERVAL   = 2000;   // data every 2s
const unsigned long HEARTBEAT_INTERVAL = 30000;  // status "online" every 30s

// ── WiFi connect ───────────────────────────────────────────────────────────────
void connectWifi() {
  Serial.print("[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WiFi] ✅ Connected — IP: " + WiFi.localIP().toString());
}

// ── FIX 4: MQTT message callback (receive relay commands) ──────────────────────
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("[MQTT] Message on topic: ");
  Serial.println(topic);

  // Only handle control topic
  if (strcmp(topic, CONTROL_TOPIC) != 0) return;

  // Parse JSON command from dashboard
  StaticJsonDocument<128> cmd;
  DeserializationError err = deserializeJson(cmd, payload, length);
  if (err) {
    Serial.println("[MQTT] ❌ Bad JSON in control message");
    return;
  }

  const char* newRelay = cmd["relay"] | "OFF";
  const char* newMode  = cmd["mode"]  | "MANUAL";

  relayMode = String(newMode);

  if (relayMode == "MANUAL") {
    relayState = String(newRelay);
    digitalWrite(RELAY_PIN, relayState == "ON" ? HIGH : LOW);
    Serial.printf("[RELAY] Manual → %s\n", relayState.c_str());
  } else {
    Serial.println("[RELAY] Switched to AUTO mode");
  }

  // Acknowledge back to backend
  char ackTopic[80];
  snprintf(ackTopic, sizeof(ackTopic), "aqms/%s/control/ack", NODE_ID);
  StaticJsonDocument<64> ack;
  ack["relay"] = relayState;
  ack["mode"]  = relayMode;
  char ackBuf[64];
  serializeJson(ack, ackBuf);
  mqtt.publish(ackTopic, ackBuf, false);
}

// ── MQTT connect (with callback + subscription) ────────────────────────────────
void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("[MQTT] Connecting... ");

    // FIX: Use unique client ID to avoid broker rejecting duplicate connections
    char clientId[32];
    snprintf(clientId, sizeof(clientId), "aqms-%s-%04X", NODE_ID, (uint16_t)random(0xFFFF));

    if (mqtt.connect(clientId)) {
      Serial.println("✅ Connected");

      // Publish online status immediately after (re)connect
      mqtt.publish(STATUS_TOPIC, "online", true); // retained=true so backend always knows

      // FIX 3: Subscribe to relay control commands from dashboard
      mqtt.subscribe(CONTROL_TOPIC, 1);
      Serial.printf("[MQTT] Subscribed → %s\n", CONTROL_TOPIC);

    } else {
      Serial.printf("❌ Failed (rc=%d), retrying in 5s\n", mqtt.state());
      delay(5000);
    }
  }
}

// ── ML inference ───────────────────────────────────────────────────────────────
String runML(float temp, float hum) {
  features[0] = temp;
  features[1] = hum;

  signal_t signal;
  numpy::signal_from_buffer(features, EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE, &signal);

  ei_impulse_result_t result = {0};
  EI_IMPULSE_ERROR res = run_classifier(&signal, &result, false);
  if (res != EI_IMPULSE_OK) return "ERROR";

  float maxVal = 0;
  String bestLabel = "UNKNOWN";
  for (size_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
    if (result.classification[i].value > maxVal) {
      maxVal = result.classification[i].value;
      bestLabel = result.classification[i].label;
    }
  }
  return bestLabel;
}

// ──────────────────────────────────────────────────────────────────────────────
void setup() {

  Serial.begin(115200);

  delay(100);

  // Build topic strings (char arrays — safe in callbacks)
  
  snprintf(DATA_TOPIC,    sizeof(DATA_TOPIC),    "aqms/%s/data",    NODE_ID);
  snprintf(STATUS_TOPIC,  sizeof(STATUS_TOPIC),  "aqms/%s/status",  NODE_ID);
  snprintf(CONTROL_TOPIC, sizeof(CONTROL_TOPIC), "aqms/%s/control", NODE_ID);

  // Relay pin
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  dht.begin();
  connectWifi();

  // FIX 4: Register callback BEFORE connecting
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);

  connectMQTT();
}

// ──────────────────────────────────────────────────────────────────────────────
void loop() {
  // Reconnect if dropped
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop(); // ← must be called to receive messages

  unsigned long now = millis();

  // FIX 2: Periodic "online" heartbeat so dashboard always knows we're alive
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    mqtt.publish(STATUS_TOPIC, "online", true);
    Serial.println("[HEARTBEAT] online");
    lastHeartbeat = now;
  }

  // Publish sensor data every 2s
  if (now - lastPublish >= PUBLISH_INTERVAL) {
    lastPublish = now;

    float temperature = dht.readTemperature();
    float humidity    = dht.readHumidity();

    if (isnan(temperature) || isnan(humidity)) {
      Serial.println("[DHT] ❌ Read failed — skipping");
      return;
    }

    // AUTO mode relay logic
    if (relayMode == "AUTO") {
      String newState = (temperature > AUTO_TEMP_THRESHOLD) ? "ON" : "OFF";
      if (newState != relayState) {
        relayState = newState;
        digitalWrite(RELAY_PIN, relayState == "ON" ? HIGH : LOW);
        Serial.printf("[AUTO] Temp=%.1f°C → Relay %s\n", temperature, relayState.c_str());
      }
    }

    // ML inference
    String ml_result = runML(temperature, humidity);

    // FIX 5: Include ALL fields the dashboard expects
    StaticJsonDocument<256> doc;
    doc["device_id"]   = NODE_ID;
    doc["temperature"] = round(temperature * 10.0) / 10.0;
    doc["humidity"]    = round(humidity    * 10.0) / 10.0;
    doc["pm25"]        = random(30, 180);   // Replace with real sensor (e.g. PMS5003)
    doc["pm10"]        = random(40, 200);   // ← FIX 5: was missing
    doc["co"]          = random(1, 35);     // ← FIX 5: was missing
    doc["co2"]         = random(400, 2000);
    doc["relay"]       = relayState;        // ← FIX 2: was missing
    doc["mode"]        = relayMode;         // ← FIX 2: was missing
    doc["air_status"]  = ml_result;

    char payload[256];
    serializeJson(doc, payload);

    mqtt.publish(DATA_TOPIC, payload);
    Serial.println(payload);
  }
}
