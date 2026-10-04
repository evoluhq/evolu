import {
  assertEqual,
  assertFalse,
  assertThrowsInstanceOf,
  assertTrue,
} from "@evolu/common";
import { describe, it } from "node:test";
import {
  combineWorkloadHashes,
  compareWithBaseline,
  estimateEndToEndMs,
  fastestByMetric,
  formatChange,
  isBaseFirst,
  isLoadHigh,
  median,
  metricOf,
  networkProfiles,
  ratioVerdict,
  sameValue,
  summarizeRatios,
  workDifferences,
} from "./timing.mts";

const errorMessage = (run: () => unknown): string =>
  assertThrowsInstanceOf(run, Error).message;

describe("fastestByMetric", () => {
  it("keeps each metric's fastest value independently", () => {
    assertEqual(
      fastestByMetric([
        { relay: 30, client: 10 },
        { relay: 20, client: 40 },
        { relay: 25, client: 15 },
      ]),
      { relay: 20, client: 10 },
    );
  });

  it("rejects measurements with other metrics", () => {
    assertEqual(
      errorMessage(() => fastestByMetric([{ relay: 1 }, { client: 1 }])),
      "Measurements must have the same metrics.",
    );
  });

  it("rejects no measurements", () => {
    assertEqual(
      errorMessage(() => fastestByMetric([])),
      "There are no measurements.",
    );
  });
});

describe("metricOf", () => {
  it("reads an existing metric", () => {
    assertEqual(metricOf({ relay: 5 }, "relay"), 5);
  });

  it("rejects a missing metric", () => {
    assertEqual(
      errorMessage(() => metricOf({}, "relay")),
      "The metric relay is missing.",
    );
  });
});

describe("median", () => {
  it("takes the middle of an odd count", () => {
    assertEqual(median([3, 1, 2]), 2);
  });

  it("averages the middle two of an even count", () => {
    assertEqual(median([4, 1, 3, 2]), 2.5);
  });

  it("rejects no values", () => {
    assertEqual(
      errorMessage(() => median([])),
      "A median needs values.",
    );
  });
});

describe("summarizeRatios", () => {
  it("summarizes head/base ratios of pairs, not of fastest values", () => {
    assertEqual(
      summarizeRatios([
        { base: 100, head: 110 },
        { base: 200, head: 200 },
        { base: 100, head: 90 },
        { base: 50, head: 60 },
        { base: 100, head: 105 },
      ]),
      { median: 1.05, min: 0.9, max: 1.2 },
    );
  });

  it("rejects a timing that is not positive", () => {
    assertEqual(
      errorMessage(() => summarizeRatios([{ base: 0, head: 1 }])),
      "Paired timings must be positive.",
    );
  });
});

describe("ratioVerdict", () => {
  it("fails only above 1.10", () => {
    assertEqual(ratioVerdict(1.1), "slower");
    assertEqual(ratioVerdict(1.1001), "regression");
  });

  it("prints slower from 1.03", () => {
    assertEqual(ratioVerdict(1.0299), "same");
    assertEqual(ratioVerdict(1.03), "slower");
  });

  it("prints faster from the inverse of 1.03", () => {
    assertEqual(ratioVerdict(1 / 1.03), "faster");
    assertEqual(ratioVerdict(0.98), "same");
  });
});

describe("isBaseFirst", () => {
  it("alternates which side runs first, starting with the base", () => {
    assertEqual([0, 1, 2, 3, 4].map(isBaseFirst), [
      true,
      false,
      true,
      false,
      true,
    ]);
  });
});

describe("compareWithBaseline", () => {
  it("reports only metrics more than 10% slower", () => {
    assertEqual(
      compareWithBaseline(
        { exact: 110, over: 111, faster: 50 },
        { exact: 100, over: 100, faster: 100 },
      ),
      {
        regressions: [{ metric: "over", baselineNs: 100, currentNs: 111 }],
        added: [],
        removed: [],
      },
    );
  });

  it("lists added and removed metrics", () => {
    assertEqual(
      compareWithBaseline({ kept: 1, added: 1 }, { kept: 1, removed: 1 }),
      { regressions: [], added: ["added"], removed: ["removed"] },
    );
  });
});

describe("formatChange", () => {
  it("formats signed percentages", () => {
    assertEqual(formatChange(105, 100), "+5.00%");
    assertEqual(formatChange(95, 100), "-5.00%");
    assertEqual(formatChange(100, 100), "+0.00%");
  });
});

describe("workDifferences", () => {
  it("lists changed keys and keys only one side has", () => {
    assertEqual(
      workDifferences(
        { rounds: 3, bytes: 10, "relay.iterate": 2 },
        { rounds: 3, bytes: 12, "client.iterate": 1 },
      ),
      ["bytes", "relay.iterate", "client.iterate"],
    );
  });

  it("finds no difference in the same work", () => {
    assertEqual(workDifferences({ rounds: 3 }, { rounds: 3 }), []);
  });
});

describe("combineWorkloadHashes", () => {
  it("depends on every case and its order", () => {
    const hash = combineWorkloadHashes([
      ["a", "1"],
      ["b", "2"],
    ]);
    assertEqual(hash.length, 64);
    assertEqual(
      combineWorkloadHashes([
        ["a", "1"],
        ["b", "2"],
      ]),
      hash,
    );
    assertFalse(
      combineWorkloadHashes([
        ["b", "2"],
        ["a", "1"],
      ]) === hash,
    );
    assertFalse(
      combineWorkloadHashes([
        ["a", "1"],
        ["b", "3"],
      ]) === hash,
    );
  });
});

describe("sameValue", () => {
  it("returns the one value", () => {
    assertEqual(sameValue("The version", ["3.53.2", "3.53.2"]), "3.53.2");
  });

  it("rejects different values", () => {
    assertEqual(
      errorMessage(() => sameValue("The version", ["1", "2", "1"])),
      "The version differs between runs: 1, 2",
    );
  });

  it("rejects no values", () => {
    assertEqual(
      errorMessage(() => sameValue("The version", [])),
      "The version has no value.",
    );
  });
});

describe("estimateEndToEndMs", () => {
  it("adds round trips, transfer at each direction's bandwidth, and CPU", () => {
    const [broadband, mobile] = networkProfiles;
    const sync = {
      rounds: 3,
      upBytes: 1_250_000,
      downBytes: 2_500_000,
      cpuNs: 7_000_000,
    };
    // 60 ms of round trips, 1,000 ms up at 10 Mbit/s, 400 ms down at 50.
    assertEqual(estimateEndToEndMs(sync, broadband), 1_467);
    // 450 ms of round trips, 13,333.3 ms up, 12,500 ms down.
    assertEqual(
      Math.round(estimateEndToEndMs(sync, mobile) * 10) / 10,
      26_290.3,
    );
  });
});

describe("isLoadHigh", () => {
  it("is high above a quarter of the logical CPUs", () => {
    assertFalse(isLoadHigh(2.5, 10));
    assertTrue(isLoadHigh(2.51, 10));
  });
});
