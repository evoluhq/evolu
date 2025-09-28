import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// import { nodePolyfills } from "vite-plugin-node-polyfills";
// https://vitejs.dev/config
export default defineConfig({
  optimizeDeps: {
    exclude: [
      "@sqlite.org/sqlite-wasm",
      "kysely",
      "@evolu/common",
      "@evolu/react",
      "@evolu/react-web",
    ],
  },
  plugins: [react()],
});
