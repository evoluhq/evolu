import {
  assertEqual,
  assertFalse,
  assertThrowsInstanceOf,
  assertTrue,
  getOrThrow,
} from "@evolu/common";
import { describe, it } from "node:test";
import { workloads } from "../sqlite-wasm/workload.mts";
import {
  BenchResults,
  BenchRunOutput,
  checkRun,
  findPragmaDifferences,
  findRegressions,
  formatResults,
  metricMs,
  pairedRatio,
  resultsFormatVersion,
  RunTimings,
  TargetResult,
  type MeasuredStackResult,
} from "./results.mts";

const errorMessage = (run: () => unknown): string =>
  assertThrowsInstanceOf(run, Error).message;

const reference = {
  totalChanges: workloads.map((_, index) => (index + 1) * 10),
  contentChecksum: "3,6,9;2,4,6;1,2,3",
};

const plainFile = {
  byteLength: 8192,
  zeroByteShare: 0.05,
  sqliteHeaderOffsets: [0],
  containsPlaintextMarker: true,
};

const encryptedFile = {
  byteLength: 8192,
  zeroByteShare: 0.004,
  sqliteHeaderOffsets: [],
  containsPlaintextMarker: false,
};

const pragmas = {
  page_size: "4096",
  journal_mode: "delete",
  synchronous: "2",
  cache_size: "-16000",
  temp_store: "2",
  secure_delete: "0",
  locking_mode: "normal",
  auto_vacuum: "0",
  mmap_size: "0",
};

// Validated, so a test can pass plain numbers for branded ones.
const createOutput = (
  overrides: Readonly<Record<string, unknown>> = {},
): BenchRunOutput =>
  getOrThrow(
    BenchRunOutput.fromUnknown({
      sqliteVersion: "3.54.1",
      sqliteSourceId: "2026-06-26 20:14:12 d4c0e51e4aeb",
      compileOptions: ["THREADSAFE=2", "TEMP_STORE=3"],
      pragmas,
      workloadMs: workloads.map(() => 1),
      totalChanges: reference.totalChanges,
      contentChecksum: null,
      schemaObjectsAfter: 0,
      file: plainFile,
      driverMs: { insert: 1, selectByKey: 2, selectAll: 3 },
      ...overrides,
    }),
  );

describe("checkRun", () => {
  const check = (
    overrides: Readonly<Record<string, unknown>>,
    { encrypted = false, first = null as BenchRunOutput | null } = {},
  ) => {
    checkRun(createOutput(overrides), { reference, encrypted, first });
  };

  it("passes a run that matches the reference", () => {
    check({});
    check({ contentChecksum: reference.contentChecksum });
    check({ file: null });
    check({ file: encryptedFile }, { encrypted: true });
  });

  it("fails a run with another number of workloads", () => {
    assertEqual(
      errorMessage(() => {
        check({ workloadMs: [1] });
      }),
      "The run timed 1 workloads.",
    );
  });

  it("fails a run whose total_changes() differ from the reference", () => {
    const totalChanges = reference.totalChanges.with(3, 0);
    assertTrue(
      errorMessage(() => {
        check({ totalChanges });
      }).startsWith(
        `total_changes() after each workload is ${totalChanges.join(", ")}`,
      ),
    );
    assertTrue(
      errorMessage(() => {
        check({ totalChanges: reference.totalChanges.slice(1) });
      }).startsWith("total_changes()"),
    );
  });

  it("fails a run whose tables' checksum differs", () => {
    assertEqual(
      errorMessage(() => {
        check({ contentChecksum: "0" });
      }),
      `The tables' checksum is 0, not ${reference.contentChecksum}.`,
    );
  });

  it("fails a run that leaves a table", () => {
    assertEqual(
      errorMessage(() => {
        check({ schemaObjectsAfter: 1 });
      }),
      "The last workload left 1 schema objects.",
    );
  });

  it("fails an empty file", () => {
    assertEqual(
      errorMessage(() => {
        check({ file: { ...plainFile, byteLength: 0 } });
      }),
      "The database file is empty.",
    );
  });

  it("fails a plain file without SQLite's header at its start", () => {
    assertEqual(
      errorMessage(() => {
        check({ file: encryptedFile });
      }),
      "The plaintext file does not start with SQLite's header.",
    );
  });

  it("fails an encrypted stack whose file isn't ciphertext", () => {
    const encrypted = { encrypted: true };
    assertEqual(
      errorMessage(() => {
        check({ file: null }, encrypted);
      }),
      "The encrypted stack cannot read its file.",
    );
    assertEqual(
      errorMessage(() => {
        check(
          { file: { ...encryptedFile, sqliteHeaderOffsets: [4096] } },
          encrypted,
        );
      }),
      "The encrypted file has SQLite's header at 4096.",
    );
    assertEqual(
      errorMessage(() => {
        check({ file: { ...encryptedFile, zeroByteShare: 0.01 } }, encrypted);
      }),
      "1.00% of the encrypted file's bytes are zeros.",
    );
    assertEqual(
      errorMessage(() => {
        check(
          { file: { ...encryptedFile, containsPlaintextMarker: true } },
          encrypted,
        );
      }),
      "The encrypted file contains the workloads' text.",
    );
  });

  it("fails a run whose pragmas differ from the stack's first run", () => {
    const first = createOutput();
    check({}, { first });
    assertEqual(
      errorMessage(() => {
        check({ pragmas: { ...pragmas, cache_size: "-2000" } }, { first });
      }),
      "The pragmas differ between runs.",
    );
  });
});

