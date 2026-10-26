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
  emptyPrototype,
  EncryptionKey,
  encryptWithXChaCha20Poly1305,
  type NativeSqlite,
  type RandomBytes,
} from "@evolu/common";
import {
  createNativeSqliteRowBuilder,
  loadAddon,
  setupAddon,
  setupAddonPath,
} from "@evolu/sqlite-core/test/setup-addon.mts";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import { setImmediate as nextMacrotask } from "node:timers/promises";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { Worker } from "node:worker_threads";
import { nativeSqliteAbiVersion } from "../../src/sqlite/Binding.ts";
import {
  describeBindingConformance,
  nodeArgumentValues,
  nodeDecodedText,
  nodeOwnBlob,
  nodeTextChunk,
  xchachaVectorInputs,
  xchachaVectors,
} from "../bindingConformance.ts";
import { writeIllFormedNamesDatabase } from "../illFormedNames.ts";

// V8 exposes gc to contexts created after this flag is set.
setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;

const addonPath = await setupAddonPath();
// The module that loads the addon, for a worker, which loads it itself.
const addonModule = import.meta
  .resolve("@evolu/sqlite-core/test/setup-addon.mts");
const addon = await setupAddon();
const binding = addon.createBinding() as NativeSqlite;
const directory = mkdtempSync(join(tmpdir(), "evolu-react-native-binding-"));
const illFormedNames = `${directory}-ill-formed-names.db`;
writeIllFormedNamesDatabase(illFormedNames);

after(() => {
  rmSync(directory, { recursive: true, force: true });
  rmSync(illFormedNames, { force: true });
});

