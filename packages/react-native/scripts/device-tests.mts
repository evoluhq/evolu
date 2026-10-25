/**
 * Runs the device suites of `test/device/` in an example app that an app job
 * built and installed on a booted iOS simulator or Android emulator, and fails
 * unless the app ran as many tests as the suites register in Node.js on that
 * platform, every one passed, and the app then logged that it reloaded.
 *
 * - It stops the app, removes the reload marker an unfinished earlier run left,
 *   and seeds the fixtures into expo-sqlite's directory in the app's container:
 *   on iOS through `xcrun simctl get_app_container`, on Android with `adb
 *   root`, which a `google_apis` image allows, since a release build allows no
 *   `run-as`, then `chown` to the app's uid and `restorecon`.
 * - It reads the app's log, React Native's os_log subsystem on iOS and logcat's
 *   `ReactNativeJS` tag on Android, and opens the app at its URL, on iOS after
 *   approving the URL's scheme in the simulator, which would otherwise ask.
 * - It ends on the reload after the result, at once when the app's process dies,
 *   or hasn't started 30 seconds after it was opened, printing its crash, from
 *   the simulator's `.ips` reports on iOS and logcat's crash buffer on Android,
 *   or on a timeout.
 * - It refuses a container path that isn't absolute, and ends the run at once
 *   when the log stream exits, printing the stream's error.
 * - Every xcrun or adb command, and the log stream's first line, must come within
 *   60 seconds, so a wedged simulator or emulator fails the run too.
 *
 * Usage:
 *
 * - `node packages/react-native/scripts/device-tests.mts
 *   --write-fixtures=<directory>` writes the fixtures: for each expo-sqlite
 *   release whose SQLCipher Evolu supported, a database that SQLCipher, built
 *   on the host as `@evolu/sqlite-core`'s tests build it, created, and one that
 *   crashed with its hot journal at its fullest. It needs what those tests
 *   need.
 * - `node packages/react-native/scripts/device-tests.mts --platform=<ios or
 *   android> --device=<UDID or serial> --app=<bundle ID or package> --url=<URL>
 *   --fixtures=<directory>` runs the app, by default for at most 600 seconds,
 *   which `--timeout=<seconds>` changes.
 *
 * @module
 */
