/**
 * Summarizes what the benchmark route of `test/device/bench.ts` logged in
 * sessions on devices, Evolu's build against the expo-sqlite build it replaced,
 * and fails on a session that can't be compared.
 *
 * - It reads the route's lines wherever a log puts them: `log stream --style
 *   compact`, `logcat -v brief`, or rows copied from Console.app.
 * - A session starts at its `meta` line. Run 0 of each case is a warm-up, which
 *   only `evolu-start-new` reports, per session, as its cold start. Runs 1 to 5
 *   give each case's median and range, per session and pooled per build.
 * - It fails on a session in development or without `NODE_ENV` production, one
 *   without `meta` or `done`, or with a missing or duplicate run, a `failed`
 *   line, or another number of runs than Node counts for its sizes; on an Evolu
 *   session that reports a cipher, or an expo-sqlite one that reports none; on
 *   builds that differ in sizes, page size, journal mode, `synchronous` or
 *   `cache_size`; and on a build whose page files differ in page count.
 * - It orders each device's sessions by `startedAt`, and warns when they don't
 *   alternate.
 *
 * It reads no device: the sessions' logs are collected as the plan's M6
 * describes.
 *
 * Usage: `node packages/react-native/scripts/device-bench.mts --device=<label>
 * --log=<file> [--log=<file> …] [--device=<label> --log=<file> …]
 * [--json=<file>]`, where each log takes its device from the last `--device`
 * before it. It prints the Markdown table and, with `--json`, writes per device
 * `{ order, builds: { evolu, "expo-sqlite" } }`.
 *
 * @module
 */
import {
  array,
  assert,
  assertNonNullable,
  Boolean,
  Int,
  NonNegativeInt,
  NonNegativeNumber,
  nullOr,
  object,
  PositiveInt,
  String,
  trySync,
  union,
  type InferType,
  type ReadonlyRecord,
  type Result,
  type Typed,
} from "@evolu/common";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  deviceBenchRunsPerCase,
  deviceBenchTag,
  registerDeviceBenchCases,
  type DeviceBenchBuild,
  type DeviceBenchContext,
  type DeviceBenchSizes,
} from "../test/device/bench.ts";

const DeviceBenchSizesType = object({
  rows: PositiveInt,
  pageRows: PositiveInt,
  mutations: array(PositiveInt),
  syncMessages: array(PositiveInt),
  timerHops: PositiveInt,
});

const DeviceBenchMeta = object({
  build: union("evolu", "expo-sqlite"),
  platform: String,
  os: String,
  dev: Boolean,
  nodeEnv: nullOr(String),
  startedAt: NonNegativeInt,
  memory: nullOr(String),
  sizes: DeviceBenchSizesType,
  sqliteVersion: String,
  cipherVersion: nullOr(String),
  cipherProvider: nullOr(String),
  pageSize: PositiveInt,
  journalMode: String,
  synchronous: NonNegativeInt,
  cacheSize: Int,
  secureDelete: NonNegativeInt,
  idleMedianGapMs: NonNegativeNumber,
  idleLongestGapMs: NonNegativeNumber,
});
export interface DeviceBenchMeta extends InferType<typeof DeviceBenchMeta> {}

const measuredProps = {
  case: String,
  run: NonNegativeInt,
  ms: NonNegativeNumber,
  stallMs: NonNegativeNumber,
  heapBytes: nullOr(NonNegativeNumber),
};

const PlainRun = object(measuredProps);
interface PlainRun extends InferType<typeof PlainRun> {}

const PageRun = object({ ...measuredProps, pages: PositiveInt });
interface PageRun extends InferType<typeof PageRun> {}

const SyncRun = object({
  ...measuredProps,
  relayMs: NonNegativeNumber,
  relayMaxMs: NonNegativeNumber,
});
interface SyncRun extends InferType<typeof SyncRun> {}

/** A `run` line, whose fields its case's kind gives. */
export type DeviceBenchRun = PlainRun | PageRun | SyncRun;

const OptionLine = object({ option: String });
const FailedLine = object({ case: String, message: String });
const DoneLine = object({ runs: NonNegativeInt, failed: NonNegativeInt });
const HoldingLine = object({ memory: String });