describeBindingConformance({
  binding,
  abiVersion: nativeSqliteAbiVersion,
  directory,
  illFormedNames,
  // Node-API's napi_is_array sees no array in a Proxy.
  acceptsProxyArrays: false,
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

test("the addon is sanitized exactly when SQLITE_CORE_SANITIZE=1, so the sanitized runner can't pass unsanitized", () => {
  assertEqual(addon.isSanitized, process.env.SQLITE_CORE_SANITIZE === "1");
});

test("createBinding throws a TypeError without @evolu/nodejs's row builder", () => {
  const raw = createRequire(import.meta.url)(addonPath) as {
    readonly createBinding: (rowBuilder?: unknown) => unknown;
  };
  const rowBuilder = createNativeSqliteRowBuilder();
  const rowBuilderError = {
    kind: "TypeError",
    message:
      "createBinding takes the row builder of @evolu/nodejs's NativeSqliteRows.ts.",
    cause: undefined,
  };

  for (const invalid of [
    undefined,
    null,
    {},
    // Each of its members wrong: two objects, then the functions.
    { ...rowBuilder, holder: 1 },
    { ...rowBuilder, objects: () => undefined },
    { ...rowBuilder, take: undefined },
    { ...rowBuilder, createRows: {} },
    { ...rowBuilder, createRowOfStep: "x" },
    { ...rowBuilder, takeTexts: null },
    { ...rowBuilder, run: 1 },
    { ...rowBuilder, step: {} },
    { ...rowBuilder, runDatabase: {} },
    { ...rowBuilder, connect: undefined },
  ])
    assertEqual(
      thrownBy(() => raw.createBinding(invalid)),
      rowBuilderError,
    );
});

test("builtins replaced and index accessors of Object.prototype and Array.prototype added after createBinding never run while rows are built, but one set per appended row", () => {
  const database = binding.openMemory();
  // Rows of a few values, of the shared memory, one and more, and of more
  // than a call passes as its arguments, of numbers, short texts and longer
  // ASCII texts, as rows and as one row.
  const many =
    "with r(n) as (select 1 union all select n + 1 from r where n < 350) select n, 'kůň ' || n as t, 'a longer ascii text ' || n as l from r";
  const wide = `select ${Array.from({ length: 1030 }, (_, i) => `${i} as c${i}`).join(", ")}`;
  const { create } = Object;
  // oxlint-disable-next-line typescript/unbound-method -- Applied with its this.
  const { isWellFormed } = String.prototype;
  const { Float64Array: F64, Uint8Array: U8 } = globalThis;
  const calls = {
    create: 0,
    isWellFormed: 0,
    typedArray: 0,
    column: 0,
    objectIndex: 0,
    append: 0,
  };
  Object.create = ((...args: Parameters<typeof create>) => {
    calls.create++;
    return create(...args) as object;
  }) as typeof create;
  // oxlint-disable-next-line eslint/no-extend-native -- Building rows must not call it.
  String.prototype.isWellFormed = function () {
    calls.isWellFormed++;
    return isWellFormed.call(this);
  };
  const counted = <T extends object>(constructor: T): T =>
    new Proxy(constructor, {
      construct: (target, args) => {
        calls.typedArray++;
        return Reflect.construct(target as never, args);
      },
    });
  globalThis.Float64Array = counted(F64);
  globalThis.Uint8Array = counted(U8);
  // oxlint-disable-next-line eslint/no-extend-native -- Setting a column must not run it.
  Object.defineProperty(Object.prototype, "a", {
    configurable: true,
    // oxlint-disable-next-line eslint/accessor-pairs -- Only setting runs it.
    set() {
      calls.column++;
    },
  });
  // Every index a call sets, on an object that isn't a run's rows array.
  const indexes = Array.from({ length: 1031 }, (_, index) => String(index));
  for (const index of indexes) {
    // oxlint-disable-next-line eslint/no-extend-native -- An object the builder creates must not run it.
    Object.defineProperty(Object.prototype, index, {
      configurable: true,
      get() {
        calls.objectIndex++;
        return undefined;
      },
      set() {
        calls.objectIndex++;
      },
    });
    // oxlint-disable-next-line eslint/no-extend-native -- Appending a row runs it.
    Object.defineProperty(Array.prototype, index, {
      configurable: true,
      get() {
        calls.objectIndex++;
        return undefined;
      },
      set(this: Array<unknown>, value: unknown) {
        calls.append++;
        Object.defineProperty(this, index, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      },
    });
  }
  let results: unknown = null;
  try {
    const statement = database.prepare("select 1 as a");
    const ran = statement.run([]);
    statement.bind([]);
    const stepped = statement.step();
    statement.finalize();
    const two = database.prepare("select 1 as a union all select 2");
    const ranTwo = two.run([]);
    two.finalize();
    const manyRows = database.prepare(many);
    const ranMany = manyRows.run([]);
    manyRows.finalize();
    const row = database.prepare(wide);
    const steppedWide = row.step();
    row.finalize();
    results = [
      ran,
      stepped,
      ranTwo,
      ranMany,
      steppedWide,
      database.run("select 2 as a", []),
      database.run(many, []),
    ];
  } finally {
    Object.create = create;
    // oxlint-disable-next-line eslint/no-extend-native -- Restored.
    String.prototype.isWellFormed = isWellFormed;
    globalThis.Float64Array = F64;
    globalThis.Uint8Array = U8;
    delete (Object.prototype as unknown as Record<string, unknown>)["a"];
    for (const index of indexes) {
      delete (Object.prototype as unknown as Record<string, unknown>)[index];
      delete (Array.prototype as unknown as Record<string, unknown>)[index];
    }
    database.close();
  }

  const manyRows = Array.from({ length: 350 }, (_, i) => ({
    n: i + 1,
    t: `kůň ${i + 1}`,
    l: `a longer ascii text ${i + 1}`,
  }));
  assertEqual(results, [
    [{ a: 1 }],
    { a: 1 },
    [{ a: 1 }, { a: 2 }],
    manyRows,
    Object.fromEntries(Array.from({ length: 1030 }, (_, i) => [`c${i}`, i])),
    [{ a: 2 }],
    manyRows,
  ]);
  // A set per row of the runs' rows: 1, 2, 350, 1 and 350.
  assertEqual(calls, {
    create: 0,
    isWellFormed: 0,
    typedArray: 0,
    column: 0,
    objectIndex: 0,
    append: 704,
  });
});

test("index accessors of Object.prototype added after createBinding never run while a builder builds its first keys and its first large row", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { loadAddon } = await import(workerData.addonModule);
        const binding = loadAddon(workerData.addonPath).createBinding();
        const wide =
          "select " +
          Array.from({ length: 1030 }, (_, i) => i + " as c" + i).join(", ");
        const indexes = Array.from({ length: 1031 }, (_, i) => String(i));
        let calls = 0;
        for (const index of indexes)
          Object.defineProperty(Object.prototype, index, {
            configurable: true,
            get() {
              calls++;
              return undefined;
            },
            set() {
              calls++;
            },
          });
        const database = binding.openMemory();
        let rows;
        try {
          // The builder's first keys, then its first row of more values than
          // a call passes as its arguments, with no longer ASCII text.
          const narrow = database.prepare("select 1 as a");
          narrow.bind([]);
          const first = narrow.step();
          narrow.finalize();
          const statement = database.prepare(wide);
          statement.bind([]);
          const row = statement.step();
          statement.finalize();
          rows = [first.a, Object.keys(row).length, row.c1029];
        } finally {
          for (const index of indexes) delete Object.prototype[index];
          database.close();
        }
        parentPort.postMessage([rows, calls]);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [result] = (await once(worker, "message")) as [unknown];

  assertEqual(result, [[1, 1030, 1029], 0]);
});

test("a replaced TextDecoder decode or String slice never runs while the rows of a result too large for arguments are built", () => {
  const database = binding.openMemory();
  // oxlint-disable-next-line typescript/unbound-method -- Applied with its this.
  const { decode } = TextDecoder.prototype;
  // oxlint-disable-next-line typescript/unbound-method -- Applied with its this.
  const { slice } = String.prototype;
  let calls = 0;
  TextDecoder.prototype.decode = function (...args) {
    calls++;
    return decode.apply(this, args);
  };
  // oxlint-disable-next-line eslint/no-extend-native -- Building rows must not call it.
  String.prototype.slice = function (...args) {
    calls++;
    return slice.apply(this, args);
  };
  let rows: unknown = null;
  try {
    rows = database.run(
      "with r(n) as (select 1 union all select n + 1 from r where n < 20) select n, 'kůň ' || n as t, 'a longer text ' || n as l, cast(x'ff' as text) as i from r",
      [],
    );
  } finally {
    TextDecoder.prototype.decode = decode;
    // oxlint-disable-next-line eslint/no-extend-native -- Restored.
    String.prototype.slice = slice;
    database.close();
  }

  assertEqual(
    rows,
    Array.from({ length: 20 }, (_, i) => ({
      n: i + 1,
      t: `kůň ${i + 1}`,
      l: `a longer text ${i + 1}`,
      i: "\uFFFD",
    })),
  );
  assertEqual(calls, 0);
});

test("an Object.prototype property set before the row builder loaded changes none of its options, so a large result's ill-formed text still decodes with U+FFFD", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        // A fatal decoder would throw for the ill-formed text instead. Not
        // enumerable, so Node.js's TypeScript loader, which enumerates
        // inherited properties, works.
        Object.defineProperty(Object.prototype, "fatal", {
          value: true,
          configurable: true,
        });
        const { loadAddon } = await import(workerData.addonModule);
        delete Object.prototype.fatal;
        const binding = loadAddon(workerData.addonPath).createBinding();
        const database = binding.openMemory();
        let result;
        try {
          result = database.run(
            "with r(n) as (select 1 union all select n + 1 from r where n < 1100) select cast(x'ff' as text) as i from r",
            [],
          );
        } catch (error) {
          result = error.message;
        }
        database.close();
        parentPort.postMessage(result);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [result] = (await once(worker, "message")) as [unknown];

  assertEqual(
    result,
    Array.from({ length: 1100 }, () => ({ i: "\uFFFD" })),
  );
});

test("a row kept from a large result keeps its texts, not the texts of the other rows, short or long", () => {
  const database = binding.openMemory();
  database.run("create table t (a, b, c, d, e, f, g, h)", []);
  // Texts of 13 bytes and more, which decode on their own, and shorter ones,
  // which are sliced from one string.
  const row = (i: number) => ({
    a: `${"abcdefghij".repeat(10)}${i}`,
    b: `${"kůň 😀 ".repeat(15)}${i}`,
    ...Object.fromEntries(
      ["c", "d", "e", "f", "g", "h"].map((key) => [key, `kůň-${key}${i}`]),
    ),
  });
  const insert = database.prepare(
    "insert into t values (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (let i = 0; i < 20_000; i++) insert.run(Object.values(row(i)));
  insert.finalize();
  gc();
  gc();
  const usage = () => {
    const { heapUsed, external } = process.memoryUsage();
    return heapUsed + external;
  };
  const before = usage();

  let rows = database.run("select * from t", []) as ReadonlyArray<unknown>;
  const kept = rows[5000];
  rows = [];
  gc();
  gc();
  const retained = usage() - before;
  database.close();

  assertEqual(kept, row(5000));
  // The long texts take about 8 MB as strings, the short ones about 2 MB.
  assert(retained < 1_000_000, "Expected the other rows' texts released.", {
    actual: retained,
  });
});

test("the runs of statements and databases refuse an id that names no live handle of their kind, also one a collected handle had", async () => {
  const database = binding.openMemory();
  const statement = database.prepare("select 1 as a");
  const [statementKey] = Object.getOwnPropertySymbols(statement);
  const [databaseKey] = Object.getOwnPropertySymbols(database);
  assert(
    statementKey !== undefined && databaseKey !== undefined,
    "Expected the keys of the ids.",
  );
  const statementId = (statement as unknown as Record<symbol, number>)[
    statementKey
  ];
  const databaseId = (database as unknown as Record<symbol, number>)[
    databaseKey
  ];
  // Collected after the loop, so the slot of its id holds another handle.
  let collectedId = 0;
  let isCollected = false;
  const registry = new FinalizationRegistry<undefined>(() => {
    isCollected = true;
  });
  const prepare = () => {
    const collected = database.prepare("select 2 as a");
    collectedId = (collected as unknown as Record<symbol, number>)[
      statementKey
    ];
    registry.register(collected, undefined);
  };
  prepare();
  for (let attempt = 0; attempt < 5; attempt++) {
    await nextMacrotask();
    gc();
  }
  await nextMacrotask();
  const reused = database.prepare("select 3 as a");
  const { run, step } = statement;
  const { run: runDatabase } = database;
  const ids = [
    -1,
    1.5,
    2 ** 53,
    2 ** 64,
    Infinity,
    "0",
    statementId + 1,
    statementId + 2 ** 32,
    // A slot past every handle's.
    2 ** 31,
    databaseId,
    collectedId,
  ];

  assertTrue(isCollected);
  const notStatement = {
    kind: "TypeError",
    message: "Expected a statement.",
    cause: undefined,
  };
  assertEqual(run.call({ [statementKey]: statementId }, []), [{ a: 1 }]);
  for (const id of ids)
    assertEqual(
      [
        thrownBy(() => run.call({ [statementKey]: id }, [])),
        thrownBy(() => step.call({ [statementKey]: id })),
      ],
      [notStatement, notStatement],
    );
  for (const id of [-1, statementId, databaseId + 2 ** 32])
    assertEqual(
      thrownBy(() => runDatabase.call({ [databaseKey]: id }, "select 1", [])),
      { kind: "TypeError", message: "Expected a database.", cause: undefined },
    );
  assertEqual(reused.run([]), [{ a: 3 }]);
  statement.finalize();
  reused.finalize();
  database.close();
});

test("the rows of runs, steps and a database's runs have @evolu/common's emptyPrototype, whose objects V8 keeps faster", () => {
  const database = binding.openMemory();
  const statement = database.prepare("select 1 as a, 'b' as b");
  const [run] = statement.run([]) as ReadonlyArray<object>;
  statement.bind([]);
  const step = statement.step() as object;
  const [wide] = database.run(
    `select ${Array.from({ length: 1030 }, (_, i) => `${i} as c${i}`).join(", ")}`,
    [],
  ) as ReadonlyArray<object>;
  const [small] = database.run("select 1 as a", []) as ReadonlyArray<object>;
  statement.finalize();
  database.close();

  assertEqual(
    [run, step, wide, small].map(
      (row) => Object.getPrototypeOf(row) === emptyPrototype,
    ),
    [true, true, true, true],
  );
});

// A run's rows of a few numbers, which the row builder builds after the
// native returns, and of several texts, which it builds in a call before.
const sharedRows = "select 1 as a union all select 2 union all select 3";
const calledRows = "select 'x' as a union all select 'y' union all select 'z'";

test("a run whose rows array's index setter closes the database or finalizes the statement throws that the statement is finalized, of numbers or of texts", () => {
  for (const sql of [sharedRows, calledRows])
    for (const target of ["close", "finalize"] as const) {
      const database = binding.openMemory();
      const statement = database.prepare(sql);
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

test("a run of a few values keeps no reference to its one text or blob once its row is dropped", async () => {
  const database = binding.openMemory();
  // In a frame of its own, which no suspended frame keeps the row in.
  const read = () => {
    const [row] = database.run("select x'0102' as b", []) as [
      { readonly b: Uint8Array },
    ];
    return new WeakRef(row.b);
  };
  const blob = read();
  // Of numbers only, so it leaves no text or blob of its own.
  database.run("select 1 as a", []);
  for (let attempt = 0; attempt < 5; attempt++) {
    await nextMacrotask();
    gc();
  }
  database.close();

  assertEqual(blob.deref(), undefined);
});

test("a step of a few values keeps no reference to its one text or blob once its row is dropped", async () => {
  const database = binding.openMemory();
  const statement = database.prepare("select x'0102' as b");
  // In a frame of its own, which no suspended frame keeps the row in.
  const read = () => {
    statement.bind([]);
    const row = statement.step() as unknown as { readonly b: Uint8Array };
    statement.reset();
    return new WeakRef(row.b);
  };
  const blob = read();
  for (let attempt = 0; attempt < 5; attempt++) {
    await nextMacrotask();
    gc();
  }
  statement.finalize();
  database.close();

  assertEqual(blob.deref(), undefined);
});

test("a step of a row wider than a few values keeps none of its texts once its row is dropped", async () => {
  const database = binding.openMemory();
  // 1,024 numbers, then 76 longer ASCII texts of 200 KB, which takeTexts takes.
  const statement = database.prepare(
    `select ${Array.from({ length: 1100 }, (_, i) =>
      i < 1024
        ? `${i} as c${i}`
        : `replace(hex(zeroblob(100000)), '0', 'x') as c${i}`,
    ).join(", ")}`,
  );
  const settle = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await nextMacrotask();
      gc();
    }
  };
  const usage = () => {
    const { heapUsed, external } = process.memoryUsage();
    return heapUsed + external;
  };
  await settle();
  const before = usage();
  // In a frame of its own, which no suspended frame keeps the row in.
  const step = () => {
    statement.bind([]);
    const row = statement.step() as unknown as Record<string, string>;
    statement.reset();
    return row["c1099"]?.length;
  };
  const length = step();
  await settle();
  const retained = usage() - before;
  statement.finalize();
  database.close();

  assertEqual(length, 200_000);
  // The texts take about 15 MB.
  assert(retained < 1_000_000, "Expected the row's texts released.", {
    actual: retained,
  });
});

test("a step or run never calls a replaced Object.create, so it runs no JavaScript while rows are built", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { loadAddon } = await import(workerData.addonModule);
        const create = Object.create;
        let calls = 0;
        // Replaced before the environment's first createBinding.
        Object.create = (...args) => {
          calls++;
          return create(...args);
        };
        const binding = loadAddon(workerData.addonPath).createBinding();
        const database = binding.openMemory();
        const statement = database.prepare("select 1 as a union all select 2");
        const rows = statement.run([]);
        statement.bind([]);
        const row = statement.step();
        const once = database.run("select 3 as a", []);
        database.close();
        parentPort.postMessage([rows, row, once, calls]);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [results] = (await once(worker, "message")) as [unknown];

  assertEqual(results, [[{ a: 1 }, { a: 2 }], { a: 1 }, [{ a: 3 }], 0]);
});

test("statements and database runs of the same column names share the keys the environment keeps of them, so a statement prepared again takes none", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(
          workerData.addonModule
        );
        const rowBuilder = createNativeSqliteRowBuilder();
        let takes = 0;
        const binding = require(workerData.addonPath).createBinding({
          ...rowBuilder,
          take: (...args) => {
            takes++;
            return rowBuilder.take(...args);
          },
        });
        const database = binding.openMemory();
        const rows = [];
        for (const sql of [
          "select 1 as a, 2 as b",
          "select 3 as a, 4 as b",
          "select 5 as b, 6 as a",
        ]) {
          const statement = database.prepare(sql);
          rows.push(statement.step());
          statement.finalize();
        }
        rows.push(database.run("select 7 as a, 8 as b", []));
        database.close();
        parentPort.postMessage([rows, takes]);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [result] = (await once(worker, "message")) as [unknown];

  // One take for a and b, another for b and a.
  assertEqual(result, [
    [{ a: 1, b: 2 }, { a: 3, b: 4 }, { b: 5, a: 6 }, [{ a: 7, b: 8 }]],
    2,
  ]);
});

test("a step or run whose call for the keys of its column names closes the database or finalizes the statement throws, and uses the statement no more", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      const create = Object.create;
      let hook = null;
      // Replaced before the row builder loads, so it calls this one for the
      // keys of the column names, while the statement is mid-step.
      Object.create = (...args) => {
        const run = hook;
        hook = null;
        run?.();
        return create(...args);
      };
      (async () => {
        const { loadAddon } = await import(workerData.addonModule);
        const binding = loadAddon(workerData.addonPath).createBinding();
        const results = [];
        for (const [target, call] of [
          ["close", "run"],
          ["close", "step"],
          ["close", "database run"],
          ["finalize", "run"],
          ["finalize", "step"],
        ]) {
          const database = binding.openMemory();
          // Column names whose keys the environment doesn't keep yet.
          const statement = database.prepare(
            "select 1 as a" + results.length + " union all select 2",
          );
          hook = target === "close"
            ? () => database.close()
            : () => statement.finalize();
          let thrown = null;
          try {
            if (call === "run") statement.run([]);
            else if (call === "step") statement.step();
            else database.run("select 1 as b union all select 2", []);
          } catch (error) {
            thrown = {
              kind: error instanceof TypeError ? "TypeError" : "Error",
              message: error.message,
              cause: error.cause,
            };
          }
          hook = null;
          database.close();
          results.push([target, call, thrown]);
        }
        parentPort.postMessage(results);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [results] = (await once(worker, "message")) as [unknown];

  assertEqual(results, [
    ["close", "run", finalized],
    ["close", "step", finalized],
    [
      "close",
      "database run",
      { kind: "Error", message: "The database is closed.", cause: undefined },
    ],
    ["finalize", "run", finalized],
    ["finalize", "step", finalized],
  ]);
});

test("a row builder that detaches the memory the binding shares with it makes every call throw that it's detached, writing nothing to freed memory", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      const { setFlagsFromString } = require("node:v8");
      const { runInNewContext } = require("node:vm");
      setFlagsFromString("--expose-gc");
      const collect = runInNewContext("gc");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(
          workerData.addonModule
        );
        const rowBuilder = createNativeSqliteRowBuilder();
        let memory = null;
        // The environment's first createBinding, so its builder is this one.
        const binding = require(workerData.addonPath).createBinding({
          ...rowBuilder,
          connect: (...args) => {
            memory = args[3];
            rowBuilder.connect(...args);
          },
        });
        const database = binding.openMemory();
        const statement = database.prepare("select 1 as a");
        // Detached, and its memory freed once the transferred buffer is gone.
        memory.transfer();
        memory = null;
        collect();
        collect();
        const messages = [];
        for (const call of [
          () => statement.run([]),
          () => database.run("select 1 as a", []),
          () => statement.bind([]),
          () => statement.step(),
          () => statement.reset(),
          () => statement.finalize(),
          () => database.close(),
        ])
          try {
            call();
            messages.push(null);
          } catch (error) {
            messages.push(error.message);
          }
        parentPort.postMessage(messages);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [messages] = (await once(worker, "message")) as [unknown];

  assertEqual(
    messages,
    Array.from(
      { length: 7 },
      () => "The memory the row builder shares is detached.",
    ),
  );
});

test("a row builder whose holder's getter or values' setter closes the database or finalizes the statement while a run, step or database run creates the keys of its column names makes it throw, using the statement no more", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(
          workerData.addonModule
        );
        const rowBuilder = createNativeSqliteRowBuilder();
        let hook = null;
        let where = "holder";
        const runHook = () => {
          const run = hook;
          hook = null;
          run?.();
        };
        // The builder's own holder behind a getter, and its values behind a
        // setter, either of which runs the hook once.
        const holder = Object.defineProperty({}, 0, {
          get: () => {
            if (where === "holder") runHook();
            const values = rowBuilder.holder[0];
            return where === "holder"
              ? values
              : new Proxy(values, {
                  set: (target, key, value) => {
                    runHook();
                    target[key] = value;
                    return true;
                  },
                });
          },
        });
        const binding = require(workerData.addonPath).createBinding({
          ...rowBuilder,
          holder,
        });
        const results = [];
        let column = 0;
        for (const hookAt of ["holder", "values"])
          for (const [target, call] of [
            ["close", "run"],
            ["finalize", "run"],
            ["close", "step"],
            ["finalize", "step"],
            ["close", "database run"],
          ]) {
            where = hookAt;
            const database = binding.openMemory();
            // Column lists whose keys the environment doesn't keep yet.
            const statement = database.prepare(
              "select 1 as a" + column++ + " union all select 2",
            );
            hook = target === "close"
              ? () => database.close()
              : () => statement.finalize();
            let thrown = null;
            try {
              if (call === "run") statement.run([]);
              else if (call === "step") statement.step();
              else database.run("select 1 as c" + column++, []);
            } catch (error) {
              thrown = error.message;
            }
            hook = null;
            database.close();
            results.push([hookAt, target, call, thrown]);
          }
        parentPort.postMessage(results);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [results] = (await once(worker, "message")) as [unknown];

  assertEqual(
    results,
    ["holder", "values"].flatMap((hookAt) => [
      [hookAt, "close", "run", "The statement is finalized."],
      [hookAt, "finalize", "run", "The statement is finalized."],
      [hookAt, "close", "step", "The statement is finalized."],
      [hookAt, "finalize", "step", "The statement is finalized."],
      [hookAt, "close", "database run", "The database is closed."],
    ]),
  );
});

