import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@evolu/react", "@sqlite.org/sqlite-wasm"],
    include: ["react-dom"],
  },
  worker: { format: "es" },
});
