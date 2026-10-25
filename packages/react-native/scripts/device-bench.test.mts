/**
 * The summarizer of the benchmark route's logs on lines a test writes, so it
 * needs no device and no toolchain, and test:unit runs it too.
 */
import {
  assert,
  assertEqual,
  assertFalse,
  assertThrows,
  assertTrue,
} from "@evolu/common";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, mock, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import {
  countDeviceBenchRuns,
  formatDeviceBenchSummary,
  parseDeviceBenchLine,
  runDeviceBenchCli,
  summarizeDeviceBench,
} from "./device-bench.mts";

const sizes = {
  rows: 3,
  pageRows: 2,
  mutations: [1, 2],
  syncMessages: [3],
  timerHops: 2,
};

/** The cases the runner registers for {@link sizes}, in its order. */
const caseNames = [
  "timer-hop",
  "open-new",
  "open-existing",
  "page-write-plain",
  "page-write-encrypted",
  "page-read-plain",
  "page-read-encrypted",
  "evolu-start-new",
  "evolu-start-existing",
  "mutation-1",
  "mutation-2",
  "sync-receive-3",
  "export",
];

type Build = "evolu" | "expo-sqlite";

const metaOf = (build: Build, startedAt: number) => ({
  build,
  platform: "ios",
  os: "26.5",
  dev: false,
  nodeEnv: "production",
  startedAt,
  memory: null,
  sizes,
  sqliteVersion: build === "evolu" ? "3.54.1" : "3.53.3",
  cipherVersion: build === "evolu" ? null : "4.17.0 community",
  cipherProvider: build === "evolu" ? null : "commoncrypto",
  pageSize: 4096,
  journalMode: "delete",
  synchronous: 2,
  cacheSize: -2000,
  secureDelete: build === "evolu" ? 1 : 0,
  idleMedianGapMs: 16.7,
  idleLongestGapMs: 18.1,
});

/** A line as `log stream --style compact` prints what the app logged. */
const compact = (keyword: string, json: unknown): string =>
  `2026-10-24 12:00:00.123 I  expoapp[1234:5678] [com.facebook.react.log:javascript] EvoluNativeBench ${keyword} ${JSON.stringify(json)}`;

/**
 * A row copied from Console.app on the Mac with the iPhone selected, a real one
 * with its message swapped for a bench line.
 */
const consoleApp = (keyword: string, json: unknown): string =>
  `info\t18:49:38.661916+0200\texposqlcipher\tEvoluNativeBench ${keyword} ${JSON.stringify(json)}`;

/** A line as `logcat -v brief` prints what the app logged. */
const brief = (keyword: string, json: unknown): string =>
  `I/ReactNativeJS( 4242): EvoluNativeBench ${keyword} ${JSON.stringify(json)}`;

/**
 * A session's lines, every case's six runs with `ms` taking `base + run`, plus
 * the case's offset, and 100 times that for a run 0.
 */
const setupSession = ({
  build,
  startedAt,
  base,
  offsets = {},
  pages = () => 1925,
  meta = {},
  line = compact,
}: {
  build: Build;
  startedAt: number;
  base: number;
  offsets?: Partial<Record<string, number>>;
  pages?: (name: string) => number;
  meta?: Record<string, unknown>;
  line?: (keyword: string, json: unknown) => string;
}): Array<string> => [
  "Running expoapp",
  line("meta", { ...metaOf(build, startedAt), ...meta }),
  line("option", { option: "ENABLE_COLUMN_METADATA" }),
  line("option", { option: "THREADSAFE=2" }),
  ...caseNames.flatMap((name) =>
    Array.from({ length: 6 }, (_, run) =>
      line("run", {
        case: name,
        run,
        ms: run === 0 ? base * 10 : base + run + (offsets[name] ?? 0),
        stallMs: run,
        heapBytes: build === "evolu" ? 1000 * run : null,
        ...(name.startsWith("page-") && { pages: pages(name) }),
        ...(name.startsWith("sync-receive-") && {
          relayMs: 2,
          relayMaxMs: 0.5 * run,
        }),
      }),
    ),
  ),
  line("done", { runs: 78, failed: 0 }),
];

