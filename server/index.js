/**
 * AtomicTag — Socket.io Game Server
 *
 * Oyun oturumlarını yönetir, NodeMCU cihazları ile Next.js frontend
 * arasında gerçek zamanlı köprü görevi görür.
 *
 * Port: 3001
 */

import { createServer } from "http";
import { Server } from "socket.io";
import os from "os";

const PORT        = process.env.PORT        || 3001;
const FRONTEND_PORT = process.env.FRONTEND_PORT || 3000;

// Yerel IP'yi otomatik bul (Wi-Fi arayüzü)
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

const LOCAL_IP = getLocalIP();

// ESP8266 cihazlar için bekleyen komutlar (poll ile alınır)
const pendingCommands = { player1: null, player2: null };

// ESP8266 cihaz bağlantı takibi (son poll zamanı)
const deviceLastSeen = { player1: 0, player2: 0 };

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

const httpServer = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // Dashboard IP bilgisi
  if (path === "/api/info") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      serverIP: LOCAL_IP,
      socketPort: PORT,
      frontendPort: FRONTEND_PORT,
      dashboardURL: `http://${LOCAL_IP}:${FRONTEND_PORT}`,
    }));
    return;
  }

  // ── ESP8266 REST API ──────────────────────────────────────

  // Device poll — ESP8266 her 500ms bunu çağırır
  if (path === "/api/device/poll" && req.method === "GET") {
    const playerId = url.searchParams.get("playerId");
    if (!playerId || !gameState.players[playerId]) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid playerId" }));
      return;
    }

    // Cihazı "online" olarak işaretle
    deviceLastSeen[playerId] = Date.now();
    if (!gameState.players[playerId].deviceSocketId) {
      gameState.players[playerId].deviceSocketId = "http-" + playerId;
      console.log(`[HTTP] ${playerId} connected via polling`);
      broadcastState();
    }

    const cmd = pendingCommands[playerId];
    pendingCommands[playerId] = null;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      active: gameState.active,
      hp: gameState.players[playerId].hp,
      ammo: gameState.players[playerId].ammo,
      cmd: cmd,
    }));
    return;
  }

  // Device fire
  if (path === "/api/device/fire" && req.method === "POST") {
    const data = await parseBody(req);
    const { playerId, ammo } = data;
    if (!playerId || !gameState.players[playerId]) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid" }));
      return;
    }
    if (gameState.active) {
      gameState.players[playerId].ammo = ammo;
      console.log(`[HTTP Fire] ${playerId} — ammo: ${ammo}`);
      broadcastState();
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Device hit
  if (path === "/api/device/hit" && req.method === "POST") {
    const data = await parseBody(req);
    const { playerId, hp } = data;
    if (!playerId || !gameState.players[playerId]) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid" }));
      return;
    }
    if (gameState.active) {
      gameState.players[playerId].hp = hp;
      console.log(`[HTTP Hit] ${playerId} — hp: ${hp}`);
      broadcastState();
      if (hp <= 0) endGame("elimination");
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingInterval: 60000,
  pingTimeout: 30000,
});

// ── Oyun State ───────────────────────────────────────────────

const DEFAULT_HP = 100;
const DEFAULT_AMMO = 30;

/**
 * @type {{
 *   active: boolean,
 *   startedAt: number | null,
 *   duration: number,
 *   players: Record<string, { name: string, hp: number, ammo: number, deviceSocketId: string | null }>
 * }}
 */
let gameState = createFreshState();

function createFreshState() {
  return {
    active: false,
    startedAt: null,
    duration: 300, // 5 dakika varsayılan
    players: {
      player1: {
        name: "Oyuncu 1",
        hp: DEFAULT_HP,
        ammo: DEFAULT_AMMO,
        deviceSocketId: null,
      },
      player2: {
        name: "Oyuncu 2",
        hp: DEFAULT_HP,
        ammo: DEFAULT_AMMO,
        deviceSocketId: null,
      },
    },
  };
}

// Oyun süre kontrolü
let gameTimer = null;

function broadcastState() {
  // Device'lara sadece kendi state'lerini, dashboard'a tamamını gönder
  io.to("dashboard").emit("game:state", gameState);
}

function endGame(reason = "time") {
  gameState.active = false;
  if (gameTimer) {
    clearTimeout(gameTimer);
    gameTimer = null;
  }

  // Kazananı belirle
  const p1 = gameState.players.player1;
  const p2 = gameState.players.player2;
  let winner = null;
  if (p1.hp > p2.hp) winner = "player1";
  else if (p2.hp > p1.hp) winner = "player2";

  const result = {
    reason,
    winner,
    players: gameState.players,
  };

  io.emit("game:stop");
  pendingCommands.player1 = "stop";
  pendingCommands.player2 = "stop";
  broadcastState();
  io.to("dashboard").emit("game:end", result);

  console.log(`[Game] Ended — reason: ${reason}, winner: ${winner || "draw"}`);
}

// ── Socket.io Bağlantı Yönetimi ─────────────────────────────

