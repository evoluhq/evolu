import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  optimizeDeps: {
    exclude: [
      // Do not pre-bundle `@evolu/common-web`. Why? Worker relative import path resolution fails on registration because `@evolu/common-web/dist/*.worker.js`
      // is not present in Vite's pre-bundled dependencies cache (typically `node_modules/.vite/deps`).
      // @see https://github.com/vitejs/vite/issues/13314#issuecomment-1560745780
      "@evolu/common-web",
    ],
    // Another workaround for Vite bug: https://github.com/radix-ui/primitives/discussions/1915#discussioncomment-5733178
    include: ["react-dom"],
  },
  worker: {
    format: "es",
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,

      pwaAssets: {
        disabled: false,
        config: true,
      },

      manifest: {
        name: "vite-react-pwa",
        short_name: "vite-react-pwa",
        description: "vite-react-pwa",
        theme_color: "#ffffff",
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },

      devOptions: {
        enabled: true,
        navigateFallback: "index.html",
        suppressWarnings: true,
        type: "module",
      },
    }),
  ],
});
