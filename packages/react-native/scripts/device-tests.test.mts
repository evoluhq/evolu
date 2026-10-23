/**
 * The device driver against a fake xcrun and adb, shell scripts that record
 * their commands, answer for a simulator or an emulator, and stream the lines a
 * test gives as the app's log once the app is opened, so it needs no device,
 * and test:unit runs it too. The app jobs run the real one.
 */
import { assertEqual, assertRejects, assertTrue } from "@evolu/common";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { setTimeout } from "node:timers/promises";
import { join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import {
  countDeviceTests,
  parseDeviceTestsLine,
  runDeviceTests,
  runDeviceTestsCli,
} from "./device-tests.mts";

describe("parseDeviceTestsLine", () => {
  it("reads the app's lines wherever the log puts them, and nothing else", () => {
    assertEqual(
      [
        "EvoluNativeTests passed=3 failed=1 total=4",
        "2026-10-23 12:00:00.000 I  expoapp[123:456] [javascript] EvoluNativeTests passed=0 failed=0 total=0",
        "EvoluNativeTests failed: opens a file: Expected values to be equal.",
        "I/ReactNativeJS( 4242): EvoluNativeTests reloaded",
        "EvoluNativeTests passed=3 failed=x total=4",
        "EvoluNativeTests passed=3",
        "EvoluNativeTests other",
        "Running EvoluRN",
      ].map(parseDeviceTestsLine),
      [
        { type: "Summary", passed: 3, failed: 1, total: 4 },
        { type: "Summary", passed: 0, failed: 0, total: 0 },
        { type: "Failed", text: "opens a file: Expected values to be equal." },
        { type: "Reloaded" },
        null,
        null,
        null,
        null,
      ],
    );
  });
});

describe("countDeviceTests", () => {
  it("counts what the suites register on each platform, without running them", () => {
    const ios = countDeviceTests("ios");
    const android = countDeviceTests("android");

    assertTrue(ios > 40);
    assertEqual(ios, android);
  });
});

for (const platform of ["ios", "android"] as const)
  describe(`runDeviceTests on ${platform}`, () => {
    it("passes when the app logs every test passed, the total Node counts, and then that it reloaded, after seeding the fixtures into expo-sqlite's directory", async (t) => {
      const fake = setupFakeDevice(t, platform);
      fake.log([
        "Running app",
        "EvoluNativeTests passed=3 failed=0 total=3",
        "EvoluNativeTests reloaded",
      ]);

      // The marker of an earlier run the app didn't finish, which would make
      // it log that it reloaded and run nothing.
      if (platform === "ios") {
        mkdirSync(join(fake.directory, "container/Documents/SQLite"), {
          recursive: true,
        });
        writeFileSync(
          join(
            fake.directory,
            "container/Documents/SQLite/evolu1-native-tests-reload.db",
          ),
          "",
        );
      }

      const result = await fake.run({ expectedTotal: 3 });

      assertEqual(result, {
        passed: true,
        output: "Device tests: 3 of 3 passed, and the app reloaded.\n",
      });
      assertEqual(fake.commands(), fake.expectedCommands);
      if (platform === "ios")
        assertEqual(
          readdirSync(join(fake.directory, "container/Documents/SQLite")),
          ["evolu1-a.db", "evolu1-b.db", "evolu1-b.db-journal"],
        );
    });

    it("fails with each failed test's line", async (t) => {
      const fake = setupFakeDevice(t, platform);
      fake.log([
        "EvoluNativeTests failed: opens a file: Expected values to be equal.",
        "EvoluNativeTests passed=2 failed=1 total=3",
        "EvoluNativeTests reloaded",
      ]);

      assertEqual(await fake.run({ expectedTotal: 3 }), {
        passed: false,
        output:
          "opens a file: Expected values to be equal.\nDevice tests: 1 of 3 failed.\n",
      });
    });

    it("fails when the app ran another number of tests than Node counts", async (t) => {
      const fake = setupFakeDevice(t, platform);
      fake.log([
        "EvoluNativeTests passed=2 failed=0 total=2",
        "EvoluNativeTests reloaded",
      ]);

      assertEqual(await fake.run({ expectedTotal: 3 }), {
        passed: false,
        output: "Device tests: the app ran 2 tests, but Node counts 3.\n",
      });
    });

    it("fails when the app ran no test, even when Node counts none", async (t) => {
      const fake = setupFakeDevice(t, platform);
      fake.log([
        "EvoluNativeTests passed=0 failed=0 total=0",
        "EvoluNativeTests reloaded",
      ]);

      assertEqual(await fake.run({ expectedTotal: 0 }), {
        passed: false,
        output: "Device tests: the app ran no test.\n",
      });
    });

    it("fails when the log ends without a result", async (t) => {
      const fake = setupFakeDevice(t, platform);
      fake.log(["Running app"]);

      assertEqual(await fake.run({ expectedTotal: 3, timeout: 1 }), {
        passed: false,
        output: "Device tests: no result within 1 s.\n",
      });
    });

    it("fails when the app doesn't log that it reloaded", async (t) => {
      const fake = setupFakeDevice(t, platform);
      fake.log(["EvoluNativeTests passed=3 failed=0 total=3"]);

      assertEqual(await fake.run({ expectedTotal: 3, timeout: 1 }), {
        passed: false,
        output:
          "Device tests: 3 of 3 passed, but the app didn't log that it reloaded within 1 s.\n",
      });
    });

    it("fails when the app dies as it launches, printing its crash", async (t) => {
      const fake = setupFakeDevice(t, platform, { launches: false });
      fake.log(["@die"]);

      assertEqual(
        await fake.run({ expectedTotal: 3, launchMilliseconds: 100 }),
        {
          passed: false,
          output: `Device tests: the app died.\n${fake.crash}\n`,
        },
      );
    });

    it("fails at once when the app's runner fails outside any test", async (t) => {
      const fake = setupFakeDevice(t, platform);
      fake.log([
        "EvoluNativeTests failed: runner: Evolu's native module EvoluApp isn't in this native build.",
      ]);

      assertEqual(await fake.run({ expectedTotal: 3 }), {
        passed: false,
        output:
          "runner: Evolu's native module EvoluApp isn't in this native build.\nDevice tests: the app's runner failed outside any test.\n",
      });
    });

    it("waits on a reloaded line that comes before any result, as from a marker an earlier run left", async (t) => {
      const fake = setupFakeDevice(t, platform);
      fake.log(["EvoluNativeTests reloaded"]);

      assertEqual(await fake.run({ expectedTotal: 3, timeout: 1 }), {
        passed: false,
        output: "Device tests: no result within 1 s.\n",
      });
    });

    it("fails when a command doesn't finish within its limit", async (t) => {
      const fake = setupFakeDevice(t, platform, { hangs: "seeding" });

      await assertRejects(
        fake.run({ expectedTotal: 3, commandMilliseconds: 1000 }),
        (error) => {
          assertEqual(
            (error as Error).message,
            platform === "ios"
              ? "xcrun simctl get_app_container SIM com.evolu.test data didn't finish within 1 s."
              : "adb -s emulator-5554 shell 'stat' '-c' '%u' '/data/data/com.evolu.test' didn't finish within 1 s.",
          );
        },
      );
    });

    it("fails when the first check that the app runs doesn't finish within its limit, ignoring the lines that follow", async (t) => {
      const fake = setupFakeDevice(t, platform, { hangs: "liveness" });
      fake.log([
        "EvoluNativeTests passed=3 failed=0 total=3",
        "EvoluNativeTests reloaded",
      ]);

      await assertRejects(
        fake.run({ expectedTotal: 3, commandMilliseconds: 1000 }),
        (error) => {
          assertEqual(
            (error as Error).message,
            platform === "ios"
              ? "xcrun simctl spawn SIM launchctl list didn't finish within 1 s."
              : "adb -s emulator-5554 shell 'pidof' 'com.evolu.test' didn't finish within 1 s.",
          );
        },
      );
      // A line read after the failure must throw nothing.
      await setTimeout(200);
    });

    it("fails at once when the log stream exits during the run, with its error", async (t) => {
      const fake = setupFakeDevice(t, platform);
      fake.log(["Running app", "@exit 3"]);

      assertEqual(await fake.run({ expectedTotal: 3 }), {
        passed: false,
        output:
          "Device tests: the log stream exited with 3: The device went away.\n",
      });
    });

    it("rejects when the log stream can't start", async (t) => {
      const fake = setupFakeDevice(t, platform, { streamSpawnFails: true });
      fake.log(["Running app"]);

      await assertRejects(fake.run({ expectedTotal: 3 }), (error) => {
        assertEqual((error as NodeJS.ErrnoException).code, "EACCES");
      });
    });

    it("throws when the platform's tool is missing", async (t) => {
      const fake = setupFakeDevice(t, platform);
      rmSync(join(fake.directory, platform === "ios" ? "xcrun" : "adb"));

      await assertRejects(fake.run({ expectedTotal: 3 }), (error) => {
        assertEqual((error as NodeJS.ErrnoException).code, "ENOENT");
      });
    });

    it("says so when the app dies without a crash report", async (t) => {
      const fake = setupFakeDevice(t, platform, { crashReport: false });
      fake.log(["Running app", "@sleep 0.3", "@die"]);

      assertEqual(await fake.run({ expectedTotal: 3 }), {
        passed: false,
        output: "Device tests: the app died.\nNo crash report.\n",
      });
    });

    it("fails at once when the app dies, printing its crash", async (t) => {
      const fake = setupFakeDevice(t, platform);
      fake.log(["Running app", "@sleep 0.3", "@die"]);
      const started = performance.now();

      const result = await fake.run({ expectedTotal: 3 });

      assertTrue(performance.now() - started < 10_000);
      assertEqual(result, {
        passed: false,
        output: `Device tests: the app died.\n${fake.crash}\n`,
      });
    });
  });

describe("runDeviceTests on ios, failing to start", () => {
  it("refuses a container that isn't an absolute path, seeding nothing", async (t) => {
    const fake = setupFakeDevice(t, "ios", { printsNoContainer: true });
    // A relative path would seed the current directory's.
    const cwd = process.cwd();
    process.chdir(fake.directory);
    t.after(() => {
      process.chdir(cwd);
    });

    await assertRejects(fake.run({ expectedTotal: 3 }), (error) => {
      assertEqual(
        (error as Error).message,
        'xcrun simctl get_app_container printed "", not an absolute path.',
      );
    });
    assertEqual(existsSync(join(fake.directory, "Documents")), false);
  });

  it("fails when the log stream prints nothing within the limit", async (t) => {
    const fake = setupFakeDevice(t, "ios", { streamSilent: true });

    await assertRejects(
      fake.run({ expectedTotal: 3, commandMilliseconds: 1000 }),
      (error) => {
        assertEqual(
          (error as Error).message,
          "The log stream printed nothing within 1 s.",
        );
      },
    );
    for (let attempt = 0; fake.streamRuns() && attempt < 100; attempt++)
      await setTimeout(10);
    assertEqual(fake.streamRuns(), false);
  });

  it("stops the log stream when opening the app fails", async (t) => {
    const fake = setupFakeDevice(t, "ios", { openFails: true });

    await assertRejects(fake.run({ expectedTotal: 3 }), (error) => {
      assertTrue(
        (error as Error).message.includes(
          "An error was encountered processing the command",
        ),
      );
    });
    // Killing it takes a moment.
    for (let attempt = 0; fake.streamRuns() && attempt < 100; attempt++)
      await setTimeout(10);
    assertEqual(fake.streamRuns(), false);
  });
});

describe("runDeviceTests through adb", () => {
  it("quotes adb shell's arguments, so a URL with ? and & reaches am start whole", async (t) => {
    const fake = setupFakeDevice(t, "android");
    fake.log([
      "EvoluNativeTests passed=3 failed=0 total=3",
      "EvoluNativeTests reloaded",
    ]);

    await fake.run({
      expectedTotal: 3,
      url: "evolutest://native-tests?a=1&b=2",
    });

    assertTrue(
      fake
        .commands()
        .includes(
          "-s emulator-5554 shell 'am' 'start' '-W' '-a' 'android.intent.action.VIEW' '-d' 'evolutest://native-tests?a=1&b=2' 'com.evolu.test'",
        ),
    );
  });

  it("fails when reading the crash buffer of a dead app doesn't finish within its limit", async (t) => {
    const fake = setupFakeDevice(t, "android", {
      launches: false,
      hangs: "crash buffer",
    });
    fake.log([]);

    await assertRejects(
      fake.run({
        expectedTotal: 3,
        launchMilliseconds: 100,
        commandMilliseconds: 1000,
      }),
      (error) => {
        assertEqual(
          (error as Error).message,
          "adb -s emulator-5554 logcat -b crash -d didn't finish within 1 s.",
        );
      },
    );
  });
});

describe("runDeviceTests on ios without crash reports", () => {
  it("fails with the log stream's error when it exits before its first line", async (t) => {
    const fake = setupFakeDevice(t, "ios", { streamFails: true });

    await assertRejects(fake.run({ expectedTotal: 3 }), (error) => {
      assertEqual(
        (error as Error).message,
        "The log stream exited with 149 before its first line: Unable to lookup in current state: Shutdown\n",
      );
    });
  });

  it("ends the crash wait when the log stream exits during it, leaving no timer", async (t) => {
    const fake = setupFakeDevice(t, "ios", { crashReport: false });
    fake.log(["Running app", "@die", "@sleep 0.3", "@exit 3"]);
    const timers = () =>
      process
        .getActiveResourcesInfo()
        .filter((resource) => resource === "Timeout").length;
    const before = timers();

    assertEqual(
      await fake.run({ expectedTotal: 3, crashReportMilliseconds: 5000 }),
      {
        passed: false,
        output:
          "Device tests: the log stream exited with 3: The device went away.\n",
      },
    );
    assertEqual(timers(), before);
  });

  it("says so when the app dies before the simulator wrote any crash report", async (t) => {
    const fake = setupFakeDevice(t, "ios", { crashReport: false });
    rmSync(fake.crashReports, { recursive: true });
    fake.log(["Running app", "@sleep 0.3", "@die"]);

    assertEqual(await fake.run({ expectedTotal: 3 }), {
      passed: false,
      output: "Device tests: the app died.\nNo crash report.\n",
    });
  });
});

describe("runDeviceTestsCli", () => {
  it("expects the total the suites register on the platform, and returns 0 when the run passes", async (t) => {
    const fake = setupFakeDevice(t, "ios");
    const total = countDeviceTests("ios");
    fake.log([
      `EvoluNativeTests passed=${total} failed=0 total=${total}`,
      "EvoluNativeTests reloaded",
    ]);
    const log = t.mock.method(console, "log", () => undefined);

    const code = await runDeviceTestsCli(
      [
        "--platform=ios",
        "--device=SIM",
        "--app=com.evolu.test",
        "--url=evolutest://native-tests",
        `--fixtures=${fake.fixtures}`,
        "--timeout=20",
      ],
      fake.tools,
    );
    log.mock.restore();

    assertEqual(code, 0);
    assertEqual(
      log.mock.calls.map((call) => call.arguments),
      [[`Device tests: ${total} of ${total} passed, and the app reloaded.`]],
    );
    assertTrue(
      fake.commands().includes("simctl openurl SIM evolutest://native-tests"),
    );
  });

  it("returns 1 when the run fails", async (t) => {
    const fake = setupFakeDevice(t, "android");
    fake.log(["EvoluNativeTests passed=0 failed=1 total=1"]);
    const log = t.mock.method(console, "log", () => undefined);

    const code = await runDeviceTestsCli(
      [
        "--platform=android",
        "--device=emulator-5554",
        "--app=com.evolu.test",
        "--url=evolutest://native-tests",
        `--fixtures=${fake.fixtures}`,
        "--timeout=20",
      ],
      fake.tools,
    );
    log.mock.restore();

    assertEqual(code, 1);
    assertEqual(
      log.mock.calls.map((call) => call.arguments),
      [["Device tests: 1 of 1 failed."]],
    );
  });
});

describe("device-tests.mts", () => {
  it("fails as a script on arguments it can't act on", () => {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("device-tests.mts", import.meta.url)),
        "--platform=windows",
      ],
      { encoding: "utf8" },
    );

    assertEqual(result.status, 1);
    assertTrue(result.stderr.includes("--platform takes ios or android."));
  });
});

