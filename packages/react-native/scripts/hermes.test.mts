/**
 * The Hermes host script's build, runs, coverage gate and command line, with a
 * fake clang that links a shell script as the host, a fake llvm-profdata and
 * llvm-cov, and a tarball seeded into the cache, so they need no network,
 * Hermes or compiler, and test:unit runs them too. `test:react-native-hermes`
 * runs the real one.
 */
import {
  assert,
  assertEqual,
  assertFalse,
  assertRejects,
  assertTrue,
} from "@evolu/common";
import type { PinnedArchive } from "@evolu/sqlite-core/scripts/sqlite-source.mts";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { hermesTarball, runHermesCli, runHermesTests } from "./hermes.mts";

describe("runHermesTests", () => {
  it("passes when both hosts pass and cover all of cpp/EvoluSqliteBinding.cpp", async (t) => {
    const fake = setupFakeHermes(t);

    const result = await fake.run();

    assertTrue(result.passed);
    assertEqual(result.output, [
      "## AddressSanitizer and UndefinedBehaviorSanitizer",
      "ok 1 - suite.js in a directory of only ill-formed-names.db, filter ''",
      "## ThreadSanitizer",
      "ok 1 - suite.js in a directory of only ill-formed-names.db, filter ''",
      "## Coverage of cpp/EvoluSqliteBinding.cpp: 10 of 10 lines, 2 of 2 functions, 4 of 4 branches",
      "",
    ]);
  });

  it("builds a host per sanitizer set from the shipped units with test hooks, the adapter with warnings as errors and, in the AddressSanitizer build alone, coverage, linked to the tarball's Hermes framework", async (t) => {
    const fake = setupFakeHermes(t);

    await fake.run();

    const commands = fake.commands();
    const address = [
      "-fsanitize=address,undefined",
      "-fno-sanitize-recover=all",
    ];
    const thread = ["-fsanitize=thread"];
    const hermes = fake.unpacked();
    const shipped = [
      "-g",
      "-O1",
      "-fno-omit-frame-pointer",
      "-DEVOLU_NATIVE_PACKAGE",
      "-DSQLITE_CUSTOM_INCLUDE=sqlite_config.h",
      "-DEVOLU_TEST_HOOKS",
      `-I${fake.packageDirectory}/native/include`,
    ];
    const cxx = [
      "-std=c++20",
      "-Wall",
      "-Wextra",
      "-Werror",
      `-isystem${hermes}/destroot/include`,
    ];
    const compileOf = (source: string, sanitizer: ReadonlyArray<string>) =>
      commands.find(
        (args) =>
          args.includes(join(fake.packageDirectory, source)) &&
          sanitizer.every((flag) => args.includes(flag)),
      ) ?? [];
    for (const sanitizer of [address, thread]) {
      for (const unit of ["evolu_database", "sqlite3"]) {
        const compile = compileOf(`native/units/${unit}.c`, sanitizer);
        for (const flag of ["-std=c11", ...shipped])
          assert(compile.includes(flag), `${unit}.c has ${flag}`);
        assertFalse(compile.includes("-fprofile-instr-generate"));
      }
      const adapter = compileOf("cpp/EvoluSqliteBinding.cpp", sanitizer);
      for (const flag of [...shipped, ...cxx])
        assert(adapter.includes(flag), `the adapter has ${flag}`);
      assertEqual(
        adapter.includes("-fprofile-instr-generate"),
        sanitizer === address,
      );
      const host = compileOf("test/hermes/host.cpp", sanitizer);
      for (const flag of [...shipped, ...cxx, `-I${fake.packageDirectory}/cpp`])
        assert(host.includes(flag), `the host has ${flag}`);
      assertFalse(host.includes("-fprofile-instr-generate"));
    }
    const links = commands.filter((args) => !args.includes("-c"));
    assertEqual(links.length, 2);
    for (const [link, sanitizer] of [
      [links[0], address],
      [links[1], thread],
    ] as const) {
      assertEqual(link[0], fake.cxx);
      const framework = `${hermes}/destroot/Library/Frameworks/macosx`;
      for (const flag of [
        ...sanitizer,
        `-F${framework}`,
        "hermesvm",
        `-Wl,-rpath,${framework}`,
      ])
        assert(link.includes(flag), `the link has ${flag}`);
      assertEqual(
        link.includes("-fprofile-instr-generate"),
        sanitizer === address,
      );
      // The units, the adapter and the host.
      assertEqual(link.filter((arg) => arg.endsWith(".o")).length, 4);
    }
  });

  it("unpacks only the tarball's framework and headers, once", async (t) => {
    const fake = setupFakeHermes(t);

    await fake.run();
    const hermes = fake.unpacked();
    writeFileSync(join(hermes, "kept"), "");
    await fake.run();

    assertTrue(existsSync(join(hermes, "kept")));
    assertEqual(readdirSync(join(hermes, "destroot")).toSorted(), [
      "Library",
      "include",
    ]);
    assertTrue(
      existsSync(
        join(
          hermes,
          "destroot/Library/Frameworks/macosx/hermesvm.framework/hermesvm",
        ),
      ),
    );
    assertTrue(existsSync(join(hermes, "destroot/include/jsi/jsi.h")));
    assertFalse(
      existsSync(join(hermes, "destroot/Library/Frameworks/universal")),
    );
  });

  it("uses the Hermes another run unpacked while this one unpacked it", async (t) => {
    const fake = setupFakeHermes(t);
    // The other run unpacks into the directory the work directory's name
    // extends, and leaves a mark.
    const tar = setupFakeTar(
      fake.directory,
      'mkdir "${4%.*}" && tar "$1" "$2" -C "${4%.*}" "$5" "$6" && : > "${4%.*}/other-run"',
    );

    const result = await runHermesTests({ ...fake.cliOptions, tar });

    assertTrue(result.passed);
    assertTrue(existsSync(join(fake.unpacked(), "other-run")));
    assertEqual(readdirSync(dirname(fake.unpacked())), [
      basename(fake.unpacked()),
    ]);
  });

  it("throws why it couldn't move the unpacked Hermes into place when no other run did", async (t) => {
    const fake = setupFakeHermes(t);
    const tar = setupFakeTar(fake.directory, 'rm -rf "$4"');

    await assertRejects(
      runHermesTests({ ...fake.cliOptions, tar }),
      (error) => {
        assertEqual((error as NodeJS.ErrnoException).code, "ENOENT");
      },
    );

    assertEqual(readdirSync(dirname(fake.unpacked())), []);
    assertEqual(fake.commands(), []);
  });

  it("refuses a tarball whose SHA3-256 isn't the pin before it unpacks or builds anything", async (t) => {
    const fake = setupFakeHermes(t);
    writeFileSync(fake.cachedTarball, "not the pinned tarball");

    await assertRejects(fake.run(), (error) => {
      assertTrue(
        (error as Error).message.startsWith(
          `${fake.cachedTarball}: sha3-256 ${createHash("sha3-256").update("not the pinned tarball").digest("hex")}, pinned `,
        ),
      );
    });

    assertFalse(existsSync(join(fake.env.SQLITE_CORE_BUILD, "hermes")));
    assertEqual(fake.commands(), []);
  });

  it("refuses native/ that is missing or was written for another native.json", async (t) => {
    const fake = setupFakeHermes(t);
    const digest = join(fake.packageDirectory, "native/native.json.sha256");
    const refused = () =>
      assertRejects(fake.run(), (error) => {
        assertEqual(
          (error as Error).message,
          "native/ is missing or was written for another native.json. Run node packages/react-native/scripts/vendor-native.mts first.",
        );
      });

    writeFileSync(digest, `${"0".repeat(64)}\n`);
    await refused();
    rmSync(digest);
    await refused();

    assertEqual(fake.commands(), []);
  });

  it("fails when a host's test fails, measuring no coverage", async (t) => {
    const fake = setupFakeHermes(t);
    fake.setProgram(
      [
        "#!/bin/sh",
        'case "$0" in',
        '  *thread*) echo "not ok 1 - raced"; exit 1 ;;',
        "esac",
        'echo "ok 1 - raced"',
      ].join("\n"),
    );

    const result = await fake.run();

    assertFalse(result.passed);
    assertEqual(result.output, [
      "## AddressSanitizer and UndefinedBehaviorSanitizer",
      "ok 1 - raced",
      "## ThreadSanitizer",
      "not ok 1 - raced",
      "",
    ]);
  });

  it("fails when a host crashes, naming the signal, and runs the other", async (t) => {
    const fake = setupFakeHermes(t);
    fake.setProgram(
      [
        "#!/bin/sh",
        'case "$0" in',
        '  *address*) echo "ok 1 - before"; kill -SEGV $$ ;;',
        "esac",
        'echo "ok 1 - before"',
      ].join("\n"),
    );

    const result = await fake.run();

    assertFalse(result.passed);
    assertEqual(result.output, [
      "## AddressSanitizer and UndefinedBehaviorSanitizer",
      "ok 1 - before",
      "",
      "Killed by SIGSEGV.",
      "## ThreadSanitizer",
      "ok 1 - before",
      "",
    ]);
  });

  it("fails when a host prints more than it takes, killing it and saying why", async (t) => {
    const fake = setupFakeHermes(t);
    fake.setProgram("#!/bin/sh\nyes");

    const result = await fake.run();

    assertFalse(result.passed);
    assertTrue(
      result.output.includes(
        `Killed by SIGKILL: spawnSync ${fake.env.SQLITE_CORE_BUILD}/hermes-host-thread ENOBUFS.`,
      ),
    );
  });

  it("throws when a host can't start", async (t) => {
    const fake = setupFakeHermes(t);
    fake.setProgram("", 0o644);

    await assertRejects(fake.run(), (error) => {
      assertEqual((error as NodeJS.ErrnoException).code, "EACCES");
    });
  });

  it("fails on a gap in cpp/EvoluSqliteBinding.cpp's coverage, listing it, and when the build didn't instrument it", async (t) => {
    const fake = setupFakeHermes(t);
    fake.setCoverage("gap");

    const gap = await fake.run();
    fake.setCoverage("uninstrumented");
    const uninstrumented = await fake.run();

    assertFalse(gap.passed);
    assertEqual(gap.output.slice(-3), [
      "## Coverage of cpp/EvoluSqliteBinding.cpp: 9 of 10 lines, 2 of 2 functions, 4 of 4 branches",
      "cpp/EvoluSqliteBinding.cpp:7: line never ran",
      "",
    ]);
    assertFalse(uninstrumented.passed);
    assertEqual(uninstrumented.output.slice(-3), [
      "## Coverage of cpp/EvoluSqliteBinding.cpp: 0 of 0 lines, 0 of 0 functions, 0 of 0 branches",
      "cpp/EvoluSqliteBinding.cpp isn't in the report, so the build didn't instrument it.",
      "",
    ]);
  });

  it("passes a filter to both hosts and lists the gaps of a filtered run without failing", async (t) => {
    const fake = setupFakeHermes(t);
    fake.setCoverage("gap");

    const result = await fake.run("teardown_");

    assertTrue(result.passed);
    assertEqual(result.output, [
      "## AddressSanitizer and UndefinedBehaviorSanitizer",
      "ok 1 - suite.js in a directory of only ill-formed-names.db, filter 'teardown_'",
      "## ThreadSanitizer",
      "ok 1 - suite.js in a directory of only ill-formed-names.db, filter 'teardown_'",
      "## Coverage of cpp/EvoluSqliteBinding.cpp: 9 of 10 lines, 2 of 2 functions, 4 of 4 branches",
      "cpp/EvoluSqliteBinding.cpp:7: line never ran",
      "A filtered run leaves gaps, which fail only a full one.",
      "",
    ]);
  });

  it("compiles the suite to a script that defines EvoluHermesSuite, as Hermes evaluates no module", async (t) => {
    const fake = setupFakeHermes(t);
    // Evaluates the script as a script, as the host does, and calls it.
    const evaluate = join(fake.directory, "evaluate.cjs");
    writeFileSync(
      evaluate,
      [
        'const { readFileSync } = require("node:fs");',
        'const { runInThisContext } = require("node:vm");',
        'runInThisContext(readFileSync(process.argv[2], "utf8"));',
        "process.stdout.write(JSON.stringify(EvoluHermesSuite.values()));",
        "",
      ].join("\n"),
    );
    fake.setProgram(
      [
        "#!/bin/sh",
        writeProfile,
        `echo "ok 1 - $('${process.execPath}' '${evaluate}' "$1")"`,
      ].join("\n"),
    );

    const result = await fake.run();

    assertEqual(result.output.slice(0, 2), [
      "## AddressSanitizer and UndefinedBehaviorSanitizer",
      'ok 1 - ["suite",1]',
    ]);
  });
});

