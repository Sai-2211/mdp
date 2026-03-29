/*
  ESP32 WiFi → Firebase Firestore bridge for EV charger prototype.

  Hardware:
    - DS18B20 temperature sensor on pin 4 (1-Wire, 4.7kΩ pull-up to 3.3V)
    - Relay module on pin 26
    - ACS712 30A current sensor on pin 35 (0.066 V/A)
    - 25V voltage sensor module on pin 34
    - MAX17048 fuel gauge on I2C (SDA=21, SCL=22)
    - Active buzzer module on pin 25 (low level trigger)
    - Green LED on pin 14 (via 220Ω resistor)

  Required Libraries:
    1. Firebase ESP Client  — by mobizt
    2. OneWire              — by Paul Stoffregen
    3. DallasTemperature    — by Miles Burton
    4. Adafruit MAX1704X    — by Adafruit
    5. Adafruit BusIO       — by Adafruit
*/

#include <WiFi.h>
#include <time.h>
#include <Firebase_ESP_Client.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <Adafruit_MAX1704X.h>
#include <addons/TokenHelper.h>

// ─────────────────────────────────────────────
//  CONFIGURATION
// ─────────────────────────────────────────────
#define WIFI_SSID           "Sai2211"
#define WIFI_PASSWORD       "Sai221107"
#define FIREBASE_API_KEY    "AIzaSyDKiLZx-u1aSDqOIt7nm7Lpv15rBgOvhm8"
#define FIREBASE_PROJECT_ID "evcharger-437ad"
#define DEVICE_EMAIL        "esp32-device@evcharger.com"
#define DEVICE_PASSWORD     "esp32@evcharger"

// ─────────────────────────────────────────────
//  PINS
// ─────────────────────────────────────────────
#define TEMP_PIN     4
#define RELAY_PIN    26
#define CURRENT_PIN  35
#define VOLTAGE_PIN  34
#define LED_PIN      2
#define BUZZER_PIN   25
#define GREEN_LED    14

// ─────────────────────────────────────────────
//  RELAY POLARITY
//  If relay is not switching correctly, swap HIGH and LOW
// ─────────────────────────────────────────────
#define RELAY_ON  LOW
#define RELAY_OFF HIGH

// ─────────────────────────────────────────────
//  CALIBRATION
// ─────────────────────────────────────────────
#define VOLTAGE_DIVIDER_RATIO  5.0
#define ACS712_SENSITIVITY     0.066
#define ACS712_ZERO_VOLTAGE    2.2
#define TEMP_LIMIT             40.0
#define VOLTAGE_MIN            3.0

// ─────────────────────────────────────────────
//  TIMING
// ─────────────────────────────────────────────
#define SENSOR_INTERVAL_MS  5000
#define COMMAND_POLL_MS     2000

// ─────────────────────────────────────────────
//  CHARGING STOP REASONS
// ─────────────────────────────────────────────
#define STOP_REASON_NONE          "none"
#define STOP_REASON_APP           "app"
#define STOP_REASON_SOC           "soc_reached"
#define STOP_REASON_OVERHEAT      "overheat"
#define STOP_REASON_OVERDISCHARGE "overdischarge"

// ─────────────────────────────────────────────
//  GLOBALS
// ─────────────────────────────────────────────
OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensor(&oneWire);
Adafruit_MAX17048 gauge;

FirebaseData fbdo;
FirebaseAuth fbAuth;
FirebaseConfig fbConfig;

unsigned long lastSensorMs      = 0;
unsigned long lastCommandMs     = 0;
unsigned long lastLedMs         = 0;
unsigned long lastGreenBlinkMs  = 0;
unsigned long sessionStartMs    = 0;
unsigned long lastEnergyUpdateMs = 0;

bool relayState      = false;
bool ledState        = false;
bool greenBlinking   = false;
bool greenBlinkState = false;