const setupLogs = () => [
  {
    device: "iPhone",
    lines: [
      ...setupSession({
        build: "expo-sqlite",
        startedAt: 1000,
        base: 10,
        offsets: {
          "page-write-encrypted": 19.25,
          "page-read-encrypted": 9.625,
        },
      }),
      ...setupSession({
        build: "evolu",
        startedAt: 2000,
        base: 5,
        offsets: { "page-write-encrypted": 11.5, "page-read-encrypted": 5.75 },
      }),
    ],
  },
  {
    device: "iPhone",
    lines: [
      ...setupSession({
        build: "expo-sqlite",
        startedAt: 3000,
        base: 20,
        offsets: {
          "page-write-encrypted": 19.25,
          "page-read-encrypted": 9.625,
        },
      }),
      ...setupSession({
        build: "evolu",
        startedAt: 4000,
        base: 7,
        offsets: { "page-write-encrypted": 11.5, "page-read-encrypted": 5.75 },
      }),
    ],
  },
];

describe("parseDeviceBenchLine", () => {
  it("reads each keyword wherever the log puts the tag", () => {
    const run = {
      case: "mutation-100",
      run: 3,
      ms: 41.2,
      stallMs: 12.5,
      heapBytes: 10485760,
    };
    assertEqual(
      [
        compact("run", run),
        brief("run", run),
        consoleApp("run", run),
        `${consoleApp("run", run)}\tcom.facebook.react.log`,
        brief("run", { ...run, heapBytes: null }),
        compact("meta", metaOf("evolu", 1)),
        brief("option", { option: "THREADSAFE=2" }),
        compact("run", {
          case: "page-read-encrypted",
          run: 0,
          ms: 9,
          stallMs: 0,
          heapBytes: null,
          pages: 1925,
        }),
        brief("run", {
          case: "sync-receive-1000",
          run: 5,
          ms: 900,
          stallMs: 30,
          heapBytes: 1,
          relayMs: 200,
          relayMaxMs: 3,
        }),
        compact("failed", { case: "runner", message: "No directory." }),
        brief("done", { runs: 90, failed: 0 }),
        compact("holding", { memory: "idle" }),
        `${brief("done", { runs: 90, failed: 0 })}\r`,
      ].map(parseDeviceBenchLine),
      [
        { type: "Run", run },
        { type: "Run", run },
        { type: "Run", run },
        { type: "Run", run },
        { type: "Run", run: { ...run, heapBytes: null } },
        { type: "Meta", meta: metaOf("evolu", 1) },
        { type: "Option", option: "THREADSAFE=2" },
        {
          type: "Run",
          run: {
            case: "page-read-encrypted",
            run: 0,
            ms: 9,
            stallMs: 0,
            heapBytes: null,
            pages: 1925,
          },
        },
        {
          type: "Run",
          run: {
            case: "sync-receive-1000",
            run: 5,
            ms: 900,
            stallMs: 30,
            heapBytes: 1,
            relayMs: 200,
            relayMaxMs: 3,
          },
        },
        { type: "Failed", case: "runner", message: "No directory." },
        { type: "Done", runs: 90, failed: 0 },
        { type: "Holding", memory: "idle" },
        { type: "Done", runs: 90, failed: 0 },
      ],
    );
  });

  it("gives null for any other line", () => {
    assertEqual(
      [
        "Running expoapp",
        "",
        "I/ReactNativeJS( 4242): EvoluNativeTests passed=1 failed=0 total=1",
        "EvoluNativeBenchmark run {}",
      ].map(parseDeviceBenchLine),
      [null, null, null, null],
    );
  });

  it("throws an error that names the line on bad JSON, an unknown keyword, or a missing or extra key", () => {
    const run = { case: "open-new", run: 1, ms: 2, stallMs: 0, heapBytes: 3 };
    for (const line of [
      brief("run", run).slice(0, -1),
      "I/ReactNativeJS( 4242): EvoluNativeBench done",
      brief("ran", run),
      brief("run", { ...run, extra: 1 }),
      brief("run", { ...run, ms: undefined }),
      brief("run", { ...run, ms: -1 }),
      brief("run", { ...run, case: "page-write-plain" }),
      brief("run", { ...run, pages: 1925 }),
      brief("run", {
        ...run,
        case: "sync-receive-1000",
        relayMs: 1,
      }),
      brief("meta", { ...metaOf("evolu", 1), cipher: null }),
      brief("meta", { ...metaOf("evolu", 1), build: "nitro" }),
      brief("option", {}),
      brief("failed", { case: "runner" }),
      brief("done", { runs: 1 }),
      brief("holding", { memory: 1 }),
      brief("run", { ...run, case: 1 }),
    ])
      assertThrows(
        () => parseDeviceBenchLine(line),
        (error) => {
          assert(
            (error as Error).message.includes(JSON.stringify(line)),
            (error as Error).message,
          );
        },
      );
  });
});

