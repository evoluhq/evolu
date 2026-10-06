import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertFalse,
  assertInstanceOf,
  assertRejects,
  assertThrows,
  assertTrue,
} from "@evolu/common";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { arch, release, tmpdir, type } from "node:os";
import { dirname, join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import createWabt from "wabt";
import {
  buildWasm,
  checkConfigMake,
  checkMakeLog,
  checkManifestUuid,
  checkToolchain,
  createBuildEnvironment,
  fetchPinned,
  verifyWasm,
  type BuildWasmOptions,
} from "./build-wasm.mts";

describe("buildWasm", () => {
  it("writes the wasm and build-info.json and removes the work directory", async (t) => {
    const build = await setupBuild(t);

    await buildWasm(build.options);

    assertEqualBytes(
      readFileSync(join(build.options.outputDirectory, "sqlite3.wasm")),
      build.wasm,
    );
    assertEqual(
      JSON.parse(
        readFileSync(
          join(build.options.outputDirectory, "build-info.json"),
          "utf8",
        ),
      ),
      {
        inputs: {
          sqliteSource: build.options.sqliteSource,
          emscripten: "6.0.3",
          wasmStrip: "1.0.39",
          make: makeWasm,
        },
        toolchain: {
          emcc: emcc603,
          wasmStrip: "1.0.39",
          clang: "clang version 22.0.0",
          wasmOpt: "wasm-opt version 125",
          make: "GNU Make 4.4.1",
          hostCc: "cc 17.0.0",
          bash: build.bashVersion,
          node: process.version,
          host: `${type()} ${release()} ${arch()}`,
        },
        outputs: {
          "sqlite3.wasm": {
            bytes: build.wasm.length,
            sha256: sha256(build.wasm),
          },
        },
      },
    );
    assertEqual(readdirSync(build.options.temporaryDirectory), []);
  });

  it("runs the steps of the recipe in order", async (t) => {
    const build = await setupBuild(t);

    await buildWasm(build.options);

    assertEqual(build.readCommands(), [
      `unzip -q ${join(build.cache, "sqlite.zip")}`,
      `configure --with-emsdk=${build.emsdk}`,
      "make sqlite3.c",
      makeWasm.join(" "),
    ]);
  });

  it("reads the archive from the default cache without SQLITE_WASM_CACHE", async (t) => {
    const build = await setupBuild(t);
    const { SQLITE_WASM_CACHE: _cache, ...env } = build.options.env;

    await buildWasm({
      ...build.options,
      defaultCacheDirectory: build.cache,
      env,
    });

    assertEqualBytes(
      readFileSync(join(build.options.outputDirectory, "sqlite3.wasm")),
      build.wasm,
    );
  });

  it("reads the archive from the default cache when SQLITE_WASM_CACHE is empty", async (t) => {
    const build = await setupBuild(t);

    await buildWasm({
      ...build.options,
      defaultCacheDirectory: build.cache,
      env: { ...build.options.env, SQLITE_WASM_CACHE: "" },
    });

    assertEqualBytes(
      readFileSync(join(build.options.outputDirectory, "sqlite3.wasm")),
      build.wasm,
    );
  });

  it("writes nothing and keeps the work directory when the wasm differs from its pin", async (t) => {
    const build = await setupBuild(t);
    const pinned = sha256(new TextEncoder().encode("sqlite3.wasm"));
    const wasmPath = "sqlite-src/ext/wasm/jswasm/sqlite3.wasm";

    const work = await assertBuildKeepsWork(
      { ...build.options, wasmSha256: pinned },
      (work) =>
        `${join(work, wasmPath)} differs from the pins:\nsha256 ${sha256(build.wasm)}, pinned ${pinned}`,
    );
    assertEqualBytes(readFileSync(join(work, wasmPath)), build.wasm);
  });

  it("writes nothing when the tree is another check-in", async (t) => {
    const build = await setupBuild(t);
    const pinned =
      "4a75bdd007ec52935fdbecc6ed448951bb2e28d1aaca6f641c7b33e4e09459bc";

    await assertBuildKeepsWork(
      {
        ...build.options,
        sqliteSource: { ...build.options.sqliteSource, checkIn: pinned },
      },
      (work) =>
        `${join(work, "sqlite-src/manifest.uuid")}: check-in ${checkIn}, pinned ${pinned}`,
    );
  });

  it("writes nothing when configure finds another wasm-strip", async (t) => {
    const build = await setupBuild(t);
    writeConfigure(build.tree, build.commands, "/usr/bin/wasm-strip");

    await assertBuildKeepsWork(
      build.options,
      () =>
        `ext/wasm/config.make has bin.wasm-strip /usr/bin/wasm-strip, expected ${join(wabtBin, "wasm-strip")}`,
    );
  });

  it("writes nothing and reports the log of a failed command", async (t) => {
    const build = await setupBuild(t);
    writeTool(
      join(build.emsdk, "bin/make"),
      '[ "$1" = sqlite3.c ] && exit 0; echo "make: *** Error 1" >&2; exit 2',
    );

    await assertBuildKeepsWork(
      build.options,
      (work) =>
        `${makeWasm.join(" ")} failed (2); see ${join(work, "logs/make-wasm.log")}:\nmake: *** Error 1\n`,
    );
  });

  it("writes nothing and reports the signal that killed a command", async (t) => {
    const build = await setupBuild(t);
    writeTool(join(build.emsdk, "bin/make"), "kill -KILL $$");

    await assertBuildKeepsWork(
      build.options,
      (work) =>
        `make sqlite3.c failed (SIGKILL); see ${join(work, "logs/make-sqlite3.c.log")}:\n`,
    );
  });

  it("writes nothing when a command is missing", async (t) => {
    const build = await setupBuild(t);
    rmSync(join(build.tree, "configure"));

    await assertBuildKeepsWork(
      build.options,
      (work) =>
        `./configure --with-emsdk=${build.emsdk} failed (spawnSync ./configure ENOENT); see ${join(work, "logs/configure.log")}:\n`,
    );
  });

  it("writes nothing when a tool it records is missing", async (t) => {
    const build = await setupBuild(t);
    const wasmOpt = join(build.emsdk, "upstream/bin/wasm-opt");
    rmSync(wasmOpt);

    await assertBuildKeepsWork(
      build.options,
      () => `spawnSync ${wasmOpt} ENOENT`,
    );
  });

  it("refuses another Emscripten before it creates the work directory", async (t) => {
    const build = await setupBuild(t);
    const emcc = emcc603.replace(" 6.0.3 ", " 6.0.30 ");
    writeTool(join(build.emsdk, "bin/emcc"), `echo '${emcc}'`);

    await assertBuildRefused(
      build.options,
      `Expected Emscripten 6.0.3, emcc --version printed: ${emcc}`,
    );
  });

  it("refuses a cached archive whose hash differs before it creates the work directory", async (t) => {
    const build = await setupBuild(t);
    const tampered = new TextEncoder().encode("tampered");
    const path = join(build.cache, "sqlite.zip");
    writeFileSync(path, tampered);

    await assertBuildRefused(
      build.options,
      `${path}: sha3-256 ${sha3(tampered)}, pinned ${build.options.sqliteSource.hash}`,
    );
  });
});

describe("fetchPinned", () => {
  it("downloads a missing archive into the cache", async (t) => {
    const bytes = new TextEncoder().encode("archive");
    const url = await setupServer(t, 200, bytes);
    const cache = setupDirectory(t);

    const path = await fetchPinned(
      { url, file: "archive.zip", hash: sha3(bytes) },
      cache,
    );

    assertEqual(path, join(cache, "archive.zip"));
    assertEqualBytes(readFileSync(path), bytes);
  });

  it("creates a missing cache directory", async (t) => {
    const bytes = new TextEncoder().encode("archive");
    const url = await setupServer(t, 200, bytes);
    const cache = join(setupDirectory(t), "wasm-cache");

    const path = await fetchPinned(
      { url, file: "archive.zip", hash: sha3(bytes) },
      cache,
    );

    assertEqualBytes(readFileSync(path), bytes);
  });

  it("refuses a download whose hash differs and does not cache it", async (t) => {
    const tampered = new TextEncoder().encode("tampered");
    const url = await setupServer(t, 200, tampered);
    const cache = setupDirectory(t);
    const pinned = sha3(new TextEncoder().encode("archive"));

    await assertRejectsWithMessage(
      fetchPinned({ url, file: "archive.zip", hash: pinned }, cache),
      `${url}: sha3-256 ${sha3(tampered)}, pinned ${pinned}`,
    );
    assertFalse(existsSync(join(cache, "archive.zip")));
  });

  it("refuses an unsuccessful download", async (t) => {
    const url = await setupServer(t, 404, new TextEncoder().encode("missing"));
    const cache = setupDirectory(t);

    await assertRejectsWithMessage(
      fetchPinned({ url, file: "archive.zip", hash: "pinned" }, cache),
      `${url}: HTTP 404`,
    );
    assertFalse(existsSync(join(cache, "archive.zip")));
  });

  it("uses a cached archive without downloading it", async (t) => {
    const bytes = new TextEncoder().encode("archive");
    const cache = setupDirectory(t);
    writeFileSync(join(cache, "archive.zip"), bytes);

    const path = await fetchPinned(
      { url: unreachableUrl, file: "archive.zip", hash: sha3(bytes) },
      cache,
    );

    assertEqual(path, join(cache, "archive.zip"));
  });

  it("refuses a cached archive whose hash differs", async (t) => {
    const tampered = new TextEncoder().encode("tampered");
    const cache = setupDirectory(t);
    const path = join(cache, "archive.zip");
    writeFileSync(path, tampered);
    const pinned = sha3(new TextEncoder().encode("archive"));

    await assertRejectsWithMessage(
      fetchPinned(
        { url: unreachableUrl, file: "archive.zip", hash: pinned },
        cache,
      ),
      `${path}: sha3-256 ${sha3(tampered)}, pinned ${pinned}`,
    );
  });
});

describe("checkManifestUuid", () => {
  it("accepts a tree whose manifest.uuid is the pinned check-in", (t) => {
    const tree = setupDirectory(t);
    writeFileSync(join(tree, "manifest.uuid"), `${checkIn}\n`);

    checkManifestUuid(tree, checkIn);
  });

  it("refuses a tree whose manifest.uuid is another check-in", (t) => {
    const tree = setupDirectory(t);
    const other =
      "4a75bdd007ec52935fdbecc6ed448951bb2e28d1aaca6f641c7b33e4e09459bc";
    writeFileSync(join(tree, "manifest.uuid"), `${other}\n`);

    assertThrowsWithMessage(
      () => {
        checkManifestUuid(tree, checkIn);
      },
      `${join(tree, "manifest.uuid")}: check-in ${other}, pinned ${checkIn}`,
    );
  });
});

describe("checkToolchain", () => {
  it("returns the versions of Emscripten 6.0.3 and wasm-strip 1.0.39", (t) => {
    const env = setupTools(t, { emcc: emcc603, "wasm-strip": "1.0.39" });

    assertEqual(checkToolchain(env), { emcc: emcc603, wasmStrip: "1.0.39" });
  });

  it("reads only the first line a tool prints, also from stderr", (t) => {
    const directory = setupDirectory(t);
    writeFileSync(
      join(directory, "emcc"),
      `#!/bin/sh\necho '${emcc603}' >&2\necho 'Copyright (C) 2026' >&2\n`,
      { mode: 0o755 },
    );
    writeFileSync(join(directory, "wasm-strip"), "#!/bin/sh\necho 1.0.39\n", {
      mode: 0o755,
    });

    assertEqual(checkToolchain({ PATH: directory }), {
      emcc: emcc603,
      wasmStrip: "1.0.39",
    });
  });

  it("refuses another Emscripten version", (t) => {
    const emcc = emcc603.replace(" 6.0.3 ", " 6.0.30 ");
    const env = setupTools(t, { emcc, "wasm-strip": "1.0.39" });

    assertThrowsWithMessage(
      () => checkToolchain(env),
      `Expected Emscripten 6.0.3, emcc --version printed: ${emcc}`,
    );
  });

  it("refuses another wasm-strip version", (t) => {
    const env = setupTools(t, { emcc: emcc603, "wasm-strip": "1.0.34" });

    assertThrowsWithMessage(
      () => checkToolchain(env),
      "Expected wasm-strip 1.0.39, wasm-strip --version printed: 1.0.34",
    );
  });
});

describe("createBuildEnvironment", () => {
  it("refuses an environment without EMSDK", () => {
    assertThrowsWithMessage(
      () => createBuildEnvironment({ PATH: "/usr/bin:/bin" }, "linux"),
      "Set EMSDK to the root of an emsdk with Emscripten 6.0.3 installed and activated.",
    );
  });

  it("refuses an empty EMSDK", () => {
    assertThrowsWithMessage(
      () =>
        createBuildEnvironment({ EMSDK: "", PATH: "/usr/bin:/bin" }, "linux"),
      "Set EMSDK to the root of an emsdk with Emscripten 6.0.3 installed and activated.",
    );
  });

  it("keeps sourced values that contain =, and no variable without a name", (t) => {
    const emsdk = setupDirectory(t);
    writeFileSync(join(emsdk, "emsdk_env.sh"), "export EMSDK_TEST=-sA=1\n");

    const env = createBuildEnvironment(
      { EMSDK: emsdk, PATH: "/usr/bin:/bin" },
      "linux",
    );

    assertEqual(env.EMSDK_TEST, "-sA=1");
    assertFalse("" in env);
  });

  it("refuses an EMSDK whose emsdk_env.sh fails", (t) => {
    const emsdk = setupDirectory(t);
    writeFileSync(join(emsdk, "emsdk_env.sh"), "return 1\n");

    assertThrows(
      () =>
        createBuildEnvironment(
          { EMSDK: emsdk, PATH: "/usr/bin:/bin" },
          "linux",
        ),
      (error) => {
        assertInstanceOf(error, Error);
        assert("status" in error, "Expected the exit status of bash.");
        assertEqual(error.status, 1);
      },
    );
  });

  it("refuses an EMSDK without emsdk_env.sh", (t) => {
    const emsdk = setupDirectory(t);

    assertThrows(
      () =>
        createBuildEnvironment(
          { EMSDK: emsdk, PATH: "/usr/bin:/bin" },
          "linux",
        ),
      (error) => {
        assertInstanceOf(error, Error);
        assert("status" in error, "Expected the exit status of bash.");
        assertEqual(error.status, 1);
      },
    );
  });

  it("sources emsdk_env.sh and puts the wasm-strip of wabt first", (t) => {
    const emsdk = setupEmsdk(t);

    const env = createBuildEnvironment(
      { EMSDK: emsdk, PATH: "/usr/bin:/bin" },
      "linux",
    );

    assertEqual(env.EMSDK_TEST, "sourced");
    assertEqual(env.PATH, `${wabtBin}:${emsdk}/bin:/usr/bin:/bin`);
    assertEqual(env.LC_ALL, "C");
    assertEqual(env.TZ, "UTC");
  });

  it("passes only EMSDK, HOME, PATH and TMPDIR from the host", (t) => {
    const emsdk = setupEmsdk(t);

    const env = createBuildEnvironment(
      {
        EMSDK: emsdk,
        HOME: "/home/evolu",
        PATH: "/usr/bin:/bin",
        TMPDIR: "/tmp/evolu",
        // Emscripten adds it to every compile.
        EMCC_CFLAGS: "-DSQLITE_DEFAULT_CACHE_SIZE=-4000",
      },
      "linux",
    );

    assertEqual(
      [env.EMSDK, env.HOME, env.TMPDIR, env.EMCC_CFLAGS],
      [emsdk, "/home/evolu", "/tmp/evolu", undefined],
    );
  });

  it("does not run the ~/.bashrc of the host", (t) => {
    const home = setupDirectory(t);
    writeFileSync(join(home, ".bashrc"), "export BASHRC_RAN=1\n");

    const env = createBuildEnvironment(
      { EMSDK: setupEmsdk(t), HOME: home, PATH: "/usr/bin:/bin" },
      "linux",
    );

    assertEqual(env.BASHRC_RAN, undefined);
  });

  it("puts the GNU-style sed shim first on macOS", (t) => {
    const emsdk = setupEmsdk(t);

    const env = createBuildEnvironment(
      { EMSDK: emsdk, PATH: "/usr/bin:/bin" },
      "darwin",
    );

    assertEqual(env.PATH, `${gnuSed}:${wabtBin}:${emsdk}/bin:/usr/bin:/bin`);
  });

  it("passes sed calls without -i through to sed on macOS", (t) => {
    const env = createBuildEnvironment(
      { EMSDK: setupEmsdk(t), PATH: "/usr/bin:/bin" },
      "darwin",
    );

    const result = spawnSync("sed", ["-e", "s/a/b/"], {
      env,
      input: "a\n",
      encoding: "utf8",
    });

    assertEqual([result.status, result.stdout], [0, "b\n"]);
  });

  it(
    "edits in place with sed -i on macOS as GNU sed does",
    { skip: process.platform !== "darwin" },
    (t) => {
      const env = createBuildEnvironment(
        { EMSDK: setupEmsdk(t), PATH: "/usr/bin:/bin" },
        "darwin",
      );
      const file = join(setupDirectory(t), "sqlite3.js");
      writeFileSync(file, "a c\n");

      // As ext/wasm/GNUmakefile edits the JavaScript Emscripten generates.
      const result = spawnSync(
        "sed",
        ["-i", "-e", "s/a/b/", "-e", "s/c/d/", file],
        { env, encoding: "utf8" },
      );

      assertEqual([result.status, result.stderr], [0, ""]);
      assertEqual(readFileSync(file, "utf8"), "b d\n");
    },
  );
});

describe("checkConfigMake", () => {
  it("accepts a config.make with emcc, wasm-opt and our wasm-strip", () => {
    checkConfigMake(configMake, "/repo/node_modules/wabt/bin/wasm-strip");
  });

  for (const tool of ["bin.emcc", "bin.wasm-opt"])
    it(`refuses a config.make without ${tool}`, () => {
      assertThrowsWithMessage(() => {
        checkConfigMake(
          configMake.replace(new RegExp(`^${tool} = .*$`, "mu"), `${tool} = `),
          "/repo/node_modules/wabt/bin/wasm-strip",
        );
      }, `ext/wasm/config.make has no ${tool}`);
    });

  it("refuses a config.make with another wasm-strip", () => {
    assertThrowsWithMessage(() => {
      checkConfigMake(
        configMake.replace(
          "/repo/node_modules/wabt/bin/wasm-strip",
          "/usr/bin/wasm-strip",
        ),
        "/repo/node_modules/wabt/bin/wasm-strip",
      );
    }, "ext/wasm/config.make has bin.wasm-strip /usr/bin/wasm-strip, expected /repo/node_modules/wabt/bin/wasm-strip");
  });
});

describe("checkMakeLog", () => {
  it("accepts the log of a build", () => {
    checkMakeLog(makeLog);
  });

  it("refuses the log of a build whose wasm-opt failed", () => {
    const failure =
      "[🍦 jswasm/vanilla/sqlite3.wasm] 🔥 ignoring wasm-opt failure";

    assertThrowsWithMessage(() => {
      checkMakeLog(`${makeLog}${failure}\n`);
    }, `make reported "${failure}"`);
  });
});

describe("verifyWasm", () => {
  it("lists a sha256 that differs from the pin", async () => {
    const wasm = await setupTinyWasm();
    const pinned = sha256(new TextEncoder().encode("sqlite3.wasm"));

    const problems = await verifyWasm(wasm, pinned);

    assertEqual(problems[0], `sha256 ${sha256(wasm)}, pinned ${pinned}`);
  });

  it("lists how the wasm differs from the generator's pins", async () => {
    const wasm = await setupTinyWasm();

    const problems = await verifyWasm(wasm, sha256(wasm));

    assertTrue(
      problems.includes(
        "sqlite3__wasm_enum_json() differs from the pinned one",
      ),
    );
  });
});

describe("build-wasm.mts CLI", () => {
  it("builds with the host's environment, so it refuses an empty EMSDK", () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("build-wasm.mts", import.meta.url))],
      { env: { ...process.env, EMSDK: "" }, encoding: "utf8" },
    );

    assertEqual(result.status, 1);
    assertTrue(
      result.stderr.includes(
        "Error: Set EMSDK to the root of an emsdk with Emscripten 6.0.3 installed and activated.",
      ),
    );
  });
});