describe("runHermesCli", () => {
  it("prints the run and returns its exit code, and takes a filter", async (t) => {
    const fake = setupFakeHermes(t);
    const logged: Array<string> = [];
    const log = t.mock.method(console, "log", (text: string) => {
      logged.push(text);
    });

    const passed = await runHermesCli(["teardown_"], fake.cliOptions);
    fake.setProgram('#!/bin/sh\necho "not ok 1 - x"\nexit 1');
    const failed = await runHermesCli([], fake.cliOptions);
    log.mock.restore();

    assertEqual([passed, failed], [0, 1]);
    assertEqual(logged.length, 2);
    assertTrue(logged[0].includes("filter 'teardown_'"));
    assertTrue(logged[1].includes("not ok 1 - x"));
  });

  it("runs as a script, which verifies the cached tarball against the pin", (t) => {
    const fake = setupFakeHermes(t);
    mkdirSync(fake.env.SQLITE_CORE_CACHE, { recursive: true });
    writeFileSync(
      join(fake.env.SQLITE_CORE_CACHE, hermesTarball.file),
      "not the pinned tarball",
    );

    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("hermes.mts", import.meta.url))],
      { env: { ...process.env, ...fake.env }, encoding: "utf8" },
    );

    assertEqual(result.status, 1);
    assertTrue(
      result.stderr.includes(
        `${join(fake.env.SQLITE_CORE_CACHE, hermesTarball.file)}: sha3-256 `,
      ),
    );
  });
});

