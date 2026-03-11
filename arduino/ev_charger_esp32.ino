/*
  ESP32 WiFi → Firebase Firestore bridge for EV charger prototype.

  Hardware:
    - DHT11 temperature sensor on pin 4
    - Relay module on pin 26
    - ACS712 current sensor on pin 34 (5A module, 0.185 V/A)
    - Voltage divider on pin 35 (ratio × 5)

  Firebase:
    - Pushes sensor data to  device/status  (live) and  readings/{auto-id}  (history)
    - Reads relay commands from  device/command
    - Uses Email/Password auth with a dedicated device account

  Required Arduino Libraries (install via Library Manager):
    1. Firebase ESP Client  — by mobizt
    2. DHT sensor library   — by Adafruit
    3. Adafruit Unified Sensor

  Setup checklist:
    1. Fill in WIFI_SSID and WIFI_PASSWORD below
    2. Create a device account in Firebase Console → Authentication → Add User
    3. Fill in DEVICE_EMAIL and DEVICE_PASSWORD with that account
    4. Upload to ESP32, open Serial Monitor at 115200 baud
*/

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <DHT.h>

// Provide the token generation helper
#include <addons/TokenHelper.h>

// ─────────────────────────────────────────────
//  CONFIGURATION — fill these in
// ─────────────────────────────────────────────
#define WIFI_SSID          "Sai2211"
#define WIFI_PASSWORD      "Sai221107"

#define FIREBASE_API_KEY   "AIzaSyDKiLZx-u1aSDqOIt7nm7Lpv15rBgOvhm8"
#define FIREBASE_PROJECT_ID "evcharger-437ad"

// Create this account in Firebase Console → Authentication → Add User
#define DEVICE_EMAIL       "esp32-device@evcharger.com"
#define DEVICE_PASSWORD    "esp32@evcharger"

// ─────────────────────────────────────────────
//  PINS
// ─────────────────────────────────────────────
#define DHTPIN       4
#define DHTTYPE      DHT11
#define RELAY_PIN    26
#define CURRENT_PIN  34
#define VOLTAGE_PIN  35
#define LED_PIN      2       // Built-in LED (most ESP32 boards)

// ─────────────────────────────────────────────
//  CALIBRATION
// ─────────────────────────────────────────────
#define VOLTAGE_DIVIDER_RATIO  5.0     // Resistor divider ratio
#define ACS712_SENSITIVITY     0.185   // V/A for ACS712-5A module
#define ACS712_ZERO_VOLTAGE    2.5     // Output voltage at 0 A
#define TEMP_LIMIT             40.0    // °C — relay forced OFF above this

// ─────────────────────────────────────────────
//  TIMING
// ─────────────────────────────────────────────
#define SENSOR_INTERVAL_MS     5000    // Push data every 5 seconds
#define COMMAND_POLL_MS        2000    // Check relay command every 2 seconds

// ─────────────────────────────────────────────
//  GLOBALS
// ─────────────────────────────────────────────
DHT dht(DHTPIN, DHTTYPE);

FirebaseData fbdo;
FirebaseAuth fbAuth;
FirebaseConfig fbConfig;

unsigned long lastSensorMs  = 0;
unsigned long lastCommandMs = 0;
unsigned long lastLedMs     = 0;
bool relayState = false;
bool firebaseReady = false;
bool ledState = false;

// ─────────────────────────────────────────────
//  LED STATUS INDICATOR
//   Slow blink (1s)  = Trying to connect WiFi
//   Fast blink (250ms) = WiFi OK, Firebase not ready
//   Solid ON          = Fully connected & operational
//   Brief flash       = Data pushed to Firestore
// ─────────────────────────────────────────────
void ledBlink(int intervalMs) {
  unsigned long now = millis();
  if (now - lastLedMs >= (unsigned long)intervalMs) {
    lastLedMs = now;
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState ? HIGH : LOW);
  }
}

void ledOn()  { digitalWrite(LED_PIN, HIGH); ledState = true; }
void ledOff() { digitalWrite(LED_PIN, LOW);  ledState = false; }

void ledFlash(int count, int ms) {
  for (int i = 0; i < count; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(ms);
    digitalWrite(LED_PIN, LOW);
    delay(ms);
  }
}

// ─────────────────────────────────────────────
//  WiFi
// ─────────────────────────────────────────────
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Connecting");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    // Slow blink while connecting to WiFi
    ledBlink(1000);
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Connected! IP: ");
    Serial.println(WiFi.localIP());
    // Quick triple-flash to confirm WiFi connected
    ledFlash(3, 150);
  } else {
    Serial.println("[WiFi] FAILED — will retry in loop");
    ledOff();
  }
}

// ─────────────────────────────────────────────
//  Firebase
// ─────────────────────────────────────────────
void tokenStatusCallback(token_info_t info);

void setupFirebase() {
  fbConfig.api_key = FIREBASE_API_KEY;

  fbAuth.user.email    = DEVICE_EMAIL;
  fbAuth.user.password = DEVICE_PASSWORD;

  fbConfig.token_status_callback = tokenStatusCallback;

  Firebase.reconnectWiFi(true);
  Firebase.begin(&fbConfig, &fbAuth);

  Serial.println("[Firebase] Initializing...");
}

// ─────────────────────────────────────────────
//  SENSOR READS
// ─────────────────────────────────────────────
float readTemperatureC() {
  float t = dht.readTemperature();
  if (isnan(t)) {
    Serial.println("[Sensor] DHT11 read failed");
    return -999.0;
  }
  return t;
}