describe("countDeviceBenchRuns", () => {
  it("is the number of cases times six, registering them without running them", () => {
    assertEqual(countDeviceBenchRuns(sizes), caseNames.length * 6);
    assertEqual(
      countDeviceBenchRuns({
        rows: 10_000,
        pageRows: 480,
        mutations: [1, 100, 1000],
        syncMessages: [1000, 10_000],
        timerHops: 100,
      }),
      15 * 6,
    );
  });
});

describe("summarizeDeviceBench", () => {
  it("gives the median and range of runs 1 to 5 per case, per session and pooled per build, with run 0 only as evolu-start-new's cold start", () => {
    const summary = summarizeDeviceBench(setupLogs());
    const { order, builds } = summary.iPhone;
    const a = builds["expo-sqlite"];
    const b = builds.evolu;

    assertEqual(order, ["expo-sqlite", "evolu", "expo-sqlite", "evolu"]);
    assertTrue(a != null && b != null);
    assertEqual(a.meta, metaOf("expo-sqlite", 1000));
    assertEqual(a.options, ["ENABLE_COLUMN_METADATA", "THREADSAFE=2"]);
    assertEqual(a.cases["open-new"], {
      type: "Plain",
      median: 18,
      min: 11,
      max: 25,
      runs: [11, 12, 13, 14, 15, 21, 22, 23, 24, 25],
      sessionMedians: [13, 23],
      stallMs: { median: 3, min: 1, max: 5 },
      heapBytes: null,
    });
    assertEqual(b.cases["open-new"], {
      type: "Plain",
      median: 9,
      min: 6,
      max: 12,
      runs: [6, 7, 8, 9, 10, 8, 9, 10, 11, 12],
      sessionMedians: [8, 10],
      stallMs: { median: 3, min: 1, max: 5 },
      heapBytes: 3000,
    });
    assertEqual(b.cases["page-read-plain"], {
      type: "Page",
      median: 9,
      min: 6,
      max: 12,
      runs: [6, 7, 8, 9, 10, 8, 9, 10, 11, 12],
      sessionMedians: [8, 10],
      stallMs: { median: 3, min: 1, max: 5 },
      heapBytes: 3000,
      pages: 1925,
    });
    assertEqual(b.cases["sync-receive-3"], {
      type: "Sync",
      median: 9,
      min: 6,
      max: 12,
      runs: [6, 7, 8, 9, 10, 8, 9, 10, 11, 12],
      sessionMedians: [8, 10],
      stallMs: { median: 3, min: 1, max: 5 },
      heapBytes: 3000,
      syncMs: { median: 7, min: 4, max: 10 },
      relayMs: { median: 2, min: 2, max: 2 },
      relayMaxMs: 2.5,
    });
    assertEqual(a.coldStart, [100, 200]);
    assertEqual(b.coldStart, [50, 70]);
    assertEqual(a.cases["evolu-start-new"].runs.length, 10);
    assertEqual(a.pageEncryptUs, 10);
    assertEqual(a.pageDecryptUs, 5);
    assertEqual(b.pageEncryptUs, 11_500 / 1925);
    assertEqual(b.pageDecryptUs, 5750 / 1925);
  });

  it("summarizes a device with one build, as a smoke run gives, and orders sessions by startedAt", () => {
    const [first, second] = setupLogs();
    const summary = summarizeDeviceBench([
      {
        device: "Simulator",
        lines: second.lines.slice(second.lines.length / 2),
      },
      { device: "Simulator", lines: first.lines.slice(first.lines.length / 2) },
    ]);

    assertEqual(summary.Simulator.order, ["evolu", "evolu"]);
    assertEqual(summary.Simulator.builds["expo-sqlite"], null);
    assertEqual(summary.Simulator.builds.evolu?.coldStart, [50, 70]);
  });

  const lines = (): Array<string> => setupLogs()[0].lines;
  const replace = (
    from: ReadonlyArray<string>,
    match: string,
    by: ReadonlyArray<string>,
  ): Array<string> => {
    const index = from.findIndex((line) => line.includes(match));
    assert(index !== -1, match);
    return [...from.slice(0, index), ...by, ...from.slice(index + 1)];
  };
  const bSession = (
    options: Partial<Parameters<typeof setupSession>[0]> = {},
  ): Array<string> =>
    setupSession({ build: "evolu", startedAt: 2000, base: 5, ...options });

  for (const [title, logLines, message] of [
    [
      "a session in development",
      bSession({ meta: { dev: true } }),
      "iPhone: the evolu session of 1970-01-01T00:00:02.000Z ran with __DEV__ true.",
    ],
    [
      "a session whose NODE_ENV isn't production",
      bSession({ meta: { nodeEnv: "development" } }),
      'iPhone: the evolu session of 1970-01-01T00:00:02.000Z ran with NODE_ENV "development", not production.',
    ],
    [
      "a session whose NODE_ENV is missing",
      bSession({ meta: { nodeEnv: null } }),
      "iPhone: the evolu session of 1970-01-01T00:00:02.000Z ran with NODE_ENV null, not production.",
    ],
    [
      "a line before any meta",
      [compact("option", { option: "THREADSAFE=2" }), ...bSession()],
      "iPhone: a bench line before any session's meta.",
    ],
    [
      "a missing run",
      replace(bSession(), '"case":"mutation-2","run":4,', []),
      "iPhone: the evolu session of 1970-01-01T00:00:02.000Z has no run 4 of mutation-2.",
    ],
    [
      "a duplicate run",
      replace(bSession(), '"case":"mutation-2","run":4,', [
        compact("run", {
          case: "mutation-2",
          run: 4,
          ms: 1,
          stallMs: 0,
          heapBytes: null,
        }),
        compact("run", {
          case: "mutation-2",
          run: 4,
          ms: 1,
          stallMs: 0,
          heapBytes: null,
        }),
      ]),
      "iPhone: the evolu session of 1970-01-01T00:00:02.000Z has run 4 of mutation-2 twice.",
    ],
    [
      "a run beyond the sixth",
      replace(bSession(), "done", [
        compact("run", {
          case: "mutation-2",
          run: 6,
          ms: 1,
          stallMs: 0,
          heapBytes: null,
        }),
        compact("done", { runs: 78, failed: 0 }),
      ]),
      "iPhone: the evolu session of 1970-01-01T00:00:02.000Z has run 6 of mutation-2, which the runner doesn't run.",
    ],
    [
      "a run of a case the sizes don't register",
      replace(bSession(), "done", [
        compact("run", {
          case: "mutation-100",
          run: 1,
          ms: 1,
          stallMs: 0,
          heapBytes: null,
        }),
        compact("done", { runs: 78, failed: 0 }),
      ]),
      "iPhone: the evolu session of 1970-01-01T00:00:02.000Z has run 1 of mutation-100, which the runner doesn't run.",
    ],
    [
      "a failed line",
      replace(bSession(), "done", [
        compact("failed", { case: "export", message: "Too short." }),
        compact("done", { runs: 72, failed: 1 }),
      ]),
      "iPhone: the evolu session of 1970-01-01T00:00:02.000Z failed: export: Too short.",
    ],
    [
      "a session without done",
      bSession().slice(0, -1),
      "iPhone: the evolu session of 1970-01-01T00:00:02.000Z has no done line.",
    ],
    [
      "a memory launch, which logs no done",
      [
        compact("meta", { ...metaOf("evolu", 2000), memory: "idle" }),
        compact("holding", { memory: "idle" }),
      ],
      "iPhone: the evolu session of 1970-01-01T00:00:02.000Z has no done line.",
    ],
    [
      "a done count other than Node's",
      replace(bSession(), "done", [compact("done", { runs: 77, failed: 0 })]),
      "iPhone: the evolu session of 1970-01-01T00:00:02.000Z ran 77 runs, but Node counts 78.",
    ],
    [
      "an evolu session that reports a cipher",
      bSession({ meta: { cipherVersion: "4.17.0 community" } }),
      'iPhone: the evolu session of 1970-01-01T00:00:02.000Z reports the cipher "4.17.0 community", which only expo-sqlite\'s SQLCipher has.',
    ],
    [
      "an expo-sqlite session that reports no cipher",
      setupSession({
        build: "expo-sqlite",
        startedAt: 1000,
        base: 10,
        meta: { cipherVersion: null },
      }),
      "iPhone: the expo-sqlite session of 1970-01-01T00:00:01.000Z reports no cipher, so its expo-sqlite has no SQLCipher.",
    ],
    ...(
      [
        ["sizes", { ...sizes, rows: 4 }],
        ["pageSize", 8192],
        ["journalMode", "wal"],
        ["synchronous", 1],
        ["cacheSize", -4000],
      ] as const
    ).map(
      ([key, value]) =>
        [
          `builds that differ in ${key}`,
          [...lines().slice(0, 83), ...bSession({ meta: { [key]: value } })],
          `iPhone: the evolu session of 1970-01-01T00:00:02.000Z differs from the expo-sqlite session of 1970-01-01T00:00:01.000Z in ${key}.`,
        ] as const,
    ),
    [
      "a build whose plaintext and encrypted page files differ in page count",
      bSession({
        pages: (name) => (name.endsWith("-encrypted") ? 1926 : 1925),
      }),
      "iPhone: evolu's page files differ in page count: 1925 and 1926.",
    ],
  ] as const)
    it(`fails on ${title}`, () => {
      assertThrows(
        () => summarizeDeviceBench([{ device: "iPhone", lines: logLines }]),
        (error) => {
          assertEqual((error as Error).message, message);
        },
      );
    });

  it("fails on a log without any session", () => {
    assertThrows(
      () =>
        summarizeDeviceBench([
          ...setupLogs(),
          { device: "iPhone", lines: ["Running expoapp"] },
        ]),
      (error) => {
        assertEqual(
          (error as Error).message,
          "iPhone: a log has no session's meta line.",
        );
      },
    );
  });

  it("reads logcat's lines too", () => {
    const summary = summarizeDeviceBench([
      {
        device: "Pixel_10",
        lines: setupSession({
          build: "evolu",
          startedAt: 2000,
          base: 5,
          line: brief,
        }),
      },
    ]);

    assertEqual(summary.Pixel_10.builds.evolu?.coldStart, [50]);
  });
});