/** A line the bench logs, as {@link parseDeviceBenchLine} reads it. */
export type DeviceBenchLine =
  | { readonly type: "Meta"; readonly meta: DeviceBenchMeta }
  | { readonly type: "Option"; readonly option: string }
  | { readonly type: "Run"; readonly run: DeviceBenchRun }
  | { readonly type: "Failed"; readonly case: string; readonly message: string }
  | { readonly type: "Done"; readonly runs: number; readonly failed: number }
  | { readonly type: "Holding"; readonly memory: string };

/**
 * Reads a line the bench logged, wherever in a log line its tag is, or returns
 * null for any other line. Bad JSON, an unknown keyword, or a missing or extra
 * key throws an error that names the line, so a typo can't drop a run.
 */
export const parseDeviceBenchLine = (line: string): DeviceBenchLine | null => {
  const index = line.indexOf(`${deviceBenchTag} `);
  if (index === -1) return null;
  const rest = line.slice(index + deviceBenchTag.length + 1);
  const space = rest.indexOf(" ");
  const keyword = space === -1 ? rest.trimEnd() : rest.slice(0, space);
  // A row copied from Console.app can have columns after its message, which a
  // tab separates, and JSON escapes every tab it holds.
  const text =
    space === -1
      ? ""
      : rest
          .slice(space + 1)
          .split("\t")[0]
          .trimEnd();
  const fail = (problem: string): never => {
    throw new Error(`${problem} in the bench line ${JSON.stringify(line)}.`);
  };
  const parsed = trySync(() => JSON.parse(text) as unknown);
  if (!parsed.ok) return fail("Bad JSON");
  const json = parsed.value;
  const read = <T,>(type: {
    readonly fromUnknown: (value: unknown) => Result<T, unknown>;
  }): T => {
    const result = type.fromUnknown(json);
    return result.ok ? result.value : fail("Unexpected fields");
  };
  switch (keyword) {
    case "meta":
      return { type: "Meta", meta: read(DeviceBenchMeta) };
    case "option":
      return { type: "Option", ...read(OptionLine) };
    case "run": {
      const name = (json as { readonly case?: unknown } | null)?.case;
      const kind = typeof name === "string" ? caseKind(name) : "Plain";
      return {
        type: "Run",
        run:
          kind === "Page"
            ? read(PageRun)
            : kind === "Sync"
              ? read(SyncRun)
              : read(PlainRun),
      };
    }
    case "failed":
      return { type: "Failed", ...read(FailedLine) };
    case "done":
      return { type: "Done", ...read(DoneLine) };
    case "holding":
      return { type: "Holding", ...read(HoldingLine) };
    default:
      return fail(`The unknown keyword ${JSON.stringify(keyword)}`);
  }
};

/** The runner names its page cases `page-…` and its sync cases `sync-receive-…`. */
const caseKind = (name: string): "Plain" | "Page" | "Sync" =>
  name.startsWith("page-")
    ? "Page"
    : name.startsWith("sync-receive-")
      ? "Sync"
      : "Plain";

/** The cases the bench registers for `sizes`, in order, without running them. */
const deviceBenchCaseNames = (
  sizes: DeviceBenchSizes,
): ReadonlyArray<string> => {
  const names: Array<string> = [];
  registerDeviceBenchCases({
    sizes,
    context: {} as DeviceBenchContext,
    benchCase: ({ name }) => {
      names.push(name);
    },
  });
  return names;
};

/**
 * The runs a session of `sizes` logs: the number of cases the bench registers,
 * times six.
 */
export const countDeviceBenchRuns = (sizes: DeviceBenchSizes): number =>
  deviceBenchCaseNames(sizes).length * deviceBenchRunsPerCase;

/** A median and range. */
export interface DeviceBenchStats {
  readonly median: number;
  readonly min: number;
  readonly max: number;
}

interface DeviceBenchCaseTimes extends DeviceBenchStats {
  /** The `ms` of runs 1 to 5 of every session, in session order. */
  readonly runs: ReadonlyArray<number>;
  readonly sessionMedians: ReadonlyArray<number>;
  readonly stallMs: DeviceBenchStats;
  /** The median, or null when the runtime reports no heap. */
  readonly heapBytes: number | null;
}

