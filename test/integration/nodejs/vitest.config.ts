import { resolve } from "node:path";
import { defineProject } from "vitest/config";

export default defineProject({
  root: resolve(import.meta.dirname, "../../.."),
  test: {
    include: ["test/integration/shared/**/*.test.ts"],
    name: "node-integration",
    environment: "node",
    setupFiles: ["./test/integration/shared/_setup.ts"],
  },
});
