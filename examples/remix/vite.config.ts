import { unstable_vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

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

  plugins: [remix(), tsconfigPaths()],
});