test("a row builder that detaches the shared memory in the middle of a run, step or database run makes it throw that it's detached, writing nothing to the memory after", async () => {
  // A set of objects[0], which a run of a few values and one text makes after
  // it wrote them to the shared memory, returns what the row builder makes of
  // the memory it detached.
  const cases = [
    ["objects", "run"],
    ["objects", "database run"],
    ["take", "run"],
    ["take", "step"],
    ["take", "database run"],
    ["createRows", "run"],
    ["createRows", "database run"],
    ["createRowOfStep", "step"],
    ["takeTexts", "run"],
    ["takeTexts", "step"],
    ["takeTexts", "database run"],
  ] as const;
  const results = await Promise.all(
    cases.flatMap(([member, path]) =>
      // Collected, too, for AddressSanitizer to report a write to it.
      [false, true].map(async (isCollected) => {
        const worker = new Worker(
          `
            const { parentPort, workerData } = require("node:worker_threads");
            const { setFlagsFromString } = require("node:v8");
            const { runInNewContext } = require("node:vm");
            setFlagsFromString("--expose-gc");
            const collect = runInNewContext("gc");
            (async () => {
              const { createNativeSqliteRowBuilder } = await import(
                workerData.addonModule
              );
              const rowBuilder = createNativeSqliteRowBuilder();
              let memory = null;
              let isArmed = false;
              let kept = null;
              let snapshot = null;
              // Detaches the memory once, armed, before calling the member.
              const detach = (member, fn) => (...args) => {
                if (isArmed && member === workerData.member) {
                  isArmed = false;
                  kept = memory.transfer();
                  memory = null;
                  snapshot = Array.from(new Uint8Array(kept));
                  if (workerData.isCollected) {
                    kept = null;
                    collect();
                    collect();
                  }
                }
                return fn(...args);
              };
              // Sets the builder's own element after the detach, so its run
              // reads the text.
              const objects = [];
              Object.defineProperty(objects, 0, {
                get: () => rowBuilder.objects[0],
                set: detach("objects", (value) => {
                  rowBuilder.objects[0] = value;
                }),
              });
              const binding = require(workerData.addonPath).createBinding({
                ...rowBuilder,
                objects,
                take: detach("take", rowBuilder.take),
                createRows: detach("createRows", rowBuilder.createRows),
                createRowOfStep: detach(
                  "createRowOfStep",
                  rowBuilder.createRowOfStep,
                ),
                takeTexts: detach("takeTexts", rowBuilder.takeTexts),
                connect: (...args) => {
                  rowBuilder.connect(...args);
                  memory = args[3];
                },
              });
              const database = binding.openMemory();
              // Leaves a count of values in the memory, which a write of 0
              // after the detach would change.
              database.run("select 1 as n", []);
              // 1,100 longer ASCII texts, as rows or as one row's columns, the
              // ones after the first 1,024 of which a call passes to
              // takeTexts before it calls for the rows.
              const rows =
                "with r(n) as (select 1 union all select n + 1 from r where n < 1100) select 'a longer ascii text ' || n as t from r";
              const row =
                "select " +
                Array.from(
                  { length: 1100 },
                  (_, i) => "'a longer ascii text " + i + "' as c" + i,
                ).join(", ");
              const fewValues = "select 1 as n, 'a text' as t";
              const sql = workerData.member === "objects" ? fewValues : rows;
              const statement = database.prepare(
                workerData.path === "step" ? row : sql,
              );
              const messages = [];
              isArmed = true;
              const attempt = (call) => {
                try {
                  call();
                  messages.push(null);
                } catch (error) {
                  messages.push(error.message);
                }
              };
              if (workerData.path === "run") attempt(() => statement.run([]));
              else if (workerData.path === "database run")
                attempt(() => database.run(sql, []));
              // A step reads the memory after its row, as its reset does.
              else {
                attempt(() => statement.step());
                attempt(() => statement.reset());
              }
              parentPort.postMessage([
                messages,
                kept === null ? null : Array.from(new Uint8Array(kept)),
                workerData.isCollected ? null : snapshot,
                // Whether the memory was detached.
                !isArmed,
              ]);
            })();
          `,
          {
            eval: true,
            workerData: { addonPath, addonModule, member, path, isCollected },
          },
        );
        const [[messages, kept, snapshot, isDetached]] = (await once(
          worker,
          "message",
        )) as [[unknown, unknown, unknown, boolean]];
        return [
          member,
          path,
          isCollected,
          messages,
          kept,
          snapshot,
          isDetached,
        ];
      }),
    ),
  );

  const detached = "The memory the row builder shares is detached.";
  assertEqual(
    results.map(
      ([member, path, isCollected, messages, kept, snapshot, isDetached]) => [
        member,
        path,
        isCollected,
        messages,
        kept === snapshot || JSON.stringify(kept) === JSON.stringify(snapshot),
        isDetached,
      ],
    ),
    cases.flatMap(([member, path]) =>
      [false, true].map((isCollected) => [
        member,
        path,
        isCollected,
        member === "objects"
          ? [null]
          : path === "step"
            ? [detached, detached]
            : [detached],
        true,
        true,
      ]),
    ),
  );
});

