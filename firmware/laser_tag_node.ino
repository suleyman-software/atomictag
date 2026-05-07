/*
 * AtomicTag — NodeMCU (ESP8266) Laser Tag Firmware v3
 *
 * Production: WSS ile Railway sunucusuna bağlanır
 * LCD: I2C 16x2 ekran desteği
 *
 * Pinler:
 *   D1 (GPIO5)  → Tetik butonu
 *   D2 (GPIO4)  → Lazer LED
 *   D5 (GPIO14) → Buzzer
 *   A0          → LDR sensör
 *   D6 (GPIO12) → EEPROM sıfırlama butonu (opsiyonel)
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <EEPROM.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define SERVER_HOST "web-production-2a0c4.up.railway.app"
#define SERVER_PORT 443

#define PIN_TRIGGER  5
#define PIN_LASER    4
#define PIN_BUZZER   14
#define PIN_LDR      A0
#define PIN_RESET_CFG 12  // D6 — açılışta basılıysa EEPROM sıfırlar

#define MAX_AMMO         30
#define MAX_HP           100
#define HIT_DAMAGE       10
#define LDR_HIT_THRESHOLD 800
#define DEBOUNCE_MS      200
#define FIRE_DURATION_MS 80
#define HIT_COOLDOWN_MS  500

#define EEPROM_SIZE 512
#define CFG_MAGIC   0x4155  // "AU" — yeni versiyon magic

struct DeviceConfig {
  uint16_t magic;
  char wifiSsid[64];
  char wifiPassword[64];
  char playerId[32];
};

DeviceConfig config;
bool configValid = false;

LiquidCrystal_I2C lcd(0x27, 16, 2);
WebSocketsClient ws;
ESP8266WebServer portalServer(80);

int  ammo       = MAX_AMMO;
int  hp         = MAX_HP;
bool gameActive = false;
bool wsConnected = false;
bool apMode      = false;
unsigned long lastFireTime = 0;
unsigned long lastHitTime  = 0;

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
    Serial.println("[CFG] No config");
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

// ── Socket.IO mesaj gönderme ────────────────────────────────

void sendEvent(const char* event, JsonDocument& payload) {
  String msg = "42[\"";
  msg += event;
  msg += "\",";
  String j;
  serializeJson(payload, j);
  msg += j;
  msg += "]";
  ws.sendTXT(msg);
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
  JsonDocument doc;
  doc["playerId"] = config.playerId;
  doc["ammo"]     = ammo;
  sendEvent("fire", doc);
  lcdGameStatus();
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
    JsonDocument doc;
    doc["playerId"] = config.playerId;
    doc["hp"]       = hp;
    sendEvent("hit", doc);
    lcdGameStatus();
    if (hp <= 0) {
      gameActive = false;
      buzzerTone(150, 1000);
      lcdShow("OLDUN!", "HP: 0");
    }
  }
}

// ── Socket.IO mesaj parse ───────────────────────────────────

void parseMessage(const char* payload) {
  if (payload[0] != '4' || payload[1] != '2') return;
  JsonDocument doc;
  if (deserializeJson(doc, payload + 2)) return;
  const char* ev = doc[0];
  if (!ev) return;

  if (strcmp(ev, "game:start") == 0) {
    gameActive = true; ammo = MAX_AMMO; hp = MAX_HP;
    buzzerTone(1500, 150);
    Serial.println("[GAME] Start");
    lcdGameStatus();
  }
  else if (strcmp(ev, "game:stop") == 0) {
    gameActive = false;
    buzzerTone(300, 500);
    Serial.println("[GAME] Stop");
    lcdShow("OYUN BITTI", "");
  }
  else if (strcmp(ev, "game:state") == 0) {
    if (doc[1].containsKey("ammo")) ammo = doc[1]["ammo"];
    if (doc[1].containsKey("hp"))   hp   = doc[1]["hp"];
  }
  else if (strcmp(ev, "config:update") == 0) {
    JsonObject cfg = doc[1];
    if (cfg.containsKey("ssid"))     strlcpy(config.wifiSsid, cfg["ssid"], 64);
    if (cfg.containsKey("password")) strlcpy(config.wifiPassword, cfg["password"], 64);
    if (cfg.containsKey("playerId")) strlcpy(config.playerId, cfg["playerId"], 32);
    saveConfig();
    lcdShow("Ayar guncellendi", "Yeniden basl...");
    delay(1000);
    ESP.restart();
  }
}

// ── WebSocket event handler ─────────────────────────────────

void wsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.printf("[WS] DISC heap:%d\n", ESP.getFreeHeap());
      lcdShow("Sunucu baglanti", "bekleniyor...");
      break;

    case WStype_CONNECTED:
      Serial.printf("[WS] TCP connected heap:%d\n", ESP.getFreeHeap());
      // Socket.IO transport açıldı, handshake bekleniyor
      break;

    case WStype_TEXT: {
      String text = String((char*)payload);
      Serial.printf("[WS] RX: %.60s\n", (char*)payload);

      // Socket.IO OPEN paketi — sunucu sid gönderir
      if (text.startsWith("0{")) {
        // Socket.IO namespace'e bağlan
        ws.sendTXT("40");
        Serial.println("[SIO] Sent CONNECT (40)");
      }
      // Socket.IO CONNECT ACK — namespace bağlantısı tamam
      else if (text.startsWith("40")) {
        wsConnected = true;
        Serial.println("[SIO] Connected to namespace!");
        // Cihazı kaydet
        JsonDocument doc;
        doc["playerId"] = config.playerId;
        doc["type"]     = "device";
        sendEvent("register", doc);
        Serial.println("[SIO] Registered as device");
        lcdGameStatus();
        buzzerTone(1500, 100);
      }
      // Socket.IO EVENT
      else if (text.startsWith("42")) {
        parseMessage((char*)payload);
      }
      // Socket.IO PING
      else if (text == "2") {
        ws.sendTXT("3");
      }
      break;
    }

    case WStype_ERROR:
      Serial.printf("[WS] ERROR heap:%d\n", ESP.getFreeHeap());
      break;

    default:
      break;
  }
}

// ── Setup ───────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n\n=== AtomicTag v3 ===");

  pinMode(PIN_TRIGGER, INPUT_PULLUP);
  pinMode(PIN_LASER, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_RESET_CFG, INPUT_PULLUP);
  digitalWrite(PIN_LASER, LOW);

  lcd.init();
  lcd.backlight();
  lcdShow("AtomicTag v3", "Baslatiliyor...");

  // D6 basılıysa EEPROM'u sıfırla
  if (digitalRead(PIN_RESET_CFG) == LOW) {
    Serial.println("[!] Reset pin LOW — clearing config");
    lcdShow("EEPROM", "SIFIRLANIYOR...");
    clearConfig();
    delay(1000);
    ESP.restart();
  }

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

  // WSS bağlantısı — Railway production
  Serial.printf("[WS] -> %s:%d (SSL)\n", SERVER_HOST, SERVER_PORT);
  Serial.printf("[WS] Heap: %d\n", ESP.getFreeHeap());
  ws.beginSSL(SERVER_HOST, SERVER_PORT, "/socket.io/?EIO=4&transport=websocket");
  ws.onEvent(wsEvent);
  ws.setReconnectInterval(5000);

  Serial.println("[OK] Ready!");
}

// ── Loop ────────────────────────────────────────────────────

void loop() {
  if (apMode) {
    portalServer.handleClient();
    return;
  }

  ws.loop();

  if (digitalRead(PIN_TRIGGER) == LOW) {
    handleFire();
  }

  handleLDR();

  // WiFi kopma kontrolü — 30 saniye aralıkla, sadece gerçekten koptuysa
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