/** A case's runs 1 to 5, pooled per build. */
export type DeviceBenchCaseSummary =
  | (DeviceBenchCaseTimes & Typed<"Plain">)
  | (DeviceBenchCaseTimes & Typed<"Page"> & { readonly pages: number })
  | (DeviceBenchCaseTimes &
      Typed<"Sync"> & {
        /** `ms − relayMs`, the relay running on the same JS thread. */
        readonly syncMs: DeviceBenchStats;
        readonly relayMs: DeviceBenchStats;
        readonly relayMaxMs: number;
      });

export interface DeviceBenchBuildSummary {
  /** The meta of the build's first session. */
  readonly meta: DeviceBenchMeta;
  readonly options: ReadonlyArray<string>;
  readonly cases: ReadonlyRecord<string, DeviceBenchCaseSummary>;
  /** Each session's `evolu-start-new` run 0. */
  readonly coldStart: ReadonlyArray<number>;
  /** (encrypted ms − plaintext ms) / page count, of the medians, in µs. */
  readonly pageEncryptUs: number;
  readonly pageDecryptUs: number;
}

export interface DeviceBenchDeviceSummary {
  /** The builds of the sessions, ordered by `startedAt`. */
  readonly order: ReadonlyArray<DeviceBenchBuild>;
  readonly builds: {
    readonly evolu: DeviceBenchBuildSummary | null;
    readonly "expo-sqlite": DeviceBenchBuildSummary | null;
  };
}

export type DeviceBenchSummary = ReadonlyRecord<
  string,
  DeviceBenchDeviceSummary
>;

interface Session {
  readonly meta: DeviceBenchMeta;
  readonly options: Array<string>;
  readonly runs: Array<DeviceBenchRun>;
  readonly failed: Array<{ readonly case: string; readonly message: string }>;
  done: { readonly runs: number } | null;
}

/**
 * Summarizes the logs, each labeled by its device, as the module documentation
 * describes, and throws on a session that can't be compared.
 */