// Prevents app from turning relay back ON after auto-stop
// Must be manually reset by user tapping Start in app
bool socStopActive   = false;

String currentProfile      = "car";
float  targetSoC           = 95.0;
String stopReason          = STOP_REASON_APP; // app on boot = idle state
float  accumulatedEnergyWh = 0.0;

// ─────────────────────────────────────────────
//  BUILT-IN LED HELPERS
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
    digitalWrite(LED_PIN, HIGH); delay(ms);
    digitalWrite(LED_PIN, LOW);  delay(ms);
  }
}

// ─────────────────────────────────────────────
//  GREEN LED CONTROL
//  Steady ON  = charging active
//  Fast blink = charging complete (SoC reached)
//  OFF        = idle / stopped by app / overheat
// ─────────────────────────────────────────────
void setGreenLED(bool on) {
  greenBlinking = false;
  digitalWrite(GREEN_LED, on ? HIGH : LOW);
}

void startGreenBlink() {
  greenBlinking    = true;
  greenBlinkState  = false;
  lastGreenBlinkMs = millis();
}

void handleGreenBlink() {
  if (!greenBlinking) return;
  unsigned long now = millis();
  if (now - lastGreenBlinkMs >= 300) {
    lastGreenBlinkMs = now;
    greenBlinkState  = !greenBlinkState;
    digitalWrite(GREEN_LED, greenBlinkState ? HIGH : LOW);
  }
}

// ─────────────────────────────────────────────
//  BUZZER
//  Low level trigger module — LOW = ON, HIGH = OFF
// ─────────────────────────────────────────────
void setBuzzer(bool on) {
  digitalWrite(BUZZER_PIN, on ? LOW : HIGH);
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
    ledBlink(1000);
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Connected! IP: ");
    Serial.println(WiFi.localIP());
    ledFlash(3, 150);
  } else {
    Serial.println("[WiFi] FAILED — will retry in loop");
    ledOff();
  }
}

// ─────────────────────────────────────────────
//  Firebase
// ─────────────────────────────────────────────
void setupFirebase() {
  fbConfig.api_key               = FIREBASE_API_KEY;
  fbAuth.user.email              = DEVICE_EMAIL;
  fbAuth.user.password           = DEVICE_PASSWORD;
  fbConfig.token_status_callback = tokenStatusCallback;
  Firebase.reconnectWiFi(true);
  Firebase.begin(&fbConfig, &fbAuth);
  Serial.println("[Firebase] Initializing...");
}

// ─────────────────────────────────────────────
//  SENSOR READS
// ─────────────────────────────────────────────
float readTemperatureC() {
  tempSensor.requestTemperatures();
  float t = tempSensor.getTempCByIndex(0);
  if (t == DEVICE_DISCONNECTED_C) {
    Serial.println("[Sensor][TEMP] ❌ DS18B20 not connected — check wiring and 4.7kΩ pull-up");
    return -999.0;
  }
  if (t < -10.0 || t > 100.0) {
    Serial.printf("[Sensor][TEMP] ⚠ Suspicious reading: %.1f°C\n", t);
    return -999.0;
  }
  Serial.printf("[Sensor][TEMP] ✓ %.1f°C\n", t);
  return t;
}

float readCurrent() {
  const int samples = 50;
  float acc = 0;
  int validSamples = 0;
  for (int i = 0; i < samples; i++) {
    int raw = analogRead(CURRENT_PIN);
    if (raw == 0) {
      Serial.println("[Sensor][CURRENT] ❌ ACS712 not connected or pin floating");
      return -999.0;
    }
    float voltage = raw * (3.3 / 4095.0);
    float current = (voltage - ACS712_ZERO_VOLTAGE) / ACS712_SENSITIVITY;
    acc += current;
    validSamples++;
    delay(2);
  }
  if (validSamples == 0) return -999.0;
  float result = acc / validSamples;
  if (result > 30.0 || result < -30.0) {
    Serial.printf("[Sensor][CURRENT] ⚠ Out of range: %.2fA\n", result);
    return -999.0;
  }
  if (result < 0.05 && result > -0.05) result = 0.0;
  Serial.printf("[Sensor][CURRENT] ✓ %.2fA\n", result);
  return result;
}