/**
 * Creates the inputs of a build: the pinned archive in SQLITE_WASM_CACHE, and
 * an emsdk whose fake tools print versions. The archive unpacks to a fake
 * SQLite tree whose configure writes `ext/wasm/config.make` as SQLite's does,
 * and the fake make builds a wasm with the generator's pins. The fake steps
 * record their commands, and the archive's URL is unreachable, so a build that
 * misses the cache fails.
 */
const setupBuild = async (t: TestContext) => {
  const root = setupDirectory(t);
  const commands = join(root, "commands");
  const record = (command: string) => `echo "${command} $*" >> "${commands}"`;

  const sources = join(root, "sources");
  const wasm = await setupPinnedWasm();
  const wasmPath = join(sources, "sqlite3.wasm");
  const tree = join(sources, "sqlite.zip/sqlite-src");
  mkdirSync(tree, { recursive: true });
  writeFileSync(wasmPath, wasm);
  writeFileSync(join(tree, "manifest.uuid"), `${checkIn}\n`);
  writeConfigure(tree, commands, "$(command -v wasm-strip)");

  const emsdk = setupEmsdk(t);
  mkdirSync(join(emsdk, "bin"));
  mkdirSync(join(emsdk, "upstream/bin"), { recursive: true });
  writeTool(join(emsdk, "bin/emcc"), `echo '${emcc603}'`);
  writeTool(join(emsdk, "bin/cc"), "echo 'cc 17.0.0'");
  writeTool(join(emsdk, "upstream/bin/clang"), "echo 'clang version 22.0.0'");
  writeTool(
    join(emsdk, "upstream/bin/wasm-opt"),
    "echo 'wasm-opt version 125'",
  );
  // unzip -q <archive>
  writeTool(
    join(emsdk, "bin/unzip"),
    `${record("unzip")}; cp -R "${sources}/$(basename "$2")/." .`,
  );
  writeTool(
    join(emsdk, "bin/make"),
    [
      '[ "$1" = --version ] && echo "GNU Make 4.4.1" && exit 0',
      record("make"),
      '[ "$1" = sqlite3.c ] && exit 0',
      `mkdir -p jswasm && cp "${wasmPath}" jswasm/sqlite3.wasm`,
    ].join("\n"),
  );

  const cache = join(root, "cache");
  mkdirSync(cache);
  const sqliteZip = new TextEncoder().encode("sqlite.zip");
  writeFileSync(join(cache, "sqlite.zip"), sqliteZip);

  // Only node, which wabt's wasm-strip runs, and the system tools.
  const nodeBin = join(root, "node-bin");
  mkdirSync(nodeBin);
  symlinkSync(process.execPath, join(nodeBin, "node"));
  const path = [nodeBin, "/usr/bin", "/bin"].join(":");

  const temporaryDirectory = join(root, "tmp");
  mkdirSync(temporaryDirectory);

  const options: BuildWasmOptions = {
    sqliteSource: {
      url: unreachableUrl,
      file: "sqlite.zip",
      hash: sha3(sqliteZip),
      directory: "sqlite-src",
      checkIn,
    },
    wasmSha256: sha256(wasm),
    outputDirectory: join(root, "wasm"),
    defaultCacheDirectory: join(root, "missing"),
    temporaryDirectory,
    env: { EMSDK: emsdk, PATH: path, SQLITE_WASM_CACHE: cache },
    platform: "linux",
  };

  return {
    options,
    wasm,
    wasmPath,
    tree,
    emsdk,
    cache,
    commands,
    bashVersion: spawnSync("bash", ["--version"], {
      env: { PATH: path },
      encoding: "utf8",
    }).stdout.split("\n")[0],
    readCommands: (): ReadonlyArray<string> =>
      readFileSync(commands, "utf8").split("\n").slice(0, -1),
  };
};