export const summarizeDeviceBench = (
  logs: ReadonlyArray<{
    readonly device: string;
    readonly lines: ReadonlyArray<string>;
  }>,
): DeviceBenchSummary => {
  const sessionsByDevice = new Map<string, Array<Session>>();
  for (const { device, lines } of logs) {
    const sessions = sessionsByDevice.get(device) ?? [];
    sessionsByDevice.set(device, sessions);
    let session: Session | null = null;
    for (const line of lines) {
      const parsed = parseDeviceBenchLine(line);
      if (parsed == null) continue;
      if (parsed.type === "Meta") {
        session = {
          meta: parsed.meta,
          options: [],
          runs: [],
          failed: [],
          done: null,
        };
        sessions.push(session);
        continue;
      }
      if (session == null)
        throw new Error(`${device}: a bench line before any session's meta.`);
      switch (parsed.type) {
        case "Option":
          session.options.push(parsed.option);
          break;
        case "Run":
          session.runs.push(parsed.run);
          break;
        case "Failed":
          session.failed.push(parsed);
          break;
        case "Done":
          session.done = parsed;
          break;
        // A memory launch, whose session has no done line.
        case "Holding":
          break;
      }
    }
  }

  const summary: Record<string, DeviceBenchDeviceSummary> = {};
  for (const [device, unordered] of sessionsByDevice) {
    const sessions = unordered.toSorted(
      (a, b) => a.meta.startedAt - b.meta.startedAt,
    );
    const describe = ({ meta }: Session): string =>
      `the ${meta.build} session of ${new Date(meta.startedAt).toISOString()}`;
    for (const session of sessions) {
      const { meta } = session;
      const fail = (problem: string): never => {
        throw new Error(`${device}: ${describe(session)} ${problem}`);
      };
      const [failure] = session.failed;
      if (failure != null) fail(`failed: ${failure.case}: ${failure.message}`);
      if (meta.dev) fail("ran with __DEV__ true.");
      if (meta.nodeEnv !== "production")
        fail(
          `ran with NODE_ENV ${JSON.stringify(meta.nodeEnv)}, not production.`,
        );
      const expected = countDeviceBenchRuns(meta.sizes);
      if (session.done == null) fail("has no done line.");
      else if (session.done.runs !== expected)
        fail(`ran ${session.done.runs} runs, but Node counts ${expected}.`);
      const names = deviceBenchCaseNames(meta.sizes);
      const seen = new Set<string>();
      for (const { case: name, run } of session.runs) {
        const key = `${name} ${run}`;
        if (!names.includes(name) || run >= deviceBenchRunsPerCase)
          fail(`has run ${run} of ${name}, which the runner doesn't run.`);
        if (seen.has(key)) fail(`has run ${run} of ${name} twice.`);
        seen.add(key);
      }
      for (const name of names)
        for (let run = 0; run < deviceBenchRunsPerCase; run++)
          if (!seen.has(`${name} ${run}`))
            fail(`has no run ${run} of ${name}.`);
      if (meta.build === "evolu" && meta.cipherVersion != null)
        fail(
          `reports the cipher ${JSON.stringify(meta.cipherVersion)}, which only expo-sqlite's SQLCipher has.`,
        );
      if (meta.build === "expo-sqlite" && meta.cipherVersion == null)
        fail("reports no cipher, so its expo-sqlite has no SQLCipher.");
      const [first] = sessions;
      for (const key of [
        "sizes",
        "pageSize",
        "journalMode",
        "synchronous",
        "cacheSize",
      ] as const)
        if (JSON.stringify(meta[key]) !== JSON.stringify(first.meta[key]))
          throw new Error(
            `${device}: ${describe(session)} differs from ${describe(first)} in ${key}.`,
          );
    }

    const summarizeBuild = (
      build: DeviceBenchBuild,
    ): DeviceBenchBuildSummary | null => {
      const ofBuild = sessions.filter(({ meta }) => meta.build === build);
      const [first] = ofBuild;
      if (first == null) return null;
      const pageCounts = new Set(
        ofBuild.flatMap(({ runs }) =>
          runs.flatMap((run) => ("pages" in run ? [run.pages] : [])),
        ),
      );
      if (pageCounts.size > 1)
        throw new Error(
          `${device}: ${build}'s page files differ in page count: ${[...pageCounts].toSorted((a, b) => a - b).join(" and ")}.`,
        );
      const cases: Record<string, DeviceBenchCaseSummary> = {};
      for (const name of deviceBenchCaseNames(first.meta.sizes)) {
        const runsBySession = ofBuild.map(({ runs }) =>
          runs.filter((run) => run.case === name && run.run > 0),
        );
        const runs = runsBySession.flat();
        const heap = runs.flatMap(({ heapBytes }) =>
          heapBytes == null ? [] : [heapBytes],
        );
        const times: DeviceBenchCaseTimes = {
          ...stats(runs.map(({ ms }) => ms)),
          runs: runs.map(({ ms }) => ms),
          sessionMedians: runsBySession.map(
            (sessionRuns) => stats(sessionRuns.map(({ ms }) => ms)).median,
          ),
          stallMs: stats(runs.map(({ stallMs }) => stallMs)),
          heapBytes: heap.length === 0 ? null : stats(heap).median,
        };
        const syncRuns = runs.filter((run): run is SyncRun => "relayMs" in run);
        cases[name] =
          caseKind(name) === "Page"
            ? { type: "Page", ...times, pages: [...pageCounts][0] }
            : caseKind(name) === "Sync"
              ? {
                  type: "Sync",
                  ...times,
                  syncMs: stats(
                    syncRuns.map(({ ms, relayMs }) => ms - relayMs),
                  ),
                  relayMs: stats(syncRuns.map(({ relayMs }) => relayMs)),
                  relayMaxMs: Math.max(
                    ...syncRuns.map(({ relayMaxMs }) => relayMaxMs),
                  ),
                }
              : { type: "Plain", ...times };
      }
      const perPage = (encrypted: string, plain: string): number =>
        ((cases[encrypted].median - cases[plain].median) * 1000) /
        [...pageCounts][0];
      return {
        meta: first.meta,
        options: first.options,
        cases,
        coldStart: ofBuild.flatMap(({ runs }) =>
          runs.flatMap((run) =>
            run.case === "evolu-start-new" && run.run === 0 ? [run.ms] : [],
          ),
        ),
        pageEncryptUs: perPage("page-write-encrypted", "page-write-plain"),
        pageDecryptUs: perPage("page-read-encrypted", "page-read-plain"),
      };
    };

    summary[device] = {
      order: sessions.map(({ meta }) => meta.build),
      builds: {
        evolu: summarizeBuild("evolu"),
        "expo-sqlite": summarizeBuild("expo-sqlite"),
      },
    };
  }
  return summary;
};