float readVoltage() {
  int raw = analogRead(VOLTAGE_PIN);
  if (raw == 0) {
    Serial.println("[Sensor][VOLTAGE] ❌ Voltage sensor not connected");
    return -999.0;
  }
  float adcVoltage = raw * (3.3 / 4095.0);
  float voltage    = adcVoltage * VOLTAGE_DIVIDER_RATIO;
  if (voltage < 2.0 || voltage > 4.5) {
    Serial.printf("[Sensor][VOLTAGE] ⚠ Out of range: %.2fV\n", voltage);
    return -999.0;
  }
  Serial.printf("[Sensor][VOLTAGE] ✓ %.2fV\n", voltage);
  return voltage;
}

float readSoC() {
  float soc = gauge.cellPercent();
  if (soc > 100.0) {
    Serial.printf("[Sensor][SOC] ⚠ MAX17048 overshot: %.1f%% — clamping to 100%%\n", soc);
    soc = 100.0;
  }
  if (soc < 0.0) {
    Serial.printf("[Sensor][SOC] ❌ MAX17048 bad reading: %.1f%%\n", soc);
    return -999.0;
  }
  Serial.printf("[Sensor][SOC] ✓ %.1f%%\n", soc);
  return soc;
}

// ─────────────────────────────────────────────
//  FIREBASE: sync relay state back to command doc
// ─────────────────────────────────────────────
void writeRelayCommandToFirebase(bool state) {
  FirebaseJson content;
  content.set("fields/relay/booleanValue", state);
  String mask = "relay";
  if (Firebase.Firestore.patchDocument(&fbdo, FIREBASE_PROJECT_ID, "",
      "device/command", content.raw(), mask.c_str())) {
    Serial.printf("[Firebase] device/command relay → %s ✓\n",
                  state ? "true" : "false");
  } else {
    Serial.printf("[Firebase] device/command FAILED: %s\n",
                  fbdo.errorReason().c_str());
  }
}

// ─────────────────────────────────────────────
//  RELAY CONTROL
//  Way 1 — App button:      setRelay(true/false, STOP_REASON_APP)
//  Way 2 — SoC target:      setRelay(false, STOP_REASON_SOC)
//  Way 3 — Overheat:        setRelay(false, STOP_REASON_OVERHEAT)
//  Way 4 — Over-discharge:  setRelay(false, STOP_REASON_OVERDISCHARGE)
// ─────────────────────────────────────────────
void setRelay(bool on, String reason) {
  relayState = on;
  digitalWrite(RELAY_PIN, on ? RELAY_ON : RELAY_OFF);

  if (on) {
    // Reset all stop flags when user manually starts charging
    socStopActive        = false;
    stopReason           = STOP_REASON_NONE;
    sessionStartMs       = millis();
    accumulatedEnergyWh  = 0.0;
    lastEnergyUpdateMs   = millis();
    setGreenLED(true);
    setBuzzer(false);
    Serial.println("[Relay] ON — charging started");

  } else {
    stopReason = reason;

    if (reason == STOP_REASON_SOC) {
      socStopActive = true;   // lock relay — prevent app from overriding
      startGreenBlink();
      setBuzzer(false);
      Serial.printf("[Relay] OFF — SoC target %.0f%% reached\n", targetSoC);
      writeRelayCommandToFirebase(false);

    } else if (reason == STOP_REASON_OVERHEAT) {
      socStopActive = true;   // lock relay during overheat too
      setGreenLED(false);
      setBuzzer(true);
      Serial.println("[Relay] OFF — OVERHEAT safety cutoff");
      writeRelayCommandToFirebase(false);

    } else if (reason == STOP_REASON_OVERDISCHARGE) {
      socStopActive = true;   // lock relay during overdischarge too
      setGreenLED(false);
      setBuzzer(true);
      Serial.println("[Relay] OFF — OVER-DISCHARGE protection triggered");
      writeRelayCommandToFirebase(false);

    } else if (reason == STOP_REASON_APP) {
      socStopActive = false;  // user stopped — allow restart
      setGreenLED(false);
      setBuzzer(false);
      Serial.println("[Relay] OFF — stopped by app");

    } else {
      socStopActive = false;
      setGreenLED(false);
      setBuzzer(false);
      Serial.println("[Relay] OFF");
      writeRelayCommandToFirebase(false);
    }
  }
}

