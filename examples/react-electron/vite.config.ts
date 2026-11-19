import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
      },
      renderer: process.env.NODE_ENV === "test" ? undefined : {},
    }),
  ],
  optimizeDeps: {
    exclude: ["@evolu/sqlite-wasm", "kysely", "@evolu/react-web"],
  },
  assetsInclude: ["**/*.wasm"],
});
