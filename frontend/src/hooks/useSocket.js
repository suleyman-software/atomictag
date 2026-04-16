"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

// Tarayıcıdaki hostname'i kullan — böylece telefon da doğru IP'ye bağlanır
const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : "http://localhost:3001");

/**
 * Socket.io bağlantısını yöneten merkezi hook.
 * Tüm oyun state'ini tutar ve admin komutlarını expose eder.
 */
export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [configResult, setConfigResult] = useState(null);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // Dashboard olarak kayıt ol
      socket.emit("register", { type: "dashboard" });
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("game:state", (state) => {
      setGameState(state);
    });

    socket.on("game:end", (result) => {
      setGameResult(result);
    });

    socket.on("config:update-result", (result) => {
      setConfigResult(result);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const setPlayers = useCallback((player1Name, player2Name, duration) => {
    socketRef.current?.emit("admin:set-players", {
      player1Name,
      player2Name,
      duration,
    });
  }, []);

  const startGame = useCallback(() => {
    setGameResult(null);
    socketRef.current?.emit("admin:start");
  }, []);

  const stopGame = useCallback(() => {
    socketRef.current?.emit("admin:stop");
  }, []);

  const resetGame = useCallback(() => {
    setGameResult(null);
    socketRef.current?.emit("admin:reset");
  }, []);

  const updateDeviceConfig = useCallback((playerId, configData) => {
    setConfigResult(null);
    socketRef.current?.emit("admin:update-config", {
      playerId,
      ...configData,
    });
  }, []);

  return {
    connected,
    gameState,
    gameResult,
    configResult,
    setPlayers,
    startGame,
    stopGame,
    resetGame,
    updateDeviceConfig,
  };
}
