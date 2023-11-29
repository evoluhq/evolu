import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The build is not working, and the error isn't helpful:
// [vite:build-import-analysis] Cannot read properties of undefined (reading 'forEach')
// Do we need that?
// assetsInclude: [`**/*.wasm`],

// https://vitejs.dev/config/
export default defineConfig({
  optimizeDeps: {
    // A workaround for Vite bug: https://github.com/vitejs/vite/issues/13314#issuecomment-1560745780
    exclude: ["@evolu/react"],
    // Another workaround for Vite bug: https://github.com/radix-ui/primitives/discussions/1915#discussioncomment-5733178
    include: ["react-dom"],
  },
  worker: {
    format: "es",
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
