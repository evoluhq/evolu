import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    include: ["*.test.mts"],
    name: "node-oxlint-config",
  },
});
