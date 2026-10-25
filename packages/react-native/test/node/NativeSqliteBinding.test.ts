/**
 * The binding's conformance suite against the N-API mirror of
 * `@evolu/sqlite-core`, node/binding.c, with real files, and what only Node.js
 * can check: that the suite's XChaCha20-Poly1305 vectors are noble's, the files
 * a refused open leaves alone, and when the mirror closes a connection whose
 * handle is gone.
 */
import {
  assert,
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertTrue,
  bytesToHex,
  EncryptionKey,
  encryptWithXChaCha20Poly1305,
  type NativeSqlite,
  type RandomBytes,
} from "@evolu/common";
import {
  setupAddon,
  setupAddonPath,
} from "@evolu/sqlite-core/test/setup-addon.mts";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { setImmediate as nextMacrotask } from "node:timers/promises";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { Worker } from "node:worker_threads";
import { nativeSqliteAbiVersion } from "../../src/sqlite/Binding.ts";
import {
  describeBindingConformance,
  xchachaVectorInputs,
  xchachaVectors,
} from "../bindingConformance.ts";

// V8 exposes gc to contexts created after this flag is set.
setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;

const addonPath = await setupAddonPath();
const addon = await setupAddon();
const binding = addon.createBinding() as NativeSqlite;
const directory = mkdtempSync(join(tmpdir(), "evolu-react-native-binding-"));

after(() => {
  rmSync(directory, { recursive: true, force: true });
});

describeBindingConformance({
  binding,
  abiVersion: nativeSqliteAbiVersion,
  directory,
  test,
  assertEqual,
});

/** What `fn` throws, as the conformance suite describes it. */
const thrownBy = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    assertInstanceOf(error, Error);
    return {
      kind: error instanceof TypeError ? "TypeError" : "Error",
      message: error.message,
      cause: error.cause,
    };
  }
  throw new Error("Expected a throw.");
};

const finalized = {
  kind: "Error",
  message: "The statement is finalized.",
  cause: undefined,
};

