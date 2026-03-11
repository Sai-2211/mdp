/*
  ESP32 WiFi → Firebase Firestore bridge for EV charger prototype.
  - Pushes latest sensor data to device/status and readings/{auto-id}
  - Listens to device/command for relay toggling
  - Uses Firebase Email/Password auth (device account)
*/

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ── WiFi ─────────────────────────────────
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// ── Firebase ─────────────────────────────
#define FIREBASE_API_KEY "YOUR_FIREBASE_API_KEY"
#define FIREBASE_PROJECT_ID "YOUR_FIREBASE_PROJECT_ID"
#define DEVICE_EMAIL "esp32-device@yourdomain.com"
#define DEVICE_PASSWORD "YOUR_DEVICE_ACCOUNT_PASSWORD"

// ── Sensor calibration ────────────────────
#define VOLTAGE_DIVIDER_RATIO 5.0    // adjust for your resistor values
#define ACS712_SENSITIVITY 0.100     // V/A — 0.185 for 5A module, 0.100 for 20A
#define ACS712_ZERO_VOLTAGE 1.65     // voltage output at 0A (measure and calibrate)

// ── Timing ────────────────────────────────
#define SENSOR_INTERVAL_MS 5000

// ── Pins ──────────────────────────────────
const int ONE_WIRE_BUS = 4;     // DS18B20
const int VOLTAGE_PIN = 34;     // ADC
const int CURRENT_PIN = 35;     // ADC
const int RELAY_PIN = 26;       // Relay output

FirebaseData fbdo;
FirebaseAuth fbAuth;
FirebaseConfig fbConfig;

unsigned long lastSensorMs = 0;
bool relayState = false;

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Connected. IP: ");
  Serial.println(WiFi.localIP());
}

void setupFirebase() {
  fbConfig.api_key = FIREBASE_API_KEY;
  fbConfig.project_id = FIREBASE_PROJECT_ID;
  fbAuth.user.email = DEVICE_EMAIL;
  fbAuth.user.password = DEVICE_PASSWORD;
  Firebase.reconnectWiFi(true);
  Firebase.begin(&fbConfig, &fbAuth);
}

float readTemperatureC() {
  sensors.requestTemperatures();
  return sensors.getTempCByIndex(0);
}

float readVoltage() {
  // Convert ADC reading to voltage using calibration ratio.
  const int raw = analogRead(VOLTAGE_PIN);
  const float vRef = 3.3f;
  const float adcVoltage = (raw / 4095.0f) * vRef;
  return adcVoltage * VOLTAGE_DIVIDER_RATIO;
}

float readCurrent() {
  // Average multiple samples for noise reduction.
  const int samples = 50;
  float acc = 0;
  for (int i = 0; i < samples; i++) {
    int raw = analogRead(CURRENT_PIN);
    float vRef = 3.3f;
    float voltage = (raw / 4095.0f) * vRef;
    float vDiff = voltage - ACS712_ZERO_VOLTAGE;
    float current = vDiff / ACS712_SENSITIVITY;
    acc += current;
    delay(2);
  }
  return acc / samples;
}

void pushStatus(float temperature, float voltage, float current, float power) {
  // Build Firestore fields payload.
  FirebaseJson content;
  content.set("fields/temperature/doubleValue", temperature);
  content.set("fields/voltage/doubleValue", voltage);
  content.set("fields/current/doubleValue", current);
  content.set("fields/power/doubleValue", power);
  content.set("fields/relay/booleanValue", relayState);
  // Use device time as fallback; Firestore server timestamp would require transform payload.
  content.set("fields/timestamp/timestampValue", Firebase.getCurrentTimeString().c_str());

  String mask = "temperature,voltage,current,power,relay,timestamp";

  if (Firebase.Firestore.patchDocument(&fbdo, FIREBASE_PROJECT_ID, "", "device/status", content.raw(), mask.c_str())) {
    Serial.println("Updated device/status");
  } else {
    Serial.printf("Status write error: %s\n", fbdo.errorReason().c_str());
  }

  // Push history document.
  if (Firebase.Firestore.createDocument(&fbdo, FIREBASE_PROJECT_ID, "", "readings", content.raw())) {
    Serial.println("Added readings entry");
  } else {
    Serial.printf("Readings write error: %s\n", fbdo.errorReason().c_str());
  }
}

void pullRelayCommand() {
  if (Firebase.Firestore.getDocument(&fbdo, FIREBASE_PROJECT_ID, "", "device/command")) {
    FirebaseJson payload;
    payload.setJsonData(fbdo.payload().c_str());
    FirebaseJsonData relayField;
    if (payload.get(relayField, "fields/relay/booleanValue")) {
      bool desired = relayField.boolValue;
      if (desired != relayState) {
        relayState = desired;
        digitalWrite(RELAY_PIN, relayState ? HIGH : LOW);
        Serial.printf("Relay set to %s\n", relayState ? "ON" : "OFF");
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  sensors.begin();
  connectWiFi();
  setupFirebase();
}

void loop() {
  if (Firebase.ready()) {
    unsigned long now = millis();
    if (now - lastSensorMs >= SENSOR_INTERVAL_MS) {
      lastSensorMs = now;
      float tempC = readTemperatureC();
      float voltage = readVoltage();
      float current = readCurrent();
      float power = voltage * current;

      Serial.printf("T=%.2fC V=%.2fV I=%.2fA P=%.2fW\n", tempC, voltage, current, power);
      pushStatus(tempC, voltage, current, power);
    }
    pullRelayCommand();
  }

  delay(200);
}