const stats = (values: ReadonlyArray<number>): DeviceBenchStats => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    median:
      sorted.length % 2 === 1
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
};

/**
 * M0's direct figures on the iPhone 16e, the core's page encrypt and decrypt
 * outside SQLite.
 */
const m0PageUs = { encrypt: 5.5, decrypt: 3.5 };

/**
 * Prints each device's Markdown table, B against A per case, with the sync
 * cases' ratio from `ms − relayMs`, the cold starts and the page figures beside
 * M0's, and a warning when the sessions didn't alternate.
 */
export const formatDeviceBenchSummary = (
  summary: DeviceBenchSummary,
): string => {
  const out: Array<string> = [];
  for (const [device, { order, builds }] of Object.entries(summary)) {
    const a = builds["expo-sqlite"];
    const b = builds.evolu;
    out.push(`## ${device}`, "", `Sessions: ${order.join(", ")}.`, "");
    // A frame clock can change between sessions, as the arm64 emulator's did
    // between about 30 and 60 Hz, and every Evolu-level case waits on it.
    const timerHops = { evolu: 0, "expo-sqlite": 0 };
    const floors = order.map((build) => {
      // Each build in the order has its sessions' summary.
      const ofBuild = builds[build];
      assertNonNullable(ofBuild);
      return ofBuild.cases["timer-hop"].sessionMedians[timerHops[build]++];
    });
    out.push(
      `Timer floor, each session's timer-hop median: ${order.map((build, index) => `${build} ${format(floors[index])} ms`).join(", ")}.`,
      "",
    );
    const [lowest, highest] = [Math.min(...floors), Math.max(...floors)];
    if (highest > lowest * 1.1)
      out.push(
        `> Warning: the sessions' timer floors differ by more than 10%, ${format(lowest)} to ${format(highest)} ms, so compare the Evolu-level cases only between sessions with the same floor, or as multiples of the hop.`,
        "",
      );
    if (order.some((build, index) => index > 0 && build === order[index - 1]))
      out.push(
        `> Warning: the sessions didn't alternate A, B, A, B: ${order.join(", ")}.`,
        "",
      );
    // A device has a session, so a build.
    const shown = a ?? b;
    assertNonNullable(shown);
    const names = Object.keys(shown.cases);
    const ratio = (x: number | undefined, y: number | undefined): string =>
      x == null || y == null ? "—" : format(y / x);
    out.push(
      "| Case | expo-sqlite ms | evolu ms | evolu / expo-sqlite | Stall ms, expo-sqlite / evolu |",
      "| ---- | -------------- | -------- | ------------------- | ----------------------------- |",
    );
    for (const name of names) {
      const x = a?.cases[name];
      const y = b?.cases[name];
      const range = (c: DeviceBenchCaseSummary | undefined): string =>
        c == null
          ? "—"
          : `${format(c.median)} (${format(c.min)}–${format(c.max)})`;
      const syncMedian = (
        c: DeviceBenchCaseSummary | undefined,
      ): number | undefined =>
        c == null ? undefined : c.type === "Sync" ? c.syncMs.median : c.median;
      out.push(
        `| ${name} | ${range(x)} | ${range(y)} | ${ratio(syncMedian(x), syncMedian(y))} | ${x == null ? "—" : format(x.stallMs.median)} / ${y == null ? "—" : format(y.stallMs.median)} |`,
      );
    }
    out.push(
      "",
      "Sync cases, whose ratio above is of `ms − relayMs`, the relay running on the same JS thread:",
      "",
      "| Case | Build | ms | ms − relayMs | relayMs | relayMaxMs |",
      "| ---- | ----- | -- | ------------ | ------- | ---------- |",
    );
    for (const name of names)
      for (const [build, summaryOfBuild] of [
        ["expo-sqlite", a],
        ["evolu", b],
      ] as const) {
        const c = summaryOfBuild?.cases[name];
        if (c?.type === "Sync")
          out.push(
            `| ${name} | ${build} | ${format(c.median)} | ${format(c.syncMs.median)} | ${format(c.relayMs.median)} | ${format(c.relayMaxMs)} |`,
          );
      }
    out.push(
      "",
      "| Case | Build | Cold start ms, per session | Warm median ms |",
      "| ---- | ----- | -------------------------- | -------------- |",
    );
    for (const [build, summaryOfBuild] of [
      ["expo-sqlite", a],
      ["evolu", b],
    ] as const)
      if (summaryOfBuild != null)
        out.push(
          `| evolu-start-new | ${build} | ${summaryOfBuild.coldStart.map(format).join(", ")} | ${format(summaryOfBuild.cases["evolu-start-new"].median)} |`,
        );
    out.push(
      "",
      "| Page | expo-sqlite µs | evolu µs | M0's direct iPhone µs |",
      "| ---- | -------------- | -------- | --------------------- |",
      `| Encrypt | ${a == null ? "—" : format(a.pageEncryptUs)} | ${b == null ? "—" : format(b.pageEncryptUs)} | ${format(m0PageUs.encrypt)} |`,
      `| Decrypt | ${a == null ? "—" : format(a.pageDecryptUs)} | ${b == null ? "—" : format(b.pageDecryptUs)} | ${format(m0PageUs.decrypt)} |`,
      "",
    );
  }
  return out.join("\n");
};

