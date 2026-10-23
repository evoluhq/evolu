/**
 * `cpp/CMakeLists.txt`, configured on the host inside a stand-in for the app's
 * CMake project, with React Native's targets stubbed, as the app adds it
 * through autolinking (`ReactNative-application.cmake`): its refusal of a
 * native/ that the vendor step didn't write from native.json, and what reaches
 * the app's own target, which compiles the generated autolinking.cpp under
 * -Wall -Werror and includes `EvoluSqlite.h`. Only `cpp/` may, and no define or
 * option of Evolu's, such as `RN_STRICT_API`, which that file would fail. The
 * app then links `common_flags` into the target with the plain signature, which
 * CMake refuses after a keyword one.
 */
import { assert, assertEqual, assertTrue } from "@evolu/common";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { NativeManifest } from "../../scripts/vendor-native.mts";

const packageDirectory = fileURLToPath(new URL("../../", import.meta.url));
const manifestText = readFileSync(join(packageDirectory, "native.json"));
const manifest = JSON.parse(manifestText.toString("utf8")) as NativeManifest;

/**
 * CMake from the PATH, else the newest of the Android SDK, which every machine
 * that builds React Native for Android has.
 */
const cmake = ((): string => {
  if (spawnSync("cmake", ["--version"]).status === 0) return "cmake";
  const sdk = join(
    process.env.ANDROID_HOME ?? join(homedir(), "Library/Android/sdk"),
    "cmake",
  );
  const [newest] = existsSync(sdk)
    ? readdirSync(sdk).toSorted((a, b) =>
        b.localeCompare(a, "en", { numeric: true }),
      )
    : [];
  assert(newest != null, "CMake isn't on the PATH or in the Android SDK.");
  return join(sdk, newest, "bin/cmake");
})();

interface CompileCommand {
  readonly file: string;
  readonly command: string;
}

/**
 * Configures the stand-in app with a copy of the package whose native/ has
 * `digest`, or none, and CMake's `args`, and returns CMake's result with the
 * compile commands it generated.
 */
const configure = (
  t: TestContext,
  digest: string | null,
  args: ReadonlyArray<string> = [],
) => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-cmake-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const evolu = join(directory, "evolu");
  cpSync(join(packageDirectory, "cpp"), join(evolu, "cpp"), {
    recursive: true,
  });
  cpSync(join(packageDirectory, "native.json"), join(evolu, "native.json"));
  if (digest != null) {
    for (const subdirectory of ["include", "units"])
      mkdirSync(join(evolu, "native", subdirectory), { recursive: true });
    writeFileSync(join(evolu, "native/units/sqlite3.c"), "");
    writeFileSync(join(evolu, "native/units/evolu_codec.c"), "");
    writeFileSync(join(evolu, "native/native.json.sha256"), digest);
  }
  const app = join(directory, "app");
  mkdirSync(app);
  writeFileSync(join(app, "autolinking.cpp"), "");
  writeFileSync(
    join(app, "CMakeLists.txt"),
    `cmake_minimum_required(VERSION 3.13)
project(appmodules C CXX)
add_library(jsi INTERFACE)
add_library(reactnative INTERFACE)
add_library(react_codegen_EvoluReactNativeSpec INTERFACE)
add_library(common_flags INTERFACE)
add_library(appmodules SHARED autolinking.cpp)
# As ReactNative-application.cmake sets it when its IPO check passes.
set(CMAKE_INTERPROCEDURAL_OPTIMIZATION TRUE)
add_subdirectory(${JSON.stringify(join(evolu, "cpp"))} evolu_sqlite_autolinked_build)
target_link_libraries(appmodules evolu_sqlite)
target_link_libraries(evolu_sqlite common_flags)
`,
  );
  const build = join(directory, "build");
  const configured = spawnSync(
    cmake,
    [
      "-S",
      app,
      "-B",
      build,
      "-G",
      "Unix Makefiles",
      "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
      ...args,
    ],
    { encoding: "utf8" },
  );
  const commandsFile = join(build, "compile_commands.json");
  return {
    evolu,
    build,
    configured,
    commands: existsSync(commandsFile)
      ? (JSON.parse(
          readFileSync(commandsFile, "utf8"),
        ) as Array<CompileCommand>)
      : [],
  };
};

const manifestDigest = `${createHash("sha256").update(manifestText).digest("hex")}\n`;