test("a run of a large result after a row builder detached the buffer the binding keeps for such calls, or of one larger than it keeps, returns every row", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(
          workerData.addonModule
        );
        const rowBuilder = createNativeSqliteRowBuilder();
        let detached = 0;
        const binding = require(workerData.addonPath).createBinding({
          ...rowBuilder,
          // Detaches the buffer once it built the rows of it.
          createRows: (...args) => {
            const rows = rowBuilder.createRows(...args);
            if (args[3] instanceof ArrayBuffer) {
              args[3].transfer();
              detached++;
            }
            return rows;
          },
        });
        const database = binding.openMemory();
        const numbers = (count) =>
          "with r(n) as (select 1 union all select n + 1 from r where n < " +
          count +
          ") select n, 'kůň ' || n as t from r";
        const isEvery = (rows, count) =>
          rows.length === count &&
          rows.every((row, i) => row.n === i + 1 && row.t === "kůň " + (i + 1));
        // A few runs of 2,000 values, then of 100,000, more than 256 KiB.
        const results = [1000, 1000, 1000, 50000, 50000].map((count) =>
          isEvery(database.run(numbers(count), []), count),
        );
        database.close();
        parentPort.postMessage([results, detached]);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [result] = (await once(worker, "message")) as [unknown];

  assertEqual(result, [[true, true, true, true, true], 5]);
});

