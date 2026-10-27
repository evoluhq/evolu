import { assertEqual, assertTrue, getOrThrow } from "@evolu/common";
import { describe, it } from "node:test";
import {
  compareRelayDigests,
  findRelayRegressions,
  formatRelayResults,
  RelayResults,
  relayResultsFormatVersion,
  RelayRunOutput,
  relayRatio,
} from "./results.mts";

const output = getOrThrow(
  RelayRunOutput.fromUnknown({
    sizeAfterWrites: 50_000,
    databaseBytes: 44_000_000,
    phasesMs: { write: 500, fingerprint: 100, iterate: 100, read: 100 },
    digests: { fingerprints: "f", iterated: "50000:i", read: "r" },
  }),
);

describe("compareRelayDigests", () => {
  it("accepts a run that returned what the first did", () => {
    assertEqual(compareRelayDigests(output, output), null);
  });

  it("names the digests that differ", () => {
    assertEqual(
      compareRelayDigests(
        {
          ...output,
          digests: { ...output.digests, fingerprints: "x", read: "y" },
        },
        output,
      ),
      "The fingerprints, read differ from the first run's.",
    );
  });

  it("fails on another number of timestamps first", () => {
    assertEqual(
      compareRelayDigests(
        RelayRunOutput.orThrow({
          ...output,
          sizeAfterWrites: 49_999,
          digests: { ...output.digests, read: "y" },
        }),
        output,
      ),
      "The owner has 49999 timestamps, not 50000.",
    );
  });
});

const createRun = (round: number, write: number) => ({
  round,
  position: round % 2,
  phasesMs: { write, fingerprint: 100, iterate: 100, read: 100 },
  databaseBytes: 44_000_000,
});

const createResults = (
  baseWrites: ReadonlyArray<number>,
  headWrites: ReadonlyArray<number>,
  error: string | null = null,
): RelayResults =>
  getOrThrow(
    RelayResults.fromUnknown({
      formatVersion: relayResultsFormatVersion,
      createdAt: "2026-10-25T12:00:00.000Z",
      environment: { CPU: "Apple M5" },
      loadAverages: { start: [1, 1, 1], end: [1, 1, 1] },
      digests: output.digests,
      sizeAfterWrites: 50_000,
      base: {
        commit: "abde2972c0000000000000000000000000000000",
        subject: "Old",
        isDirty: false,
        driver: "better-sqlite3 13.0.3",
        storage: "Storage on recursive CTEs",
        warmupRuns: [],
        runs: baseWrites.map((write, round) => createRun(round, write)),
      },
      head: {
        commit: "1234567890000000000000000000000000000000",
        subject: "New",
        isDirty: true,
        driver: "Evolu's SQLite (@evolu/nodejs's addon)",
        storage: "Storage on the C skiplist functions",
        warmupRuns: [],
        runs: headWrites.map((write, round) => createRun(round, write)),
      },
      error,
    }),
  );

describe("relayRatio", () => {
  it("divides new by old in the same round", () => {
    const results = createResults([500, 400, 600], [600, 400, 300]);
    assertEqual(relayRatio(results.head, results.base, "write"), {
      median: 1,
      min: 0.5,
      max: 1.2,
      verdict: "Same",
    });
    // The other phases take 300 ms in every run.
    assertEqual(relayRatio(results.head, results.base, "total")?.median, 1);
  });

  it("is null without measured runs", () => {
    const results = createResults([], []);
    assertEqual(relayRatio(results.head, results.base, "write"), null);
  });
});

describe("findRelayRegressions", () => {
  it("lists what the new code is slower in, every round", () => {
    assertEqual(findRelayRegressions(createResults([500, 500], [700, 600])), [
      "write",
      "total",
    ]);
    assertEqual(
      findRelayRegressions(createResults([500, 500], [700, 400])),
      [],
    );
  });
});

describe("formatRelayResults", () => {
  it("tables both checkouts and gives the verdict", () => {
    const markdown = formatRelayResults(createResults([500, 500], [250, 250]));
    const lines = markdown.split("\n");
    assertTrue(
      lines.includes(
        "- New: `123456789` New (with uncommitted changes): Evolu's SQLite (@evolu/nodejs's addon), Storage on the C skiplist functions",
      ),
    );
    assertTrue(
      lines.includes(
        "| 50000 writes in batches of 500 | 500 (500–500) | 250 (250–250) | 0.50 (0.50–0.50) | faster |",
      ),
    );
    assertTrue(
      markdown.includes(
        "**Verdict:** the new code is not slower in any metric",
      ),
    );
  });

  it("says when the gate failed", () => {
    const markdown = formatRelayResults(
      createResults(
        [500],
        [500],
        "head: The read differ from the first run's.",
      ),
    );
    assertTrue(
      markdown.includes(
        "**The gate failed:** head: The read differ from the first run's.",
      ),
    );
    assertTrue(markdown.includes("**Verdict:** none, as the gate failed."));
  });
});
