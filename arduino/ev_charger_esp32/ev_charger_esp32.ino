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
#include <time.h>
#include <Firebase_ESP_Client.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <MAX1704X.h>

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
#define TEMP_PIN     4
#define RELAY_PIN    26
#define CURRENT_PIN  35
#define VOLTAGE_PIN  34
#define LED_PIN      2       // Built-in LED (most ESP32 boards)
#define BUZZER_PIN   25
#define RED_LED      27
#define GREEN_LED    14

// ─────────────────────────────────────────────
//  CALIBRATION
// ─────────────────────────────────────────────
#define VOLTAGE_DIVIDER_RATIO  5.0     // Resistor divider ratio
#define ACS712_SENSITIVITY     0.066   // V/A for ACS712-30A module
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
OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensor(&oneWire);
MAX1704X gauge(0x36);

FirebaseData fbdo;
FirebaseAuth fbAuth;
FirebaseConfig fbConfig;

unsigned long lastSensorMs  = 0;
unsigned long lastCommandMs = 0;
unsigned long lastLedMs     = 0;
bool relayState = false;
bool firebaseReady = false;
bool ledState = false;

String currentProfile = "car";
float  targetSoC      = 95.0;

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
void tokenStatusCallback(token_info_t info) {
  Serial.printf("[Token] Status: %s\n", info.status == token_status_ready ? "Ready" : "Not Ready");
}

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
// DS18B20 Temperature
float readTemperatureC() {
  tempSensor.requestTemperatures();
  float t = tempSensor.getTempCByIndex(0);

  if (t == DEVICE_DISCONNECTED_C) {
    Serial.println("[Sensor][TEMP] ❌ DS18B20 not connected — check wiring and 4.7kΩ pull-up");
    return -999.0;
  }
  if (t < -10.0 || t > 100.0) {
    Serial.printf("[Sensor][TEMP] ⚠ Suspicious reading: %.1f°C — possible loose connection\n", t);
    return -999.0;
  }
  Serial.printf("[Sensor][TEMP] ✓ %.1f°C\n", t);
  return t;
}

// ACS712 Current Sensor
float readCurrent() {
  const int samples = 50;
  float acc = 0;
  int validSamples = 0;

  for (int i = 0; i < samples; i++) {
    int raw = analogRead(CURRENT_PIN);

    // Raw value of 0 or 4095 means sensor is disconnected or shorted
    if (raw == 0 || raw == 4095) {
      Serial.println("[Sensor][CURRENT] ❌ ACS712 not connected or pin floating");
      return -999.0;
    }

    float voltage = raw * (3.3 / 4095.0);
    float current = (voltage - ACS712_ZERO_VOLTAGE) / ACS712_SENSITIVITY;
    acc += current;
    validSamples++;
    delay(2);
  }

  if (validSamples == 0) {
    Serial.println("[Sensor][CURRENT] ❌ No valid samples from ACS712");
    return -999.0;
  }

  float result = acc / validSamples;

  // ACS712 30A module — physically impossible to exceed ±30A
  if (result > 30.0 || result < -30.0) {
    Serial.printf("[Sensor][CURRENT] ⚠ Reading out of range: %.2fA — check calibration\n", result);
    return -999.0;
  }

  // Small negative readings near zero are just noise — clamp to 0
  if (result < 0.05 && result > -0.05) result = 0.0;

  Serial.printf("[Sensor][CURRENT] ✓ %.2fA\n", result);
  return result;
}