import {
  assertEqual,
  exhaustiveCheck,
  trySync,
  type NativeSqlite,
} from "@evolu/common";
import type { EvoluDeps } from "@evolu/common/local-first";
import {
  defaultBuildDirectory,
  defaultCacheDirectory,
} from "@evolu/sqlite-core/scripts/paths.mts";
import {
  buildSqlcipherFixture,
  expoSqliteReleases,
  runSqlcipherFixture,
} from "@evolu/sqlite-core/test/sqlcipher.mts";
import { type ChildProcessByStdio, spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { once } from "node:events";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import {
  deviceFixtureKey,
  deviceFixtureRows,
  deviceFixtures,
  deviceTestsMarker,
  deviceTestsTag,
  registerDeviceSuites,
  type DevicePlatform,
} from "../test/device/suites.ts";

/** A line the app's runner logs, as {@link parseDeviceTestsLine} reads it. */
export type DeviceTestsLine =
  | { readonly type: "Failed"; readonly text: string }
  | {
      readonly type: "Summary";
      readonly passed: number;
      readonly failed: number;
      readonly total: number;
    }
  | { readonly type: "Reloaded" };

/**
 * Reads a line the app's runner logged, wherever in a log line it is, or
 * returns null for any other line.
 */
export const parseDeviceTestsLine = (line: string): DeviceTestsLine | null => {
  const index = line.indexOf(`${deviceTestsTag} `);
  if (index === -1) return null;
  const text = line.slice(index + deviceTestsTag.length + 1);
  if (text === "reloaded") return { type: "Reloaded" };
  if (text.startsWith("failed: "))
    return { type: "Failed", text: text.slice("failed: ".length) };
  const summary = /^passed=(\d+) failed=(\d+) total=(\d+)$/u.exec(text);
  if (summary == null) return null;
  return {
    type: "Summary",
    passed: Number(summary[1]),
    failed: Number(summary[2]),
    total: Number(summary[3]),
  };
};

/**
 * The number of tests the suites register on `platform`, with a test function
 * that only counts them. Registering touches neither the binding nor
 * `createEvoluDeps`, so placeholders stand in for them.
 */
export const countDeviceTests = (platform: DevicePlatform): number => {
  let count = 0;
  registerDeviceSuites({
    platform,
    nativeSqlite: {} as NativeSqlite,
    databaseDirectory: "/",
    directory: "/",
    test: () => {
      count++;
    },
    assertEqual,
    createEvoluDeps: {} as () => EvoluDeps,
  });
  return count;
};

/**
 * Writes the fixtures into `directory`, each `evolu1-<name>.db` of
 * `test/device/suites.ts`'s `deviceFixtures`, with its `-journal` for one that
 * crashed.
 */
export const writeDeviceFixtures = async ({
  directory,
  cacheDirectory,
  buildDirectory,
}: {
  directory: string;
  cacheDirectory: string;
  buildDirectory: string;
}): Promise<void> => {
  const hexKey = Buffer.from(deviceFixtureKey).toString("hex");
  mkdirSync(directory, { recursive: true });
  mkdirSync(buildDirectory, { recursive: true });
  const work = mkdtempSync(join(buildDirectory, "device-fixtures-"));
  try {
    for (const { name, expoSqlite: version, crashed } of deviceFixtures) {
      const expoSqlite = expoSqliteReleases.find(
        (release) => release.version === version,
      );
      if (expoSqlite == null)
        throw new Error(
          `@evolu/sqlite-core builds no SQLCipher of expo-sqlite ${version}.`,
        );
      const fixture = await buildSqlcipherFixture({
        expoSqlite,
        cacheDirectory,
        buildDirectory,
      });
      const path = join(directory, `evolu1-${name}.db`);
      // A fixture an earlier write left would fail the create, or pass for the
      // hot journal no crash left this time.
      rmSync(path, { force: true });
      rmSync(`${path}-journal`, { force: true });
      const created = join(work, `${name}-created.db`);
      requireFixture(
        runSqlcipherFixture(fixture, [
          "create",
          crashed ? created : path,
          hexKey,
          String(deviceFixtureRows),
        ]),
        0,
      );
      if (!crashed) continue;
      // The transaction updates every row, so a crash at a later write leaves
      // more of it to roll back. The last write before the commit that leaves
      // a hot journal leaves the most.
      const updated = join(work, `${name}-updated.db`);
      const copy = join(work, `${name}-copy.db`);
      for (let write = 1; ; write++) {
        copyFileSync(created, updated);
        const crash = runSqlcipherFixture(fixture, [
          "crash",
          updated,
          hexKey,
          String(write),
          copy,
        ]);
        rmSync(`${updated}-journal`, { force: true });
        // Fewer writes than that: the transaction committed.
        if (crash.status === 0) break;
        requireFixture(crash, 3);
        const journal = `${copy}-journal`;
        if (existsSync(journal) && readFileSync(journal)[0] > 0) {
          copyFileSync(copy, path);
          copyFileSync(journal, `${path}-journal`);
        }
      }
      if (!existsSync(`${path}-journal`))
        throw new Error(
          `No crash of expo-sqlite ${version}'s SQLCipher left a hot journal.`,
        );
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};

const requireFixture = (
  result: ReturnType<typeof runSqlcipherFixture>,
  status: number,
): void => {
  if (result.status !== status || result.stderr !== "")
    throw new Error(
      `The SQLCipher fixture exited with ${String(result.status)}: ${result.stderr}`,
    );
};

/**
 * Seeds the fixtures in `fixturesDirectory` and runs the app at `url` on
 * `device`, as the module documentation describes, with `xcrun` or `adb`, and
 * returns whether it passed, with what to print.
 */
export const runDeviceTests = async ({
  platform,
  device,
  app,
  url,
  fixturesDirectory,
  expectedTotal,
  timeoutMilliseconds = 600_000,
  pollMilliseconds = 1000,
  launchMilliseconds = 30_000,
  crashReportMilliseconds = 60_000,
  commandMilliseconds = 60_000,
  xcrun = "xcrun",
  adb = "adb",
  crashReportsDirectory = join(homedir(), "Library/Logs/DiagnosticReports"),
}: {
  platform: DevicePlatform;
  device: string;
  app: string;
  url: string;
  fixturesDirectory: string;
  expectedTotal: number;
  timeoutMilliseconds?: number;
  pollMilliseconds?: number;
  /** How long an opened app may take to start before it counts as dead. */
  launchMilliseconds?: number;
  /** How long to wait for the crash report of a dead app on iOS. */
  crashReportMilliseconds?: number;
  /** How long a command, and the log stream's first line, may take. */
  commandMilliseconds?: number;
  xcrun?: string;
  adb?: string;
  /** Where the simulator writes the `.ips` reports of crashed apps. */
  crashReportsDirectory?: string;
}): Promise<{ readonly passed: boolean; readonly output: string }> => {
  const started = Date.now();
  const fixtures = readdirSync(fixturesDirectory)
    .toSorted()
    .map((file) => join(fixturesDirectory, file));
  const marker = `evolu1-${deviceTestsMarker}.db`;
  const spawnCommand = (command: string, args: ReadonlyArray<string>) => {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      timeout: commandMilliseconds,
      killSignal: "SIGKILL",
    });
    if (result.error != null)
      throw (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT"
        ? new Error(
            `${basename(command)} ${args.join(" ")} didn't finish within ${commandMilliseconds / 1000} s.`,
          )
        : result.error;
    return result;
  };
  const runCommand = (command: string, args: ReadonlyArray<string>): string => {
    const result = spawnCommand(command, args);
    if (result.status !== 0)
      throw new Error(
        `${command} exited with ${String(result.status)}\n${result.stdout}${result.stderr}`,
      );
    return result.stdout;
  };
  using disposer = new DisposableStack();
  let stream: ChildProcessByStdio<null, Readable, Readable>;
  let streamErrors = "";
  let isAlive: () => boolean;
  let opened: number;
  /**
   * The crash of the dead app, which a settled run's `signal` stops waiting
   * for.
   */
  let crash: (signal: AbortSignal) => Promise<string>;
  if (platform === "ios") {
    // A simulator without the app running fails the terminate, which is fine.
    spawnCommand(xcrun, ["simctl", "terminate", device, app]);
    const container = runCommand(xcrun, [
      "simctl",
      "get_app_container",
      device,
      app,
      "data",
    ]).trim();
    // A relative path would seed the current directory.
    if (!isAbsolute(container))
      throw new Error(
        `xcrun simctl get_app_container printed ${JSON.stringify(container)}, not an absolute path.`,
      );
    const directory = join(container, "Documents/SQLite");
    mkdirSync(directory, { recursive: true });
    rmSync(join(directory, marker), { force: true });
    for (const fixture of fixtures)
      copyFileSync(fixture, join(directory, basename(fixture)));
    stream = spawn(
      xcrun,
      [
        "simctl",
        "spawn",
        device,
        "log",
        "stream",
        "--level",
        "info",
        "--style",
        "compact",
        "--predicate",
        'subsystem == "com.facebook.react.log"',
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    disposer.defer(() => {
      stream.kill();
    });
    stream.stderr.on("data", (chunk: Buffer) => {
      streamErrors += chunk.toString();
    });
    await once(stream, "spawn");
    // A log stream shows only what is logged after it starts, which it prints
    // a line for.
    let silence: NodeJS.Timeout | undefined;
    await new Promise((resolve, reject) => {
      silence = setTimeout(() => {
        reject(
          new Error(
            `The log stream printed nothing within ${commandMilliseconds / 1000} s.`,
          ),
        );
      }, commandMilliseconds);
      stream.stdout.once("data", resolve);
      stream.once("error", reject);
      stream.once("close", (code) => {
        reject(
          new Error(
            `The log stream exited with ${String(code)} before its first line: ${streamErrors}`,
          ),
        );
      });
    }).finally(() => {
      clearTimeout(silence);
    });
    // A simulator asks before it opens an app at a URL whose scheme wasn't
    // approved there, and the app doesn't start until someone answers.
    runCommand(xcrun, [
      "simctl",
      "spawn",
      device,
      "defaults",
      "write",
      "com.apple.launchservices.schemeapproval",
      `com.apple.CoreSimulator.CoreSimulatorBridge-->${new URL(url).protocol.slice(0, -1)}`,
      "-string",
      app,
    ]);
    runCommand(xcrun, ["simctl", "openurl", device, url]);
    opened = performance.now();
    isAlive = () =>
      spawnCommand(xcrun, ["simctl", "spawn", device, "launchctl", "list"])
        .stdout.split("\n")
        .some((line) => {
          const [pid, , label = ""] = line.split("\t");
          return (
            /^\d+$/u.test(pid) && label.startsWith(`UIKitApplication:${app}[`)
          );
        });
    // ReportCrash writes the report seconds after the death, and the
    // simulator's daemons write reports of their own meanwhile.
    crash = async (signal) => {
      const deadline = performance.now() + crashReportMilliseconds;
      for (;;) {
        // A user that no app has crashed for yet has no directory.
        const reports = existsSync(crashReportsDirectory)
          ? readdirSync(crashReportsDirectory)
              .filter((file) => file.endsWith(".ips"))
              .flatMap((file) => {
                const path = join(crashReportsDirectory, file);
                // A report can go between the listing and its read.
                const report = trySync(() =>
                  statSync(path).mtimeMs >= started
                    ? readFileSync(path, "utf8")
                    : "",
                );
                if (!report.ok) return [];
                // An .ips report starts with a line of JSON about the app.
                const bundleID = trySync(
                  () =>
                    (
                      JSON.parse(report.value.split("\n")[0]) as {
                        bundleID?: unknown;
                      }
                    ).bundleID,
                );
                return bundleID.ok && bundleID.value === app
                  ? [`## ${file}\n${report.value}`]
                  : [];
              })
          : [];
        if (reports.length > 0) return reports.join("\n");
        if (performance.now() >= deadline) return "No crash report.";
        await sleep(500, undefined, { signal });
      }
    };
  } else {
    const adbRun = (...args: ReadonlyArray<string>): string =>
      runCommand(adb, ["-s", device, ...args]);
    // adb hands what follows shell to the device's shell as one command line,
    // which would end an unquoted URL at its &.
    const shell = (...args: ReadonlyArray<string>): string =>
      adbRun("shell", ...args.map(quoteForShell));
    const data = `/data/data/${app}`;
    const directory = `${data}/files/SQLite`;
    shell("am", "force-stop", app);
    adbRun("root");
    adbRun("wait-for-device");
    shell("mkdir", "-p", directory);
    shell("rm", "-f", `${directory}/${marker}`);
    adbRun("push", ...fixtures, `${directory}/`);
    const uid = shell("stat", "-c", "%u", data).trim();
    shell("chown", "-R", `${uid}:${uid}`, `${data}/files`);
    shell("restorecon", "-R", `${data}/files`);
    // logcat prints what the buffer holds before it follows, so it misses
    // nothing the app logged after the buffer was cleared.
    adbRun("logcat", "-c");
    shell(
      "am",
      "start",
      "-W",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      url,
      app,
    );
    opened = performance.now();
    stream = spawn(
      adb,
      ["-s", device, "logcat", "-v", "brief", "-s", "ReactNativeJS:V"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    disposer.defer(() => {
      stream.kill();
    });
    stream.stderr.on("data", (chunk: Buffer) => {
      streamErrors += chunk.toString();
    });
    await once(stream, "spawn");
    isAlive = () =>
      spawnCommand(adb, [
        "-s",
        device,
        "shell",
        ...["pidof", app].map(quoteForShell),
      ]).status === 0;
    crash = () =>
      Promise.resolve(
        adbRun("logcat", "-b", "crash", "-d").trimEnd() || "No crash report.",
      );
  }

  const seconds = `${timeoutMilliseconds / 1000} s`;
  const failures: Array<string> = [];
  let summary: Extract<DeviceTestsLine, { type: "Summary" }> | null = null;
  // Before the log is read, so a failure leaves no line to handle. An app that
  // ran and stopped died, and so did one that hasn't started within the launch
  // window, as when its native code fails to load.
  let wasAlive = isAlive();
  return await new Promise((resolve, reject) => {
    // Aborted once the run settles, so a crash wait ends with it.
    const settled = new AbortController();
    const stop = (): void => {
      settled.abort();
      clearInterval(poll);
      clearTimeout(timeout);
    };
    const finish = (passed: boolean, line: string): void => {
      stop();
      lines.close();
      resolve({
        passed,
        output: [...(passed ? [] : failures), line, ""].join("\n"),
      });
    };
    const fail = (error: Error): void => {
      stop();
      lines.close();
      reject(error);
    };
    const lines = createInterface({ input: stream.stdout });
    // The stream ends only when it fails, as when the device goes away, and
    // its lines come first.
    stream.once("close", (code) => {
      finish(
        false,
        `Device tests: the log stream exited with ${String(code)}: ${streamErrors.trimEnd()}`,
      );
    });
    stream.once("error", fail);
    lines.on("line", (line) => {
      const parsed = parseDeviceTestsLine(line);
      if (parsed == null) return;
      switch (parsed.type) {
        case "Failed":
          failures.push(parsed.text);
          // The runner logs no result after a failure of its own.
          if (parsed.text.startsWith("runner: "))
            finish(
              false,
              "Device tests: the app's runner failed outside any test.",
            );
          break;
        case "Summary":
          summary = parsed;
          if (parsed.failed > 0)
            finish(
              false,
              `Device tests: ${parsed.failed} of ${parsed.total} failed.`,
            );
          else if (parsed.total === 0)
            finish(false, "Device tests: the app ran no test.");
          else if (parsed.total !== expectedTotal)
            finish(
              false,
              `Device tests: the app ran ${parsed.total} tests, but Node counts ${expectedTotal}.`,
            );
          break;
        case "Reloaded":
          if (summary != null)
            finish(
              true,
              `Device tests: ${summary.total} of ${summary.total} passed, and the app reloaded.`,
            );
          break;
        // Only a new kind of line, which the compiler then flags, reaches it.
        /* node:coverage ignore next 2 */
        default:
          exhaustiveCheck(parsed);
      }
    });
    const poll = setInterval(() => {
      void (async () => {
        if (isAlive()) wasAlive = true;
        else if (wasAlive || performance.now() - opened >= launchMilliseconds) {
          // The stream's exit or a last line may still settle the run first.
          clearInterval(poll);
          clearTimeout(timeout);
          finish(
            false,
            `Device tests: the app died.\n${await crash(settled.signal)}`,
          );
        }
      })().catch(fail);
    }, pollMilliseconds);
    const timeout = setTimeout(() => {
      finish(
        false,
        summary == null
          ? `Device tests: no result within ${seconds}.`
          : `Device tests: ${summary.total} of ${summary.total} passed, but the app didn't log that it reloaded within ${seconds}.`,
      );
    }, timeoutMilliseconds);
  });
};

/**
 * Quotes an argument for the device's shell, which adb hands the arguments
 * after `shell` to as one command line.
 */
const quoteForShell = (argument: string): string =>
  `'${argument.replaceAll("'", `'\\''`)}'`;

/**
 * Runs the command line the module documentation describes and returns its exit
 * code.
 */
export const runDeviceTestsCli = async (
  args: ReadonlyArray<string>,
  options: {
    env?: NodeJS.ProcessEnv;
    xcrun?: string;
    adb?: string;
    crashReportsDirectory?: string;
  },
): Promise<number> => {
  const { values, tokens } = parseArgs({
    args: [...args],
    options: {
      "write-fixtures": { type: "string" },
      platform: { type: "string" },
      device: { type: "string" },
      app: { type: "string" },
      url: { type: "string" },
      fixtures: { type: "string" },
      timeout: { type: "string", default: "600" },
    },
    tokens: true,
  });
  const { platform, device, app, url, fixtures } = values;
  if (values["write-fixtures"] != null) {
    if (
      tokens.some(
        (token) => token.kind === "option" && token.name !== "write-fixtures",
      )
    )
      throw new Error("Pass --write-fixtures alone.");
    const env = options.env ?? process.env;
    await writeDeviceFixtures({
      directory: values["write-fixtures"],
      cacheDirectory: defaultCacheDirectory(env),
      buildDirectory: defaultBuildDirectory(env),
    });
    log(`Wrote the fixtures into ${values["write-fixtures"]}.`);
    return 0;
  }
  if (platform !== "ios" && platform !== "android")
    throw new Error("--platform takes ios or android.");
  if (device == null || app == null || url == null || fixtures == null)
    throw new Error("Pass --device, --app, --url and --fixtures.");
  const timeout = Number(values.timeout);
  if (!(timeout > 0))
    throw new Error("--timeout takes a positive number of seconds.");
  const { passed, output } = await runDeviceTests({
    platform,
    device,
    app,
    url,
    fixturesDirectory: fixtures,
    expectedTotal: countDeviceTests(platform),
    timeoutMilliseconds: timeout * 1000,
    ...options,
  });
  log(output.trimEnd());
  return passed ? 0 : 1;
};

const log = (message: string): void => {
  // oxlint-disable-next-line eslint/no-console -- Report CLI results.
  console.log(message);
};

if (import.meta.main)
  process.exitCode = await runDeviceTestsCli(process.argv.slice(2), {});
