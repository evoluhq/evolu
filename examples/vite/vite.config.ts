import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  optimizeDeps: {
    // A workaround for Vite bug: https://github.com/vitejs/vite/issues/13314#issuecomment-1560745780
    exclude: ["@evolu/react"],
    // Another workaround for Vite bug: https://github.com/radix-ui/primitives/discussions/1915#discussioncomment-5733178
    include: ["react-dom"],
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `[name][hash].js`,
        chunkFileNames: `[name][hash].js`,
        assetFileNames: `[name][hash].[ext]`,
      },
    },
  },
  worker: {
    format: "es",
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [
    react(),
    {
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          // https://sqlite.org/wasm/doc/trunk/persistence.md#coop-coep
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          next();
        });
      },
      name: "configure-server",
    },
  ],
});
