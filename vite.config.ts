import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = process.env.API_PORT;

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 3000,
    host: "0.0.0.0",
    hmr: process.env.DISABLE_HMR !== "true",
    ...(apiPort
      ? {
          proxy: {
            "/api": {
              target: `http://127.0.0.1:${apiPort}`,
              changeOrigin: true,
            },
          },
        }
      : {}),
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
  },
});