describe("runDeviceTestsCli arguments", () => {
  it("refuses arguments it can't act on", async () => {
    const run = [
      "--platform=ios",
      "--device=SIM",
      "--app=com.evolu.test",
      "--url=evolutest://native-tests",
      "--fixtures=fixtures",
    ];
    for (const [args, message] of [
      [
        ["--platform=windows", ...run.slice(1)],
        "--platform takes ios or android.",
      ],
      [run.slice(1), "--platform takes ios or android."],
      [
        run.filter((arg) => !arg.startsWith("--device")),
        "Pass --device, --app, --url and --fixtures.",
      ],
      [
        run.filter((arg) => !arg.startsWith("--fixtures")),
        "Pass --device, --app, --url and --fixtures.",
      ],
      [
        [...run, "--timeout=0"],
        "--timeout takes a positive number of seconds.",
      ],
      [
        [...run, "--timeout=soon"],
        "--timeout takes a positive number of seconds.",
      ],
      [[...run, "--write-fixtures=out"], "Pass --write-fixtures alone."],
    ] as const)
      await assertRejects(runDeviceTestsCli(args, {}), (error) => {
        assertEqual((error as Error).message, message);
      });
  });
});

/**
 * A fake xcrun or adb in a directory of its own, which streams the lines of
 * `log` as the app's log once the app is opened: `@die` ends the app's process,
 * as a crash does, `@sleep <seconds>` pauses, and `@exit <code>` ends the
 * stream with that code and an error, as when the device goes away.
 */
