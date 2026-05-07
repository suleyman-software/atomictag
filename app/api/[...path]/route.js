import { NextResponse } from "next/server";

const DEFAULT_HP = 100;
const DEFAULT_AMMO = 30;

function getStore() {
  if (!globalThis.__atomicGame) {
    globalThis.__atomicGame = {
      active: false,
      startedAt: null,
      duration: 300,
      players: {
        player1: { name: "Oyuncu 1", hp: DEFAULT_HP, ammo: DEFAULT_AMMO, lastSeen: 0 },
        player2: { name: "Oyuncu 2", hp: DEFAULT_HP, ammo: DEFAULT_AMMO, lastSeen: 0 },
      },
      pendingCommands: { player1: null, player2: null },
    };
  }
  return globalThis.__atomicGame;
}

function checkGameTime(game) {
  if (game.active && game.startedAt) {
    const elapsed = (Date.now() - game.startedAt) / 1000;
    if (elapsed >= game.duration) {
      game.active = false;
      game.pendingCommands.player1 = "stop";
      game.pendingCommands.player2 = "stop";
    }
  }
}

function isOnline(player) {
  return player.lastSeen > 0 && Date.now() - player.lastSeen < 5000;
}

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const game = getStore();
  checkGameTime(game);

  // GET /api/game/state
  if (path === "/api/game/state") {
    const elapsed = game.active && game.startedAt
      ? Math.floor((Date.now() - game.startedAt) / 1000)
      : 0;
    return json({
      active: game.active,
      duration: game.duration,
      elapsed,
      players: {
        player1: { ...game.players.player1, online: isOnline(game.players.player1) },
        player2: { ...game.players.player2, online: isOnline(game.players.player2) },
      },
    });
  }

  // GET /api/device/poll?playerId=player1
  if (path === "/api/device/poll") {
    const playerId = url.searchParams.get("playerId");
    if (!playerId || !game.players[playerId]) {
      return json({ error: "invalid playerId" }, 400);
    }
    game.players[playerId].lastSeen = Date.now();
    const cmd = game.pendingCommands[playerId];
    game.pendingCommands[playerId] = null;
    return json({
      active: game.active,
      hp: game.players[playerId].hp,
      ammo: game.players[playerId].ammo,
      cmd,
    });
  }

  return json({ error: "not found" }, 404);
}

export async function POST(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const game = getStore();
  checkGameTime(game);

  let body = {};
  try { body = await request.json(); } catch {}

  // POST /api/game/start
  if (path === "/api/game/start") {
    game.active = true;
    game.startedAt = Date.now();
    game.players.player1.hp = DEFAULT_HP;
    game.players.player1.ammo = DEFAULT_AMMO;
    game.players.player2.hp = DEFAULT_HP;
    game.players.player2.ammo = DEFAULT_AMMO;
    game.pendingCommands.player1 = "start";
    game.pendingCommands.player2 = "start";
    return json({ ok: true });
  }

  // POST /api/game/stop
  if (path === "/api/game/stop") {
    game.active = false;
    game.pendingCommands.player1 = "stop";
    game.pendingCommands.player2 = "stop";
    return json({ ok: true });
  }

  // POST /api/game/reset
  if (path === "/api/game/reset") {
    game.active = false;
    game.startedAt = null;
    game.players.player1.hp = DEFAULT_HP;
    game.players.player1.ammo = DEFAULT_AMMO;
    game.players.player2.hp = DEFAULT_HP;
    game.players.player2.ammo = DEFAULT_AMMO;
    game.pendingCommands.player1 = "stop";
    game.pendingCommands.player2 = "stop";
    return json({ ok: true });
  }

  // POST /api/game/settings
  if (path === "/api/game/settings") {
    const { player1Name, player2Name, duration } = body;
    if (player1Name) game.players.player1.name = player1Name;
    if (player2Name) game.players.player2.name = player2Name;
    if (duration && duration > 0) game.duration = duration;
    return json({ ok: true });
  }

  // POST /api/device/fire
  if (path === "/api/device/fire") {
    const { playerId, ammo } = body;
    if (!playerId || !game.players[playerId]) return json({ error: "invalid" }, 400);
    if (game.active) game.players[playerId].ammo = ammo;
    return json({ ok: true });
  }

  // POST /api/device/hit
  if (path === "/api/device/hit") {
    const { playerId, hp } = body;
    if (!playerId || !game.players[playerId]) return json({ error: "invalid" }, 400);
    if (game.active) {
      game.players[playerId].hp = hp;
      if (hp <= 0) {
        game.active = false;
        game.pendingCommands.player1 = "stop";
        game.pendingCommands.player2 = "stop";
      }
    }
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
}