describe("formatDeviceBenchSummary", () => {
  it("prints each device's table of B against A, the sync ratio from ms − relayMs, the cold starts and the page figures", () => {
    const text = formatDeviceBenchSummary(summarizeDeviceBench(setupLogs()));

    for (const expected of [
      "## iPhone",
      "Sessions: expo-sqlite, evolu, expo-sqlite, evolu.",
      "| Case | expo-sqlite ms | evolu ms | evolu / expo-sqlite | Stall ms, expo-sqlite / evolu |",
      "| open-new | 18 (11–25) | 9 (6–12) | 0.5 | 3 / 3 |",
      "| sync-receive-3 | 18 (11–25) | 9 (6–12) | 0.438 | 3 / 3 |",
      "| sync-receive-3 | expo-sqlite | 18 | 16 | 2 | 2.5 |",
      "| sync-receive-3 | evolu | 9 | 7 | 2 | 2.5 |",
      "| evolu-start-new | expo-sqlite | 100, 200 | 18 |",
      "| evolu-start-new | evolu | 50, 70 | 9 |",
      "| Encrypt | 10 | 5.97 | 5.5 |",
      "| Decrypt | 5 | 2.99 | 3.5 |",
      "Timer floor, each session's timer-hop median: expo-sqlite 13 ms, evolu 8 ms, expo-sqlite 23 ms, evolu 10 ms.",
      "> Warning: the sessions' timer floors differ by more than 10%, 8 to 23 ms, so compare the cases that wait on timers only between sessions with the same floor, or as multiples of the hop: timer-hop, the sync cases, and in a build whose worker hops use setTimeout(0), every Evolu-level case.",
    ])
      assert(text.includes(`${expected}\n`), `${expected}\n\n${text}`);
    assertFalse(text.includes("alternate"));
  });

  it("doesn't warn when the sessions' timer floors are 10% apart", () => {
    const text = formatDeviceBenchSummary(
      summarizeDeviceBench([
        {
          device: "iPhone",
          lines: [
            ...setupSession({
              build: "expo-sqlite",
              startedAt: 1000,
              base: 10,
            }),
            ...setupSession({
              build: "evolu",
              startedAt: 2000,
              base: 5,
              offsets: { "timer-hop": 6.3 },
            }),
          ],
        },
      ]),
    );

    assert(
      text.includes(
        "Timer floor, each session's timer-hop median: expo-sqlite 13 ms, evolu 14.3 ms.\n",
      ),
      text,
    );
    assertFalse(text.includes("timer floors differ"));
  });

  it("warns when the sessions' timer floors are more than 10% apart", () => {
    const text = formatDeviceBenchSummary(
      summarizeDeviceBench([
        {
          device: "iPhone",
          lines: [
            ...setupSession({
              build: "expo-sqlite",
              startedAt: 1000,
              base: 10,
            }),
            ...setupSession({
              build: "evolu",
              startedAt: 2000,
              base: 5,
              offsets: { "timer-hop": 6.4 },
            }),
          ],
        },
      ]),
    );

    assert(
      text.includes("timer floors differ by more than 10%, 13 to 14.4 ms"),
      text,
    );
  });

  it("warns when the sessions don't alternate, and shows a missing build as a dash", () => {
    const [first, second] = setupLogs();
    const text = formatDeviceBenchSummary(
      summarizeDeviceBench([
        {
          device: "Pixel_10",
          lines: first.lines.slice(first.lines.length / 2),
        },
        {
          device: "Pixel_10",
          lines: second.lines.slice(second.lines.length / 2),
        },
        {
          device: "Simulator",
          lines: first.lines.slice(0, first.lines.length / 2),
        },
      ]),
    );

    for (const expected of [
      "> Warning: the sessions didn't alternate A, B, A, B: evolu, evolu.",
      "| open-new | — | 9 (6–12) | — | — / 3 |",
      "| Encrypt | — | 5.97 | 5.5 |",
      "| open-new | 13 (11–15) | — | — | 3 / — |",
      "| Encrypt | 10 | — | 5.5 |",
      "| Decrypt | 5 | — | 3.5 |",
    ])
      assert(text.includes(`${expected}\n`), `${expected}\n\n${text}`);
  });
});

