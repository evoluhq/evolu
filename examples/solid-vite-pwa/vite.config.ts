import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import solid from "vite-plugin-solid";

// https://vitejs.dev/config/
export default defineConfig({
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm", "kysely"],
  },
  plugins: [
    solid(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,

      manifest: {
        name: "solid-vite-pwa",
        short_name: "solid-vite-pwa",
        description: "Evolu+Solid+Vite",
        theme_color: "#ffffff",

        icons: [
          {
            src: "pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },

      devOptions: {
        enabled: false,
        navigateFallback: "index.html",
        suppressWarnings: true,
        type: "module",
      },
    }),
  ],
});
