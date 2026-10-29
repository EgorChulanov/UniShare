import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = process.env.UNISHARE_API ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@unishare/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)) },
  },
  server: {
    port: 5173,
    host: true,
    // Lets tunnels (cloudflared, ngrok, tuna) reach the dev server for Telegram/VK testing.
    allowedHosts: true,
    proxy: {
      "/api": { target: api, changeOrigin: true, ws: true },
      "/media": { target: api, changeOrigin: true },
    },
  },
  build: {
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          motion: ["framer-motion"],
        },
      },
    },
  },
});
