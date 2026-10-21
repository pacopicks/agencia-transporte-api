import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    chunkSizeWarningLimit: 800, // React + Leaflet juntos pesan ~550 kB (165 kB comprimido)
  },
  server: {
    // En desarrollo (npm run dev) las peticiones a /api se mandan a FastAPI
    proxy: { "/api": "http://localhost:8000" },
  },
});