describe("runDeviceBenchCli", () => {
  const setupFiles = (t: TestContext) => {
    const directory = mkdtempSync(join(tmpdir(), "evolu-device-bench-"));
    t.after(() => {
      rmSync(directory, { recursive: true, force: true });
    });
    const [first, second] = setupLogs();
    const files = {
      a: join(directory, "iphone-1.log"),
      b: join(directory, "iphone-2.log"),
      c: join(directory, "pixel-1.log"),
      json: join(directory, "summary.json"),
    };
    writeFileSync(files.a, first.lines.join("\n"));
    writeFileSync(files.b, `${second.lines.join("\r\n")}\r\n`);
    writeFileSync(
      files.c,
      setupSession({ build: "evolu", startedAt: 1, base: 5, line: brief }).join(
        "\n",
      ),
    );
    return files;
  };

  it("prints the table and writes the JSON, each log labeled by the last --device before it", (t) => {
    const files = setupFiles(t);
    const log = mock.method(console, "log", () => undefined);

    const code = runDeviceBenchCli([
      "--device=iPhone",
      `--log=${files.a}`,
      `--log=${files.b}`,
      "--device=Pixel_10",
      `--log=${files.c}`,
      `--json=${files.json}`,
    ]);
    log.mock.restore();

    assertEqual(code, 0);
    const printed = String(log.mock.calls[0].arguments[0]);
    assertTrue(printed.includes("## iPhone\n"));
    assertTrue(printed.includes("## Pixel_10\n"));
    const json = JSON.parse(readFileSync(files.json, "utf8")) as Record<
      string,
      { readonly order: ReadonlyArray<string> }
    >;
    assertEqual(Object.keys(json), ["iPhone", "Pixel_10"]);
    assertEqual(json.iPhone.order, [
      "expo-sqlite",
      "evolu",
      "expo-sqlite",
      "evolu",
    ]);
    assertEqual(json.Pixel_10.order, ["evolu"]);
  });

  it("refuses arguments it can't act on", (t) => {
    const files = setupFiles(t);
    for (const [args, message] of [
      [[], "Pass --device=<label> and then --log=<file>."],
      [[`--log=${files.a}`], "Pass --device=<label> before --log=<file>."],
      [
        ["--device=iPhone", `--log=${files.a}`, "--device=Pixel_10"],
        "Pass --log=<file> after --device=Pixel_10.",
      ],
      [
        [
          "--device=iPhone",
          `--log=${files.a}`,
          `--json=${files.json}`,
          `--json=${files.json}`,
        ],
        "Pass --json=<file> once.",
      ],
      [
        ["--device=iPhone", `--log=${files.a}`, "extra"],
        "Unexpected argument extra.",
      ],
      [["--device=", `--log=${files.a}`], "--device takes a label."],
      [
        ["--device=iPhone", "--device=Pixel_10", `--log=${files.a}`],
        "Pass --log=<file> after --device=iPhone.",
      ],
      [
        ["--device=iPhone", `--log=${files.a}`, "--", "--json=out"],
        "Unexpected argument --json=out.",
      ],
    ] as const)
      assertThrows(
        () => runDeviceBenchCli(args),
        (error) => {
          assertEqual((error as Error).message, message);
        },
      );
  });

  it("fails as a script on arguments it can't act on", () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("device-bench.mts", import.meta.url))],
      { encoding: "utf8" },
    );

    assertEqual(result.status, 1);
    assertTrue(
      result.stderr.includes("Pass --device=<label> and then --log=<file>."),
    );
  });
});
