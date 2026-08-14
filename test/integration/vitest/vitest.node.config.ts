import { resolve } from "node:path";
import { defineProject } from "vitest/config";

export default defineProject({
  root: resolve(import.meta.dirname, "../../.."),
  test: {
    snapshotSerializers: [
      "./test/unit/vitest/common/local-first/_uint8ArraySerializer.ts",
    ],
    exclude: ["test/integration/vitest/{Bundle,TestBundle}/*.test.ts"],
    include: ["test/integration/vitest/**/*.test.ts"],
    name: "node-integration",
    environment: "node",
    setupFiles: ["./test/unit/vitest/common/_setup.ts"],
  },
});
