"use client";

import { useState } from "react";

export default function AdminPanel({
  connected,
  gameState,
  gameResult,
  onSetPlayers,
  onStart,
  onStop,
  onReset,
}) {
  const [p1Name, setP1Name] = useState("Oyuncu 1");
  const [p2Name, setP2Name] = useState("Oyuncu 2");
  const [duration, setDuration] = useState(300);

  const isActive = gameState?.active;

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-6 backdrop-blur">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">
        Kontrol Paneli
      </h2>

      {/* Bağlantı durumu */}
      <div className="mb-4 flex items-center gap-2 text-sm">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            connected ? "bg-green-500" : "bg-red-500"
          }`}
        />
        {connected ? "Sunucuya bağlı" : "Bağlantı kesildi"}
      </div>

      {/* Oyuncu isimleri */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-gray-400">Oyuncu 1</label>
          <input
            type="text"
            value={p1Name}
            onChange={(e) => setP1Name(e.target.value)}
            disabled={isActive}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm
                       focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">Oyuncu 2</label>
          <input
            type="text"
            value={p2Name}
            onChange={(e) => setP2Name(e.target.value)}
            disabled={isActive}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm
                       focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
        </div>
      </div>

      {/* Süre */}
      <div className="mb-5">
        <label className="mb-1 block text-xs text-gray-400">
          Oyun Suresi: {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, "0")}
        </label>
        <input
          type="range"
          min={60}
          max={600}
          step={30}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          disabled={isActive}
          className="w-full accent-blue-500"
        />
      </div>

      {/* Butonlar */}
      <div className="flex gap-2">
        {!isActive ? (
          <>
            <button
              onClick={() => {
                onSetPlayers(p1Name, p2Name, duration);
                setTimeout(onStart, 100);
              }}
              disabled={!connected}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium
                         transition hover:bg-green-500 disabled:opacity-40"
            >
              Oyunu Baslat
            </button>
            <button
              onClick={onReset}
              disabled={!connected}
              className="rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-medium
                         transition hover:bg-gray-600 disabled:opacity-40"
            >
              Sifirla
            </button>
          </>
        ) : (
          <button
            onClick={onStop}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium
                       transition hover:bg-red-500"
          >
            Oyunu Durdur
          </button>
        )}
      </div>

      {/* Oyun sonucu */}
      {gameResult && (
        <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-center text-sm">
          <div className="font-semibold text-yellow-400">Oyun Bitti!</div>
          <div className="mt-1 text-gray-300">
            {gameResult.winner
              ? `Kazanan: ${gameResult.players[gameResult.winner].name}`
              : "Berabere!"}
            {" — "}
            {gameResult.reason === "time"
              ? "Sure doldu"
              : gameResult.reason === "elimination"
                ? "Eleme"
                : "Admin durdurdu"}
          </div>
        </div>
      )}
    </div>
  );
}
