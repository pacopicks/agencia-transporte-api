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
    // Dos páginas con el mismo código: el panel web (/) y la app móvil (/movil/)
    rolldownOptions: {
      input: {
        panel: fileURLToPath(new URL("./index.html", import.meta.url)),
        movil: fileURLToPath(new URL("./movil/index.html", import.meta.url)),
      },
    },
  },
  server: {
    // En desarrollo (npm run dev) las peticiones a /api se mandan a FastAPI
    proxy: { "/api": "http://localhost:8000" },
  },
});
