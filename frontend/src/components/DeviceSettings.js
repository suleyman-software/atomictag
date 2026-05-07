"use client";

import { useState } from "react";

export default function DeviceSettings({
  gameState,
  configResult,
  onUpdateConfig,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState("player1");

  const [p1Config, setP1Config] = useState({
    ssid: "",
    password: "",
    host: "web-production-2a0c4.up.railway.app",
    port: "443",
    ssl: true,
  });

  const [p2Config, setP2Config] = useState({
    ssid: "",
    password: "",
    host: "web-production-2a0c4.up.railway.app",
    port: "443",
    ssl: true,
  });

  const configs = { player1: p1Config, player2: p2Config };
  const setConfigs = { player1: setP1Config, player2: setP2Config };
  const currentConfig = configs[activeTab];
  const setCurrentConfig = setConfigs[activeTab];

  const player = gameState?.players?.[activeTab];
  const isOnline = !!player?.deviceSocketId;

  function handleSubmit(e) {
    e.preventDefault();
    onUpdateConfig(activeTab, {
      ssid: currentConfig.ssid,
      password: currentConfig.password,
      host: currentConfig.host,
      port: parseInt(currentConfig.port, 10),
      ssl: currentConfig.ssl,
    });
  }

  function updateField(field, value) {
    setCurrentConfig((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-lg font-semibold">Cihaz Ayarlari</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-800 hover:text-white"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-800">
          {["player1", "player2"].map((id) => {
            const p = gameState?.players?.[id];
            const online = !!p?.deviceSocketId;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition ${
                  activeTab === id
                    ? "border-b-2 border-blue-500 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    online ? "bg-green-500 shadow-[0_0_6px_#22c55e]" : "bg-gray-600"
                  }`}
                />
                {p?.name || id}
              </button>
            );
          })}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {/* Durum bildirimi */}
          <div
            className={`rounded-lg px-4 py-2.5 text-sm ${
              isOnline
                ? "border border-green-500/20 bg-green-500/10 text-green-400"
                : "border border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
            }`}
          >
            {isOnline ? (
              <>
                <span className="font-medium">Cihaz bagli.</span> Ayarlari
                buradan guncelleyebilirsiniz. Kaydedince cihaz otomatik
                yeniden baslar.
              </>
            ) : (
              <>
                <span className="font-medium">Cihaz bagli degil.</span>{" "}
                Ilk kurulum icin: Cihazi acin → telefonunuzdan{" "}
                <span className="font-mono text-yellow-300">AtomicTag-Setup</span>{" "}
                Wi-Fi agina baglanin → ayarlari girin.
              </>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              Wi-Fi Agi (SSID)
            </label>
            <input
              type="text"
              value={currentConfig.ssid}
              onChange={(e) => updateField("ssid", e.target.value)}
              placeholder="Ornek: Ev_WiFi"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm
                         placeholder:text-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              Wi-Fi Sifresi
            </label>
            <input
              type="password"
              value={currentConfig.password}
              onChange={(e) => updateField("password", e.target.value)}
              placeholder="Wi-Fi sifreniz"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm
                         placeholder:text-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">
                Sunucu Adresi
              </label>
              <input
                type="text"
                value={currentConfig.host}
                onChange={(e) => updateField("host", e.target.value)}
                placeholder="web-production-2a0c4.up.railway.app"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm
                           placeholder:text-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">
                Port
              </label>
              <input
                type="number"
                value={currentConfig.port}
                onChange={(e) => updateField("port", e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm
                           focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={currentConfig.ssl}
              onChange={(e) => updateField("ssl", e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 accent-blue-500"
            />
            SSL/WSS Kullan (production icin acik birakin)
          </label>

          {/* Config result feedback */}
          {configResult && configResult.playerId === activeTab && (
            <div
              className={`rounded-lg px-4 py-2.5 text-sm ${
                configResult.success
                  ? "border border-green-500/20 bg-green-500/10 text-green-400"
                  : "border border-red-500/20 bg-red-500/10 text-red-400"
              }`}
            >
              {configResult.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={!currentConfig.ssid || !currentConfig.host}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium
                         transition hover:bg-blue-500 disabled:opacity-40"
            >
              {isOnline ? "Cihaza Gonder" : "Kaydet"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-medium
                         transition hover:bg-gray-600"
            >
              Kapat
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
