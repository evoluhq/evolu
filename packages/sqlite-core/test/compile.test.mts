import {
  assert,
  assertEqual,
  assertInstanceOf,
  assertRejects,
  assertThrows,
  assertTrue,
} from "@evolu/common";
import { execFile, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import {
  compileCached,
  type CompileCachedOptions,
  vendoredPublicHeaders,
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

describe("vendoredPublicHeaders", () => {
  it("returns the contents of every header the core may include from vendored libraries", () => {
    const headers = vendoredPublicHeaders();

    for (const declaration of [
      "br_aes_ct64_cbcenc_keys",
      "br_sha512_context",
      "crypto_aead_lock",
    ])
      assertTrue(headers.includes(declaration));
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