test("a run takes the buffer the binding keeps only after takeTexts, and a new one when it needs a byte more than it", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(
          workerData.addonModule
        );
        const rowBuilder = createNativeSqliteRowBuilder();
        let kept = null;
        let isArmed = false;
        const sizes = [];
        const binding = require(workerData.addonPath).createBinding({
          ...rowBuilder,
          createRows: (...args) => {
            kept = args[3];
            sizes.push(kept.byteLength);
            return rowBuilder.createRows(...args);
          },
          takeTexts: (...args) => {
            if (isArmed) {
              isArmed = false;
              // To another length, so the memory is copied and freed.
              kept.transfer(kept.byteLength + 8);
            }
            return rowBuilder.takeTexts(...args);
          },
        });
        const database = binding.openMemory();
        // 4,000 values, the last NULL or a blob of one byte: a buffer of
        // 8 * 4,001 + 4,000 = 36,008 bytes, and one more for the blob.
        const query = (last) =>
          "with r(n) as (select 1 union all select n + 1 from r where n < 2000) " +
          "select n, case when n < 2000 then 'a longer ascii text ' || n else " +
          last +
          " end as t from r";
        const isEvery = (rows, last) =>
          rows.length === 2000 &&
          rows.every(
            (row, i) =>
              row.n === i + 1 &&
              (i < 1999 ? row.t === "a longer ascii text " + (i + 1) : last(row.t)),
          );
        database.run(query("null"), []);
        isArmed = true;
        const afterDetach = isEvery(
          database.run(query("null"), []),
          (t) => t === null,
        );
        const larger = isEvery(
          database.run(query("x'07'"), []),
          (t) => t.length === 1 && t[0] === 7,
        );
        database.close();
        parentPort.postMessage([afterDetach, larger, sizes]);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [result] = (await once(worker, "message")) as [unknown];

  // A new buffer after the detach, and one doubled for the byte more.
  assertEqual(result, [true, true, [36_008, 36_008, 72_016]]);
});