const defaultDriverMs = { insert: 10, selectByKey: 20, selectAll: 30 };

const createRun = (
  round: number,
  workloadMs: number,
  driverMs = defaultDriverMs,
): RunTimings =>
  RunTimings.orThrow({
    round,
    position: 0,
    workloadMs: workloads.map(() => workloadMs),
    driverMs,
  });

const createMeasured = (
  id: string,
  runs: ReadonlyArray<RunTimings>,
  overrides: Partial<MeasuredStackResult> = {},
): MeasuredStackResult => ({
  type: "Measured",
  id,
  label: id,
  library: `${id} 1.0.0`,
  binding: "Node-API",
  encrypted: false,
  sqliteVersion: "3.54.1",
  sqliteSourceId: "2026-06-26 20:14:12 d4c0e51e4aeb",
  compileOptions: ["THREADSAFE=2"],
  pragmas,
  warmupRuns: [],
  runs,
  ...overrides,
});

const createTarget = (
  stacks: ReadonlyArray<TargetResult["stacks"][number]>,
): TargetResult =>
  getOrThrow(
    TargetResult.fromUnknown({
      id: "node-darwin-arm64",
      label: "Node.js 24.22.0, macOS",
      createdAt: "2026-10-25T12:00:00.000Z",
      environment: { CPU: "Apple M5", "Node.js": "24.22.0" },
      loadAverages: { start: [1, 2, 3], end: [1.5, 2, 3] },
      notes: [],
      evoluStackId: "evolu",
      evoluEncryptedStackId: "evoluEncrypted",
      referenceStackId: "reference",
      stacks,
    }),
  );

describe("metricMs", () => {
  it("reads a workload, the totals and a driver operation", () => {
    const run = RunTimings.orThrow({
      ...createRun(0, 1),
      workloadMs: workloads.map((_, index) => index + 1),
    });
    assertEqual(metricMs(run, { type: "Workload", index: 2 }), 3);
    assertEqual(metricMs(run, { type: "Total" }), 136);
    assertEqual(metricMs(run, { type: "TotalWithoutFirst" }), 135);
    assertEqual(metricMs(run, { type: "Driver", operation: "selectAll" }), 30);
  });
});

describe("pairedRatio", () => {
  const total = { type: "Total" } as const;

  it("divides by the run of the same round", () => {
    const head = createMeasured("head", [createRun(0, 2), createRun(1, 3)]);
    // Another order, so pairing by position would give other ratios.
    const base = createMeasured("base", [createRun(1, 1), createRun(0, 4)]);
    assertEqual(pairedRatio(head, base, total), {
      median: 1.75,
      min: 0.5,
      max: 3,
      verdict: "Same",
    });
  });

  it("is slower only when the median exceeds the threshold and every round agrees", () => {
    const base = createMeasured(
      "base",
      [0, 1, 2].map((round) => createRun(round, 1)),
    );
    const slower = createMeasured("head", [
      createRun(0, 1.2),
      createRun(1, 1.15),
      createRun(2, 1.01),
    ]);
    assertEqual(pairedRatio(slower, base, total)?.verdict, "Slower");
    const oneFaster = createMeasured("head", [
      createRun(0, 1.2),
      createRun(1, 1.15),
      createRun(2, 0.99),
    ]);
    assertEqual(pairedRatio(oneFaster, base, total)?.verdict, "Same");
    const belowThreshold = createMeasured(
      "head",
      [0, 1, 2].map((round) => createRun(round, 1.05)),
    );
    assertEqual(pairedRatio(belowThreshold, base, total)?.verdict, "Same");
  });

  it("is faster for the inverse", () => {
    const base = createMeasured(
      "base",
      [0, 1].map((round) => createRun(round, 1)),
    );
    const faster = createMeasured("head", [
      createRun(0, 0.8),
      createRun(1, 0.85),
    ]);
    assertEqual(pairedRatio(faster, base, total)?.verdict, "Faster");
  });

  it("is null without a shared round", () => {
    const head = createMeasured("head", [createRun(0, 1)]);
    const base = createMeasured("base", [createRun(1, 1)]);
    assertEqual(pairedRatio(head, base, total), null);
  });
});

describe("findRegressions", () => {
  it("lists the metrics in which Evolu is slower than the reference", () => {
    const target = createTarget([
      createMeasured("evolu", [
        createRun(0, 1, { insert: 20, selectByKey: 20, selectAll: 30 }),
        createRun(1, 1, { insert: 30, selectByKey: 20, selectAll: 30 }),
      ]),
      createMeasured("reference", [createRun(0, 1), createRun(1, 1)]),
    ]);
    assertEqual(
      findRegressions(target).map(({ metric, ratio }) => ({
        metric,
        median: ratio.median,
      })),
      [{ metric: { type: "Driver", operation: "insert" }, median: 2.5 }],
    );
  });

  it("finds nothing when either stack failed", () => {
    const target = createTarget([
      createMeasured("evolu", [createRun(0, 2)]),
      {
        type: "Failed",
        id: "reference",
        label: "reference",
        library: "reference 1.0.0",
        binding: "Node-API",
        encrypted: false,
        error: "It failed.",
      },
    ]);
    assertEqual(findRegressions(target), []);
  });
});

