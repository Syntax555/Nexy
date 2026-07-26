import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

const base = process.env.VITE_BASE_PATH || "/Nexy/";

export default defineConfig({
  base,
  plugins: [preact()],
  build: {
    target: "es2023",
    assetsInlineLimit: 4096,
    cssCodeSplit: true,
    sourcemap: false
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true
  }
});
