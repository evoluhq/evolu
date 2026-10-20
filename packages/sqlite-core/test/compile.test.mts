import {
  assert,
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertRejects,
  assertThrows,
  assertTrue,
} from "@evolu/common";
import { execFile, spawnSync } from "node:child_process";
import fs, {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import {
  compileCached,
  type CompileCachedOptions,
  compileUnits,
  cSources,
  run,
  sourceDirectory,
  writeAtomically,
} from "../scripts/compile.mts";

describe("compileCached", () => {
  it("compiles again with another version of the compiler", async (t) => {
    const { directory, options, compiles } = setupCompiler(t);

    const object = await compileInProcess(options);
    assertEqual(await compileInProcess(options), object);
    writeFileSync(join(directory, "version"), "clang 2");
    assertTrue((await compileInProcess(options)) !== object);
    assertEqual(compiles(), 2);
  });

  it("compiles again when the extra key or the flags change", (t) => {
    const { directory, options, compiles } = setupCompiler(t);
    const extra = join(directory, "extra.h");
    writeFileSync(extra, "1");
    const keyed = { ...options, extraKey: () => readFileSync(extra, "utf8") };

    const object = compileCached(keyed);
    assertEqual(compileCached(keyed), object);
    writeFileSync(extra, "2");
    const withOtherExtra = compileCached(keyed);
    const withOtherFlags = compileCached({ ...keyed, flags: ["-DOTHER"] });

    assertEqual(new Set([object, withOtherExtra, withOtherFlags]).size, 3);
    assertEqual(compiles(), 3);
  });

  it("caches nothing when the source changes while it compiles", async (t) => {
    const { directory, options, compiles } = setupCompiler(t);
    writeFileSync(join(directory, "delay"), "2");
    const compiling = compileInProcess(options);
    // The compiler logs a compile before it sleeps.
    for (let i = 0; compiles() === 0; i++) {
      assert(i < 500, "The compiler didn't start.");
      await sleep(20);
    }
    writeFileSync(options.source, "int b;");

    await assertRejects(compiling, (error) => {
      assertInstanceOf(error, Error);
      assertTrue(error.message.includes("changed while it compiled"));
    });
    assertEqual(readdirSync(join(directory, "objects")), []);
  });

  it("compiles an object once for processes that compile it at once", async (t) => {
    const { directory, options, compiles } = setupCompiler(t);
    // Every process starts while the first compiles.
    writeFileSync(join(directory, "delay"), "2");

    const objects = await Promise.all(
      [1, 2, 3].map(() => compileInProcess(options)),
    );

    assertEqual(new Set(objects).size, 1);
    assertEqual(compiles(), 1);
    assertEqual(readdirSync(join(directory, "objects")).length, 1);
  });

  it("dates a lock from when its holder took it, not from when it began waiting", async (t) => {
    const { directory, options, compiles } = setupCompiler(t);
    const object = await compileInProcess(options);
    rmSync(object);
    writeFileSync(join(directory, "delay"), "2");
    // A running holder's fresh lock, which the process waits for.
    const lock = `${object}.lock`;
    writeFileSync(lock, String(process.pid));
    const compiling = compileInProcess(options);
    await sleep(1000);
    const releasedAt = Date.now();
    rmSync(lock);
    for (let i = 0; compiles() < 2; i++) {
      assert(i < 500, "The compiler didn't start.");
      await sleep(20);
    }

    assertTrue(statSync(lock).mtimeMs >= releasedAt - 5);
    assertEqual(await compiling, object);
  });

  it("returns the object that the lock's holder compiled while it waited", async (t) => {
    const { directory, options, compiles } = setupCompiler(t);
    const object = await compileInProcess(options);
    rmSync(object);
    // A running holder's fresh lock, which the process waits for.
    writeFileSync(`${object}.lock`, String(process.pid));
    const compiling = compileInProcess(options);
    // It waits once it has written its claim.
    const claimed = () =>
      readdirSync(join(directory, "objects")).some((name) =>
        name.startsWith(`${basename(object)}.lock.`),
      );
    for (let i = 0; !claimed(); i++) {
      assert(i < 500, "The process didn't wait.");
      await sleep(20);
    }
    writeFileSync(object, "compiled");

    assertEqual(await compiling, object);
    assertEqual(readFileSync(object, "utf8"), "compiled");
    assertEqual(compiles(), 1);
  });

  it("takes over a lock that names its own pid, which an earlier process left", async (t) => {
    const { options, compiles } = setupCompiler(t);
    const object = await compileInProcess(options);
    rmSync(object);
    const lock = `${object}.lock`;

    // A process killed between taking the lock and removing its claim, whose
    // pid this one got: the lock and the claim, one file, name this process.
    const taken = await new Promise<string>((resolve, reject) => {
      execFile(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          'import { linkSync, writeFileSync } from "node:fs";' +
            `import { compileCached } from ${JSON.stringify(import.meta.resolve("../scripts/compile.mts"))};` +
            `const lock = ${JSON.stringify(lock)};` +
            "writeFileSync(lock, String(process.pid));" +
            "linkSync(lock, `${lock}.${process.pid}`);" +
            `process.stdout.write(compileCached(${JSON.stringify(options)}));`,
        ],
        { timeout: 10_000, killSignal: "SIGKILL" },
        (error, stdout) => {
          if (error) reject(new Error(error.message, { cause: error }));
          else resolve(stdout);
        },
      );
    });

    assertEqual(taken, object);
    assertEqual(compiles(), 2);
  });

  it("throws when it can't link the lock, as on a file system without hard links, leaving no claim", (t) => {
    const { directory, options, compiles } = setupCompiler(t);
    const linkSync = t.mock.method(fs, "linkSync", () => {
      throw Object.assign(new Error("EPERM: operation not permitted, link"), {
        code: "EPERM",
      });
    });
    // compile.mts imports linkSync, whose binding this updates.
    syncBuiltinESMExports();
    try {
      assertThrows(
        () => compileCached(options),
        (error) => {
          assertEqual((error as NodeJS.ErrnoException).code, "EPERM");
        },
      );
    } finally {
      linkSync.mock.restore();
      syncBuiltinESMExports();
    }

    assertEqual(readdirSync(join(directory, "objects")), []);
    assertEqual(compiles(), 0);
  });

  it("takes over a lock whose holder exited or held it longer than a compile takes", async (t) => {
    const { directory, options, compiles } = setupCompiler(t);
    const object = await compileInProcess(options);
    rmSync(object);
    // A process that exited, as one killed while compiling.
    const { pid } = spawnSync(process.execPath, ["--eval", ""]);
    writeFileSync(`${object}.lock`, String(pid));

    assertEqual(await compileInProcess(options), object);
    assertEqual(compiles(), 2);

    // A running process, as one that took over an exited holder's pid, whose
    // lock is older than any compile.
    rmSync(object);
    writeFileSync(`${object}.lock`, String(process.pid));
    const longAgo = new Date(Date.now() - 3_600_000);
    utimesSync(`${object}.lock`, longAgo, longAgo);

    assertEqual(await compileInProcess(options), object);
    assertEqual(compiles(), 3);
    assertEqual(readdirSync(join(directory, "objects")), [
      object.slice(join(directory, "objects/").length),
    ]);
  });
});

