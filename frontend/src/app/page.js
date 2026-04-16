"use client";

import { useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import AdminPanel from "@/components/AdminPanel";
import PlayerCard from "@/components/PlayerCard";
import GameTimer from "@/components/GameTimer";
import DeviceSettings from "@/components/DeviceSettings";

export default function Dashboard() {
  const {
    connected,
    gameState,
    gameResult,
    configResult,
    setPlayers,
    startGame,
    stopGame,
    resetGame,
    updateDeviceConfig,
  } = useSocket();

  const [showSettings, setShowSettings] = useState(false);

  const p1 = gameState?.players?.player1;
  const p2 = gameState?.players?.player2;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
              AtomicTag
            </span>
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Laser Tag Kontrol Paneli
          </p>

          {/* Cihaz bağlantı durumu + ayarlar butonu */}
          <div className="mt-3 flex items-center justify-center gap-4">
            {gameState?.players && (
              <div className="flex gap-4 text-xs">
                {Object.entries(gameState.players).map(([id, p]) => (
                  <div key={id} className="flex items-center gap-1.5 text-gray-400">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        p.deviceSocketId ? "bg-green-500 shadow-[0_0_6px_#22c55e]" : "bg-gray-600"
                      }`}
                    />
                    {p.name}
                    <span className={p.deviceSocketId ? "text-green-400" : "text-gray-600"}>
                      {p.deviceSocketId ? "online" : "offline"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowSettings(true)}
              className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-xs
                         text-gray-400 transition hover:border-gray-600 hover:bg-gray-800 hover:text-white"
            >
              <span className="mr-1.5">&#9881;</span>
              Cihaz Ayarlari
            </button>
          </div>
        </div>

        {/* Timer */}
        <div className="mb-6 flex justify-center">
          <GameTimer gameState={gameState} />
        </div>

        {/* Ana Grid: Oyuncu 1 | Admin | Oyuncu 2 */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px_1fr]">
          <PlayerCard player={p1} color="#3b82f6" label="Player 1" />

          <AdminPanel
            connected={connected}
            gameState={gameState}
            gameResult={gameResult}
            onSetPlayers={setPlayers}
            onStart={startGame}
            onStop={stopGame}
            onReset={resetGame}
          />

          <PlayerCard player={p2} color="#a855f7" label="Player 2" />
        </div>
      </div>

      {/* Cihaz Ayarları Modal */}
      {showSettings && (
        <DeviceSettings
          gameState={gameState}
          configResult={configResult}
          onUpdateConfig={updateDeviceConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </main>
  );
}
