import { assertEqual, assertTrue, err, trySync } from "@evolu/common";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import {
  compareAppSize,
  measureAndroidApp,
  measureIosApp,
  type AppSizeEntry,
} from "./measure.mts";

const script = fileURLToPath(new URL("measure.mts", import.meta.url));

describe("measureIosApp", () => {
  it("measures the .app and attributes the executable's live, file-backed symbols by library", (t) => {
    assertEqual(measureIosApp(setupIosApp(t)), {
      app: 10_550,
      executable: 5000,
      executableByLibrary: {
        // _main and the entitlements blob.
        app: 0x40 + 0x40,
        // Three symbols, not the zero-fill ones or the dead-stripped one.
        "libEvoluReactNative.a": 0x400 + 0x200 + 0x6,
        "libReactCodegen.a": 0x20 + 0x30,
        linkerSynthesized: 0x10,
        // React.framework's and libc++'s.
        stubs: 0xc + 0x8,
      },
      frameworks: { "React.framework": 2000 },
      jsBundle: 3000,
      evolu: 0x400 + 0x200 + 0x6 + 0x20,
    });
  });

  it("fails when the link map has no Evolu library", (t) => {
    const { app, linkMap } = setupIosApp(t);
    writeFileSync(
      linkMap,
      readFileSync(linkMap, "latin1")
        .split("\n")
        .filter((line) => !line.includes("[  3]") && !line.includes("[  4]"))
        .join("\n"),
      "latin1",
    );

    assertEqual(
      trySync(() => measureIosApp({ app, linkMap }), errorMessage),
      err(`${linkMap} has no libEvoluReactNative.a.`),
    );
  });
});

describe("measureAndroidApp", () => {
  it("measures the arm64-v8a libraries and the APK's parts, uncompressed", (t) => {
    const apk = setupApk(t, apkEntries);

    assertEqual(measureAndroidApp(apk), {
      apk: statSync(apk).size,
      libs: { "libappmodules.so": 700, "libhermesvm.so": 900 },
      dex: 1000 + 500,
      jsBundle: 2000,
      assets: 600,
      resources: 400 + 200,
    });
  });

  it("fails for an APK without arm64-v8a libraries", (t) => {
    const apk = setupApk(
      t,
      apkEntries.filter(([name]) => !name.startsWith("lib/arm64-v8a/")),
    );

    assertEqual(
      trySync(() => measureAndroidApp(apk), errorMessage),
      err(`${apk} has no arm64-v8a libraries.`),
    );
  });
});

describe("compareAppSize", () => {
  const baseline: AppSizeEntry = {
    image: "macos26 20261026.1",
    app: 10_000,
    executable: 5000,
    frameworks: { "Old.framework": 300, "React.framework": 2000 },
    jsBundle: 3000,
  };

  it("warns about nothing when no size differs", () => {
    assertEqual(
      compareAppSize({
        key: "expo-ios",
        baseline,
        entry: { ...baseline, image: "macos26 20261102.1" },
      }),
      {
        summary: [
          "### App size: expo-ios",
          "",
          "Measured on macos26 20261102.1, the baseline on macos26 20261026.1.",
          "",
          "| Size | Baseline | Now | Difference |",
          "| :--- | ---: | ---: | ---: |",
          "| app | 10,000 | 10,000 |  |",
          "| executable | 5,000 | 5,000 |  |",
          "| frameworks / Old.framework | 300 | 300 |  |",
          "| frameworks / React.framework | 2,000 | 2,000 |  |",
          "| jsBundle | 3,000 | 3,000 |  |",
          "",
        ].join("\n"),
        warning: null,
      },
    );
  });

  it("shows and counts each size that grew, shrank, appeared or disappeared", () => {
    assertEqual(
      compareAppSize({
        key: "expo-ios",
        baseline,
        entry: {
          image: "macos26 20261026.1",
          app: 10_250,
          executable: 4900,
          frameworks: { "New.framework": 50, "React.framework": 2000 },
          jsBundle: 3000,
        },
      }),
      {
        summary: [
          "### App size: expo-ios",
          "",
          "Measured on macos26 20261026.1, the baseline on macos26 20261026.1.",
          "",
          "| Size | Baseline | Now | Difference |",
          "| :--- | ---: | ---: | ---: |",
          "| app | 10,000 | 10,250 | +250 |",
          "| executable | 5,000 | 4,900 | -100 |",
          "| frameworks / New.framework |  | 50 | new |",
          "| frameworks / React.framework | 2,000 | 2,000 |  |",
          "| jsBundle | 3,000 | 3,000 |  |",
          "| frameworks / Old.framework | 300 |  | removed |",
          "",
        ].join("\n"),
        warning:
          "4 of expo-ios's sizes differ from bench/app-size/baselines.json.",
      },
    );
  });

  it("warns when the key has no baseline", () => {
    const { summary, warning } = compareAppSize({
      key: "cli-ios",
      baseline: undefined,
      entry: baseline,
    });

    assertTrue(
      summary.includes(
        "\nMeasured on macos26 20261026.1. `bench/app-size/baselines.json` has no entry for it.\n",
      ),
    );
    assertTrue(summary.includes("\n| app |  | 10,000 | new |\n"));
    assertEqual(
      warning,
      "bench/app-size/baselines.json has no entry for cli-ios.",
    );
  });
});