/** Three significant digits. */
const format = (value: number): string =>
  Number(value.toPrecision(3)).toString();

/**
 * Runs the command line the module documentation describes and returns its exit
 * code. It refuses arguments it can't act on.
 */
export const runDeviceBenchCli = (args: ReadonlyArray<string>): number => {
  const { tokens } = parseArgs({
    args: [...args],
    options: {
      device: { type: "string", multiple: true },
      log: { type: "string", multiple: true },
      json: { type: "string", multiple: true },
    },
    allowPositionals: true,
    tokens: true,
  });
  const logs: Array<{ device: string; lines: ReadonlyArray<string> }> = [];
  let device: string | null = null;
  let deviceLogs = 0;
  let json: string | null = null;
  for (const token of tokens) {
    if (token.kind === "positional")
      throw new Error(`Unexpected argument ${token.value}.`);
    if (token.kind !== "option") continue;
    const { value } = token;
    assert(value != null, "parseArgs requires a string option's value.");
    switch (token.name) {
      case "device":
        if (device != null && deviceLogs === 0)
          throw new Error(`Pass --log=<file> after --device=${device}.`);
        if (value === "") throw new Error("--device takes a label.");
        device = value;
        deviceLogs = 0;
        break;
      case "log":
        if (device == null)
          throw new Error("Pass --device=<label> before --log=<file>.");
        logs.push({ device, lines: readFileSync(value, "utf8").split("\n") });
        deviceLogs++;
        break;
      case "json":
        if (json != null) throw new Error("Pass --json=<file> once.");
        json = value;
        break;
    }
  }
  if (device != null && deviceLogs === 0)
    throw new Error(`Pass --log=<file> after --device=${device}.`);
  if (logs.length === 0)
    throw new Error("Pass --device=<label> and then --log=<file>.");
  const summary = summarizeDeviceBench(logs);
  // oxlint-disable-next-line eslint/no-console -- Report CLI results.
  console.log(formatDeviceBenchSummary(summary));
  if (json != null)
    writeFileSync(json, `${JSON.stringify(summary, null, 2)}\n`);
  return 0;
};

if (import.meta.main)
  process.exitCode = runDeviceBenchCli(process.argv.slice(2));