it("pins the debug tarball on Maven Central of the Hermes version React Native names, as its podspec takes", () => {
  const properties = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.resolve("react-native/package.json"))),
      "sdks/hermes-engine/version.properties",
    ),
    "utf8",
  );
  const version = /^HERMES_VERSION_NAME=(.+)$/mu.exec(properties)?.[1];
  const file = `hermes-ios-${version}-hermes-ios-debug.tar.gz`;

  assertEqual(hermesTarball, {
    url: `https://repo1.maven.org/maven2/com/facebook/hermes/hermes-ios/${version}/${file}`,
    file,
    hash: hermesTarball.hash,
  });
  assertTrue(/^[0-9a-f]{64}$/u.test(hermesTarball.hash));
});

/**
 * Writes a tar into `directory` that runs the one on PATH and then the shell
 * line `after`, with `$1` to `$6` the arguments: `-xzf`, the tarball, `-C`, the
 * work directory and two members, and returns its path.
 */
const setupFakeTar = (directory: string, after: string): string => {
  const tar = join(directory, "tar");
  writeFileSync(tar, ["#!/bin/sh", 'tar "$@" || exit', after, ""].join("\n"), {
    mode: 0o755,
  });
  return tar;
};

/** The line of a fake host that writes a profile, as an instrumented one does. */
const writeProfile =
  'if [ -n "$LLVM_PROFILE_FILE" ]; then : > "${LLVM_PROFILE_FILE%/*}/$$.profraw"; fi';

