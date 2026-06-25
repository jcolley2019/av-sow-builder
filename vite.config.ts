import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 8080,
    // host: true exposes the dev server on the LAN so it can be opened
    // from a phone, e.g. http://192.168.4.27:8080
    host: true,
    proxy: {
      // Forward API calls to the Express sidecar on 8787.
      "/api": "http://localhost:8787",
    },
  },
});
