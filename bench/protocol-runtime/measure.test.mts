import { assertTrue } from "@evolu/common";
import { describe, it } from "node:test";
import { startTiming } from "./measure.mts";
import { median } from "./timing.mts";

describe("startTiming", () => {
  it("reads the CPU time of regions shorter than a scheduler tick", () => {
    const cpuPerWall = Array.from({ length: 21 }, () => {
      const end = startTiming();
      const until = performance.now() + 0.3;
      while (performance.now() < until);
      const { cpuNs, wallNs } = end();
      return cpuNs / wallNs;
    });
    // A busy region spends about its wall time on the CPU, which a Linux
    // thread's own CPU time mostly reads as almost nothing.
    assertTrue(median(cpuPerWall) > 0.5);
  });
});
