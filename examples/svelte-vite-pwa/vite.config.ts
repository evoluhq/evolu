import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
  optimizeDeps: {
    // A workaround for Vite bug: https://github.com/vitejs/vite/issues/13314#issuecomment-1560745780
    exclude: ["@sqlite.org/sqlite-wasm", "kysely", "@evolu/react-web"],
  },
});
