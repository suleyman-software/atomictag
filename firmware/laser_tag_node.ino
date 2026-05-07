/*
 * AtomicTag — NodeMCU (ESP8266) Laser Tag Firmware v4
 *
 * HTTP Polling: WSS yerine HTTPS REST API kullanır (daha stabil)
 * LCD: I2C 16x2 ekran desteği
 *
 * ── Bağlantı Şeması ──────────────────────────────────────────
 *  I2C LCD
 *    SDA          → D2  (GPIO4)
 *    SCL          → D1  (GPIO5)
 *    VCC          → VIN
 *    GND          → GND
 *
 *  KY-008 Lazer Modülü
 *    S (Sinyal)   → D5  (GPIO14)
 *    Orta (+)     → 3V3
 *    - (GND)      → GND
 *
 *  Tetik Butonu
 *    Bacak 1      → D6  (GPIO12)
 *    Bacak 2      → GND
 *
 *  Buzzer
 *    + (uzun)     → D7  (GPIO13)
 *    - (kısa)     → GND
 *
 *  Göğüs Sensörü
 *    LDR Bacak 1  → 3V3
 *    LDR Bacak 2  → A0
 *    10K Direnç   → A0 ile GND arası
 * ────────────────────────────────────────────────────────────
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <EEPROM.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define SERVER_HOST "atomictag.vercel.app"
#define SERVER_URL  "https://atomictag.vercel.app"

#define PIN_TRIGGER   12   // D6
#define PIN_LASER     14   // D5
#define PIN_BUZZER    13   // D7
#define PIN_LDR       A0

#define MAX_AMMO         30
#define MAX_HP           100
#define HIT_DAMAGE       10
#define LDR_HIT_THRESHOLD 800
#define DEBOUNCE_MS      200
#define FIRE_DURATION_MS 80
#define HIT_COOLDOWN_MS  500
#define POLL_INTERVAL_MS 600

#define EEPROM_SIZE 512
#define CFG_MAGIC   0x4156  // "AV" — v4 magic

struct DeviceConfig {
  uint16_t magic;
  char wifiSsid[64];
  char wifiPassword[64];
  char playerId[32];
};

DeviceConfig config;
bool configValid = false;

LiquidCrystal_I2C lcd(0x27, 16, 2);
ESP8266WebServer portalServer(80);

int  ammo       = MAX_AMMO;
int  hp         = MAX_HP;
bool gameActive = false;
bool serverConnected = false;
bool apMode      = false;
unsigned long lastFireTime = 0;
unsigned long lastHitTime  = 0;
unsigned long lastPollTime = 0;

// SSL istemci — insecure mode (sertifika doğrulaması atlanır, ESP8266 için gerekli)
BearSSL::WiFiClientSecure secureClient;

// ── LCD ─────────────────────────────────────────────────────

void lcdShow(const char* l1, const char* l2) {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(l1);
  lcd.setCursor(0, 1); lcd.print(l2);
}

void lcdGameStatus() {
  char line1[17], line2[17];
  snprintf(line1, 17, "HP:%-3d Ammo:%-2d", hp, ammo);
  snprintf(line2, 17, "%-16s", gameActive ? "OYUN AKTIF" : "Hazir");
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(line1);
  lcd.setCursor(0, 1); lcd.print(line2);
}

// ── EEPROM ──────────────────────────────────────────────────

void loadConfig() {
  EEPROM.begin(EEPROM_SIZE);
  EEPROM.get(0, config);
  if (config.magic == CFG_MAGIC) {
    configValid = true;
    Serial.printf("[CFG] SSID:%s Player:%s\n", config.wifiSsid, config.playerId);
  } else {
    configValid = false;
    memset(&config, 0, sizeof(config));
    strlcpy(config.playerId, "player1", 32);
    Serial.println("[CFG] No config — defaults");
  }
}

void saveConfig() {
  config.magic = CFG_MAGIC;
  EEPROM.begin(EEPROM_SIZE);
  EEPROM.put(0, config);
  EEPROM.commit();
  Serial.println("[CFG] Saved");
}

void clearConfig() {
  memset(&config, 0, sizeof(config));
  EEPROM.begin(EEPROM_SIZE);
  EEPROM.put(0, config);
  EEPROM.commit();
  configValid = false;
  Serial.println("[CFG] Cleared");
}

// ── Buzzer ──────────────────────────────────────────────────

void buzzerTone(int freq, int dur) {
  tone(PIN_BUZZER, freq, dur);
}

// ── HTTP Helpers ────────────────────────────────────────────

int httpGET(const char* path, String& response) {
  HTTPClient http;
  http.setTimeout(3000);
  http.begin(secureClient, String(SERVER_URL) + path);
  int code = http.GET();
  if (code == 200) {
    response = http.getString();
  }
  http.end();
  return code;
}

int httpPOST(const char* path, const String& body) {
  HTTPClient http;
  http.setTimeout(3000);
  http.begin(secureClient, String(SERVER_URL) + path);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  http.end();
  return code;
}

// ── Server Poll ─────────────────────────────────────────────

void pollServer() {
  String url = "/api/device/poll?playerId=";
  url += config.playerId;

  String response;
  int code = httpGET(url.c_str(), response);

  if (code == 200) {
    if (!serverConnected) {
      serverConnected = true;
      Serial.println("[HTTP] Server connected!");
      buzzerTone(1500, 100);
    }

    JsonDocument doc;
    if (deserializeJson(doc, response)) return;

    bool wasActive = gameActive;
    gameActive = doc["active"] | false;
    hp   = doc["hp"]   | hp;
    ammo = doc["ammo"] | ammo;

    const char* cmd = doc["cmd"];
    if (cmd) {
      if (strcmp(cmd, "start") == 0) {
        gameActive = true;
        ammo = MAX_AMMO;
        hp = MAX_HP;
        buzzerTone(1500, 150);
        Serial.println("[GAME] Start!");
      }
      else if (strcmp(cmd, "stop") == 0) {
        gameActive = false;
        buzzerTone(300, 500);
        Serial.println("[GAME] Stop!");
        lcdShow("OYUN BITTI", "");
        return;
      }
    }

    lcdGameStatus();

  } else {
    if (serverConnected) {
      serverConnected = false;
      Serial.printf("[HTTP] Poll failed: %d\n", code);
      lcdShow("Sunucu baglanti", "bekleniyor...");
    }
  }
}

// ── Captive Portal ──────────────────────────────────────────

const char PORTAL_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AtomicTag Kurulum</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui;background:#0a0a0f;color:#e2e8f0;
min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.c{background:#111827;border:1px solid #1f2937;border-radius:16px;padding:32px;
width:100%;max-width:400px}
h1{font-size:24px;text-align:center;margin-bottom:4px;
background:linear-gradient(to right,#60a5fa,#a78bfa);-webkit-background-clip:text;
-webkit-text-fill-color:transparent}
.s{text-align:center;color:#6b7280;font-size:13px;margin-bottom:24px}
label{display:block;font-size:12px;color:#9ca3af;margin-bottom:4px;margin-top:16px}
input,select{width:100%;padding:10px 12px;background:#1f2937;border:1px solid #374151;
border-radius:8px;color:#e2e8f0;font-size:14px;outline:none}
.b{width:100%;margin-top:24px;padding:12px;background:#16a34a;border:none;
border-radius:8px;color:white;font-size:15px;font-weight:600;cursor:pointer}
.st{text-align:center;margin-top:16px;font-size:13px;color:#6b7280}
</style>
</head>
<body>
<div class="c">
<h1>AtomicTag</h1>
<p class="s">Cihaz Kurulumu</p>
<form action="/save" method="POST">
<label>Wi-Fi Agi</label>
<select name="ssid" id="ssid"><option>Taraniyor...</option></select>
<label>Wi-Fi Sifresi</label>
<input type="password" name="password" placeholder="Wi-Fi sifreniz">
<label>Oyuncu</label>
<select name="playerid">
<option value="player1">Oyuncu 1</option>
<option value="player2">Oyuncu 2</option>
</select>
<button type="submit" class="b">Kaydet ve Baslat</button>
</form>
<p class="st" id="st"></p>
</div>
<script>
function scan(){
document.getElementById('st').textContent='Taraniyor...';
fetch('/scan').then(r=>r.json()).then(list=>{
var s=document.getElementById('ssid');s.innerHTML='';
list.forEach(function(n){var o=document.createElement('option');o.value=n;o.textContent=n;s.appendChild(o)});
document.getElementById('st').textContent=list.length+' ag bulundu';
});}
scan();
</script>
</body>
</html>
)rawliteral";

void startCaptivePortal() {
  apMode = true;
  WiFi.mode(WIFI_AP);
  WiFi.softAP("AtomicTag-Setup", "atomictag");
  Serial.printf("[AP] IP: %s\n", WiFi.softAPIP().toString().c_str());

  portalServer.on("/", HTTP_GET, []() {
    portalServer.send_P(200, "text/html", PORTAL_HTML);
  });

  portalServer.on("/scan", HTTP_GET, []() {
    int n = WiFi.scanNetworks();
    String json = "[";
    for (int i = 0; i < n; i++) {
      if (i > 0) json += ",";
      json += "\"" + WiFi.SSID(i) + "\"";
    }
    json += "]";
    portalServer.send(200, "application/json", json);
  });

  portalServer.on("/save", HTTP_POST, []() {
    portalServer.arg("ssid").toCharArray(config.wifiSsid, 64);
    portalServer.arg("password").toCharArray(config.wifiPassword, 64);
    portalServer.arg("playerid").toCharArray(config.playerId, 32);
    saveConfig();
    portalServer.send(200, "text/html",
      "<html><body style='background:#0a0a0f;color:#e2e8f0;font-family:system-ui;"
      "display:flex;align-items:center;justify-content:center;min-height:100vh'>"
      "<h2 style='color:#22c55e'>Kaydedildi! Yeniden basliyor...</h2></body></html>");
    delay(1500);
    ESP.restart();
  });

  portalServer.begin();
  buzzerTone(800, 100); delay(150); buzzerTone(800, 100);
}

// ── Wi-Fi ───────────────────────────────────────────────────

bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(config.wifiSsid, config.wifiPassword);
  Serial.printf("[WiFi] %s", config.wifiSsid);
  for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500); Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] OK — %s\n", WiFi.localIP().toString().c_str());
    return true;
  }
  Serial.println("[WiFi] FAIL");
  return false;
}

// ── Ateş ────────────────────────────────────────────────────

void handleFire() {
  if (!gameActive || ammo <= 0) { buzzerTone(200, 50); return; }
  if (millis() - lastFireTime < DEBOUNCE_MS) return;
  lastFireTime = millis();

  digitalWrite(PIN_LASER, HIGH);
  buzzerTone(2000, 50);
  digitalWrite(PIN_LASER, LOW);

  ammo--;
  lcdGameStatus();

  // HTTP POST fire event
  String body = "{\"playerId\":\"";
  body += config.playerId;
  body += "\",\"ammo\":";
  body += ammo;
  body += "}";
  int code = httpPOST("/api/device/fire", body);
  Serial.printf("[FIRE] ammo:%d http:%d\n", ammo, code);
}

// ── Vuruş ───────────────────────────────────────────────────

void handleLDR() {
  if (!gameActive) return;
  if (millis() - lastHitTime < HIT_COOLDOWN_MS) return;
  int val = analogRead(PIN_LDR);
  if (val >= LDR_HIT_THRESHOLD) {
    lastHitTime = millis();
    hp = max(0, hp - HIT_DAMAGE);
    buzzerTone(500, 300);
    lcdGameStatus();

    // HTTP POST hit event
    String body = "{\"playerId\":\"";
    body += config.playerId;
    body += "\",\"hp\":";
    body += hp;
    body += "}";
    int code = httpPOST("/api/device/hit", body);
    Serial.printf("[HIT] hp:%d http:%d\n", hp, code);

    if (hp <= 0) {
      gameActive = false;
      buzzerTone(150, 1000);
      lcdShow("OLDUN!", "HP: 0");
    }
  }
}

// ── Setup ───────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n\n=== AtomicTag v4 (HTTP) ===");

  pinMode(PIN_TRIGGER, INPUT_PULLUP);
  pinMode(PIN_LASER, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_LASER, LOW);

  lcd.init();
  lcd.backlight();
  lcdShow("AtomicTag v4", "Baslatiliyor...");

  loadConfig();

  if (!configValid) {
    lcdShow("KURULUM MODU", "WiFi:AtomicTag");
    startCaptivePortal();
    return;
  }

  lcdShow("WiFi baglaniyor", config.wifiSsid);
  if (!connectWiFi()) {
    lcdShow("WiFi HATA!", "WiFi:AtomicTag");
    startCaptivePortal();
    return;
  }
  lcdShow("WiFi OK!", "Sunucuya bagl...");

  // SSL sertifika doğrulamasını atla (ESP8266 için gerekli)
  secureClient.setInsecure();

  Serial.printf("[HTTP] Server: %s\n", SERVER_URL);
  Serial.printf("[HTTP] Heap: %d\n", ESP.getFreeHeap());
  Serial.println("[OK] Ready — polling mode");
}

// ── Loop ────────────────────────────────────────────────────

void loop() {
  if (apMode) {
    portalServer.handleClient();
    return;
  }

  // Tetik kontrolü
  if (digitalRead(PIN_TRIGGER) == LOW) {
    handleFire();
  }

  // LDR vuruş kontrolü
  handleLDR();

  // Server poll (her POLL_INTERVAL_MS ms)
  if (millis() - lastPollTime >= POLL_INTERVAL_MS) {
    lastPollTime = millis();
    pollServer();
  }

  // WiFi kopma kontrolü
  static unsigned long lastCheck = 0;
  static int wifiFailCount = 0;
  if (millis() - lastCheck > 30000) {
    lastCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      wifiFailCount++;
      Serial.printf("[WiFi] Not connected (attempt %d)\n", wifiFailCount);
      if (wifiFailCount >= 3) {
        Serial.println("[WiFi] Restarting...");
        ESP.restart();
      }
      WiFi.reconnect();
    } else {
      wifiFailCount = 0;
    }
  }
}