test("a run whose rows array's index setter closes the database or finalizes the statement throws that the statement is finalized", () => {
  for (const target of ["close", "finalize"] as const) {
    const database = binding.openMemory();
    const statement = database.prepare(
      "select 1 as a union all select 2 union all select 3",
    );
    let hook: (() => void) | null =
      target === "close"
        ? () => {
            database.close();
          }
        : () => {
            statement.finalize();
          };
    // Setting a new array's first element runs Array.prototype's setter.
    // oxlint-disable-next-line eslint/no-extend-native -- Appending a row must run JavaScript.
    Object.defineProperty(Array.prototype, "0", {
      configurable: true,
      // oxlint-disable-next-line eslint/accessor-pairs -- Only setting runs the hook.
      set(this: Array<unknown>, value: unknown) {
        const run = hook;
        hook = null;
        run?.();
        Object.defineProperty(this, "0", {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      },
    });
    try {
      assertEqual(
        thrownBy(() => statement.run([])),
        finalized,
      );
    } finally {
      delete (Array.prototype as unknown as Record<string, unknown>)["0"];
      database.close();
    }
  }
});

test("a step or run whose row creation closes the database or finalizes the statement throws that the statement is finalized", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      const create = Object.create;
      let hook = null;
      let way = "";
      // Replaced before the environment's first createBinding captures it:
      // the hook runs while the row is created, or from a setter of the
      // row's column.
      Object.create = (prototype) => {
        const row = create(prototype);
        const run = hook;
        hook = null;
        if (run === null) return row;
        if (way === "create") run();
        else
          Object.defineProperty(row, "a", {
            configurable: true,
            enumerable: true,
            set(value) {
              run();
              Object.defineProperty(this, "a", {
                value, writable: true, enumerable: true, configurable: true,
              });
            },
          });
        return row;
      };
      const binding = require(workerData.addonPath).createBinding();
      const results = [];
      for (const how of ["create", "setter"])
        for (const target of ["close", "finalize"])
          for (const call of ["step", "run"]) {
            const database = binding.openMemory();
            const statement = database.prepare(
              "select 1 as a union all select 2",
            );
            way = how;
            hook = target === "close"
              ? () => database.close()
              : () => statement.finalize();
            let thrown = null;
            try {
              if (call === "step") {
                statement.bind([]);
                statement.step();
              } else statement.run([]);
            } catch (error) {
              thrown = {
                kind: error instanceof TypeError ? "TypeError" : "Error",
                message: error.message,
                cause: error.cause,
              };
            }
            hook = null;
            database.close();
            results.push([how, target, call, thrown]);
          }
      parentPort.postMessage(results);
    `,
    { eval: true, workerData: { addonPath } },
  );

  const [results] = (await once(worker, "message")) as [unknown];

  assertEqual(
    results,
    ["create", "setter"].flatMap((how) =>
      ["close", "finalize"].flatMap((target) =>
        ["step", "run"].map((call) => [how, target, call, finalized]),
      ),
    ),
  );
});

test("importing Binding.ts reads no randomness, as the loader must not before the polyfills install it", () => {
  const binding = new URL("../../src/sqlite/Binding.ts", import.meta.url);

  const imported = spawnSync(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "--input-type=module",
      "-e",
      `Object.defineProperty(globalThis, "crypto", { value: {} }); await import(${JSON.stringify(binding.href)});`,
    ],
    { encoding: "utf8" },
  );

  assertEqual([imported.status, imported.stderr], [0, ""]);
});

test("the suite's XChaCha20-Poly1305 vectors are noble's output", () => {
  for (const [index, vector] of xchachaVectors.entries()) {
    const { key, nonce, plaintext } = xchachaVectorInputs(index, vector.length);
    const randomBytes = {
      create: (length: number) => {
        assert(length === nonce.length, "The nonce has 24 bytes.");
        return nonce;
      },
    } as RandomBytes;

    const [output] = encryptWithXChaCha20Poly1305({ randomBytes })(
      plaintext,
      EncryptionKey.orThrow(key),
    );

    assertEqual(bytesToHex(output.subarray(vector.length)), vector.tag);
    let checksum = 0xcbf29ce484222325n;
    for (const byte of output.subarray(0, vector.length))
      checksum =
        ((checksum ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
    assertEqual(checksum, vector.checksum);
  }
});

test("changes is 0 for a read-only statement whose function writes, and a write's own rows when its function writes too", () => {
  addon.autoRegisterWriteLog(true);
  const database = binding.openMemory();
  addon.autoRegisterWriteLog(false);
  const run = (sql: string) => {
    const statement = database.prepare(sql);
    try {
      return statement.run([]);
    } finally {
      statement.finalize();
    }
  };
  try {
    run("create table t (a)");
    run("create table log (a)");

    assertEqual(run("select write_log() as a"), {
      rows: [{ a: null }],
      changes: 0,
    });
    assertEqual(run("insert into t values (write_log())"), {
      rows: [],
      changes: 1,
    });
    assertEqual(run("select count(*) as n from log"), {
      rows: [{ n: 4 }],
      changes: 0,
    });
  } finally {
    database.close();
  }
});

test("close keeps a connection that SQLite can't close open, holding its file, finalizes its statements, and closes it once SQLite can", () => {
  const path = join(directory, "unfinished-backup.db");
  // The hook and the backups are the process's, so they never outlive the test.
  const database = (() => {
    addon.startBackupOnOpen(true);
    try {
      return binding.openFile(path);
    } finally {
      addon.startBackupOnOpen(false);
    }
  })();
  try {
    const prepared = database.prepare("select 1 as a");

    database.close();
    assertTrue(binding.isFileOpen(path));
    // The close finalized the statements before SQLite refused it.
    assertEqual(
      thrownBy(() => prepared.step()),
      finalized,
    );
    assertEqual(
      thrownBy(() => {
        prepared.finalize();
      }),
      finalized,
    );
    const between = database.prepare("select 1 as a");
    assertEqual(between.run([]).rows, [{ a: 1 }]);
    // A second refused close finalizes the statements prepared since.
    database.close();
    assertTrue(binding.isFileOpen(path));
    assertEqual(
      thrownBy(() => between.step()),
      finalized,
    );
  } finally {
    addon.finishBackups();
    database.close();
  }

  assertFalse(binding.isFileOpen(path));
});

test("openEncryptedFile refuses a key that isn't 32 bytes before it creates the file or its directory", () => {
  const path = join(directory, "refused/key.db");

  for (const key of [new Uint8Array(31), undefined])
    try {
      binding.openEncryptedFile(path, key as never);
    } catch {
      // The conformance suite checks the TypeError.
    }

  assertFalse(existsSync(join(directory, "refused")));
});

test("a connection whose handle is collected stays open, holding its file", async () => {
  const path = join(directory, "collected.db");
  let isCollected = false;
  // Kept, since a collected registry calls nothing.
  const registry = new FinalizationRegistry<undefined>(() => {
    isCollected = true;
  });
  // In a frame of its own, which no suspended frame keeps the handle in.
  const open = () => {
    registry.register(binding.openFile(path), undefined);
  };
  open();

  for (let attempt = 0; attempt < 5; attempt++) {
    await nextMacrotask();
    gc();
  }
  // Node-API runs a handle's finalizer after the collection, from the loop.
  await nextMacrotask();

  assertTrue(isCollected);
  assertTrue(binding.isFileOpen(path));
});

test("a Node.js environment's teardown closes the connections it opened, releasing their files", async () => {
  const path = join(directory, "teardown.db");
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      const binding = require(workerData.addonPath).createBinding();
      const database = binding.openFile(workerData.path);
      binding.openFile(workerData.path + "-other");
      database.prepare("create table t (a)");
      // Listening keeps the worker running until it's terminated.
      parentPort.on("message", () => {});
      parentPort.postMessage("opened");
    `,
    { eval: true, workerData: { addonPath, path } },
  );
  const [message] = (await new Promise((resolve, reject) => {
    worker.once("message", (value) => {
      resolve([value]);
    });
    worker.once("error", reject);
  })) as [unknown];
  assertEqual(message, "opened");
  assertTrue(binding.isFileOpen(path));
  assertTrue(binding.isFileOpen(`${path}-other`));

  await worker.terminate();

  assertFalse(binding.isFileOpen(path));
  assertFalse(binding.isFileOpen(`${path}-other`));
  const reopened = binding.openFile(path);
  reopened.close();
});
