import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxies API/socket traffic to the signaling server so only ONE public tunnel
// (this dev server's port) needs to be exposed — handy for ngrok's free tier,
// which only allows one endpoint online at a time.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves this repo at /<repo-name>/, not the domain root, so every built
  // asset URL needs that prefix — but the dev server itself is still served from /, so this
  // only applies to `vite build`, never `vite dev`.
  base: command === "build" ? "/sociocam/" : "/",
  server: {
    host: true,
    port: 5173,
    // Vite blocks requests carrying an unrecognized Host header by default (DNS-rebinding
    // protection) — ngrok's free tier assigns a fresh random subdomain on every restart, so a
    // suffix match here survives that instead of needing a config edit each time the tunnel restarts.
    allowedHosts: [".ngrok-free.dev", ".ngrok-free.app", ".ngrok.io"],
    proxy: {
      "/socket.io": {
        target: "http://localhost:4000",
        ws: true,
        changeOrigin: true,
      },
      "/auth": "http://localhost:4000",
      "/api": "http://localhost:4000",
      "/avatars": "http://localhost:4000",
    },
  },
}));
