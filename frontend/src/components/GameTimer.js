"use client";

import { useState, useEffect } from "react";

export default function GameTimer({ gameState }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!gameState?.active || !gameState.startedAt) {
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - gameState.startedAt) / 1000);
      setElapsed(secs);
    }, 250);

    return () => clearInterval(interval);
  }, [gameState?.active, gameState?.startedAt]);

  if (!gameState?.active) return null;

  const remaining = Math.max(0, (gameState.duration || 300) - elapsed);
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  const isLow = remaining <= 30;

  return (
    <div
      className={`rounded-xl border px-6 py-3 text-center font-mono text-3xl font-bold tabular-nums ${
        isLow
          ? "animate-pulse border-red-500/50 bg-red-500/10 text-red-400"
          : "border-gray-700 bg-gray-900/80 text-white"
      }`}
    >
      {String(min).padStart(2, "0")}:{String(sec).padStart(2, "0")}
    </div>
  );
}
