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
import { createHash } from "node:crypto";
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
        "EvoluNativeTests relaunched",
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
        { type: "Relaunched" },
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
    // The DeviceSecret record no Keystore key can read is Android's.
    assertEqual(android, ios + 1);
  });
});

for (const platform of ["ios", "android"] as const)
  describe(`runDeviceTests on ${platform}`, () => {
    it("passes when the app logs every test passed, the total Node counts, that it reloaded, and once restarted that it relaunched, after seeding the fixtures into expo-sqlite's directory", async (t) => {
      const fake = setupFakeDevice(t, platform);
      fake.log([
        "Running app",
        "EvoluNativeTests passed=3 failed=0 total=3",
        "EvoluNativeTests reloaded",
        "@reopened",
        "EvoluNativeTests relaunched",
      ]);

      // The marker and the DeviceSecret check of an earlier run the app didn't
      // finish, which would make it log that it reloaded and run nothing.
      if (platform === "ios") {
        mkdirSync(join(fake.directory, "container/Documents/SQLite"), {
          recursive: true,
        });
        for (const file of [
          "evolu1-native-tests-reload.db",
          "evolu1-native-tests-device-secret.db",
        ])
          writeFileSync(
            join(fake.directory, "container/Documents/SQLite", file),
            "",
          );
      }

      const result = await fake.run({ expectedTotal: 3 });

      assertEqual(result, {
        passed: true,
        output:
          "Device tests: 3 of 3 passed, the app reloaded, and it relaunched with the DeviceSecret it stored.\n",
      });
      assertEqual(fake.commands(), fake.expectedCommands);
      if (platform === "ios")
        assertEqual(
          readdirSync(join(fake.directory, "container/Documents/SQLite")),
          ["evolu1-a.db", "evolu1-b.db", "evolu1-b.db-journal"],
        );
    });

    if (platform === "ios")
      it("fails when the Keychain holds no item of the DeviceSecret, or one readable otherwise than after the first unlock on this device only", async (t) => {
        for (const [keychainItems, readable] of [
          ["0|0", "0"],
          ["2|1", "1"],
        ] as const) {
          const fake = setupFakeDevice(t, platform, { keychainItems });
          fake.log([
            "EvoluNativeTests passed=3 failed=0 total=3",
            "EvoluNativeTests reloaded",
          ]);

          assertEqual(await fake.run({ expectedTotal: 3 }), {
            passed: false,
            output: `Device tests: the Keychain holds ${keychainItems[0]} items of the DeviceSecret, ${readable} of them readable after the first unlock on this device only and not synced.\n`,
          });
        }
      });

    if (platform === "android")
      it("fails when the DeviceSecret record isn't the size of an encrypted one", async (t) => {
        const fake = setupFakeDevice(t, platform, { secretRecordLength: 43 });
        fake.log([
          "EvoluNativeTests passed=3 failed=0 total=3",
          "EvoluNativeTests reloaded",
        ]);

        assertEqual(await fake.run({ expectedTotal: 3 }), {
          passed: false,
          output:
            "Device tests: the DeviceSecret record has 43 bytes, not the 71 of an encrypted one.\n",
        });
      });

    if (platform === "android")
      it("fails when the Keystore keeps a key of the app name the app forgot", async (t) => {
        const fake = setupFakeDevice(t, platform, { keystoreKeys: "1|1" });
        fake.log([
          "EvoluNativeTests passed=3 failed=0 total=3",
          "EvoluNativeTests reloaded",
        ]);

        assertEqual(await fake.run({ expectedTotal: 3 }), {
          passed: false,
          output:
            "Device tests: the Keystore holds 1 keys of the app name the app kept and 1 of the one it forgot, not 1 and 0.\n",
        });
      });

    if (platform === "android")
      it("fails when the app didn't replace the DeviceSecret record it couldn't read", async (t) => {
        const fake = setupFakeDevice(t, platform, {
          keepsUnreadableSecret: true,
        });
        fake.log([
          "EvoluNativeTests passed=3 failed=0 total=3",
          "EvoluNativeTests reloaded",
        ]);

        assertEqual(await fake.run({ expectedTotal: 3 }), {
          passed: false,
          output:
            "Device tests: the app didn't replace the DeviceSecret record it couldn't read after forgetting it.\n",
        });
      });

    if (platform === "android")
      it("fails when the record that replaced the unreadable one isn't the size of an encrypted one", async (t) => {
        const fake = setupFakeDevice(t, platform, {
          replacedSecretRecordLength: 43,
        });
        fake.log([
          "EvoluNativeTests passed=3 failed=0 total=3",
          "EvoluNativeTests reloaded",
        ]);

        assertEqual(await fake.run({ expectedTotal: 3 }), {
          passed: false,
          output:
            "Device tests: the DeviceSecret record that replaced the unreadable one has 43 bytes, not the 71 of an encrypted one.\n",
        });
      });

    if (platform === "android")
      it("rejects when reading the DeviceSecret record back fails", async (t) => {
        const fake = setupFakeDevice(t, platform, { pullFails: true });
        fake.log([
          "EvoluNativeTests passed=3 failed=0 total=3",
          "EvoluNativeTests reloaded",
        ]);

        await assertRejects(fake.run({ expectedTotal: 3 }), (error) => {
          assertTrue(
            error instanceof Error &&
              error.message.includes("failed to stat remote object"),
          );
        });
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

    it("fails when the restarted app doesn't log that it relaunched, ignoring another reload", async (t) => {
      const fake = setupFakeDevice(t, platform);
      fake.log([
        "EvoluNativeTests passed=3 failed=0 total=3",
        "EvoluNativeTests reloaded",
        "@reopened",
        "EvoluNativeTests reloaded",
      ]);

      assertEqual(await fake.run({ expectedTotal: 3, timeout: 1 }), {
        passed: false,
        output:
          "Device tests: 3 of 3 passed and the app reloaded, but it didn't log that it relaunched within 1 s.\n",
      });
      // Restarted once.
      assertEqual(fake.commands(), fake.expectedCommands);
    });

    it("gives the restarted app the launch window again, however long the run took", async (t) => {
      const fake = setupFakeDevice(t, platform, { reopensSlowly: true });
      fake.log([
        "EvoluNativeTests passed=3 failed=0 total=3",
        "@sleep 0.5",
        "EvoluNativeTests reloaded",
        "@reopened",
        "@sleep 0.3",
        "EvoluNativeTests relaunched",
      ]);

      // Without waiting for a crash report, so a death the driver detects
      // ends the run before the app's next line.
      const result = await fake.run({
        expectedTotal: 3,
        launchMilliseconds: 400,
        crashReportMilliseconds: 0,
      });

      assertTrue(result.passed);
    });

    it("waits on a relaunched line that comes before the restart", async (t) => {
      const fake = setupFakeDevice(t, platform);
      fake.log([
        "EvoluNativeTests relaunched",
        "EvoluNativeTests passed=3 failed=0 total=3",
        "EvoluNativeTests relaunched",
      ]);

      assertEqual(await fake.run({ expectedTotal: 3, timeout: 1 }), {
        passed: false,
        output:
          "Device tests: 3 of 3 passed, but the app didn't log that it reloaded within 1 s.\n",
      });
    });

    it("rejects when restarting the app fails", async (t) => {
      const fake = setupFakeDevice(t, platform, { reopenFails: true });
      fake.log([
        "EvoluNativeTests passed=3 failed=0 total=3",
        "EvoluNativeTests reloaded",
      ]);

      await assertRejects(fake.run({ expectedTotal: 3 }), (error) => {
        assertTrue(
          (error as Error).message.includes(
            platform === "ios"
              ? "An error was encountered processing the command"
              : "Error: Activity not started",
          ),
        );
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
      "@reopened",
      "EvoluNativeTests relaunched",
    ]);

    const result = await fake.run({
      expectedTotal: 3,
      url: "evolutest://native-tests?a=1&b=2",
    });

    assertTrue(result.passed);
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
      "@reopened",
      "EvoluNativeTests relaunched",
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
      [
        [
          `Device tests: ${total} of ${total} passed, the app reloaded, and it relaunched with the DeviceSecret it stored.`,
        ],
      ],
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
 * as a crash does, `@sleep <seconds>` pauses, `@reopened` waits until the app
 * was opened again, and `@exit <code>` ends the stream with that code and an
 * error, as when the device goes away.
 */
const sha1 = (text: string): string =>
  createHash("sha1").update(text).digest("hex");

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
    keepsUnreadableSecret = false,
    replacedSecretRecordLength = 71,
    pullFails = false,
    reopenFails = false,
    reopensSlowly = false,
    // Two items, as from two access groups.
    keychainItems = "2|2",
    secretRecordLength = 71,
    keystoreKeys = "1|0",
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
    /**
     * Makes the DeviceSecret record no Keystore key can read come back as it
     * was seeded, as when the app didn't forget and replace it.
     */
    keepsUnreadableSecret?: boolean;
    /** The size of the record that replaced the unreadable one. */
    replacedSecretRecordLength?: number;
    /** Makes reading that record back fail. */
    pullFails?: boolean;
    /** Makes opening the app again fail. */
    reopenFails?: boolean;
    /** Makes the app opened again run only a moment after it was opened. */
    reopensSlowly?: boolean;
    /**
     * What the keychain database answers for the DeviceSecret: its items, and
     * how many of them are readable after the first unlock on this device
     * only.
     */
    keychainItems?: string;
    /** The size of the DeviceSecret record the app stored on Android. */
    secretRecordLength?: number;
    /**
     * What Keystore2's database answers for the keys of the app name the app
     * kept and of the one it forgot.
     */
    keystoreKeys?: string;
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
    @reopened) while [ ! -f '${directory}/reopened' ]; do sleep 0.01; done ;;
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
  // Opening an app that was opened before marks the restart, or fails. A slow
  // one starts in the background, without the tool's output, which the driver
  // waits to close.
  const reopen = `if [ -f '${directory}/opened' ]; then ${
    reopenFails
      ? `echo '${platform === "ios" ? "An error was encountered processing the command" : "Error: Activity not started"}' >&2; exit 1`
      : reopensSlowly
        ? `touch '${directory}/reopened'; (sleep 0.2; touch '${directory}/alive') </dev/null >/dev/null 2>&1 & exit 0`
        : `touch '${directory}/reopened'`
  }; fi; `;
  // What the driver writes, so the simulator opens the URL without asking.
  const approval = `simctl spawn ${device} defaults write com.apple.launchservices.schemeapproval com.apple.CoreSimulator.CoreSimulatorBridge-->evolutest -string ${app}`;
  const tool =
    platform === "ios"
      ? `#!/bin/sh
printf '%s\\n' "$*" >> '${directory}/commands'
case "$1 $2 $4" in
  "simctl terminate"*) rm -f '${directory}/alive' ;;
  "simctl getenv"*) echo '${directory}/home' ;;
  "simctl get_app_container"*) ${streamSpawnFails ? `chmod 644 "$0"; ` : ""}${hangs === "seeding" ? "exec sleep 5" : printsNoContainer ? ":" : `echo '${directory}/container'`} ;;
  "simctl spawn log") ${streamFails ? "echo 'Unable to lookup in current state: Shutdown' >&2; exit 149" : `exec sh '${directory}/stream.sh'`} ;;
  "simctl spawn launchctl") ${hangs === "liveness" ? "exec sleep 5" : alive} ;;
  "simctl spawn defaults") printf '%s\\n' "$*" >> '${directory}/approvals' ;;
  # As iOS asks before it opens an app at a URL whose scheme wasn't approved,
  # and the app doesn't start until someone answers.
  "simctl openurl"*) ${openFails ? "echo 'An error was encountered processing the command' >&2; exit 1" : `grep -qxF '${approval}' '${directory}/approvals' 2>/dev/null || exit 0; ${reopen}touch ${launches ? `'${directory}/alive' ` : ""}'${directory}/opened'`} ;;
  *) echo "xcrun: unexpected $*" >&2; exit 2 ;;
esac
`
      : `#!/bin/sh
printf '%s\\n' "$*" >> '${directory}/commands'
shift 2
# The device's shell would unquote the arguments after shell.
case "$(printf '%s ' "$@" | tr -d "'")" in
  "root "*|"wait-for-device "*|"push "*) ;;
  "pull "*) ${pullFails ? "echo 'adb: error: failed to stat remote object' >&2; exit 1; " : ""}case "$2" in
    *-unreadable) ${keepsUnreadableSecret ? `head -c 44 /dev/zero | tr '\\0' '\\7' > "$3"` : `head -c ${replacedSecretRecordLength} /dev/zero > "$3"`} ;;
    *) head -c ${secretRecordLength} /dev/zero > "$3" ;;
  esac ;;
  "logcat -c "*) ;;
  "logcat -b crash "*) ${hangs === "crash buffer" ? "exec sleep 5" : `cat '${directory}/crash'`} ;;
  "logcat -v "*) exec sh '${directory}/stream.sh' ;;
  "shell pidof "*) ${hangs === "liveness" ? "exec sleep 5" : alive} ;;
  "shell stat "*) ${hangs === "seeding" ? "exec sleep 5" : "echo 10123"} ;;
  "shell mkdir "*|"shell rm "*|"shell chown "*|"shell restorecon "*) ;;
  "shell sqlite3 "*) echo '${keystoreKeys}' ;;
  "shell am force-stop "*) rm -f '${directory}/alive' ;;
  "shell am start "*) ${streamSpawnFails ? `chmod 644 "$0"; ` : ""}${openFails ? "echo 'Error: Activity not started' >&2; exit 1" : `${reopen}touch ${launches ? `'${directory}/alive' ` : ""}'${directory}/opened'`} ;;
  *) echo "adb: unexpected $*" >&2; exit 2 ;;
esac
`;
  const toolPath = join(directory, platform === "ios" ? "xcrun" : "adb");
  writeFileSync(toolPath, tool);
  chmodSync(toolPath, 0o755);
  const sqlite3Path = join(directory, "sqlite3");
  writeFileSync(
    sqlite3Path,
    `#!/bin/sh
printf 'sqlite3 %s\\n' "$*" >> '${directory}/commands'
echo '${keychainItems}'
`,
  );
  chmodSync(sqlite3Path, 0o755);
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
          `simctl getenv ${device} HOME`,
          `sqlite3 -init /dev/null -readonly ${directory}/home/Library/Keychains/keychain-2-debug.db select count(*), count(*) filter (where pdmn = 'cku' and sync = 0) from genp where svce = x'${sha1(`dev.evolu.deviceSecret/${app}`)}' and acct = x'${sha1("native-tests-device-secret")}' and tomb = 0;`,
          `simctl terminate ${device} ${app}`,
          `simctl openurl ${device} evolutest://native-tests`,
        ]
      : [
          `-s ${device} shell 'am' 'force-stop' '${app}'`,
          `-s ${device} root`,
          `-s ${device} wait-for-device`,
          `-s ${device} shell 'mkdir' '-p' '${appData}/files/SQLite' '${appData}/no_backup'`,
          `-s ${device} shell 'rm' '-f' '${appData}/files/SQLite/evolu1-native-tests-reload.db' '${appData}/files/SQLite/evolu1-native-tests-device-secret.db' '${appData}/no_backup/evolu-device-secret-native-tests-device-secret'`,
          `-s ${device} push ${files
            .split(" ")
            .map((file) => join(fixtures, file))
            .join(" ")} ${appData}/files/SQLite/`,
          `-s ${device} push SECRET ${appData}/no_backup/evolu-device-secret-native-tests-device-secret-unreadable`,
          `-s ${device} shell 'stat' '-c' '%u' '${appData}'`,
          `-s ${device} shell 'chown' '-R' '10123:10123' '${appData}/files' '${appData}/no_backup'`,
          `-s ${device} shell 'restorecon' '-R' '${appData}/files' '${appData}/no_backup'`,
          `-s ${device} logcat -c`,
          `-s ${device} shell 'am' 'start' '-W' '-a' 'android.intent.action.VIEW' '-d' 'evolutest://native-tests' '${app}'`,
          `-s ${device} logcat -v brief -s ReactNativeJS:V`,
          `-s ${device} pull ${appData}/no_backup/evolu-device-secret-native-tests-device-secret-unreadable PULLED`,
          `-s ${device} pull ${appData}/no_backup/evolu-device-secret-native-tests-device-secret PULLED`,
          `-s ${device} shell 'sqlite3' '/data/misc/keystore/persistent.sqlite' 'select count(*) filter (where alias = '\\''dev.evolu.deviceSecret.native-tests-device-secret-kept'\\''), count(*) filter (where alias = '\\''dev.evolu.deviceSecret.native-tests-device-secret-forgotten'\\'') from keyentry where domain = 0 and namespace = 10123 and state = 1;'`,
          `-s ${device} shell 'am' 'force-stop' '${app}'`,
          `-s ${device} push SECRET ${appData}/no_backup/evolu-device-secret-native-tests-device-secret-truncated-10`,
          `-s ${device} push SECRET ${appData}/no_backup/evolu-device-secret-native-tests-device-secret-truncated-20`,
          `-s ${device} pull ${appData}/no_backup/evolu-device-secret-native-tests-device-secret-tampered PULLED`,
          `-s ${device} push SECRET ${appData}/no_backup/evolu-device-secret-native-tests-device-secret-tampered`,
          `-s ${device} shell 'chown' '10123:10123' '${appData}/no_backup/evolu-device-secret-native-tests-device-secret-truncated-10' '${appData}/no_backup/evolu-device-secret-native-tests-device-secret-truncated-20' '${appData}/no_backup/evolu-device-secret-native-tests-device-secret-tampered'`,
          `-s ${device} shell 'restorecon' '${appData}/no_backup/evolu-device-secret-native-tests-device-secret-truncated-10' '${appData}/no_backup/evolu-device-secret-native-tests-device-secret-truncated-20' '${appData}/no_backup/evolu-device-secret-native-tests-device-secret-tampered'`,
          `-s ${device} shell 'am' 'start' '-W' '-a' 'android.intent.action.VIEW' '-d' 'evolutest://native-tests' '${app}'`,
        ];
  const tools =
    platform === "ios"
      ? {
          xcrun: toolPath,
          sqlite3: sqlite3Path,
          crashReportsDirectory: crashReports,
        }
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
        )
        // The unreadable DeviceSecret record is written to a new temporary
        // directory each run.
        .map((command) =>
          command
            .replace(
              / push \S+\/evolu-device-secret-[^/ ]+\/secret /u,
              " push SECRET ",
            )
            .replace(/ \S+\/evolu-device-secret-[^/ ]+\/secret$/u, " PULLED"),
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