test("a large result's call reuses the buffer the binding keeps while it's large enough, doubling it up to 256 KiB, keeps none larger, and lets go of the one it replaces", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      const { setFlagsFromString } = require("node:v8");
      const { runInNewContext } = require("node:vm");
      const { setImmediate: nextMacrotask } = require("node:timers/promises");
      setFlagsFromString("--expose-gc");
      const collect = runInNewContext("gc");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(
          workerData.addonModule
        );
        const rowBuilder = createNativeSqliteRowBuilder();
        const buffers = [];
        const sizes = [];
        const binding = require(workerData.addonPath).createBinding({
          ...rowBuilder,
          createRows: (...args) => {
            const buffer = args[3];
            if (buffer instanceof ArrayBuffer) {
              buffers.push(new WeakRef(buffer));
              sizes.push([
                buffer.byteLength,
                buffers.findIndex((kept) => kept.deref() === buffer),
              ]);
            }
            return rowBuilder.createRows(...args);
          },
        });
        const database = binding.openMemory();
        // A row of one number each, whose buffer takes 8 + 9 * count bytes,
        // or 29,125 and a blob of 2 bytes, a buffer of 256 KiB.
        for (const count of [1032, 1032, 1100, 1200, 22000, 23000, 23300, 40000, 23000, null, 23000])
          database.run(
            "with r(n) as (select 1 union all select n + 1 from r where n < " +
              (count ?? 29126) +
              ") select " +
              (count === null ? "case when n < 29126 then n else x'0102' end" : "n") +
              " as n from r",
            [],
          );
        for (let attempt = 0; attempt < 5; attempt++) {
          await nextMacrotask();
          collect();
        }
        const isAlive = buffers.map((buffer) => buffer.deref() !== undefined);
        database.close();
        parentPort.postMessage([sizes, isAlive]);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [result] = (await once(worker, "message")) as [unknown];

  // [byte length, index of the call that first had the buffer]: the second
  // call fits exactly, the third doubles the buffer and the fourth fits it,
  // doubling stops at 256 KiB, a buffer larger than that isn't kept, and one
  // of exactly 256 KiB is, which only the binding keeps.
  assertEqual(result, [
    [
      [9296, 0],
      [9296, 0],
      [18592, 2],
      [18592, 2],
      [198008, 4],
      [207008, 5],
      [209708, 6],
      [360008, 7],
      [209708, 6],
      [262144, 9],
      [262144, 9],
    ],
    [false, false, false, false, false, false, false, false, false, true, true],
  ]);
});

test("a large result's call doubles the buffer the binding keeps to exactly 256 KiB", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(
          workerData.addonModule
        );
        const rowBuilder = createNativeSqliteRowBuilder();
        const sizes = [];
        const binding = require(workerData.addonPath).createBinding({
          ...rowBuilder,
          createRows: (...args) => {
            sizes.push(args[3].byteLength);
            return rowBuilder.createRows(...args);
          },
        });
        const database = binding.openMemory();
        // 14,561 numbers and a blob of 6 bytes, a buffer of 8 + 9 * 14,562 +
        // 6 = 128 KiB, then 20,000 numbers, 180,008 bytes.
        for (const sql of [
          "with r(n) as (select 1 union all select n + 1 from r where n < 14562) select case when n < 14562 then n else zeroblob(6) end as n from r",
          "with r(n) as (select 1 union all select n + 1 from r where n < 20000) select n from r",
        ])
          database.run(sql, []);
        database.close();
        parentPort.postMessage(sizes);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [result] = (await once(worker, "message")) as [unknown];

  assertEqual(result, [131_072, 262_144]);
});