describe("run", () => {
  it("returns what a command printed and throws with its output when it fails", () => {
    assertEqual(run("sh", ["-c", "echo out"]), "out\n");
    assertThrows(
      () => run("sh", ["-c", "echo out; echo err >&2; exit 3"]),
      (error) => {
        assertInstanceOf(error, Error);
        assertEqual(error.message, "sh exited with 3\nout\nerr\n");
      },
    );
  });

  it("throws the error of a command that doesn't run", () => {
    assertThrows(
      () => run("evolu-sqlite-core-no-such-command", []),
      (error) => {
        assertEqual((error as NodeJS.ErrnoException).code, "ENOENT");
      },
    );
  });
});

describe("writeAtomically", () => {
  it("replaces the file with what the write wrote, leaving nothing else", (t) => {
    const directory = setupDirectory(t);
    const path = join(directory, "runner");
    writeFileSync(path, "old");

    writeAtomically(path, (output) => {
      writeFileSync(output, "new");
    });

    assertEqual(readdirSync(directory), ["runner"]);
    assertEqual(readFileSync(path, "utf8"), "new");
  });

  it("keeps the earlier file and removes the partial one when the write throws", (t) => {
    const directory = setupDirectory(t);
    const path = join(directory, "runner");
    writeFileSync(path, "old");

    assertThrows(
      () => {
        writeAtomically(path, (output) => {
          writeFileSync(output, "partial");
          throw new Error("The compiler failed.");
        });
      },
      (error) => {
        assertInstanceOf(error, Error);
        assertEqual(error.message, "The compiler failed.");
      },
    );
    assertEqual(readdirSync(directory), ["runner"]);
    assertEqual(readFileSync(path, "utf8"), "old");
  });
});