// ─────────────────────────────────────────────
//  FIRESTORE: push all sensor data + status
// ─────────────────────────────────────────────
void pushStatus(float temperature, float voltage,
                float current, float power, float soc) {
  FirebaseJson content;

  content.set("fields/temperature/doubleValue", temperature == -999.0 ? 0.0 : temperature);
  content.set("fields/voltage/doubleValue",     voltage     == -999.0 ? 0.0 : voltage);
  content.set("fields/current/doubleValue",     current     == -999.0 ? 0.0 : current);
  content.set("fields/power/doubleValue",       power       == -999.0 ? 0.0 : power);
  content.set("fields/soc/doubleValue",         soc         == -999.0 ? 0.0 : soc);
  content.set("fields/relay/booleanValue",      relayState);
  content.set("fields/profile/stringValue",     currentProfile);
  content.set("fields/targetSoC/doubleValue",   targetSoC);
  content.set("fields/stopReason/stringValue",  stopReason);
  content.set("fields/socStopActive/booleanValue", socStopActive);

  content.set("fields/energyWh/doubleValue",
    accumulatedEnergyWh);
  content.set("fields/elapsedSeconds/integerValue",
    relayState ? (int)((millis() - sessionStartMs) / 1000) : 0);

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

  String mask = "temperature,voltage,current,power,relay,timestamp,"
                "soc,profile,targetSoC,stopReason,socStopActive,"
                "energyWh,elapsedSeconds,"
                "faultTemp,faultVoltage,faultCurrent,faultSoC";

  if (Firebase.Firestore.patchDocument(&fbdo, FIREBASE_PROJECT_ID, "",
      "device/status", content.raw(), mask.c_str())) {
    Serial.println("[Firestore] Updated device/status ✓");
  } else {
    Serial.printf("[Firestore] device/status FAILED: %s\n",
                  fbdo.errorReason().c_str());
  }

  if (!Firebase.Firestore.createDocument(&fbdo, FIREBASE_PROJECT_ID, "",
      "readings", content.raw())) {
    Serial.printf("[Firestore] readings FAILED: %s\n",
                  fbdo.errorReason().c_str());
  }
}

