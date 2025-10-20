import { defineConfig } from "vite";
import path from "node:path";
import electron from "vite-plugin-electron/simple";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
      },
      preload: {
        input: path.join(__dirname, "electron/preload.ts"),
      },
      renderer: process.env.NODE_ENV === "test" ? undefined : {},
    }),
  ],
  server: {
    fs: {
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, "../../packages/web/dist"),
        path.resolve(
          __dirname,
          "../../node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm",
        ),
      ],
    },
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm", "kysely", "@evolu/react-web"],
  },
  assetsInclude: ["**/*.wasm"],
});