const writeTool = (path: string, script: string): void => {
  writeFileSync(path, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
};

/**
 * Writes a configure that records its command in `commands` and writes
 * `ext/wasm/config.make` as SQLite's does, with the given wasm-strip.
 */
const writeConfigure = (
  tree: string,
  commands: string,
  wasmStrip: string,
): void => {
  writeTool(
    join(tree, "configure"),
    [
      `echo "configure $*" >> "${commands}"`,
      "mkdir -p ext/wasm",
      `printf 'bin.emcc = %s\\nbin.wasm-opt = %s\\nbin.wasm-strip = %s\\n' "$(command -v emcc)" "$EMSDK/upstream/bin/wasm-opt" "${wasmStrip}" > ext/wasm/config.make`,
    ].join("\n"),
  );
};

/**
 * Asserts that a build rejects with the message for its work directory, writes
 * nothing to the output directory and keeps the work directory, which it
 * returns.
 */
const assertBuildKeepsWork = async (
  options: BuildWasmOptions,
  message: (work: string) => string,
): Promise<string> => {
  let kept = "";
  await assertRejects(buildWasm(options), (error) => {
    assertInstanceOf(error, Error);
    const [work, ...others] = readdirSync(options.temporaryDirectory);
    assert(work != null, "Expected the work directory to be kept.");
    assertEqual(others, []);
    kept = join(options.temporaryDirectory, work);
    assertEqual(error.message, message(kept));
  });
  assertFalse(existsSync(options.outputDirectory));
  return kept;
};

/**
 * Asserts that a build rejects with the message before it creates a work
 * directory, and writes nothing to the output directory.
 */
const assertBuildRefused = async (
  options: BuildWasmOptions,
  message: string,
): Promise<void> => {
  await assertRejectsWithMessage(buildWasm(options), message);
  assertEqual(readdirSync(options.temporaryDirectory), []);
  assertFalse(existsSync(options.outputDirectory));
};

/**
 * Assembles a wasm with the enum JSON, imports and exports that
 * `scripts/upstream` pins, so that {@link verifyWasm} finds no difference.
 */
const setupPinnedWasm = async (): Promise<Uint8Array> => {
  const readPin = (file: string) =>
    readFileSync(new URL(`upstream/${file}`, import.meta.url));
  const imports = JSON.parse(
    readPin("sqlite3-wasm-imports.json").toString(),
  ) as Readonly<
    Record<string, { readonly kind: string; readonly type: string }>
  >;
  const exports = JSON.parse(
    readPin("sqlite3-wasm-exports.json").toString(),
  ) as Readonly<
    Record<string, { readonly kind: string; readonly type?: string }>
  >;
  const enumJson = readPin("sqlite3-wasm-enum.json");
  const valueTypes: Readonly<Record<string, string>> = {
    i: "i32",
    j: "i64",
    f: "f32",
    d: "f64",
  };
  // "i(ij)" is (param i32 i64) (result i32).
  const signature = (wasmType = "v()"): string => {
    const [result = "v", parameters = ""] = wasmType.split(/[()]/u);
    return [
      ...parameters.split("").map((value) => `(param ${valueTypes[value]})`),
      ...(result === "v" ? [] : [`(result ${valueTypes[result]})`]),
    ].join(" ");
  };
  const enumJsonPointer = 1024;
  const body = (name: string): string =>
    name === "sqlite3__wasm_enum_json"
      ? `(i32.const ${enumJsonPointer})`
      : name === "__wasm_call_ctors"
        ? ""
        : "unreachable";
  const fields = [
    ...Object.entries(imports).map(([key, { kind, type: wasmType }]) => {
      const [module, name] = key.split(/\.(.*)/u);
      return kind === "memory"
        ? `(import "${module}" "${name}" (memory ${wasmType.replace("-", " ")}))`
        : `(import "${module}" "${name}" (func ${signature(wasmType)}))`;
    }),
    ...Object.entries(exports).map(([name, { kind, type: wasmType }]) =>
      kind === "table"
        ? `(table (export "${name}") 0 funcref)`
        : `(func (export "${name}") ${signature(wasmType)} ${body(name)})`,
    ),
    `(data (i32.const ${enumJsonPointer}) "${[...enumJson]
      .map((byte) => `\\${byte.toString(16).padStart(2, "0")}`)
      .join("")}")`,
  ];
  return (await createWabt())
    .parseWat("pinned.wat", `(module\n${fields.join("\n")})`)
    .toBinary({}).buffer;
};

/** Assembles the least a wasm needs for scripts/generate.mts to read it. */
const setupTinyWasm = async (): Promise<Uint8Array> =>
  (await createWabt())
    .parseWat(
      "tiny.wat",
      `(module
        (import "env" "memory" (memory 1))
        (data (i32.const 16) "{}")
        (func (export "__wasm_call_ctors"))
        (func (export "sqlite3__wasm_enum_json") (result i32) (i32.const 16)))`,
    )
    .toBinary({}).buffer;

/**
 * The command that builds the wasm: Emscripten's stack overflow check, SQLite's
 * bare-bones export list, and its bare-bones options with JSON, math functions
 * and in-memory temporary files.
 */
const makeWasm = [
  "make",
  "emcc_opt=-Oz -sSTACK_OVERFLOW_CHECK=2",
  "barebones=1",
  "SQLITE_OPT=-DSQLITE_TEMP_STORE=3 -DSQLITE_OMIT_AUTHORIZATION -DSQLITE_OMIT_INCRBLOB -DSQLITE_OMIT_INTROSPECTION_PRAGMAS -DSQLITE_OMIT_PROGRESS_CALLBACK -DSQLITE_OMIT_WAL -DSQLITE_ENABLE_MATH_FUNCTIONS",
  "jswasm/sqlite3.wasm",
];

// Lines of `make jswasm/sqlite3.wasm` output.
const makeLog = [
  "using emcc version [6.0.3]",
  "[🍦 jswasm/vanilla/sqlite3.wasm] 💈 wasm-strip",
  "[🍦 jswasm/vanilla/sqlite3.wasm] 🧼 /emsdk/upstream/bin/wasm-opt",
  "",
].join("\n");

// The variables configure writes to ext/wasm/config.make.
const configMake = [
  "bin.bash = /bin/bash",
  "bin.emcc = /work/sqlite-src-3530400/tool/emcc.sh",
  "bin.wasm-strip = /repo/node_modules/wabt/bin/wasm-strip",
  "bin.wasm-opt = /emsdk/upstream/bin/wasm-opt",
  "",
].join("\n");

const gnuSed = fileURLToPath(new URL("gnu-sed", import.meta.url));

const wabtBin = dirname(
  fileURLToPath(import.meta.resolve("wabt/bin/wasm-strip")),
);

/** Creates an emsdk whose emsdk_env.sh adds its bin directory to PATH. */
const setupEmsdk = (t: TestContext): string => {
  const emsdk = setupDirectory(t);
  writeFileSync(
    join(emsdk, "emsdk_env.sh"),
    'export EMSDK_TEST=sourced\nexport PATH="$(dirname "${BASH_SOURCE[0]}")/bin:$PATH"\n',
  );
  return emsdk;
};

const emcc603 =
  "emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.3 (283e2d130132859fde6a4e4c87fd254b38127651)";

/**
 * Creates commands that print the given `--version` lines and returns an
 * environment whose PATH has only them.
 */
const setupTools = (
  t: TestContext,
  versions: Readonly<Record<string, string>>,
): NodeJS.ProcessEnv => {
  const directory = setupDirectory(t);
  for (const [command, version] of Object.entries(versions))
    writeFileSync(join(directory, command), `#!/bin/sh\necho '${version}'\n`, {
      mode: 0o755,
    });
  return { PATH: directory };
};

const checkIn =
  "bf7c7f30031888f4e796e429ab3978879485813aaca6f641c7b33e4e09459bcc";

// Fetch refuses port 1 as a bad port, so any download attempt fails.
const unreachableUrl = "http://127.0.0.1:1/archive.zip";

const assertRejectsWithMessage = (
  promise: Promise<unknown>,
  message: string,
): Promise<void> =>
  assertRejects(promise, (error) => {
    assertInstanceOf(error, Error);
    assertEqual(error.message, message);
  });

const assertThrowsWithMessage = (run: () => unknown, message: string): void => {
  assertThrows(run, (error) => {
    assertInstanceOf(error, Error);
    assertEqual(error.message, message);
  });
};

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const sha3 = (bytes: Uint8Array): string =>
  createHash("sha3-256").update(bytes).digest("hex");

const setupDirectory = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-build-wasm-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
};

/** Serves `body` with `status` on a local port and returns its URL. */
const setupServer = async (
  t: TestContext,
  status: number,
  body: Uint8Array,
): Promise<string> => {
  const server = createServer((_request, response) => {
    response.writeHead(status);
    response.end(body);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  );
  const address = server.address();
  assert(typeof address === "object" && address != null, "Server address");
  return `http://127.0.0.1:${address.port}/archive.zip`;
};