describe("findPragmaDifferences", () => {
  it("allows only secure_delete to differ for an encrypted stack", () => {
    const runs = [createRun(0, 1)];
    assertEqual(
      findPragmaDifferences(
        createTarget([
          createMeasured("evolu", runs),
          createMeasured("evoluEncrypted", runs, {
            encrypted: true,
            pragmas: { ...pragmas, secure_delete: "1" },
          }),
          createMeasured("reference", runs),
        ]),
      ),
      [],
    );
    assertEqual(
      findPragmaDifferences(
        createTarget([
          createMeasured("evolu", runs),
          createMeasured("reference", runs, {
            pragmas: { ...pragmas, secure_delete: "1", cache_size: "-2000" },
          }),
        ]),
      ),
      ["cache_size", "secure_delete"],
    );
  });
});

describe("formatResults", () => {
  const results = getOrThrow(
    BenchResults.fromUnknown({
      formatVersion: resultsFormatVersion,
      createdAt: "2026-10-25T12:00:00.000Z",
      configuration: {
        warmupRounds: 1,
        measuredRounds: 2,
        waSqliteCommit: "7a4b4241ba7c61ee19121aacd6c93892234ce1a1",
        workloadSha256: "0".repeat(64),
        pragmas: ["PRAGMA page_size = 4096"],
      },
      targets: [
        createTarget([
          createMeasured("evolu", [createRun(0, 1), createRun(1, 1)], {
            label: "Evolu",
            compileOptions: ["THREADSAFE=2", "TEMP_STORE=3"],
          }),
          createMeasured("evoluEncrypted", [createRun(0, 2), createRun(1, 2)], {
            label: "Evolu, encrypted",
            encrypted: true,
            pragmas: { ...pragmas, secure_delete: "1" },
          }),
          createMeasured("reference", [createRun(0, 2), createRun(1, 2)], {
            label: "better-sqlite3",
            compileOptions: ["THREADSAFE=1"],
          }),
          {
            type: "Failed",
            id: "nodeSqlite",
            label: "node:sqlite",
            library: "node:sqlite",
            binding: "built in",
            encrypted: false,
            error: "Error: unable to open database file\n    at stack",
          },
        ]),
      ],
    }),
  );
  const markdown = formatResults(results);
  const lines = markdown.split("\n");

  it("has a column per measured stack and a row per workload", () => {
    assertTrue(
      lines.includes(
        "| Workload | Evolu | Evolu, encrypted | better-sqlite3 |",
      ),
    );
    assertTrue(
      lines.includes(
        "| 2. 25000 INSERTs in a transaction | 1.00 (1.00–1.00) | 2.00 (2.00–2.00) | 2.00 (2.00–2.00) |",
      ),
    );
    assertTrue(
      lines.includes(
        "| Total | 16.0 (16.0–16.0) | 32.0 (32.0–32.0) | 32.0 (32.0–32.0) |",
      ),
    );
  });

  it("reports the driver operations per call", () => {
    // 10 ms for 10000 inserts is 1 µs each, and 30 ms for 10 reads 3 ms each.
    assertTrue(
      lines.includes(
        "| 10000 single-row inserts | 1.00 (1.00–1.00) | 1.00 (1.00–1.00) | 1.00 (1.00–1.00) |",
      ),
    );
    assertTrue(
      lines.includes(
        "| 10 reads of 10000 rows | 3.00 (3.00–3.00) | 3.00 (3.00–3.00) | 3.00 (3.00–3.00) |",
      ),
    );
  });

  it("relates Evolu to the reference and encryption to Evolu", () => {
    assertTrue(
      lines.includes(
        "| Total | 0.50 (0.50–0.50) | faster | 2.00 (2.00–2.00) |",
      ),
    );
    assertTrue(
      lines.includes(
        "**Verdict:** Evolu is not slower than better-sqlite3 in any metric.",
      ),
    );
  });

  it("names the failed stack with the first line of its error", () => {
    assertTrue(
      lines.includes("node:sqlite failed: Error: unable to open database file"),
    );
    assertFalse(markdown.includes("at stack"));
  });

  it("lists the compile options that differ", () => {
    assertTrue(lines.includes("| THREADSAFE | 2 | 2 | 1 |"));
    assertTrue(lines.includes("| TEMP_STORE | 3 |  |  |"));
  });

  it("names the pragmas, and says when only secure_delete differs", () => {
    assertTrue(
      markdown.includes(
        "Every plain stack ran with the same pragmas, and every encrypted one with the same but `secure_delete`.",
      ),
    );
    assertTrue(markdown.includes("| 2 (FULL) |"));
  });
});
