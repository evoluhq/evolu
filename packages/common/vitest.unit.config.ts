import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineProject({
  test: {
    snapshotSerializers: [
      resolve(__dirname, "./test/local-first/_uint8ArraySerializer.ts"),
    ],
    include: ["test/**/*.test.ts"],
    name: "@evolu/common (nodejs)",
    environment: "node",
    setupFiles: ["./test/_setup.ts"],
  },
});
