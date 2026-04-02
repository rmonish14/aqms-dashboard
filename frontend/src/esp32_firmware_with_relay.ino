/*
 * AQMS ESP32 Firmware — with Relay Control via MQTT
 * ─────────────────────────────────────────────────
 * Now subscribes to:  aqms/alpha-001/control
 * Publishes ACK to:   aqms/alpha-001/control/ack
 *
 * Control payload (from dashboard):
 *   {"relay":"ON"}  → GPIO 26 HIGH (relay energized)
 *   {"relay":"OFF"} → GPIO 26 LOW  (relay de-energized)
 */

#include <aruni-project-1_inferencing.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ── WiFi ───────────────────────────
const char* WIFI_SSID = "MONISH";
const char* WIFI_PASS = "12345678";

// ── MQTT ───────────────────────────
const char* MQTT_BROKER = "broker.hivemq.com";
const int   MQTT_PORT   = 1883;
const char* NODE_ID     = "alpha-001";

String DATA_TOPIC    = "aqms/" + String(NODE_ID) + "/data";
String STATUS_TOPIC  = "aqms/" + String(NODE_ID) + "/status";
String CONTROL_TOPIC = "aqms/" + String(NODE_ID) + "/control";       // ← Subscribe
String ACK_TOPIC     = "aqms/" + String(NODE_ID) + "/control/ack";   // ← Publish ACK

// ── Node Location ──────────────────
#define LATITUDE  11.0168
#define LONGITUDE 77.9558

// ── DHT ────────────────────────────
#define DHTPIN   2
#define DHTTYPE  DHT11
DHT dht(DHTPIN, DHTTYPE);

// ── MQ Sensors ─────────────────────
#define MQ7_PIN 34   // CO sensor
#define MQ6_PIN 35   // LPG sensor

// ── Relay Pin ──────────────────────
#define RELAY_PIN 26  // ← Change to your wired GPIO pin
bool relayState = false;

// ── MQTT client ────────────────────
WiFiClient espClient;
PubSubClient mqtt(espClient);

// ── ML buffer ──────────────────────
float features[2];

// ── WiFi connect ───────────────────
void connectWifi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected ✅");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

// ── MQTT Callback ──────────────────
// Called when a message arrives on subscribed topics
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("[MQTT] Message on topic: ");
  Serial.println(topic);

  // Parse JSON payload
  StaticJsonDocument<128> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.println("[MQTT] ❌ JSON parse error in callback");
    return;
  }

  String topicStr = String(topic);

  // ── Handle relay control command ──────────────────────────────────────────
  if (topicStr == CONTROL_TOPIC) {
    const char* relayCmd = doc["relay"];
    if (relayCmd == nullptr) return;

    if (String(relayCmd) == "ON") {
      relayState = true;
      digitalWrite(RELAY_PIN, HIGH);
      Serial.println("[RELAY] ✅ Turned ON");
    } else if (String(relayCmd) == "OFF") {
      relayState = false;
      digitalWrite(RELAY_PIN, LOW);
      Serial.println("[RELAY] 🔴 Turned OFF");
    }

    // Publish ACK back to dashboard
    StaticJsonDocument<128> ack;
    ack["nodeId"] = NODE_ID;
    ack["relay"]  = relayState ? "ON" : "OFF";
    ack["ok"]     = true;
    char ackPayload[128];
    serializeJson(ack, ackPayload);
    mqtt.publish(ACK_TOPIC.c_str(), ackPayload);

    Serial.print("[RELAY] ACK published → ");
    Serial.println(ackPayload);
  }
}

// ── MQTT connect ───────────────────
void connectMQTT() {
  Serial.print("Connecting to MQTT");
  while (!mqtt.connected()) {
    if (mqtt.connect(NODE_ID)) {
      Serial.println("\nMQTT Connected ✅");

      // Re-subscribe on every reconnection
      mqtt.subscribe(CONTROL_TOPIC.c_str(), 1);
      Serial.print("[MQTT] Subscribed → ");
      Serial.println(CONTROL_TOPIC);

      // Publish online status
      mqtt.publish(STATUS_TOPIC.c_str(), "online");
    } else {
      Serial.print(".");
      delay(1000);
    }
  }
}

// ── ML inference ───────────────────
String runML(float temp, float hum) {
  features[0] = temp;
  features[1] = hum;

  signal_t signal;
  numpy::signal_from_buffer(features, 2, &signal);

  ei_impulse_result_t result = {0};
  EI_IMPULSE_ERROR res = run_classifier(&signal, &result, false);
  if (res != EI_IMPULSE_OK) return "ERROR";

  float maxVal = 0;
  String bestLabel = "";
  for (size_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
    if (result.classification[i].value > maxVal) {
      maxVal = result.classification[i].value;
      bestLabel = result.classification[i].label;
    }
  }
  return bestLabel;
}

// ── Setup ──────────────────────────
void setup() {
  Serial.begin(115200);

  // Relay pin
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);  // Default OFF on boot
  Serial.println("[RELAY] Pin configured — default OFF");

  dht.begin();
  analogReadResolution(12);

  connectWifi();

  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);   // ← Set callback BEFORE connecting
  connectMQTT();

  Serial.println("\nSystem Ready 🚀");
}

// ── Loop ───────────────────────────
void loop() {

  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();   // ← This triggers mqttCallback when commands arrive

  float temperature = dht.readTemperature();
  float humidity    = dht.readHumidity();

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("DHT Error ❌");
    return;
  }

  // ── MQ SENSOR READ ──
  int mq7_raw = analogRead(MQ7_PIN);
  int mq6_raw = analogRead(MQ6_PIN);

  float co_ppm  = map(mq7_raw, 0, 4095, 0, 1000);
  float lpg_ppm = map(mq6_raw, 0, 4095, 0, 1000);

  // ── ML OUTPUT ──
  String ml_result = runML(temperature, humidity);

  // ── JSON Publish ──
  StaticJsonDocument<320> doc;
  doc["device_id"]   = NODE_ID;
  doc["temperature"] = temperature;
  doc["humidity"]    = humidity;
  doc["pm25"]        = lpg_ppm;
  doc["co2"]         = co_ppm;
  doc["air_status"]  = ml_result;
  doc["relay"]       = relayState ? "ON" : "OFF";   // ← Include relay state in telemetry
  doc["lat"]         = LATITUDE;
  doc["lon"]         = LONGITUDE;

  char payload[320];
  serializeJson(doc, payload);
  mqtt.publish(DATA_TOPIC.c_str(), payload);

  // ── SERIAL OUTPUT ──
  Serial.println("\n===== SENSOR DATA =====");
  Serial.print("Temperature : "); Serial.print(temperature); Serial.println(" °C");
  Serial.print("Humidity    : "); Serial.print(humidity);    Serial.println(" %");
  Serial.print("CO (ppm)    : "); Serial.println(co_ppm);
  Serial.print("LPG (ppm)   : "); Serial.println(lpg_ppm);
  Serial.print("ML Result   : "); Serial.println(ml_result);
  Serial.print("Relay State : "); Serial.println(relayState ? "ON ●" : "OFF ○");
  Serial.print("Location    : "); Serial.print(LATITUDE, 4); Serial.print(", "); Serial.println(LONGITUDE, 4);
  Serial.println("========================\n");

  delay(2000);
}
