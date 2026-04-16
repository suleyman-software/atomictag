"use client";

import dynamic from "next/dynamic";
import { Canvas3DErrorBoundary } from "./Canvas3DWrapper";

// Three.js SSR ile uyumsuz, client-only olarak yükle
const PlayerModel = dynamic(() => import("./PlayerModel"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] items-center justify-center text-gray-500 text-sm">
      3D model yukleniyor...
    </div>
  ),
});

export default function PlayerCard({ player, color, label }) {
  if (!player) return null;

  const hpPercent = (player.hp / 100) * 100;
  const ammoPercent = (player.ammo / 30) * 100;

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/80 backdrop-blur">
      {/* Oyuncu adı */}
      <div className="border-b border-gray-800 px-5 py-3">
        <h3 className="text-base font-semibold">
          <span
            className="mr-2 inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          {player.name}
        </h3>
        <span className="text-xs text-gray-500">{label}</span>
      </div>

      {/* 3D Model */}
      <Canvas3DErrorBoundary>
        <PlayerModel player={player} color={color} />
      </Canvas3DErrorBoundary>

      {/* Stat barları */}
      <div className="space-y-3 px-5 pb-5 pt-2">
        {/* HP */}
        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-gray-400">Can</span>
            <span
              className={`font-mono font-bold ${
                player.hp > 50
                  ? "text-green-400"
                  : player.hp > 25
                    ? "text-yellow-400"
                    : "text-red-400"
              }`}
            >
              {player.hp}/100
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${hpPercent}%`,
                backgroundColor:
                  player.hp > 50
                    ? "#22c55e"
                    : player.hp > 25
                      ? "#eab308"
                      : "#ef4444",
              }}
            />
          </div>
        </div>

        {/* Ammo */}
        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-gray-400">Mermi</span>
            <span className="font-mono font-bold text-blue-400">
              {player.ammo}/30
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${ammoPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