describe("measure.mts", () => {
  it("writes an iOS entry, appends its comparison to the summary, and warns about its missing baseline", (t) => {
    const { app, linkMap } = setupIosApp(t);
    const files = setupOutput(t, {});

    const result = run([
      "--key=expo-ios",
      "--image=macos26 20261102.1",
      `--app=${app}`,
      `--link-map=${linkMap}`,
      ...files.args,
    ]);

    assertEqual(
      [result.status, result.stdout, result.stderr],
      [
        0,
        "::warning title=App size::bench/app-size/baselines.json has no entry for expo-ios.\n",
        "",
      ],
    );
    assertEqual(
      JSON.parse(readFileSync(join(files.out, "expo-ios.json"), "utf8")),
      {
        "expo-ios": {
          image: "macos26 20261102.1",
          ...measureIosApp({ app, linkMap }),
        },
      },
    );
    assertTrue(
      readFileSync(files.summary, "utf8").startsWith(
        "Earlier step\n### App size: expo-ios\n",
      ),
    );
  });

  it("writes an Android entry without a warning when it matches its baseline", (t) => {
    const apk = setupApk(t, apkEntries);
    const entry = { image: "ubuntu24 20261102.1", ...measureAndroidApp(apk) };
    const files = setupOutput(t, {
      "cli-android": { ...entry, image: "ubuntu24 20261026.1" },
    });

    const result = run([
      "--key=cli-android",
      `--image=${entry.image}`,
      `--apk=${apk}`,
      ...files.args,
    ]);

    assertEqual([result.status, result.stdout, result.stderr], [0, "", ""]);
    assertEqual(
      readFileSync(join(files.out, "cli-android.json"), "utf8"),
      `${JSON.stringify({ "cli-android": entry }, null, 2)}\n`,
    );
  });

  it("fails without either --apk, or --app and --link-map", (t) => {
    const { app } = setupIosApp(t);
    const files = setupOutput(t, {});

    const result = run([
      "--key=expo-ios",
      "--image=macos26 20261102.1",
      `--app=${app}`,
      ...files.args,
    ]);

    assertEqual(result.status, 1);
    assertTrue(
      result.stderr.includes("Pass either --apk, or --app and --link-map."),
    );
  });
});

const run = (args: ReadonlyArray<string>) =>
  spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "";

/** A temporary directory, removed after the test. */
const setupDirectory = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-app-size-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
};

/**
 * An `expoapp.app` of 10,550 bytes, with a 5,000-byte executable, a 3,000-byte
 * `main.jsbundle` and a 2,000-byte React framework binary, and a link map with
 * an object file of each group, symbols in zero-fill sections, a dead-stripped
 * symbol and a symbol name that isn't UTF-8.
 */