const setupFakeDevice = (
  t: TestContext,
  platform: "ios" | "android",
  {
    crashReport = true,
    launches = true,
    streamFails = false,
    streamSilent = false,
    hangs,
    openFails = false,
    printsNoContainer = false,
    streamSpawnFails = false,
  }: {
    crashReport?: boolean;
    launches?: boolean;
    /** Makes the log stream exit with simctl's error for a shut-down simulator. */
    streamFails?: boolean;
    /** Makes the iOS log stream print nothing, not even its header. */
    streamSilent?: boolean;
    /**
     * Makes get_app_container or `stat` hang, the check that the app runs, or
     * reading Android's crash buffer.
     */
    hangs?: "seeding" | "liveness" | "crash buffer";
    /** Makes opening the app fail. */
    openFails?: boolean;
    /** Makes get_app_container print nothing and succeed. */
    printsNoContainer?: boolean;
    /** Makes the tool lose its execute bit just before the log stream starts. */
    streamSpawnFails?: boolean;
  } = {},
) => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-device-tests-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const app = "com.evolu.test";
  const device = platform === "ios" ? "SIM" : "emulator-5554";
  const fixtures = join(directory, "fixtures");
  mkdirSync(fixtures);
  for (const file of ["evolu1-a.db", "evolu1-b.db", "evolu1-b.db-journal"])
    writeFileSync(join(fixtures, file), file);
  const crashReports = join(directory, "DiagnosticReports");
  mkdirSync(crashReports);
  // The app's report of an earlier run, which the driver doesn't print.
  writeFileSync(
    join(crashReports, "old.ips"),
    `{"bundleID":"${app}"}\nan old crash`,
  );
  utimesSync(join(crashReports, "old.ips"), 0, 0);
  // A report removed between the listing and the read.
  symlinkSync(
    join(crashReports, "removed.ips"),
    join(crashReports, "gone.ips"),
  );
  const crash =
    platform === "ios"
      ? `## new.ips\n{"bundleID":"${app}"}\nEXC_BAD_ACCESS in the app`
      : "--------- beginning of crash\nF libc: Fatal signal 11 (SIGSEGV)";

  // Streams the log once the app was opened, then stays open, as a real
  // stream does. On iOS it first prints the header log stream prints when it
  // starts, and at `@die` writes another app's report at once and the app's
  // one poll later, as ReportCrash writes it seconds after the death.
  writeFileSync(
    join(directory, "stream.sh"),
    `echo $$ > '${directory}/stream.pid'
${streamSilent ? "exec sleep 600\n" : ""}${platform === "ios" ? "echo 'Filtering the log data using the predicate'\n" : ""}while [ ! -f '${directory}/opened' ]; do sleep 0.01; done
while IFS= read -r line; do
  case "$line" in
    @sleep*) sleep "\${line#@sleep }" ;;
    @exit*) echo 'The device went away.' >&2; exit "\${line#@exit }" ;;
    @die) rm -f '${directory}/alive'
      ${
        platform === "ios" && crashReport
          ? `printf '{"bundleID":"com.apple.other"}\\nanother crash' > '${crashReports}/other.ips'
      printf 'a report of another format' > '${crashReports}/other-format.ips'
      printf '{"bundleID":"${app}"}\\na diagnostic, not a crash report' > '${crashReports}/new.diag'
      (sleep 0.6; printf '{"bundleID":"${app}"}\\nEXC_BAD_ACCESS in the app' > '${crashReports}/new.tmp'; mv '${crashReports}/new.tmp' '${crashReports}/new.ips') &`
          : ":"
      } ;;
    *) printf '%s\\n' "$line" ;;
  esac
done < '${directory}/log'
exec sleep 600
`,
  );
  writeFileSync(join(directory, "crash"), crashReport ? `${crash}\n` : "");
  const alive =
    platform === "ios"
      ? `printf 'PID\\tStatus\\tLabel\\n'; [ -f '${directory}/alive' ] && printf '4242\\t0\\tUIKitApplication:${app}[ab12][rb-legacy]\\n'; printf -- '-\\t0\\tcom.apple.homed\\n'`
      : `[ -f '${directory}/alive' ] && echo 4242 || exit 1`;
  // What the driver writes, so the simulator opens the URL without asking.
  const approval = `simctl spawn ${device} defaults write com.apple.launchservices.schemeapproval com.apple.CoreSimulator.CoreSimulatorBridge-->evolutest -string ${app}`;
  const tool =
    platform === "ios"
      ? `#!/bin/sh
printf '%s\\n' "$*" >> '${directory}/commands'
case "$1 $2 $4" in
  "simctl terminate"*) rm -f '${directory}/alive' ;;
  "simctl get_app_container"*) ${streamSpawnFails ? `chmod 644 "$0"; ` : ""}${hangs === "seeding" ? "exec sleep 5" : printsNoContainer ? ":" : `echo '${directory}/container'`} ;;
  "simctl spawn log") ${streamFails ? "echo 'Unable to lookup in current state: Shutdown' >&2; exit 149" : `exec sh '${directory}/stream.sh'`} ;;
  "simctl spawn launchctl") ${hangs === "liveness" ? "exec sleep 5" : alive} ;;
  "simctl spawn defaults") printf '%s\\n' "$*" >> '${directory}/approvals' ;;
  # As iOS asks before it opens an app at a URL whose scheme wasn't approved,
  # and the app doesn't start until someone answers.
  "simctl openurl"*) ${openFails ? "echo 'An error was encountered processing the command' >&2; exit 1" : `grep -qxF '${approval}' '${directory}/approvals' 2>/dev/null || exit 0; touch ${launches ? `'${directory}/alive' ` : ""}'${directory}/opened'`} ;;
  *) echo "xcrun: unexpected $*" >&2; exit 2 ;;
esac
`
      : `#!/bin/sh
printf '%s\\n' "$*" >> '${directory}/commands'
shift 2
# The device's shell would unquote the arguments after shell.
case "$(printf '%s ' "$@" | tr -d "'")" in
  "root "*|"wait-for-device "*|"push "*) ;;
  "logcat -c "*) ;;
  "logcat -b crash "*) ${hangs === "crash buffer" ? "exec sleep 5" : `cat '${directory}/crash'`} ;;
  "logcat -v "*) exec sh '${directory}/stream.sh' ;;
  "shell pidof "*) ${hangs === "liveness" ? "exec sleep 5" : alive} ;;
  "shell stat "*) ${hangs === "seeding" ? "exec sleep 5" : "echo 10123"} ;;
  "shell mkdir "*|"shell rm "*|"shell chown "*|"shell restorecon "*) ;;
  "shell am force-stop "*) rm -f '${directory}/alive' ;;
  "shell am start "*) ${streamSpawnFails ? `chmod 644 "$0"; ` : ""}${openFails ? "echo 'Error: Activity not started' >&2; exit 1" : `touch ${launches ? `'${directory}/alive' ` : ""}'${directory}/opened'`} ;;
  *) echo "adb: unexpected $*" >&2; exit 2 ;;
esac
`;
  const toolPath = join(directory, platform === "ios" ? "xcrun" : "adb");
  writeFileSync(toolPath, tool);
  chmodSync(toolPath, 0o755);
  // macOS checks a new executable at its first run, which took over a second
  // under test:react-native-sqlite's load, so it runs once before a test's
  // command limits apply, and its command isn't recorded.
  spawnSync(toolPath, ["warm-up"]);
  rmSync(join(directory, "commands"));

  const files = "evolu1-a.db evolu1-b.db evolu1-b.db-journal";
  const appData = `/data/data/${app}`;
  const expectedCommands =
    platform === "ios"
      ? [
          `simctl terminate ${device} ${app}`,
          `simctl get_app_container ${device} ${app} data`,
          `simctl spawn ${device} log stream --level info --style compact --predicate subsystem == "com.facebook.react.log"`,
          approval,
          `simctl openurl ${device} evolutest://native-tests`,
        ]
      : [
          `-s ${device} shell 'am' 'force-stop' '${app}'`,
          `-s ${device} root`,
          `-s ${device} wait-for-device`,
          `-s ${device} shell 'mkdir' '-p' '${appData}/files/SQLite'`,
          `-s ${device} shell 'rm' '-f' '${appData}/files/SQLite/evolu1-native-tests-reload.db'`,
          `-s ${device} push ${files
            .split(" ")
            .map((file) => join(fixtures, file))
            .join(" ")} ${appData}/files/SQLite/`,
          `-s ${device} shell 'stat' '-c' '%u' '${appData}'`,
          `-s ${device} shell 'chown' '-R' '10123:10123' '${appData}/files'`,
          `-s ${device} shell 'restorecon' '-R' '${appData}/files'`,
          `-s ${device} logcat -c`,
          `-s ${device} shell 'am' 'start' '-W' '-a' 'android.intent.action.VIEW' '-d' 'evolutest://native-tests' '${app}'`,
          `-s ${device} logcat -v brief -s ReactNativeJS:V`,
        ];
  const tools =
    platform === "ios"
      ? { xcrun: toolPath, crashReportsDirectory: crashReports }
      : { adb: toolPath, crashReportsDirectory: crashReports };

  return {
    directory,
    fixtures,
    crash,
    crashReports,
    tools,
    expectedCommands,
    log: (lines: ReadonlyArray<string>) => {
      writeFileSync(join(directory, "log"), `${lines.join("\n")}\n`);
    },
    /** The commands after the polls of whether the app runs. */
    commands: () =>
      readFileSync(join(directory, "commands"), "utf8")
        .trimEnd()
        .split("\n")
        .filter(
          (command) =>
            !command.includes("launchctl list") && !command.includes("pidof"),
        ),
    /** Whether the log stream still runs. */
    streamRuns: () => {
      try {
        process.kill(
          Number(readFileSync(join(directory, "stream.pid"), "utf8")),
          0,
        );
        return true;
      } catch {
        return false;
      }
    },
    run: ({
      expectedTotal,
      timeout = 20,
      launchMilliseconds,
      crashReportMilliseconds = 2000,
      commandMilliseconds,
      url = "evolutest://native-tests",
    }: {
      expectedTotal: number;
      timeout?: number;
      launchMilliseconds?: number;
      crashReportMilliseconds?: number;
      commandMilliseconds?: number;
      url?: string;
    }) =>
      runDeviceTests({
        platform,
        device,
        app,
        url,
        fixturesDirectory: fixtures,
        expectedTotal,
        timeoutMilliseconds: timeout * 1000,
        pollMilliseconds: 20,
        crashReportMilliseconds,
        ...(launchMilliseconds != null && { launchMilliseconds }),
        ...(commandMilliseconds != null && { commandMilliseconds }),
        ...tools,
      }),
  };
};