// 25V Voltage Sensor
float readVoltage() {
  int raw = analogRead(VOLTAGE_PIN);

  // Raw 0 means sensor is not connected or no voltage
  if (raw == 0) {
    Serial.println("[Sensor][VOLTAGE] ❌ Voltage sensor not connected or battery disconnected");
    return -999.0;
  }

  // Raw 4095 means input voltage is too high — ADC is saturated
  if (raw == 4095) {
    Serial.println("[Sensor][VOLTAGE] ❌ ADC saturated — voltage too high or sensor shorted");
    return -999.0;
  }

  float adcVoltage = raw * (3.3 / 4095.0);
  float voltage = adcVoltage * VOLTAGE_DIVIDER_RATIO;

  // Li-ion battery physically cannot go below 2.5V or above 4.25V
  if (voltage < 2.5 || voltage > 4.3) {
    Serial.printf("[Sensor][VOLTAGE] ⚠ Reading out of range: %.2fV — check sensor connections\n", voltage);
    return -999.0;
  }

  Serial.printf("[Sensor][VOLTAGE] ✓ %.2fV\n", voltage);
  return voltage;
}

// MAX17048 Fuel Gauge
float readSoC() {
  float soc = gauge.getSOC();

  if (soc < 0.0 || soc > 100.0) {
    Serial.printf("[Sensor][SOC] ❌ MAX17048 not connected or bad reading: %.1f%%\n", soc);
    return -999.0;
  }

  Serial.printf("[Sensor][SOC] ✓ %.1f%%\n", soc);
  return soc;
}

/*
float readGaugeVoltage() {
  float v = gauge.getVoltage();

  if (v < 2.5 || v > 4.3) {
    Serial.printf("[Sensor][GAUGE_V] ❌ MAX17048 voltage out of range: %.2fV\n", v);
    return -999.0;
  }

  Serial.printf("[Sensor][GAUGE_V] ✓ %.2fV\n", v);
  return v;
}
*/

void setBuzzer(bool on) {
  digitalWrite(BUZZER_PIN, on ? LOW : HIGH); // BC557 PNP — inverted
}

void setLEDs(bool charging, bool done) {
  digitalWrite(RED_LED,   charging ? HIGH : LOW);
  digitalWrite(GREEN_LED, done     ? HIGH : LOW);
}