// CMake wraps a message's lines.
const refusal =
  "@evolu/react-native's native/ is missing or wasn't written from its native.json. In Evolu's repository, run node packages/react-native/scripts/vendor-native.mts.";
const stderrIncludesRefusal = (stderr: string) =>
  stderr.replaceAll(/\s+/gu, " ").includes(refusal);

test("gives the app's target only cpp/ as an include directory and none of Evolu's flags, and Evolu's targets native.json's", (t) => {
  const { evolu, configured, commands } = configure(t, manifestDigest);
  assertEqual(configured.status, 0);

  const commandOf = (file: string) => {
    const found = commands.find((command) => command.file.endsWith(file));
    assert(found != null, `No compile command for ${file}.`);
    return found.command;
  };
  const includes = (command: string) =>
    [...command.matchAll(/(?:^| )(?:-I|-isystem ?)(\S+)/gu)].map(
      ([, path]) => path,
    );

  const appCommand = commandOf("app/autolinking.cpp");
  assertEqual(
    includes(appCommand).map((path) => path.replace(evolu, "<evolu>")),
    ["<evolu>/cpp"],
  );
  for (const flag of ["RN_STRICT_API", "EVOLU_NATIVE_PACKAGE", "-fvisibility"])
    assertTrue(!appCommand.includes(flag));

  for (const unit of ["native/units/sqlite3.c", "native/units/evolu_codec.c"]) {
    const command = commandOf(unit);
    for (const flag of [
      ...manifest.flags.defines.map((define) => `-D${define}`),
      ...manifest.flags.c,
      ...manifest.flags.android.c,
      `-I${join(evolu, manifest.flags.headerSearchPath)}`,
    ])
      assertTrue(command.split(" ").includes(flag));
    assertTrue(!command.includes("RN_STRICT_API"));
    // The constant-time C isn't inlined across files.
    assertTrue(!command.includes("-flto"));
  }
  // IPO is on, as the C target's lack of -flto would otherwise prove nothing.
  assertTrue(commandOf("cpp/EvoluSqlite.cpp").includes("-flto"));

  for (const unit of ["cpp/EvoluSqlite.cpp", "cpp/EvoluSqliteBinding.cpp"]) {
    const command = commandOf(unit);
    for (const flag of [
      "-DRN_STRICT_API",
      "-std=c++20",
      "-fexceptions",
      "-frtti",
      "-fvisibility=hidden",
      `-I${join(evolu, manifest.flags.headerSearchPath)}`,
    ])
      assertTrue(command.split(" ").includes(flag));
  }
});

test("keeps the C out of LTO also when the app passes -flto in its C flags", (t) => {
  const { configured, commands } = configure(t, manifestDigest, [
    "-DCMAKE_C_FLAGS=-flto",
  ]);
  assertEqual(configured.status, 0);

  for (const unit of ["native/units/sqlite3.c", "native/units/evolu_codec.c"]) {
    const found = commands.find((command) => command.file.endsWith(unit));
    assert(found != null, `No compile command for ${unit}.`);
    const tokens = found.command.split(" ");
    // The last of them wins.
    assertTrue(tokens.includes("-flto"));
    assertTrue(tokens.lastIndexOf("-fno-lto") > tokens.lastIndexOf("-flto"));
  }
});

test("refuses to build once native.json changes after the configure, as after a pull, until the vendor step rewrites native/", (t) => {
  const { evolu, build, configured } = configure(t, manifestDigest);
  assertEqual(configured.status, 0);
  const buildC = () =>
    spawnSync(cmake, ["--build", build, "--target", "evolu_sqlite_c"], {
      encoding: "utf8",
    });
  assertEqual(buildC().status, 0);

  appendFileSync(join(evolu, "native.json"), " ");
  const rebuilt = buildC();

  assertTrue(rebuilt.status !== 0);
  assertTrue(stderrIncludesRefusal(`${rebuilt.stdout}${rebuilt.stderr}`));
});

test("refuses a package without native/, naming the vendor step", (t) => {
  const { configured } = configure(t, null);

  assertEqual(configured.status, 1);
  assertTrue(stderrIncludesRefusal(configured.stderr));
});

test("refuses a native/ written from another native.json, or not matching it, which has no digest", (t) => {
  for (const digest of [`${"0".repeat(64)}\n`, ""]) {
    const { configured } = configure(t, digest);

    assertEqual(configured.status, 1);
    assertTrue(stderrIncludesRefusal(configured.stderr));
  }
});