describe("compileUnits", () => {
  const vendorDirectory = join(import.meta.dirname, "../vendor");

  it("compiles the core's own sources with the given SQLite flags first, warnings as errors and only the vendored libraries' public includes", () => {
    const units = compileUnits(["-DSQLITE_THREADSAFE=0", "-Isqlite"]).filter(
      ({ source }) => source.startsWith(sourceDirectory),
    );

    assertEqual(
      units.map(({ source }) => source),
      cSources(sourceDirectory),
    );
    for (const { flags, headers } of units) {
      assertEqual(flags.slice(0, 2), ["-DSQLITE_THREADSAFE=0", "-Isqlite"]);
      assertTrue(flags.includes("-std=c11"));
      assertTrue(flags.includes("-Werror"));
      assertTrue(flags.includes(`-I${sourceDirectory}`));
      assertTrue(flags.includes(`-I${join(vendorDirectory, "bearssl/inc")}`));
      assertFalse(flags.includes(`-I${join(vendorDirectory, "bearssl/src")}`));
      // The core's headers and the vendored public ones.
      for (const declaration of [
        "evolu_codec_open",
        "br_aes_ct64_cbcenc_keys",
        "br_sha512_context",
        "crypto_aead_lock",
      ])
        assertTrue(headers().includes(declaration));
    }
  });

  it("compiles every vendored source, also in subdirectories, with its library's private includes, no warning flags and none of the SQLite flags", () => {
    const units = compileUnits(["-DSQLITE_THREADSAFE=0", "-Isqlite"]).filter(
      ({ source }) => source.startsWith(vendorDirectory),
    );

    // In UTF-16 code unit order, whatever the locale, because the order is
    // the wasm's link order.
    assertEqual(
      units.map(({ source }) => relative(vendorDirectory, source)),
      readdirSync(vendorDirectory, { recursive: true, encoding: "utf8" })
        .filter((path) => path.endsWith(".c"))
        .toSorted(),
    );
    const bearssl = units.filter(({ source }) =>
      source.startsWith(join(vendorDirectory, "bearssl")),
    );
    assertTrue(bearssl.some(({ source }) => source.includes("symcipher")));
    for (const { flags } of units)
      assertFalse(
        flags.includes("-DSQLITE_THREADSAFE=0") || flags.includes("-Isqlite"),
      );
    for (const { flags, headers } of bearssl) {
      assertTrue(flags.includes("-std=c11"));
      assertTrue(flags.includes(`-I${join(vendorDirectory, "bearssl/src")}`));
      assertFalse(flags.some((flag) => flag.startsWith("-W")));
      // Its internal headers, such as inner.h.
      assertTrue(headers().includes("br_aes_ct64_bitslice_Sbox"));
    }
  });
});

const setupDirectory = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-sqlite-core-compile-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
};

/**
 * Sets up a compiler that prints the version file beside it, "clang 1" at
 * first, logs each compile into the compiles file, sleeps for the seconds of
 * the delay file, if any, and copies the source, and the options of compiling a
 * source with it.
 */
const setupCompiler = (t: TestContext) => {
  const directory = setupDirectory(t);
  const cc = join(directory, "cc");
  writeFileSync(
    cc,
    [
      "#!/bin/sh",
      'directory=$(dirname "$0")',
      'if [ "$1" = --version ]; then cat "$directory/version"; exit; fi',
      'while [ $# -gt 0 ]; do case "$1" in -c) source="$2";; -o) output="$2";; esac; shift; done',
      'echo "$source" >> "$directory/compiles"',
      'if [ -f "$directory/delay" ]; then sleep "$(cat "$directory/delay")"; fi',
      'cp "$source" "$output"',
    ].join("\n"),
    { mode: 0o755 },
  );
  writeFileSync(join(directory, "version"), "clang 1");
  const source = join(directory, "a.c");
  writeFileSync(source, "int a;");
  return {
    directory,
    options: {
      cc,
      flags: [],
      source,
      objectsDirectory: join(directory, "objects"),
    },
    compiles: (): number =>
      existsSync(join(directory, "compiles"))
        ? readFileSync(join(directory, "compiles"), "utf8").split("\n").length -
          1
        : 0,
  };
};

/**
 * Compiles in a process of its own, which reads the compiler's version once,
 * and returns the object's path. The process is killed after 10 seconds, so a
 * lock that's never released fails the test, which a synchronous wait in this
 * process would block instead.
 */
const compileInProcess = (options: CompileCachedOptions): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { compileCached } from ${JSON.stringify(import.meta.resolve("../scripts/compile.mts"))};` +
          `process.stdout.write(compileCached(${JSON.stringify(options)}));`,
      ],
      { timeout: 10_000, killSignal: "SIGKILL" },
      (error, stdout) => {
        if (error) reject(new Error(error.message, { cause: error }));
        else resolve(stdout);
      },
    );
  });