// ─────────────────────────────────────────────
//  FIRESTORE: push sensor data
// ─────────────────────────────────────────────
void pushStatus(float temperature, float voltage, float current, float power, float soc) {
  FirebaseJson content;

  // Use 0 as fallback for any failed sensor — app will show 0 instead of crashing
  content.set("fields/temperature/doubleValue", temperature == -999.0 ? 0.0 : temperature);
  content.set("fields/voltage/doubleValue",     voltage    == -999.0 ? 0.0 : voltage);
  content.set("fields/current/doubleValue",     current    == -999.0 ? 0.0 : current);
  content.set("fields/power/doubleValue",       power      == -999.0 ? 0.0 : power);
  content.set("fields/soc/doubleValue",         soc        == -999.0 ? 0.0 : soc);
  content.set("fields/relay/booleanValue",      relayState);
  content.set("fields/profile/stringValue",     currentProfile);
  content.set("fields/targetSoC/doubleValue",   targetSoC);

  // Sensor fault flags — app can read these to show warning icons
  content.set("fields/faultTemp/booleanValue",    temperature == -999.0);
  content.set("fields/faultVoltage/booleanValue", voltage     == -999.0);
  content.set("fields/faultCurrent/booleanValue", current     == -999.0);
  content.set("fields/faultSoC/booleanValue",     soc         == -999.0);

  time_t now = time(nullptr);
  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);
  char timeBuf[30];
  strftime(timeBuf, sizeof(timeBuf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  content.set("fields/timestamp/timestampValue", timeBuf);

  String mask = "temperature,voltage,current,power,relay,timestamp,soc,profile,targetSoC,faultTemp,faultVoltage,faultCurrent,faultSoC";

  if (Firebase.Firestore.patchDocument(&fbdo, FIREBASE_PROJECT_ID, "", "device/status", content.raw(), mask.c_str())) {
    Serial.println("[Firestore] Updated device/status ✓");
  } else {
    Serial.printf("[Firestore] device/status FAILED: %s\n", fbdo.errorReason().c_str());
  }

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
        if (desired == true) {
          setLEDs(true, false);  // red ON, green OFF
          setBuzzer(false);
        } else {
          setLEDs(false, false);
          setBuzzer(false);
        }
      }
    }
    FirebaseJsonData profileField;
    if (payload.get(profileField, "fields/profile/stringValue")) {
      currentProfile = profileField.stringValue;
      if      (currentProfile == "scooter") targetSoC = 60.0;
      else if (currentProfile == "bike")    targetSoC = 80.0;
      else if (currentProfile == "car")     targetSoC = 95.0;
      else if (currentProfile == "truck")   targetSoC = 100.0;
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
  tempSensor.begin();
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  // Fuel gauge init
  Wire.begin(21, 22);
  gauge.begin();
  gauge.setAlertThreshold(10);

  // Buzzer and LED init
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  digitalWrite(BUZZER_PIN, HIGH);
  digitalWrite(RED_LED, LOW);
  digitalWrite(GREEN_LED, LOW);

  // Network init
  connectWiFi();

  // ← ADD THIS BLOCK right here
  configTime(19800, 0, "pool.ntp.org"); // UTC+5:30 India
  Serial.print("[NTP] Syncing time");
  while (time(nullptr) < 1000000000) {
    Serial.print(".");
    delay(500);
  }
  Serial.println(" synced ✓");

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
    float soc         = readSoC();

    // Only calculate power if both voltage and current are valid
    float power = -999.0;
    if (voltage != -999.0 && current != -999.0) {
      power = voltage * current;
    } else {
      Serial.println("[Sensor][POWER] ⚠ Cannot calculate power — voltage or current fault");
  }

  Serial.println("------- Sensor Readings -------");
  Serial.printf("  Temperature: %s\n", temperature == -999.0 ? "FAULT" : String(temperature, 1) + " °C");
  Serial.printf("  Voltage:     %s\n", voltage     == -999.0 ? "FAULT" : String(voltage, 2)     + " V");
  Serial.printf("  Current:     %s\n", current     == -999.0 ? "FAULT" : String(current, 2)     + " A");
  Serial.printf("  Power:       %s\n", power       == -999.0 ? "FAULT" : String(power, 2)       + " W");
  Serial.printf("  SoC:         %s\n", soc         == -999.0 ? "FAULT" : String(soc, 1)         + " %");
  Serial.printf("  Relay:       %s\n", relayState ? "ON" : "OFF");
  Serial.printf("  Profile:     %s (target %.0f%%)\n", currentProfile.c_str(), targetSoC);
  Serial.println("-------------------------------");

  // Safety — only trigger if temperature is a valid reading
  if (temperature != -999.0 && temperature > TEMP_LIMIT && relayState) {
    relayState = false;
    digitalWrite(RELAY_PIN, LOW);
    setLEDs(false, false);
    setBuzzer(true);
    Serial.printf("[SAFETY] Temperature %.1f°C exceeded limit — RELAY FORCED OFF\n", temperature);
  }

  // Auto-stop — only trigger if SoC is a valid reading
  if (soc != -999.0 && soc >= targetSoC && relayState) {
    relayState = false;
    digitalWrite(RELAY_PIN, LOW);
    setLEDs(false, true);
    setBuzzer(false);
    Serial.printf("[Profile] Target %.0f%% reached — charging stopped\n", targetSoC);
  }

  // Always push to Firestore regardless of sensor faults
  pushStatus(temperature, voltage, current, power, soc);
  }

  // ── Poll relay command from app ─────────────
  if (now - lastCommandMs >= COMMAND_POLL_MS) {
    lastCommandMs = now;
    pullRelayCommand();

    // Re-check safety after command pull
    tempSensor.requestTemperatures();
    float tempCheck = tempSensor.getTempCByIndex(0);
    if (tempCheck != DEVICE_DISCONNECTED_C && tempCheck > TEMP_LIMIT && relayState) {
      relayState = false;
      digitalWrite(RELAY_PIN, LOW);
      setLEDs(false, false);
      setBuzzer(true);
      Serial.println("[SAFETY] Overheat after command — relay forced OFF");
    }
  }

  delay(100);
}
