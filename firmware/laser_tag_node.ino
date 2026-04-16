/*
 * AtomicTag — NodeMCU (ESP8266) Laser Tag Firmware
 *
 * Özellikler:
 *   - İlk açılışta Captive Portal (AP modu) ile Wi-Fi ayarları
 *   - Ayarlar EEPROM'a kaydedilir, tekrar girmeye gerek yok
 *   - Web dashboard'dan uzaktan ayar güncellemesi
 *   - Tetik, lazer, buzzer, LDR tam entegrasyon
 *
 * Pinler:
 *   - Tetik butonu  → GPIO5  (D1)
 *   - Lazer LED      → GPIO4  (D2)
 *   - Buzzer         → GPIO14 (D5)
 *   - LDR (analog)   → A0
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <EEPROM.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ── Pin Tanımları ────────────────────────────────────────────
#define PIN_TRIGGER  5   // D1
#define PIN_LASER    4   // D2
#define PIN_BUZZER   14  // D5
#define PIN_LDR      A0

// ── Oyun Sabitleri ───────────────────────────────────────────
#define MAX_AMMO         30
#define MAX_HP           100
#define HIT_DAMAGE       10
#define LDR_HIT_THRESHOLD 800
#define DEBOUNCE_MS      200
#define FIRE_DURATION_MS 80
#define HIT_COOLDOWN_MS  500

// ── EEPROM Ayar Yapısı ──────────────────────────────────────
#define EEPROM_SIZE 512
#define EEPROM_MAGIC 0xAT  // Geçerli veri kontrolü

struct DeviceConfig {
  uint16_t magic;
  char wifiSsid[64];
  char wifiPassword[64];
  char serverHost[64];
  uint16_t serverPort;
  char playerId[32];
};

DeviceConfig config;
bool configValid = false;

// ── Durum Değişkenleri ───────────────────────────────────────
WebSocketsClient ws;
ESP8266WebServer portalServer(80);

int  ammo          = MAX_AMMO;
int  hp            = MAX_HP;
bool gameActive    = false;
unsigned long lastFireTime = 0;
unsigned long lastHitTime  = 0;
bool wsConnected   = false;
bool apMode        = false;

// ── EEPROM Fonksiyonları ─────────────────────────────────────

void loadConfig() {
  EEPROM.begin(EEPROM_SIZE);
  EEPROM.get(0, config);

  if (config.magic == 0x4154) { // "AT" in hex
    configValid = true;
    Serial.println("[Config] Loaded from EEPROM");
    Serial.printf("  SSID: %s\n", config.wifiSsid);
    Serial.printf("  Server: %s:%d\n", config.serverHost, config.serverPort);
    Serial.printf("  Player: %s\n", config.playerId);
  } else {
    configValid = false;
    Serial.println("[Config] No saved config found");
  }
}

void saveConfig() {
  config.magic = 0x4154;
  EEPROM.begin(EEPROM_SIZE);
  EEPROM.put(0, config);
  EEPROM.commit();
  Serial.println("[Config] Saved to EEPROM");
}

void clearConfig() {
  config.magic = 0;
  EEPROM.begin(EEPROM_SIZE);
  EEPROM.put(0, config);
  EEPROM.commit();
  configValid = false;
  Serial.println("[Config] Cleared");
}

// ── Captive Portal (AP Modu) ─────────────────────────────────

const char PORTAL_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AtomicTag Kurulum</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#0a0a0f;color:#e2e8f0;
min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#111827;border:1px solid #1f2937;border-radius:16px;padding:32px;
width:100%;max-width:400px}
h1{font-size:24px;text-align:center;margin-bottom:4px;
background:linear-gradient(to right,#60a5fa,#a78bfa);-webkit-background-clip:text;
-webkit-text-fill-color:transparent}
.sub{text-align:center;color:#6b7280;font-size:13px;margin-bottom:24px}
label{display:block;font-size:12px;color:#9ca3af;margin-bottom:4px;margin-top:16px}
input,select{width:100%;padding:10px 12px;background:#1f2937;border:1px solid #374151;
border-radius:8px;color:#e2e8f0;font-size:14px;outline:none}
input:focus,select:focus{border-color:#3b82f6}
.btn{width:100%;margin-top:24px;padding:12px;background:#16a34a;border:none;
border-radius:8px;color:white;font-size:15px;font-weight:600;cursor:pointer}
.btn:hover{background:#15803d}
.status{text-align:center;margin-top:16px;font-size:13px;color:#6b7280}
.scan{text-align:right;margin-top:4px}
.scan a{color:#60a5fa;font-size:12px;text-decoration:none}
</style>
</head>
<body>
<div class="card">
<h1>AtomicTag</h1>
<p class="sub">Cihaz Kurulumu</p>
<form action="/save" method="POST">
<label>Wi-Fi Agi</label>
<select name="ssid" id="ssid">
<option value="">Taranıyor...</option>
</select>
<div class="scan"><a href="#" onclick="scan()">Yeniden Tara</a></div>

<label>Wi-Fi Sifresi</label>
<input type="password" name="password" placeholder="Wi-Fi sifreniz">

<label>Sunucu IP Adresi</label>
<input type="text" name="host" placeholder="192.168.1.100" required>

<label>Sunucu Portu</label>
<input type="number" name="port" value="3001" required>

<label>Oyuncu ID</label>
<select name="playerid" required>
<option value="player1">Oyuncu 1 (player1)</option>
<option value="player2">Oyuncu 2 (player2)</option>
</select>

<button type="submit" class="btn">Kaydet ve Baslat</button>
</form>
<p class="status" id="st"></p>
</div>
<script>
function scan(){
document.getElementById('st').textContent='Taranıyor...';
fetch('/scan').then(r=>r.json()).then(list=>{
const sel=document.getElementById('ssid');
sel.innerHTML='';
list.forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;sel.appendChild(o)});
document.getElementById('st').textContent=list.length+' ag bulundu';
});
}
scan();
</script>
</body>
</html>
)rawliteral";

void startCaptivePortal() {
  apMode = true;
  WiFi.mode(WIFI_AP);
  WiFi.softAP("AtomicTag-Setup", "atomictag");
  Serial.printf("[AP] Portal started — IP: %s\n", WiFi.softAPIP().toString().c_str());

  // Ana sayfa
  portalServer.on("/", HTTP_GET, []() {
    portalServer.send_P(200, "text/html", PORTAL_HTML);
  });

  // Wi-Fi tarama
  portalServer.on("/scan", HTTP_GET, []() {
    int n = WiFi.scanNetworks();
    JsonDocument doc;
    JsonArray arr = doc.to<JsonArray>();
    for (int i = 0; i < n; i++) {
      arr.add(WiFi.SSID(i));
    }
    String json;
    serializeJson(doc, json);
    portalServer.send(200, "application/json", json);
  });

  // Kaydet
  portalServer.on("/save", HTTP_POST, []() {
    String ssid = portalServer.arg("ssid");
    String pass = portalServer.arg("password");
    String host = portalServer.arg("host");
    String port = portalServer.arg("port");
    String pid  = portalServer.arg("playerid");

    ssid.toCharArray(config.wifiSsid, 64);
    pass.toCharArray(config.wifiPassword, 64);
    host.toCharArray(config.serverHost, 64);
    config.serverPort = port.toInt();
    pid.toCharArray(config.playerId, 32);

    saveConfig();
    configValid = true;

    portalServer.send(200, "text/html",
      "<html><body style='background:#0a0a0f;color:#e2e8f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh'>"
      "<div style='text-align:center'><h2 style='color:#22c55e'>Kaydedildi!</h2>"
      "<p>Cihaz yeniden baslatiliyor...</p></div></body></html>");

    delay(1500);
    ESP.restart();
  });

  // Mevcut ayarları döndür (dashboard'dan okumak için)
  portalServer.on("/config", HTTP_GET, []() {
    JsonDocument doc;
    doc["ssid"]     = config.wifiSsid;
    doc["host"]     = config.serverHost;
    doc["port"]     = config.serverPort;
    doc["playerId"] = config.playerId;
    String json;
    serializeJson(doc, json);
    portalServer.send(200, "application/json", json);
  });

  portalServer.begin();

  // Portal açık olduğunu buzzer ile bildir
  buzzerTone(800, 100);
  delay(150);
  buzzerTone(800, 100);
}

// ── Wi-Fi Bağlantısı ────────────────────────────────────────

bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(config.wifiSsid, config.wifiPassword);
  Serial.printf("[WiFi] Connecting to %s", config.wifiSsid);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected — IP: %s\n", WiFi.localIP().toString().c_str());
    return true;
  }

  Serial.println("\n[WiFi] Connection failed!");
  return false;
}

// ── Yardımcı Fonksiyonlar ────────────────────────────────────

void buzzerTone(int freq, int dur) {
  tone(PIN_BUZZER, freq, dur);
}

void sendEvent(const char* event, JsonDocument& payload) {
  String msg = "42[\"";
  msg += event;
  msg += "\",";
  String jsonStr;
  serializeJson(payload, jsonStr);
  msg += jsonStr;
  msg += "]";
  ws.sendTXT(msg);
}

// ── Tetik Ateşleme ──────────────────────────────────────────

void handleFire() {
  if (!gameActive || ammo <= 0) {
    buzzerTone(200, 50);
    return;
  }

  unsigned long now = millis();
  if (now - lastFireTime < DEBOUNCE_MS) return;
  lastFireTime = now;

  digitalWrite(PIN_LASER, HIGH);
  buzzerTone(2000, FIRE_DURATION_MS);
  delay(FIRE_DURATION_MS);
  digitalWrite(PIN_LASER, LOW);

  ammo--;

  JsonDocument doc;
  doc["playerId"] = config.playerId;
  doc["ammo"]     = ammo;
  sendEvent("fire", doc);
}

// ── LDR Vuruş Algılama ──────────────────────────────────────

void handleLDR() {
  if (!gameActive) return;

  unsigned long now = millis();
  if (now - lastHitTime < HIT_COOLDOWN_MS) return;

  int ldrValue = analogRead(PIN_LDR);

  if (ldrValue >= LDR_HIT_THRESHOLD) {
    lastHitTime = now;
    hp = max(0, hp - HIT_DAMAGE);

    buzzerTone(500, 300);

    JsonDocument doc;
    doc["playerId"] = config.playerId;
    doc["hp"]       = hp;
    sendEvent("hit", doc);

    if (hp <= 0) {
      gameActive = false;
      buzzerTone(150, 1000);
    }
  }
}

// ── WebSocket Olayları ───────────────────────────────────────

void parseSocketIOMessage(const char* payload) {
  if (payload[0] != '4' || payload[1] != '2') return;

  const char* json = payload + 2;
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, json);
  if (err) return;

  const char* event = doc[0];
  if (!event) return;

  if (strcmp(event, "game:start") == 0) {
    gameActive = true;
    ammo = MAX_AMMO;
    hp   = MAX_HP;
    buzzerTone(1000, 200);
    delay(250);
    buzzerTone(1500, 200);
    Serial.println("[GAME] Started!");
  }
  else if (strcmp(event, "game:stop") == 0) {
    gameActive = false;
    buzzerTone(300, 500);
    Serial.println("[GAME] Stopped!");
  }
  else if (strcmp(event, "game:state") == 0) {
    if (doc[1].containsKey("ammo")) ammo = doc[1]["ammo"];
    if (doc[1].containsKey("hp"))   hp   = doc[1]["hp"];
  }
  else if (strcmp(event, "config:update") == 0) {
    // Dashboard'dan uzaktan ayar güncellemesi
    JsonObject cfg = doc[1];
    if (cfg.containsKey("ssid"))     strlcpy(config.wifiSsid, cfg["ssid"], 64);
    if (cfg.containsKey("password")) strlcpy(config.wifiPassword, cfg["password"], 64);
    if (cfg.containsKey("host"))     strlcpy(config.serverHost, cfg["host"], 64);
    if (cfg.containsKey("port"))     config.serverPort = cfg["port"];
    if (cfg.containsKey("playerId")) strlcpy(config.playerId, cfg["playerId"], 32);

    saveConfig();
    Serial.println("[Config] Updated remotely, restarting...");
    buzzerTone(1200, 100);
    delay(200);
    buzzerTone(1500, 100);
    delay(500);
    ESP.restart();
  }
}

void wsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.println("[WS] Disconnected");
      break;

    case WStype_CONNECTED:
      Serial.println("[WS] Connected to server");
      break;

    case WStype_TEXT: {
      String text = (char*)payload;

      if (text.startsWith("0{")) {
        wsConnected = true;
        JsonDocument doc;
        doc["playerId"] = config.playerId;
        doc["type"]     = "device";
        sendEvent("register", doc);
        Serial.println("[WS] Registered as device");
      }
      else if (text.startsWith("42")) {
        parseSocketIOMessage((char*)payload);
      }
      else if (text == "2") {
        ws.sendTXT("3");
      }
      break;
    }

    default:
      break;
  }
}

// ── Setup & Loop ─────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Serial.println("\n[AtomicTag] Booting...");

  pinMode(PIN_TRIGGER, INPUT_PULLUP);
  pinMode(PIN_LASER, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_LASER, LOW);

  loadConfig();

  if (!configValid) {
    // İlk kurulum — Captive Portal aç
    Serial.println("[Mode] No config — starting setup portal");
    startCaptivePortal();
    return;
  }

  // Kayıtlı config var, Wi-Fi'ye bağlan
  if (!connectWiFi()) {
    // Bağlanamadı — Portal'a düş
    Serial.println("[Mode] WiFi failed — starting setup portal");
    startCaptivePortal();
    return;
  }

  // WebSocket bağlantısı
  ws.begin(config.serverHost, config.serverPort, "/socket.io/?EIO=4&transport=websocket");
  ws.onEvent(wsEvent);
  ws.setReconnectInterval(3000);

  buzzerTone(1000, 100);
  delay(150);
  buzzerTone(1500, 100);
  Serial.println("[AtomicTag] Ready!");
}

void loop() {
  if (apMode) {
    // Captive Portal modunda
    portalServer.handleClient();
    return;
  }

  ws.loop();

  if (digitalRead(PIN_TRIGGER) == LOW) {
    handleFire();
  }

  handleLDR();

  // Uzun süreli Wi-Fi kopması durumunda yeniden bağlan
  static unsigned long lastWifiCheck = 0;
  if (millis() - lastWifiCheck > 10000) {
    lastWifiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WiFi] Lost connection, reconnecting...");
      WiFi.reconnect();
    }
  }
}
