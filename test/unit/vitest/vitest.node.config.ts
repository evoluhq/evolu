import { resolve } from "node:path";
import { defineProject } from "vitest/config";

export default defineProject({
  root: resolve(import.meta.dirname, "../../.."),
  test: {
    snapshotSerializers: [
      "./test/unit/vitest/common/local-first/_uint8ArraySerializer.ts",
    ],
    include: ["test/unit/vitest/**/*.test.ts"],
    name: "unit (nodejs)",
    environment: "node",
    setupFiles: ["./test/unit/vitest/common/_setup.ts"],
  },
});