/**
 * Sets up a fake clang, llvm-profdata and llvm-cov, a package directory with
 * native/ written for its native.json, the adapter, the host and a suite, and a
 * stand-in Hermes tarball in the cache, pinned by its SHA3-256.
 *
 * The fake clang records each command's arguments, writes an empty object for a
 * compile and copies the program for a link, and prints the fake tools' paths
 * for -print-prog-name. The program writes a coverage profile where
 * LLVM_PROFILE_FILE names, and prints the basename of its first argument,
 * whether its second is a directory of only the database of ill-formed names,
 * and its third, the filter. The fake llvm-cov reports the coverage set by
 * setCoverage.
 */
const setupFakeHermes = (t: TestContext) => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-react-native-hermes-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const bin = join(directory, "bin");
  const packageDirectory = join(directory, "package");
  mkdirSync(bin);
  const cc = join(bin, "clang");
  const cxx = join(bin, "clang++");
  for (const compiler of [cc, cxx])
    writeFileSync(
      compiler,
      [
        "#!/bin/sh",
        `bin='${bin}'`,
        'case "$1" in',
        "  --version) echo 'fake clang'; exit ;;",
        '  -print-prog-name=*) echo "$bin/${1#-print-prog-name=}"; exit ;;',
        "esac",
        'printf \'%s\\n\' "$0" "$@" "" >> "$bin/commands"',
        "compile=false",
        'while [ $# -gt 0 ]; do case "$1" in -c) compile=true ;; -o) output=$2 ;; esac; shift; done',
        'if [ "$compile" = true ]; then : > "$output"; else cp "$bin/program" "$output"; fi',
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
  writeFileSync(join(bin, "commands"), "");
  writeFileSync(join(bin, "llvm-profdata"), "#!/bin/sh\n", { mode: 0o755 });
  writeFileSync(
    join(bin, "llvm-cov"),
    [
      "#!/bin/sh",
      `bin='${bin}'`,
      'case "$2" in',
      '  -format=text) cat "$bin/coverage.json" ;;',
      '  -format=lcov) cat "$bin/coverage.lcov" ;;',
      "esac",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  const setProgram = (script: string, mode = 0o755): void => {
    writeFileSync(join(bin, "program"), `${script}\n`);
    chmodSync(join(bin, "program"), mode);
  };
  setProgram(
    [
      "#!/bin/sh",
      writeProfile,
      'if [ -d "$2" ] && [ "$(ls -A "$2")" = ill-formed-names.db ]; then empty="a directory of only ill-formed-names.db"; else empty="$2"; fi',
      'echo "ok 1 - $(basename "$1") in $empty, filter \'$3\'"',
    ].join("\n"),
  );
  const adapter = join(packageDirectory, "cpp/EvoluSqliteBinding.cpp");
  const setCoverage = (coverage: "full" | "gap" | "uninstrumented"): void => {
    const isInstrumented = coverage !== "uninstrumented";
    const lines = isInstrumented ? 10 : 0;
    const covered = coverage === "gap" ? lines - 1 : lines;
    const counts = (count: number, covered: number) => ({ count, covered });
    writeFileSync(
      join(bin, "coverage.json"),
      JSON.stringify({
        data: [
          {
            files: isInstrumented
              ? [{ filename: adapter, branches: [], expansions: [] }]
              : [],
            functions: isInstrumented
              ? [1, 2].map((line) => ({
                  name: `f${line}`,
                  count: 1,
                  regions: [[line, 1, line, 9]],
                  filenames: [adapter],
                }))
              : [],
            totals: {
              lines: counts(lines, covered),
              functions: counts(isInstrumented ? 2 : 0, isInstrumented ? 2 : 0),
              branches: counts(isInstrumented ? 4 : 0, isInstrumented ? 4 : 0),
            },
          },
        ],
      }),
    );
    writeFileSync(
      join(bin, "coverage.lcov"),
      isInstrumented
        ? [
            `SF:${adapter}`,
            ...Array.from(
              { length: lines },
              (_, index) =>
                `DA:${index + 1},${coverage === "gap" && index === 6 ? 0 : 1}`,
            ),
            "end_of_record",
            "",
          ].join("\n")
        : "",
    );
  };
  setCoverage("full");

  const files = {
    "native/units/evolu_database.c": "",
    "native/units/sqlite3.c": "",
    "native/include/evolu_names.h": "",
    "cpp/EvoluSqliteBinding.cpp": "",
    "cpp/EvoluSqliteBinding.h": "",
    "cpp/EvoluSqlite.cpp": "",
    "test/hermes/host.cpp": "",
    "test/hermes/suite.ts": [
      'const values = (): ReadonlyArray<unknown> => ["suite", 1];',
      "export { values };",
      "",
    ].join("\n"),
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(packageDirectory, path)), { recursive: true });
    writeFileSync(join(packageDirectory, path), content);
  }
  const manifest = `${JSON.stringify(
    {
      sqlite: {},
      flags: {
        defines: [
          "EVOLU_NATIVE_PACKAGE",
          "SQLITE_CUSTOM_INCLUDE=sqlite_config.h",
        ],
        headerSearchPath: "native/include",
        c: ["-O2"],
        ios: { c: ["-std=gnu11"] },
        android: { c: ["-std=c11", "-fvisibility=hidden"] },
      },
      files: Object.fromEntries(
        Object.keys(files)
          .filter((path) => path.startsWith("native/"))
          .map((path) => [
            path.slice("native/".length),
            { origin: "vendor-native.mts", sha256: "0".repeat(64) },
          ]),
      ),
    },
    null,
    2,
  )}\n`;
  writeFileSync(join(packageDirectory, "native.json"), manifest);
  writeFileSync(
    join(packageDirectory, "native/native.json.sha256"),
    `${createHash("sha256").update(manifest).digest("hex")}\n`,
  );

  const env = {
    SQLITE_CORE_BUILD: join(directory, "build"),
    SQLITE_CORE_CACHE: join(directory, "cache"),
  };
  const contents = join(directory, "tarball");
  for (const [path, content] of Object.entries({
    "destroot/include/jsi/jsi.h": "",
    "destroot/include/hermes/hermes.h": "",
    "destroot/Library/Frameworks/macosx/hermesvm.framework/hermesvm": "",
    "destroot/Library/Frameworks/universal/hermesvm.xcframework/Info.plist": "",
    "destroot/bin/hermesc": "",
    LICENSE: "",
  })) {
    mkdirSync(dirname(join(contents, path)), { recursive: true });
    writeFileSync(join(contents, path), content);
  }
  mkdirSync(env.SQLITE_CORE_CACHE);
  const cachedTarball = join(env.SQLITE_CORE_CACHE, "hermes.tar.gz");
  const packed = spawnSync("tar", [
    "-czf",
    cachedTarball,
    "-C",
    contents,
    "./destroot",
    "./LICENSE",
  ]);
  assertEqual(packed.status, 0);
  const tarball: PinnedArchive = {
    url: "https://example.invalid/hermes.tar.gz",
    file: "hermes.tar.gz",
    hash: createHash("sha3-256")
      .update(readFileSync(cachedTarball))
      .digest("hex"),
  };
  const cliOptions = {
    packageDirectory,
    env: { ...process.env, ...env },
    cc,
    cxx,
    tarball,
  };

  return {
    directory,
    packageDirectory,
    env,
    cc,
    cxx,
    cachedTarball,
    cliOptions,
    setProgram,
    setCoverage,
    run: async (filter?: string) => {
      const { passed, output } = await runHermesTests({
        ...cliOptions,
        ...(filter != null && { filter }),
      });
      return { passed, output: output.split("\n") };
    },
    /** The directory the tarball was unpacked into. */
    unpacked: () => join(env.SQLITE_CORE_BUILD, "hermes", tarball.hash),
    /** Each compile's and link's arguments, the compiler first, in order. */
    commands: (): ReadonlyArray<ReadonlyArray<string>> =>
      readFileSync(join(bin, "commands"), "utf8")
        .split("\n\n")
        .slice(0, -1)
        .map((command) => command.split("\n")),
  };
};