const setupIosApp = (t: TestContext) => {
  const directory = setupDirectory(t);
  const products = join(directory, "Products/Release-iphonesimulator");
  const app = join(products, "expoapp.app");
  for (const [file, size] of [
    ["expoapp", 5000],
    ["main.jsbundle", 3000],
    ["Info.plist", 100],
    ["Frameworks/React.framework/React", 2000],
    ["Frameworks/React.framework/Info.plist", 50],
    ["assets/logo.png", 400],
  ] as const) {
    mkdirSync(dirname(join(app, file)), { recursive: true });
    writeFileSync(join(app, file), Buffer.alloc(size));
  }

  const build = join(
    directory,
    "Intermediates.noindex/expoapp.build/Release-iphonesimulator/expoapp.build",
  );
  const linkMap = join(build, "expoapp-LinkMap-normal-arm64.txt");
  mkdirSync(build, { recursive: true });
  writeFileSync(
    linkMap,
    [
      `# Path: ${app}/expoapp`,
      "# Arch: arm64",
      "# Object files:",
      "[  0] linker synthesized",
      `[  1] ${build}/Objects-normal/arm64/AppDelegate.o`,
      `[  2] ${build}/expoapp.app-Simulated.xcent.der`,
      `[  3] ${products}/EvoluReactNative/libEvoluReactNative.a(EvoluSqlite.o)`,
      `[  4] ${products}/EvoluReactNative/libEvoluReactNative.a(evolu_sqlite.o)`,
      `[  5] ${products}/ReactCodegen/libReactCodegen.a(EvoluReactNativeSpec-generated.o)`,
      `[  6] ${products}/ReactCodegen/libReactCodegen.a(rnscreens-generated.o)`,
      `[  7] ${directory}/XCFrameworkIntermediates/React-Core-prebuilt/React.framework/React`,
      "[  8] /Applications/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform/Developer/SDKs/iPhoneSimulator.sdk/usr/lib/libc++.tbd",
      "# Sections:",
      "# Address\tSize    \tSegment\tSection",
      "0x100000000\t0x00001000\t__TEXT\t__text",
      "0x100001000\t0x00000100\t__TEXT\t__cstring",
      "0x100001100\t0x00000040\t__TEXT\t__ents_der",
      "0x100004000\t0x00000100\t__DATA\t__data",
      "0x100004100\t0x00000100\t__DATA\t__bss",
      "0x100004200\t0x00000100\t__DATA\t__common",
      "# Symbols:",
      "# Address\tSize    \tFile  Name",
      "0x100000000\t0x00000000\t[  0] __mh_execute_header",
      "0x100000000\t0x00000040\t[  1] _main",
      "0x100000040\t0x00000400\t[  3] _evolu_open",
      "0x100000440\t0x00000200\t[  4] _sqlite3_open",
      "0x100000640\t0x00000020\t[  5] _EvoluReactNativeSpec",
      "0x100000660\t0x00000030\t[  6] _rnscreens",
      "0x100000690\t0x0000000C\t[  7] _React_stub",
      "0x10000069C\t0x00000008\t[  8] _libcxx_stub",
      "0x100001000\t0x00000006\t[  4] literal string: café",
      "0x100001100\t0x00000040\t[  2] entitlements",
      "0x100004000\t0x00000010\t[  0] __dyld_private",
      "0x100004100\t0x00000008\t[  4] _sqlite3_zero",
      "0x100004200\t0x00000004\t[  3] _evolu_common",
      "",
      "# Dead Stripped Symbols:",
      "#        \tSize    \tFile  Name",
      "<<dead>>\t0x00000100\t[  3] _unused",
      "",
    ].join("\n"),
    // So "é" is the single byte 0xE9, which isn't UTF-8.
    "latin1",
  );
  return { app, linkMap };
};

/** Name, uncompressed size and whether the APK compresses the entry. */
const apkEntries: ReadonlyArray<readonly [string, number, boolean]> = [
  ["AndroidManifest.xml", 300, true],
  ["classes.dex", 1000, true],
  ["classes2.dex", 500, true],
  ["lib/arm64-v8a/libappmodules.so", 700, false],
  ["lib/arm64-v8a/libhermesvm.so", 900, false],
  ["lib/x86_64/libappmodules.so", 800, false],
  ["assets/index.android.bundle", 2000, true],
  ["assets/fonts/Font.ttf", 600, true],
  ["resources.arsc", 400, false],
  ["res/drawable/icon.png", 200, false],
  ["META-INF/CERT.SF", 100, true],
];

/** An APK of `entries`, each holding its size in repeated bytes. */
const setupApk = (
  t: TestContext,
  entries: ReadonlyArray<readonly [string, number, boolean]>,
): string => {
  const parts: Array<Buffer> = [];
  const centralDirectory: Array<Buffer> = [];
  let offset = 0;
  for (const [name, size, compress] of entries) {
    const data = Buffer.alloc(size, "a");
    const stored = compress ? deflateRawSync(data) : data;
    const fileName = Buffer.from(name);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(compress ? 8 : 0, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(fileName.length, 26);
    parts.push(local, fileName, stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(compress ? 8 : 0, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);
    centralDirectory.push(central, fileName);

    offset += local.length + fileName.length + stored.length;
  }
  const directory = Buffer.concat(centralDirectory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  const apk = join(setupDirectory(t), "app-release.apk");
  writeFileSync(apk, Buffer.concat([...parts, directory, end]));
  return apk;
};

/** The baselines file, an output directory and a summary file to append to. */
const setupOutput = (t: TestContext, baselines: object) => {
  const directory = setupDirectory(t);
  const out = join(directory, "app-size");
  const summary = join(directory, "summary.md");
  const baselinesFile = join(directory, "baselines.json");
  writeFileSync(baselinesFile, JSON.stringify(baselines));
  writeFileSync(summary, "Earlier step\n");
  return {
    out,
    summary,
    args: [
      `--baselines=${baselinesFile}`,
      `--out=${out}`,
      `--summary=${summary}`,
    ],
  };
};