io.on("connection", (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // ── Kayıt ──────────────────────────────────────────────────

  socket.on("register", (data) => {
    const { type, playerId } = data;

    if (type === "device" && gameState.players[playerId]) {
      // NodeMCU cihazı kayıt
      socket.join("devices");
      socket.data.type = "device";
      socket.data.playerId = playerId;
      gameState.players[playerId].deviceSocketId = socket.id;
      console.log(`[Device] ${playerId} registered (${socket.id})`);

      // Mevcut state'i gönder
      socket.emit("game:state", {
        active: gameState.active,
        hp: gameState.players[playerId].hp,
        ammo: gameState.players[playerId].ammo,
      });
    } else if (type === "dashboard") {
      // Web dashboard kayıt
      socket.join("dashboard");
      socket.data.type = "dashboard";
      console.log(`[Dashboard] Connected (${socket.id})`);
      socket.emit("game:state", gameState);
    }
  });

  // ── Cihaz Olayları ────────────────────────────────────────

  socket.on("fire", (data) => {
    const { playerId, ammo } = data;
    if (!gameState.active || !gameState.players[playerId]) return;

    gameState.players[playerId].ammo = ammo;
    console.log(`[Fire] ${playerId} — ammo: ${ammo}`);
    broadcastState();
  });

  socket.on("hit", (data) => {
    const { playerId, hp } = data;
    if (!gameState.active || !gameState.players[playerId]) return;

    gameState.players[playerId].hp = hp;
    console.log(`[Hit] ${playerId} — hp: ${hp}`);
    broadcastState();

    // Oyuncu öldü mü?
    if (hp <= 0) {
      endGame("elimination");
    }
  });

  // ── Dashboard (Admin) Komutları ───────────────────────────

  socket.on("admin:set-players", (data) => {
    const { player1Name, player2Name, duration } = data;
    gameState.players.player1.name = player1Name || "Oyuncu 1";
    gameState.players.player2.name = player2Name || "Oyuncu 2";
    if (duration) gameState.duration = duration;
    console.log(`[Admin] Players set: ${player1Name} vs ${player2Name}`);
    broadcastState();
  });

  socket.on("admin:start", () => {
    // State'i sıfırla ve oyunu başlat
    gameState.active = true;
    gameState.startedAt = Date.now();
    gameState.players.player1.hp = DEFAULT_HP;
    gameState.players.player1.ammo = DEFAULT_AMMO;
    gameState.players.player2.hp = DEFAULT_HP;
    gameState.players.player2.ammo = DEFAULT_AMMO;

    // Cihazlara başlat komutu (Socket.IO + HTTP polling)
    io.to("devices").emit("game:start");
    pendingCommands.player1 = "start";
    pendingCommands.player2 = "start";
    broadcastState();

    // Süre sayacı
    gameTimer = setTimeout(() => {
      if (gameState.active) endGame("time");
    }, gameState.duration * 1000);

    console.log(`[Game] Started — duration: ${gameState.duration}s`);
  });

  socket.on("admin:stop", () => {
    if (gameState.active) {
      endGame("admin");
    }
  });

  // ── Cihaz Ayar Güncelleme ──────────────────────────────────

  socket.on("admin:update-config", (data) => {
    const { playerId, ssid, password, host, port } = data;
    if (!gameState.players[playerId]) return;

    const deviceSocketId = gameState.players[playerId].deviceSocketId;
    if (deviceSocketId) {
      // Cihaz bağlıysa doğrudan gönder
      io.to(deviceSocketId).emit("config:update", {
        ssid,
        password,
        host,
        port,
        playerId,
      });
      console.log(`[Config] Sent config update to ${playerId}`);
    } else {
      console.log(`[Config] Device ${playerId} not connected, config not sent`);
    }

    // Dashboard'a geri bildirim
    socket.emit("config:update-result", {
      playerId,
      success: !!deviceSocketId,
      message: deviceSocketId
        ? "Ayarlar cihaza gonderildi. Cihaz yeniden baslatiliyor..."
        : "Cihaz bagli degil. Cihazi acip AP modundan ayarlari girin.",
    });
  });

  socket.on("admin:reset", () => {
    if (gameTimer) clearTimeout(gameTimer);
    gameState = createFreshState();
    io.to("devices").emit("game:stop");
    pendingCommands.player1 = "stop";
    pendingCommands.player2 = "stop";
    broadcastState();
    console.log("[Admin] Game reset");
  });

  // ── Bağlantı Kopması ─────────────────────────────────────

  socket.on("disconnect", () => {
    const { type, playerId } = socket.data;

    if (type === "device" && playerId && gameState.players[playerId]) {
      gameState.players[playerId].deviceSocketId = null;
      console.log(`[Device] ${playerId} disconnected`);
      broadcastState();
    }

    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// HTTP cihazları offline kontrolü (5 saniye poll yoksa offline)
setInterval(() => {
  const now = Date.now();
  for (const pid of ["player1", "player2"]) {
    const sid = gameState.players[pid].deviceSocketId;
    if (sid && sid.startsWith("http-") && now - deviceLastSeen[pid] > 5000) {
      gameState.players[pid].deviceSocketId = null;
      console.log(`[HTTP] ${pid} timed out`);
      broadcastState();
    }
  }
}, 3000);

// ── Sunucu Başlat ────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║         AtomicTag Sunucu             ║
╠══════════════════════════════════════╣
║  Yerel IP   : ${LOCAL_IP.padEnd(22)}║
║  Socket     : http://${LOCAL_IP}:${PORT}  ║
║  Dashboard  : http://${LOCAL_IP}:${FRONTEND_PORT}  ║
╠══════════════════════════════════════╣
║  NodeMCU Sunucu IP → ${LOCAL_IP.padEnd(16)}║
╚══════════════════════════════════════╝
`);
});
