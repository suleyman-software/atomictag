"use client";

import { useState, useEffect, useCallback } from "react";

export default function Dashboard() {
  const [game, setGame] = useState(null);
  const [p1Name, setP1Name] = useState("");
  const [p2Name, setP2Name] = useState("");
  const [duration, setDuration] = useState(300);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/game/state");
      if (res.ok) setGame(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 800);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    if (game && !p1Name && !p2Name) {
      setP1Name(game.players.player1.name);
      setP2Name(game.players.player2.name);
      setDuration(game.duration);
    }
  }, [game, p1Name, p2Name]);

  async function action(endpoint) {
    await fetch(`/api/game/${endpoint}`, { method: "POST" });
    poll();
  }

  async function saveSettings() {
    await fetch("/api/game/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player1Name: p1Name, player2Name: p2Name, duration }),
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
    poll();
  }

  if (!game) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400">Yukleniyor...</p>
      </div>
    );
  }

  const remaining = game.active ? Math.max(0, game.duration - game.elapsed) : game.duration;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          AtomicTag
        </h1>
        <p className="text-gray-500 text-sm mt-1">Laser Tag Kontrol Paneli</p>
      </div>

      {/* Timer */}
      <div className="text-center mb-6">
        <div className={`text-5xl font-mono font-bold ${game.active ? "text-green-400" : "text-gray-500"}`}>
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </div>
        <div className={`mt-2 text-sm font-medium ${game.active ? "text-green-400" : "text-gray-500"}`}>
          {game.active ? "OYUN AKTIF" : "BEKLENIYOR"}
        </div>
      </div>

      {/* Players */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {["player1", "player2"].map((id) => {
          const p = game.players[id];
          const hpPct = (p.hp / 100) * 100;
          const hpColor = hpPct > 50 ? "bg-green-500" : hpPct > 20 ? "bg-yellow-500" : "bg-red-500";
          return (
            <div key={id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold">{p.name}</span>
                <span className={`w-2.5 h-2.5 rounded-full ${p.online ? "bg-green-500 shadow-[0_0_8px_#22c55e]" : "bg-gray-600"}`} />
              </div>

              {/* HP Bar */}
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>HP</span>
                  <span>{p.hp}/100</span>
                </div>
                <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full ${hpColor} rounded-full transition-all duration-300`} style={{ width: `${hpPct}%` }} />
                </div>
              </div>

              {/* Ammo */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Mermi</span>
                <span className="font-mono font-bold text-blue-400">{p.ammo}/30</span>
              </div>

              <div className="mt-2 text-xs text-gray-500">
                {p.online ? "Cihaz bagli" : "Cihaz cevrimdisi"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Game Controls */}
      <div className="flex gap-3 mb-8">
        {!game.active ? (
          <button
            onClick={() => action("start")}
            className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-500 font-semibold transition"
          >
            Oyunu Baslat
          </button>
        ) : (
          <button
            onClick={() => action("stop")}
            className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-semibold transition"
          >
            Durdur
          </button>
        )}
        <button
          onClick={() => action("reset")}
          className="px-6 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 font-semibold transition"
        >
          Sifirla
        </button>
      </div>

      {/* Settings */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="font-semibold mb-4 text-gray-300">Ayarlar</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Oyuncu 1 Adi</label>
            <input
              type="text"
              value={p1Name}
              onChange={(e) => setP1Name(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Oyuncu 2 Adi</label>
            <input
              type="text"
              value={p2Name}
              onChange={(e) => setP2Name(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Oyun Suresi (saniye)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 60)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            onClick={saveSettings}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition"
          >
            {settingsSaved ? "Kaydedildi!" : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
