import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so a built copy can be served from any path on any static host
// (nginx, caddy, `python -m http.server`, a subdirectory, whatever).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
