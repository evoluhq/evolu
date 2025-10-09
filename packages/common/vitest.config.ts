import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    snapshotSerializers: ["./test/Evolu/_uint8ArraySerializer.ts"],
  },
});