// ─────────────────────────────────────────────
//  FIRESTORE: pull relay command from app
// ─────────────────────────────────────────────
void pullRelayCommand() {
  if (!Firebase.Firestore.getDocument(&fbdo, FIREBASE_PROJECT_ID, "",
      "device/command")) {
    Serial.printf("[Firestore] command read FAILED: %s\n",
                  fbdo.errorReason().c_str());
    return;
  }

  FirebaseJson payload;
  payload.setJsonData(fbdo.payload().c_str());

  // Read profile
  FirebaseJsonData profileField;
  if (payload.get(profileField, "fields/profile/stringValue")) {
    String newProfile = profileField.stringValue;
    if (newProfile != currentProfile) {
      currentProfile = newProfile;
      if      (currentProfile == "scooter") targetSoC = 60.0;
      else if (currentProfile == "bike")    targetSoC = 80.0;
      else if (currentProfile == "car")     targetSoC = 95.0;
      else if (currentProfile == "truck")   targetSoC = 100.0;
      Serial.printf("[Profile] Changed to %s — target: %.0f%%\n",
                    currentProfile.c_str(), targetSoC);
    }
  }

  // Read custom SoC target
  FirebaseJsonData targetField;
  if (payload.get(targetField, "fields/targetSoC/doubleValue")) {
    targetSoC = targetField.doubleValue;
  } else if (payload.get(targetField, "fields/targetSoC/integerValue")) {
    targetSoC = targetField.intValue;
  }

  // Read relay command — Way 1 (app control)
  FirebaseJsonData relayField;
  if (payload.get(relayField, "fields/relay/booleanValue")) {
    bool desired = relayField.boolValue;

    // If socStopActive is true, only allow relay ON if user
    // explicitly taps Start — which resets socStopActive
    if (desired == true && socStopActive) {
      Serial.println("[Relay] ⚠ App sent ON but socStopActive — ignoring");
      // Write false back so app stays in correct state
      writeRelayCommandToFirebase(false);
      return;
    }

    if (desired != relayState) {
      if (desired == true) {
        setRelay(true, STOP_REASON_NONE);
      } else {
        setRelay(false, STOP_REASON_APP);
      }
    }
  }
}

// ─────────────────────────────────────────────
//  SETUP
// ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.println("\n==============================");
  Serial.println("  EV Charger ESP32 — Starting");
  Serial.println("==============================");

  // Built-in LED
  pinMode(LED_PIN, OUTPUT);
  ledOff();

  // Relay — ensure OFF on boot
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_OFF);

  // Buzzer — ensure OFF on boot
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, HIGH);

  // Green LED — ensure OFF on boot
  pinMode(GREEN_LED, OUTPUT);
  digitalWrite(GREEN_LED, LOW);

  // Fuel gauge — MAX17048 (I2C must init before 1-Wire)
  Wire.begin(21, 22);
  if (!gauge.begin()) {
    Serial.println("[MAX17048] ❌ Not found — check SDA/SCL wiring");
  } else {
    Serial.println("[MAX17048] ✓ Found");
    gauge.setAlertVoltages(3.0, 4.2);
    gauge.quickStart();
    delay(1000);
    Serial.printf("[MAX17048] Voltage: %.2fV  SoC: %.1f%%\n",
                  gauge.cellVoltage(), gauge.cellPercent());
  }

  // Temperature sensor — 1-Wire (init after I2C)
  tempSensor.begin();
  Serial.println("[DS18B20] Initialized");

  // WiFi
  connectWiFi();

  // NTP
  configTime(19800, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
  Serial.print("[NTP] Syncing time");
  int ntpAttempts = 0;
  while (time(nullptr) < 1000000000 && ntpAttempts < 20) {
    Serial.print(".");
    delay(500);
    ntpAttempts++;
  }
  if (time(nullptr) < 1000000000) {
    Serial.println(" FAILED — continuing without NTP");
  } else {
    Serial.println(" synced ✓");
  }

  setupFirebase();
}

