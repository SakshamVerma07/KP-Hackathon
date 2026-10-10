import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.BACKEND_URL || "http://127.0.0.1:5000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": backend,
      "/socket.io": {
        target: backend,
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    globals: true,
    css: false,
  },
});
