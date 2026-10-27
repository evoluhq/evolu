/**
 * Runs the React Native target on an iOS simulator or an Android emulator. It
 * serves the plan and the workloads to the app in `app/`, as `protocol.mts`
 * describes, builds, installs and launches the app in Release with Expo, or
 * relaunches the installed one, and records every run the app reports.
 *
 * @module
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { createRequire } from "node:module";
import { homedir, loadavg } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TargetResult } from "../results.mts";
import { createStackRecorder, type StackRecorder } from "../rounds.mts";
import {
  describeMachine,
  type LoadedWorkloads,
  type Rounds,
} from "../setup.mts";
import {
  reactNativeServerPort,
  type ReactNativeMeta,
  type ReactNativePlan,
  type ReactNativeRunReport,
  type ReactNativeStackId,
} from "./protocol.mts";

export const reactNativePlatforms = ["ios", "android"] as const;
export type ReactNativePlatform = (typeof reactNativePlatforms)[number];

const appDirectory = fileURLToPath(new URL("app/", import.meta.url));
const repositoryDirectory = fileURLToPath(
  new URL("../../../", import.meta.url),
);
const appId = "com.evolu.bench.sqlite";
const sessionTimeoutMs = 60 * 60 * 1000;

const appRequire = createRequire(`${appDirectory}package.json`);
const readVersion = (path: string): string =>
  (appRequire(path) as { readonly version: string }).version;

// Android's tools as Android Studio installs them on macOS, unless the
// environment names others, which Expo's build also reads.
const androidSdk =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  join(homedir(), "Library/Android/sdk");
const androidStudioJava =
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
const toolEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  // CocoaPods fails without a UTF-8 locale.
  LANG:
    process.env.LANG?.includes("UTF-8") === true
      ? process.env.LANG
      : "en_US.UTF-8",
  ANDROID_HOME: androidSdk,
  ...(process.env.JAVA_HOME == null && existsSync(androidStudioJava)
    ? { JAVA_HOME: androidStudioJava }
    : {}),
};
const adbPath = join(androidSdk, "platform-tools", "adb");

const stackDefinitions = (): ReadonlyArray<{
  readonly id: ReactNativeStackId;
  readonly label: string;
  readonly library: string;
  readonly binding: string;
  readonly encrypted: boolean;
}> => [
  {
    id: "evolu",
    label: "Evolu",
    library: "Evolu's SQLite (@evolu/react-native)",
    binding: "JSI, unix VFS",
    encrypted: false,
  },
  {
    id: "evoluEncrypted",
    label: "Evolu, encrypted",
    library: "Evolu's SQLite (@evolu/react-native)",
    binding: "JSI, Evolu's codec",
    encrypted: true,
  },
  {
    id: "expoSqlite",
    label: "expo-sqlite",
    library: `expo-sqlite ${readVersion("expo-sqlite/package.json")}`,
    binding: "Expo Modules, unix VFS",
    encrypted: false,
  },
  {
    id: "opSqlite",
    label: "op-sqlite",
    library: `op-sqlite ${readVersion("@op-engineering/op-sqlite/package.json")}`,
    binding: "JSI, unix VFS",
    encrypted: false,
  },
];

const run = (
  command: string,
  args: ReadonlyArray<string>,
  cwd = repositoryDirectory,
): string => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: toolEnvironment,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  return result.stdout.trim();
};

/** Runs a command with its output shown, resolving when it exits with 0. */
const runShown = (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  environment: NodeJS.ProcessEnv = {},
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: { ...toolEnvironment, ...environment },
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${command} ${args.join(" ")} exited with ${signal ?? code}.`,
          ),
        );
    });
  });

interface Device {
  readonly id: string;
  readonly description: string;
  readonly environment: Readonly<Record<string, string>>;
  /** What the build needs for the device, such as an emulator's ABI. */
  readonly buildEnvironment: NodeJS.ProcessEnv;
}

/** The booted simulator or the one named, which it boots. */
const resolveSimulator = (requested: string | undefined): Device => {
  const { devices } = JSON.parse(
    run("xcrun", ["simctl", "list", "devices", "available", "--json"]),
  ) as {
    readonly devices: Readonly<
      Record<
        string,
        ReadonlyArray<{
          readonly udid: string;
          readonly name: string;
          readonly state: string;
        }>
      >
    >;
  };
  const candidates = Object.entries(devices).flatMap(([runtime, list]) =>
    list.map((device) => ({ ...device, runtime })),
  );
  const device =
    requested == null
      ? candidates.find((candidate) => candidate.state === "Booted")
      : candidates.find(
          (candidate) =>
            candidate.udid === requested || candidate.name === requested,
        );
  if (device == null)
    throw new Error(
      requested == null
        ? "No simulator is booted. Boot one, or pass --device=<UDID or name>."
        : `No available simulator is ${requested}.`,
    );
  if (device.state !== "Booted")
    run("xcrun", ["simctl", "bootstatus", device.udid, "-b"]);
  const os = device.runtime
    .replace(/^com\.apple\.CoreSimulator\.SimRuntime\./u, "")
    .replace(/-(\d+)-(\d+)$/u, " $1.$2");
  return {
    id: device.udid,
    description: `${device.name} simulator, ${os}`,
    environment: {
      Device: `${device.name} simulator, ${os}`,
      Xcode: run("xcodebuild", ["-version"]).split("\n").join(", "),
    },
    buildEnvironment: {},
  };
};

const adb = (serial: string, args: ReadonlyArray<string>): string =>
  run(adbPath, ["-s", serial, ...args]);

/** The only emulator adb lists, or the one with the serial. */
const resolveEmulator = (requested: string | undefined): Device => {
  const serials = run(adbPath, ["devices"])
    .split("\n")
    .slice(1)
    .flatMap((line) => {
      const [serial, state] = line.trim().split(/\s+/u);
      return serial != null && state === "device" ? [serial] : [];
    });
  const serial = requested ?? (serials.length === 1 ? serials[0] : undefined);
  if (serial == null || !serials.includes(serial))
    throw new Error(
      requested == null
        ? `Start one emulator, or pass --device=<serial>; adb lists ${serials.join(", ") || "none"}.`
        : `adb lists no ${requested}.`,
    );
  const property = (name: string) => adb(serial, ["shell", "getprop", name]);
  const description = `${property("ro.product.model")} emulator (${adb(serial, ["emu", "avd", "name"]).split("\n")[0]?.trim() ?? ""}), Android ${property("ro.build.version.release")} (API ${property("ro.build.version.sdk")}), ${property("ro.product.cpu.abi")}`;
  return {
    id: serial,
    description,
    environment: {
      Device: description,
      Fingerprint: property("ro.build.fingerprint"),
    },
    // Only the emulator's ABI, rather than React Native's four.
    buildEnvironment: {
      ORG_GRADLE_PROJECT_reactNativeArchitectures:
        property("ro.product.cpu.abi"),
    },
  };
};

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Array<Buffer> = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

/** Runs one session of the app and returns its target. */
export const runReactNativeTarget = async ({
  platform,
  device: requestedDevice,
  build,
  workloads,
  rounds,
  log,
}: {
  platform: ReactNativePlatform;
  device: string | undefined;
  /** Whether to build and install the app first. */
  build: boolean;
  workloads: LoadedWorkloads;
  rounds: Rounds;
  log: (message: string) => void;
}): Promise<TargetResult> => {
  const createdAt = new Date().toISOString();
  const device =
    platform === "ios"
      ? resolveSimulator(requestedDevice)
      : resolveEmulator(requestedDevice);
  const definitions = stackDefinitions();
  const recorders = new Map<ReactNativeStackId, StackRecorder>(
    definitions.map((definition) => [
      definition.id,
      createStackRecorder(definition, workloads.reference),
    ]),
  );
  const plan: ReactNativePlan = {
    ...rounds,
    stacks: definitions.map(({ id, encrypted }) => ({ id, encrypted })),
    workloadCount: workloads.sql.length,
  };

  // Set by the server's handler, so not narrowed to null.
  let meta = null as ReactNativeMeta | null;
  let finish: (error: Error | null) => void = () => undefined;
  const finished = new Promise<Error | null>((resolve) => {
    finish = resolve;
  });

  const server = createServer((request, response) => {
    void (async () => {
      const path = request.url ?? "";
      const workload = /^\/workload\/(\d+)$/u.exec(path);
      if (request.method === "GET" && path === "/plan") {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(plan));
      } else if (request.method === "GET" && workload != null) {
        const sql = workloads.sql[Number(workload[1])];
        response.statusCode = sql == null ? 404 : 200;
        response.end(sql ?? "");
      } else if (request.method === "POST" && path === "/meta") {
        meta = (await readJson(request)) as ReactNativeMeta;
        log(
          `${meta.platform} ${meta.os}, React Native ${meta.reactNative}, Hermes ${meta.hermes ?? "none"}`,
        );
        if (meta.dev) finish(new Error("The app is a development build."));
        response.end();
      } else if (request.method === "POST" && path === "/run") {
        const report = (await readJson(request)) as ReactNativeRunReport;
        const recorder = recorders.get(report.stackId);
        const name = `${report.isWarmup ? "warmup" : "run"}-${report.round + 1}`;
        if (recorder == null) log(`Unknown stack ${report.stackId}`);
        else if (report.type === "Failed") {
          recorder.fail(report.error);
          log(`${report.stackId} ${name} failed: ${report.error}`);
        } else if (recorder.record(report.output, report)) {
          log(`${report.stackId} ${name} done`);
        } else {
          const result = recorder.toResult();
          log(
            `${report.stackId} ${name} failed: ${result.type === "Failed" ? result.error : ""}`,
          );
        }
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({ isFailed: recorder?.hasFailed() ?? true }),
        );
      } else if (request.method === "POST" && path === "/done") {
        response.end();
        finish(null);
      } else if (request.method === "POST" && path === "/fatal") {
        const { error } = (await readJson(request)) as {
          readonly error: string;
        };
        response.end();
        finish(new Error(`The app failed: ${error}`));
      } else {
        response.statusCode = 404;
        response.end();
      }
    })().catch((error: unknown) => {
      response.statusCode = 500;
      response.end();
      finish(error instanceof Error ? error : new Error(String(error)));
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(reactNativeServerPort, "127.0.0.1", resolve);
  });

  const timeout = setTimeout(() => {
    finish(new Error("The session timed out."));
  }, sessionTimeoutMs);
  const stopApp = () => {
    if (platform === "ios")
      spawnSync("xcrun", ["simctl", "terminate", device.id, appId]);
    else
      spawnSync(adbPath, ["-s", device.id, "shell", "am", "force-stop", appId]);
  };
  try {
    log(device.description);
    if (platform === "android")
      adb(device.id, [
        "reverse",
        `tcp:${reactNativeServerPort}`,
        `tcp:${reactNativeServerPort}`,
      ]);
    // Stops a session an earlier run left.
    stopApp();

    const loadAveragesStart = loadavg();
    if (build) {
      // As pnpm ios and pnpm android do, so native/ matches native.json.
      await runShown(
        "node",
        ["packages/react-native/scripts/vendor-native.mts"],
        repositoryDirectory,
      );
      const expo = appRequire.resolve("expo/bin/cli");
      if (platform === "ios")
        // Expo builds, installs and launches the app.
        await runShown(
          "node",
          [
            expo,
            "run:ios",
            "--configuration",
            "Release",
            "--device",
            device.id,
            "--no-bundler",
          ],
          appDirectory,
        );
      else {
        // Gradle and adb directly, as Expo's install lost the emulator when
        // adb reconnected it during a long build.
        if (!existsSync(`${appDirectory}android`))
          await runShown(
            "node",
            [expo, "prebuild", "--platform", "android", "--no-install"],
            appDirectory,
          );
        // The bundle task tracks only the app's directory, not the modules
        // it imports from the rest of the repository, so it always runs.
        await runShown(
          "./gradlew",
          [
            "app:createBundleReleaseJsAndAssets",
            "--rerun",
            "app:assembleRelease",
          ],
          `${appDirectory}android`,
          device.buildEnvironment,
        );
        adb(device.id, [
          "install",
          "-r",
          `${appDirectory}android/app/build/outputs/apk/release/app-release.apk`,
        ]);
      }
    }
    if (platform === "ios") {
      if (!build) run("xcrun", ["simctl", "launch", device.id, appId]);
    } else {
      // An emulator that boots from its quick-boot snapshot loses an app
      // installed after the snapshot.
      if (
        !adb(device.id, ["shell", "pm", "list", "packages", appId])
          .split("\n")
          .includes(`package:${appId}`)
      )
        throw new Error(
          `${device.id} doesn't have the app installed; run without --skip-build.`,
        );
      adb(device.id, [
        "shell",
        "monkey",
        "-p",
        appId,
        "-c",
        "android.intent.category.LAUNCHER",
        "1",
      ]);
    }

    const error = await finished;
    if (error != null) throw error;
    const loadAveragesEnd = loadavg();

    return TargetResult.orThrow({
      id: `react-native-${platform}`,
      label: `React Native ${meta?.reactNative ?? ""}, ${device.description}`,
      createdAt,
      environment: {
        ...describeMachine(),
        ...device.environment,
        "React Native": meta?.reactNative ?? "unknown",
        Hermes: meta?.hermes ?? "unknown",
      },
      loadAverages: { start: loadAveragesStart, end: loadAveragesEnd },
      notes: [],
      evoluStackId: "evolu",
      evoluEncryptedStackId: "evoluEncrypted",
      referenceStackId: "expoSqlite",
      stacks: definitions.map(
        (definition) =>
          recorders.get(definition.id)?.toResult() ?? {
            type: "Failed",
            ...definition,
            error: "No recorder.",
          },
      ),
    });
  } finally {
    clearTimeout(timeout);
    server.close();
    // An app that timed out or failed would go on running its workloads.
    stopApp();
    if (platform === "android")
      spawnSync(adbPath, [
        "-s",
        device.id,
        "reverse",
        "--remove",
        `tcp:${reactNativeServerPort}`,
      ]);
  }
};