test("a call passes up to the conformance suite's nodeArgumentValues values as arguments and more in a buffer, and longer ASCII texts after them in chunks of its nodeTextChunk", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(
          workerData.addonModule
        );
        const rowBuilder = createNativeSqliteRowBuilder();
        let chunks = [];
        let isBuffered = null;
        const binding = require(workerData.addonPath).createBinding({
          ...rowBuilder,
          createRows: (...args) => {
            isBuffered = args[3] instanceof ArrayBuffer;
            return rowBuilder.createRows(...args);
          },
          takeTexts: (isFirst, ...texts) => {
            chunks.push(texts.length);
            return rowBuilder.takeTexts(isFirst, ...texts);
          },
        });
        const database = binding.openMemory();
        const { argumentValues, textChunk } = workerData;
        const results = [argumentValues, argumentValues + 1].map((count) => {
          isBuffered = null;
          chunks = [];
          // Rows of a short text each, which the shared memory doesn't hold,
          // and one more longer ASCII text than a chunk.
          database.run(
            "with r(n) as (select 1 union all select n + 1 from r where n < " +
              count +
              ") select 'k' || n as t from r",
            [],
          );
          const numbers = isBuffered;
          database.run(
            "with r(n) as (select 1 union all select n + 1 from r where n < " +
              (argumentValues + textChunk + 1) +
              ") select 'a longer ascii text ' || n as t from r",
            [],
          );
          return [numbers, chunks];
        });
        database.close();
        parentPort.postMessage(results);
      })();
    `,
    {
      eval: true,
      workerData: {
        addonPath,
        addonModule,
        argumentValues: nodeArgumentValues,
        textChunk: nodeTextChunk,
      },
    },
  );

  const [result] = (await once(worker, "message")) as [unknown];

  assertEqual(result, [
    [false, [nodeTextChunk, 1]],
    [true, [nodeTextChunk, 1]],
  ]);
});

test("a run passes the texts after the first 1,024 values that aren't ASCII and have fewer than the conformance suite's nodeDecodedText bytes to takeTexts, as the longer ASCII ones, and decodes the others", async () => {
  // A byte fewer than nodeDecodedText of UTF-8, and nodeDecodedText.
  const shorter = `x${"é".repeat(nodeDecodedText / 2 - 1)}`;
  const decoded = "é".repeat(nodeDecodedText / 2);
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(
          workerData.addonModule
        );
        const rowBuilder = createNativeSqliteRowBuilder();
        const taken = [];
        const binding = require(workerData.addonPath).createBinding({
          ...rowBuilder,
          takeTexts: (isFirst, ...texts) => {
            taken.push(...texts);
            return rowBuilder.takeTexts(isFirst, ...texts);
          },
        });
        const database = binding.openMemory();
        // 1,024 numbers, then texts of 24 bytes, and then the two.
        const rows = database.run(
          "with r(n) as (select 1 union all select n + 1 from r where n < 1100) " +
            "select case when n <= 1024 then n else 'žluťoučký kůň ' || n end as v from r " +
            "union all select ? union all select ?",
          [workerData.shorter, workerData.decoded],
        );
        database.close();
        parentPort.postMessage([rows.map((row) => row.v), taken]);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule, shorter, decoded } },
  );

  const [result] = (await once(worker, "message")) as [unknown];

  const texts = [
    ...Array.from({ length: 76 }, (_, i) => `žluťoučký kůň ${1025 + i}`),
    shorter,
  ];
  assertEqual(result, [
    [...Array.from({ length: 1024 }, (_, i) => i + 1), ...texts, decoded],
    texts,
  ]);
});

test("a run passes each blob after the first 1,024 values of the conformance suite's nodeOwnBlob bytes or more to takeTexts with a buffer of its own, leaving its bytes out of the call's buffer, which holds a shorter one's", async () => {
  // A byte fewer than nodeOwnBlob, and nodeOwnBlob.
  const shorter = Uint8Array.from({ length: nodeOwnBlob - 1 }, (_, i) => i);
  const own = Uint8Array.from({ length: nodeOwnBlob }, (_, i) => 255 - i);
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(
          workerData.addonModule
        );
        const rowBuilder = createNativeSqliteRowBuilder();
        const taken = [];
        // The values takeTexts took, so the row's blob is found among them.
        const passed = [];
        let size = null;
        const binding = require(workerData.addonPath).createBinding({
          ...rowBuilder,
          createRows: (...args) => {
            size = args[3].byteLength;
            return rowBuilder.createRows(...args);
          },
          takeTexts: (isFirst, ...values) => {
            passed.push(...values);
            for (const value of values)
              taken.push(
                value instanceof Uint8Array
                  ? [value.length, value.byteOffset, value.buffer.byteLength]
                  : value,
              );
            return rowBuilder.takeTexts(isFirst, ...values);
          },
        });
        const database = binding.openMemory();
        // 1,024 numbers, then the two blobs.
        const rows = database.run(
          "with r(n) as (select 1 union all select n + 1 from r where n < 1024) " +
            "select n as v from r union all select ? union all select ?",
          [workerData.shorter, workerData.own],
        );
        database.close();
        parentPort.postMessage([
          rows.slice(1024).map((row) => Array.from(row.v)),
          taken,
          size,
          passed.indexOf(rows[1025].v),
        ]);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule, shorter, own } },
  );

  const [result] = (await once(worker, "message")) as [unknown];

  // The buffer holds the 1,026 values' numbers and kinds, and the bytes of
  // the shorter blob only. The row holds the blob takeTexts took, not a copy
  // of it.
  assertEqual(result, [
    [Array.from(shorter), Array.from(own)],
    [[nodeOwnBlob, 0, nodeOwnBlob]],
    8 * 1027 + 1026 + nodeOwnBlob - 1,
    0,
  ]);
});

test("a run that a row builder's takeTexts runs collects its values in arrays of its own, so the run that called it reads all of its own", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(
          workerData.addonModule
        );
        const rowBuilder = createNativeSqliteRowBuilder();
        let database;
        let isArmed = false;
        const binding = require(workerData.addonPath).createBinding({
          ...rowBuilder,
          takeTexts: (...args) => {
            // Once, before the texts of the outer run are all taken.
            if (isArmed) {
              isArmed = false;
              database.run(texts("inner", 3000), []);
            }
            return rowBuilder.takeTexts(...args);
          },
        });
        database = binding.openMemory();
        // Longer ASCII texts after the first 1,024 values, more than a call
        // of takeTexts takes, and the inner run's more, so its arrays grow.
        const texts = (prefix, count) =>
          "with r(n) as (select 1 union all select n + 1 from r where n < " +
          count +
          ") select '" +
          prefix +
          " text ' || n as t, n from r";
        // Leaves the environment arrays to keep, which the outer run takes.
        database.run(texts("earlier", 1000), []);
        isArmed = true;
        const rows = database.run(texts("outer", 1000), []);
        database.close();
        parentPort.postMessage(
          rows.every((row, i) => row.t === "outer text " + (i + 1) && row.n === i + 1) &&
            rows.length,
        );
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [result] = (await once(worker, "message")) as [unknown];

  assertEqual(result, 1000);
});

test("a run's texts that a row builder took before it threw while building its rows don't become the next run's", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(
          workerData.addonModule
        );
        const rowBuilder = createNativeSqliteRowBuilder();
        let throws = true;
        const binding = require(workerData.addonPath).createBinding({
          ...rowBuilder,
          createRows: (...args) => {
            if (throws) {
              throws = false;
              throw new Error("createRows threw.");
            }
            return rowBuilder.createRows(...args);
          },
        });
        const database = binding.openMemory();
        // 1,025 longer ASCII texts, the 1,025th of which the binding passes
        // to takeTexts.
        const texts = (prefix) =>
          "with r(n) as (select 1 union all select n + 1 from r where n < 1025) select '" +
          prefix +
          " text ' || n as t from r";
        let thrown = null;
        try {
          database.run(texts("failed"), []);
        } catch (error) {
          thrown = error.message;
        }
        const rows = database.run(texts("second"), []);
        database.close();
        parentPort.postMessage([thrown, rows[1024].t]);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [results] = (await once(worker, "message")) as [unknown];

  assertEqual(results, ["createRows threw.", "second text 1025"]);
});

test("the slots of collected statements serve the next statements, each in its next generation", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      const { setFlagsFromString } = require("node:v8");
      const { runInNewContext } = require("node:vm");
      const { setImmediate: nextMacrotask } = require("node:timers/promises");
      setFlagsFromString("--expose-gc");
      const collect = runInNewContext("gc");
      (async () => {
        const { loadAddon } = await import(workerData.addonModule);
        const binding = loadAddon(workerData.addonPath).createBinding();
        const database = binding.openMemory();
        const ids = [];
        let collected = 0;
        const registry = new FinalizationRegistry(() => {
          collected++;
        });
        const prepare = () => {
          const statement = database.prepare("select 1 as a");
          const [key] = Object.getOwnPropertySymbols(statement);
          ids.push(statement[key]);
          return statement;
        };
        // In a frame of its own, which no suspended frame keeps them in.
        (() => {
          registry.register(prepare(), undefined);
          registry.register(prepare(), undefined);
        })();
        for (let attempt = 0; attempt < 10 && collected < 2; attempt++) {
          await nextMacrotask();
          collect();
        }
        // Node-API runs a handle's finalizer after the collection.
        await nextMacrotask();
        const next = [prepare(), prepare()];
        for (const statement of next) statement.finalize();
        database.close();
        parentPort.postMessage(
          ids.map((id) => [Math.floor(id / 2 ** 32), id % 2 ** 32]),
        );
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [results] = (await once(worker, "message")) as [
    Array<[number, number]>,
  ];

  // [generation, slot]: the database has slot 0, and the free slots serve in
  // either order, as the collections freed them.
  assertEqual(
    [results.slice(0, 2), results.slice(2).toSorted((a, b) => a[1] - b[1])],
    [
      [
        [0, 1],
        [0, 2],
      ],
      [
        [1, 1],
        [1, 2],
      ],
    ],
  );
});

test("a handle's slot retires at its last generation, so a later handle gets another slot, never an id a collected one had", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      const { setFlagsFromString } = require("node:v8");
      const { runInNewContext } = require("node:vm");
      const { setImmediate: nextMacrotask } = require("node:timers/promises");
      setFlagsFromString("--expose-gc");
      const collect = runInNewContext("gc");
      (async () => {
        const { loadAddon } = await import(workerData.addonModule);
        const binding = loadAddon(workerData.addonPath).createBinding();
        const database = binding.openMemory();
        const kept = database.prepare("select 1 as a");
        const { run } = kept;
        const ids = [];
        let key;
        // The test addon's last generation is 3, so the slot of the first
        // statement serves four, one after another.
        for (let i = 0; i < 5; i++) {
          let isCollected = false;
          const registry = new FinalizationRegistry(() => {
            isCollected = true;
          });
          // In a frame of its own, which no suspended frame keeps it in.
          (() => {
            const statement = database.prepare("select 1 as a");
            [key] = Object.getOwnPropertySymbols(statement);
            ids.push(statement[key]);
            registry.register(statement, undefined);
          })();
          for (let attempt = 0; attempt < 10 && !isCollected; attempt++) {
            await nextMacrotask();
            collect();
          }
          // Node-API runs a handle's finalizer after the collection.
          await nextMacrotask();
        }
        // Every id, the retired slot's last one too, names no statement.
        const refused = ids.map((id) => {
          try {
            run.call({ [key]: id }, []);
            return "ran";
          } catch (error) {
            return error.message;
          }
        });
        kept.finalize();
        database.close();
        parentPort.postMessage([
          ids.map((id) => [Math.floor(id / 2 ** 32), id % 2 ** 32]),
          refused,
        ]);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [results] = (await once(worker, "message")) as [unknown];

  // [generation, slot]: the database has slot 0, and the statement whose run
  // the test calls slot 1.
  assertEqual(results, [
    [
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
      [0, 3],
    ],
    Array.from({ length: 5 }, () => "Expected a statement."),
  ]);
});

test("a copy of the addon at another path refuses the other's handles as this, since their type tags differ", () => {
  const copyPath = join(directory, "copy.node");
  copyFileSync(addonPath, copyPath);
  const copy = loadAddon(copyPath).createBinding() as NativeSqlite;
  const database = binding.openMemory();
  const copied = copy.openMemory();
  const statement = database.prepare("select 1 as a");
  const copiedStatement = copied.prepare("select 2 as a");
  const notDatabase = {
    kind: "TypeError",
    message: "Expected a database.",
    cause: undefined,
  };
  const notStatement = {
    kind: "TypeError",
    message: "Expected a statement.",
    cause: undefined,
  };

  assertEqual(
    [
      thrownBy(() => database.close.call(copied)),
      thrownBy(() => copied.close.call(database)),
      thrownBy(() => statement.reset.call(copiedStatement)),
      thrownBy(() => copiedStatement.reset.call(statement)),
    ],
    [notDatabase, notDatabase, notStatement, notStatement],
  );
  assertEqual(
    [statement.run([]), copiedStatement.run([])],
    [[{ a: 1 }], [{ a: 2 }]],
  );
  statement.finalize();
  copiedStatement.finalize();
  database.close();
  copied.close();
});

test("a run refuses the id of the slot after the last one in a full table of handles", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { loadAddon } = await import(workerData.addonModule);
        const binding = loadAddon(workerData.addonPath).createBinding();
        // The database's slot and 63 statements' fill the first 64 slots.
        const database = binding.openMemory();
        const statements = Array.from({ length: 63 }, () =>
          database.prepare("select 1 as a"),
        );
        const last = statements[62];
        const [key] = Object.getOwnPropertySymbols(last);
        let thrown = null;
        try {
          last.run.call({ [key]: last[key] + 1 }, []);
        } catch (error) {
          thrown = error.message;
        }
        parentPort.postMessage([last[key], thrown]);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [results] = (await once(worker, "message")) as [unknown];

  assertEqual(results, [63, "Expected a statement."]);
});

test("createBinding throws when the row builder's connect calls createBinding, keeping the environment the inner call installed", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(
          workerData.addonModule
        );
        const { createBinding } = require(workerData.addonPath);
        let inner = null;
        let thrown = null;
        try {
          createBinding({
            ...createNativeSqliteRowBuilder(),
            connect: () => {
              inner = createBinding(createNativeSqliteRowBuilder());
            },
          });
        } catch (error) {
          thrown = error.message;
        }
        const later = createBinding(createNativeSqliteRowBuilder());
        const results = [inner, later].map((binding) => {
          const database = binding.openMemory();
          const rows = database.run("select 1 as a", []);
          database.close();
          return rows;
        });
        parentPort.postMessage([thrown, results]);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [results] = (await once(worker, "message")) as [unknown];

  assertEqual(results, [
    "createBinding was called while the row builder connected.",
    [[{ a: 1 }], [{ a: 1 }]],
  ]);
});

test("createBinding throws what the row builder's connect throws and leaves the environment to the next createBinding, whose binding works", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(
          workerData.addonModule
        );
        const { createBinding } = require(workerData.addonPath);
        let thrown = null;
        try {
          createBinding({
            ...createNativeSqliteRowBuilder(),
            connect: () => {
              throw new Error("The connect threw.");
            },
          });
        } catch (error) {
          thrown = error.message;
        }
        const database = createBinding(createNativeSqliteRowBuilder()).openMemory();
        const rows = database.run("select 1 as a", []);
        database.close();
        parentPort.postMessage([thrown, rows]);
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );

  const [results] = (await once(worker, "message")) as [unknown];

  assertEqual(results, ["The connect threw.", [{ a: 1 }]]);
});

test("openFile writes a plain SQLite file, which another SQLite reads and writes and openFile then reads", () => {
  const path = join(directory, "other-sqlite.db");
  const database = binding.openFile(path);
  const insert = database.prepare("create table t (a)");
  insert.run([]);
  insert.finalize();
  database.close();

  const other = new DatabaseSync(path);
  other.exec("insert into t values ('other')");
  other.close();

  const reopened = binding.openFile(path);
  try {
    const select = reopened.prepare("select a from t");
    assertEqual(select.run([]), [{ a: "other" }]);
    select.finalize();
  } finally {
    reopened.close();
  }
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

    assertEqual(run("select write_log() as a"), [{ a: null }]);
    assertEqual(run("insert into t values (write_log())"), 1);
    assertEqual(run("select count(*) as n from log"), [{ n: 4 }]);
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
    assertEqual(between.run([]), [{ a: 1 }]);
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
      (async () => {
        const { loadAddon } = await import(workerData.addonModule);
        const binding = loadAddon(workerData.addonPath).createBinding();
        const database = binding.openFile(workerData.path);
        binding.openFile(workerData.path + "-other");
        database.prepare("create table t (a)");
        // Listening keeps the worker running until it's terminated.
        parentPort.on("message", () => {});
        parentPort.postMessage("opened");
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule, path } },
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