float readVoltage() {
  int raw = analogRead(VOLTAGE_PIN);
  float adcVoltage = raw * (3.3 / 4095.0);
  return adcVoltage * VOLTAGE_DIVIDER_RATIO;
}

float readCurrent() {
  // Average 50 samples for noise reduction
  const int samples = 50;
  float acc = 0;
  for (int i = 0; i < samples; i++) {
    int raw = analogRead(CURRENT_PIN);
    float voltage = raw * (3.3 / 4095.0);
    float current = (voltage - ACS712_ZERO_VOLTAGE) / ACS712_SENSITIVITY;
    acc += current;
    delay(2);
  }
  return acc / samples;
}

// ─────────────────────────────────────────────
//  FIRESTORE: push sensor data
// ─────────────────────────────────────────────
void pushStatus(float temperature, float voltage, float current, float power) {
  // Build the Firestore REST-style field payload
  FirebaseJson content;
  content.set("fields/temperature/doubleValue", temperature);
  content.set("fields/voltage/doubleValue",     voltage);
  content.set("fields/current/doubleValue",     current);
  content.set("fields/power/doubleValue",       power);
  content.set("fields/relay/booleanValue",      relayState);
  // Build ISO 8601 timestamp string (Firestore timestampValue format)
  time_t now = time(nullptr);
  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);
  char timeBuf[30];
  strftime(timeBuf, sizeof(timeBuf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  content.set("fields/timestamp/timestampValue", timeBuf);

  // Update device/status (live document the app dashboard reads)
  String mask = "temperature,voltage,current,power,relay,timestamp";
  if (Firebase.Firestore.patchDocument(&fbdo, FIREBASE_PROJECT_ID, "", "device/status", content.raw(), mask.c_str())) {
    Serial.println("[Firestore] Updated device/status ✓");
  } else {
    Serial.printf("[Firestore] device/status FAILED: %s\n", fbdo.errorReason().c_str());
  }

  // Push to readings collection (history log)
  if (Firebase.Firestore.createDocument(&fbdo, FIREBASE_PROJECT_ID, "", "readings", content.raw())) {
    Serial.println("[Firestore] Added readings entry ✓");
  } else {
    Serial.printf("[Firestore] readings FAILED: %s\n", fbdo.errorReason().c_str());
  }
}

// ─────────────────────────────────────────────
//  FIRESTORE: pull relay command from app
// ─────────────────────────────────────────────
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
        Serial.printf("[Relay] Set to %s (from app command)\n", relayState ? "ON" : "OFF");
      }
    }
  } else {
    Serial.printf("[Firestore] command read FAILED: %s\n", fbdo.errorReason().c_str());
  }
}

// ─────────────────────────────────────────────
//  SETUP
// ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("==============================");
  Serial.println("  EV Charger ESP32 — Starting");
  Serial.println("==============================");

  // LED init
  pinMode(LED_PIN, OUTPUT);
  ledOff();

  // Sensor init
  dht.begin();
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  // Network init
  connectWiFi();
  setupFirebase();
}

// ─────────────────────────────────────────────
//  MAIN LOOP
// ─────────────────────────────────────────────
void loop() {
  // Reconnect WiFi if dropped
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Disconnected — reconnecting...");
    connectWiFi();
  }

  // Wait for Firebase to be ready (token obtained)
  if (!Firebase.ready()) {
    // Fast blink: WiFi OK but Firebase still authenticating
    ledBlink(250);
    delay(500);
    return;
  }

  // Solid ON: fully connected and operational
  ledOn();

  unsigned long now = millis();

  // ── Read sensors and push data ──────────────
  if (now - lastSensorMs >= SENSOR_INTERVAL_MS) {
    lastSensorMs = now;

    float temperature = readTemperatureC();
    float voltage     = readVoltage();
    float current     = readCurrent();
    float power       = voltage * current;

    Serial.println("------- Sensor Readings -------");
    Serial.printf("  Temperature: %.1f °C\n", temperature);
    Serial.printf("  Voltage:     %.2f V\n",  voltage);
    Serial.printf("  Current:     %.2f A\n",  current);
    Serial.printf("  Power:       %.2f W\n",  power);
    Serial.printf("  Relay:       %s\n",      relayState ? "ON" : "OFF");
    Serial.println("-------------------------------");

    // ── Safety override: overheat protection ──
    if (temperature > TEMP_LIMIT && temperature != -999.0) {
      if (relayState) {
        relayState = false;
        digitalWrite(RELAY_PIN, LOW);
        Serial.printf("[SAFETY] Temperature %.1f°C > %.1f°C — RELAY FORCED OFF!\n", temperature, TEMP_LIMIT);
      }
    }

    // Push to Firestore
    if (temperature != -999.0) {
      pushStatus(temperature, voltage, current, power);
    }
  }

  // ── Poll relay command from app ─────────────
  if (now - lastCommandMs >= COMMAND_POLL_MS) {
    lastCommandMs = now;
    pullRelayCommand();

    // Re-check safety after command pull
    float tempCheck = dht.readTemperature();
    if (!isnan(tempCheck) && tempCheck > TEMP_LIMIT && relayState) {
      relayState = false;
      digitalWrite(RELAY_PIN, LOW);
      Serial.println("[SAFETY] Overheat detected after command — relay forced OFF");
    }
  }

  delay(100);
}
