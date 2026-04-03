#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <WiFi.h>
#include <PubSubClient.h>

// ───────── WIFI SETTINGS ─────────
const char* ssid = "MONISH";
const char* password = "12345678";

// ───────── MQTT SETTINGS ─────────
const char* mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;

// Topic format matching PLMS Dashboard: plms/node_id/data
const char* device_id = "alpha-001";
const char* mqtt_topic_data = "plms/alpha-001/data"; 
const char* mqtt_topic_status = "plms/alpha-001/status";
const char* mqtt_topic_control = "plms/alpha-001/control";

// ───────── ESP STATE ─────────
String currentMode = "AUTO";
String currentRelay = "ON";

// ───────── LCD SETTINGS ─────────
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ───────── DHT SETTINGS ─────────
#define DHTPIN 4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// ───────── GLOBAL CLIENTS ─────────
WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMsg = 0;

// ───────── WIFI CONNECT ─────────
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    lcd.setCursor(0, 1);
    lcd.print("Please wait.");
  }

  Serial.println("");
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

// ───────── MQTT RECONNECT ─────────
void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Connecting MQTT");

    // Create a random client ID to prevent collisions on public brokers
    String clientId = "PLMS-ESP32-";
    clientId += String(random(0xffff), HEX);

    // Attempt to connect with the random client ID
    if (client.connect(clientId.c_str())) {
      Serial.println("connected");
      
      // Publish online status to the dashboard
      client.publish(mqtt_topic_status, "online", true);

      // Subscribe to control topics for Relay
      client.subscribe(mqtt_topic_control);
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      
      lcd.setCursor(0, 1);
      lcd.print("Failed. Retrying");
      delay(5000);
    }
  }
}

// ───────── MQTT CALLBACK ─────────
void callback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.print("Incoming Control: ");
  Serial.println(message);

  if (String(topic) == mqtt_topic_control) {
    // Basic Parsing of JSON from backend
    if (message.indexOf("\"relay\":\"ON\"") != -1) currentRelay = "ON";
    else if (message.indexOf("\"relay\":\"OFF\"") != -1) currentRelay = "OFF";

    if (message.indexOf("\"mode\":\"AUTO\"") != -1) currentMode = "AUTO";
    else if (message.indexOf("\"mode\":\"MANUAL\"") != -1) currentMode = "MANUAL";
  }
}

// ───────── SETUP ─────────
void setup() {
  Serial.begin(115200);

  // Init I2C
  Wire.begin(21, 22);

  // Init LCD
  lcd.init();
  lcd.backlight();

  lcd.setCursor(0, 0);
  lcd.print("Initializing...");

  // Init DHT
  dht.begin();

  // Setup WiFi
  setup_wifi();

  // Setup MQTT
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);

  delay(2000);
  lcd.clear();
}

// ───────── LOOP ─────────
void loop() {
  // Ensure MQTT connection is alive
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();
  // Read and Publish every 2 seconds
  if (now - lastMsg > 2000) {
    lastMsg = now;

    float temp = dht.readTemperature();
    float hum  = dht.readHumidity();

    // ---- Replace error with 0 ----
    if (isnan(temp)) temp = 0;
    if (isnan(hum))  hum  = 0;

    // ---- Serial Output ----
    Serial.println("---- DHT & MQTT DATA ----");
    Serial.print("Temp: "); Serial.print(temp); Serial.println(" C");
    Serial.print("Humidity: "); Serial.print(hum); Serial.println(" %");

    // ---- LCD Display ----
    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("Temp: ");
    lcd.print(temp);
    lcd.print(" C");

    lcd.setCursor(0, 1);
    lcd.print("Hum : ");
    lcd.print(hum);
    lcd.print(" %");

    // ---- MQTT Publish to Dashboard ----
    // Format JSON so that PLMS backend can read it easily
    char payload[200];
    snprintf(payload, sizeof(payload), 
             "{\"device_id\":\"%s\",\"temp\":%.2f,\"hum\":%.2f,\"mode\":\"%s\",\"relay\":\"%s\"}", 
             device_id, temp, hum, currentMode.c_str(), currentRelay.c_str());
             
    client.publish(mqtt_topic_data, payload);
    Serial.print("Published to PLMS: ");
    Serial.println(payload);
  }
}