// ─────────────────────────────────────────────
//  MAIN LOOP
// ─────────────────────────────────────────────
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Disconnected — reconnecting...");
    connectWiFi();
  }

  if (!Firebase.ready()) {
    ledBlink(250);
    delay(500);
    return;
  }

  ledOn();

  unsigned long now = millis();

  // ── Read sensors and push data ──────────────
  if (now - lastSensorMs >= SENSOR_INTERVAL_MS) {
    lastSensorMs = now;

    float temperature = readTemperatureC();
    float voltage     = readVoltage();
    float current     = readCurrent();
    float soc         = readSoC();

    float power = -999.0;
    if (voltage != -999.0 && current != -999.0) {
      power = voltage * current;
    }

    // Accumulate energy only when charging and power is positive
    if (relayState && power > 0.0) {
      float deltaHours = (millis() - lastEnergyUpdateMs) / 3600000.0;
      accumulatedEnergyWh += power * deltaHours;
      lastEnergyUpdateMs = millis();
    } else if (relayState) {
      lastEnergyUpdateMs = millis();
    }

    Serial.println("\n------- Sensor Readings -------");
    if (temperature == -999.0) Serial.println("  Temperature: FAULT");
    else Serial.printf("  Temperature: %.1f °C\n", temperature);
    if (voltage == -999.0) Serial.println("  Voltage:     FAULT");
    else Serial.printf("  Voltage:     %.2f V\n", voltage);
    if (current == -999.0) Serial.println("  Current:     FAULT");
    else Serial.printf("  Current:     %.2f A\n", current);
    if (power == -999.0) Serial.println("  Power:       FAULT");
    else Serial.printf("  Power:       %.2f W\n", power);
    if (soc == -999.0) Serial.println("  SoC:         FAULT");
    else Serial.printf("  SoC:         %.1f %%\n", soc);
    Serial.printf("  Energy:      %.4f Wh\n", accumulatedEnergyWh);
    Serial.printf("  Relay:       %s\n", relayState ? "ON" : "OFF");
    Serial.printf("  SocStop:     %s\n", socStopActive ? "LOCKED" : "unlocked");
    Serial.printf("  Stop Reason: %s\n", stopReason.c_str());
    Serial.printf("  Profile:     %s (target %.0f%%)\n",
                  currentProfile.c_str(), targetSoC);
    Serial.println("-------------------------------");

    // ── WAY 4: Over-discharge protection ───────
    if (voltage != -999.0 && voltage < VOLTAGE_MIN && relayState) {
      setRelay(false, STOP_REASON_OVERDISCHARGE);
      Serial.printf("[SAFETY] ⚠ Voltage %.2fV below %.1fV\n",
                    voltage, VOLTAGE_MIN);
    }

    // ── WAY 3: Overheat safety ──────────────────
    if (temperature != -999.0 && temperature > TEMP_LIMIT && relayState) {
      setRelay(false, STOP_REASON_OVERHEAT);
      Serial.printf("[SAFETY] ⚠ Temperature %.1f°C exceeded limit\n",
                    temperature);
    }

    // ── WAY 2: Auto-stop when SoC target reached
    if (soc != -999.0 && soc >= targetSoC && relayState) {
      setRelay(false, STOP_REASON_SOC);
      Serial.printf("[Auto-Stop] ✓ SoC %.1f%% reached target %.0f%%\n",
                    soc, targetSoC);
    }

    pushStatus(temperature, voltage, current, power, soc);
  }

  // ── Poll relay command from app ─────────────
  if (now - lastCommandMs >= COMMAND_POLL_MS) {
    lastCommandMs = now;
    pullRelayCommand();

    // Overheat re-check after app command
    tempSensor.requestTemperatures();
    float tempCheck = tempSensor.getTempCByIndex(0);
    if (tempCheck != DEVICE_DISCONNECTED_C &&
        tempCheck > TEMP_LIMIT && relayState) {
      setRelay(false, STOP_REASON_OVERHEAT);
      Serial.println("[SAFETY] ⚠ Overheat after app command — relay forced OFF");
    }

    // Over-discharge re-check after app command
    int rawV = analogRead(VOLTAGE_PIN);
    if (rawV > 0) {
      float voltCheck = (rawV * (3.3 / 4095.0)) * VOLTAGE_DIVIDER_RATIO;
      if (voltCheck < VOLTAGE_MIN && relayState) {
        setRelay(false, STOP_REASON_OVERDISCHARGE);
        Serial.printf("[SAFETY] ⚠ Voltage %.2fV after command\n", voltCheck);
      }
    }
  }

  // ── Handle green LED blink (non-blocking) ───
  handleGreenBlink();

  delay(100);
}