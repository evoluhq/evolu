/**
 * The N-API mirror of `@evolu/sqlite-core`, node/binding.c, when a call fails
 * that no other test can make fail: through the test addon's hooks of
 * node/test_hooks.h, each call of its own allocations and of the Node-API and
 * SQLite calls whose failure it checks fails in turn, from the first, until a
 * run makes no call fail. Every failure throws a JavaScript error, leaves the
 * database usable and leaks nothing, neither memory nor a statement, which the
 * hooks count, and the run after the last failure returns what a run without
 * one does. The core's hooks make its random source and the build check fail.
 */
import {
  assertEqual,
  assertInstanceOf,
  type NativeSqlite,
  type NativeSqliteDatabase,
  type NativeSqliteStatement,
  type SqliteValue,
} from "@evolu/common";
import {
  createNativeSqliteRowBuilder,
  loadAddon,
  setupAddonPath,
} from "@evolu/sqlite-core/test/setup-addon.mts";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { setImmediate as nextMacrotask } from "node:timers/promises";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { Worker } from "node:worker_threads";

// V8 exposes gc to contexts created after this flag is set.
setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;

const addonPath = await setupAddonPath();
// The module that loads the addon, for a worker, which loads it itself.
const addonModule = import.meta
  .resolve("@evolu/sqlite-core/test/setup-addon.mts");
const addon = loadAddon(addonPath);
const binding = addon.createBinding() as NativeSqlite;
const directory = mkdtempSync(join(tmpdir(), "evolu-react-native-faults-"));

after(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** What a run did: what it returned, or the class and message it threw. */
type Outcome = { readonly returned: unknown } | { readonly threw: string };

const outcomeOf = (act: () => unknown): Outcome => {
  try {
    return { returned: act() };
  } catch (error) {
    assertInstanceOf(error, Error);
    return { threw: `${error.name}: ${error.message}` };
  }
};

/**
 * The statements databases prepared since {@link failEachCall} last cleared it,
 * which the prepare of their class's prototype, wrapped here, records.
 */
const prepared: Array<NativeSqliteStatement> = [];
const anyDatabase = binding.openMemory();
const databasePrototype = Object.getPrototypeOf(
  anyDatabase,
) as NativeSqliteDatabase;
anyDatabase.close();
const { prepare } = databasePrototype;
Object.defineProperty(databasePrototype, "prepare", {
  value(this: NativeSqliteDatabase, sql: string) {
    const statement = prepare.call(this, sql);
    prepared.push(statement);
    return statement;
  },
});

/**
 * Runs `act` with what `setup` returns, failing each call it makes in turn,
 * from the first, until a run makes no call fail, and `teardown` after each
 * run, counting only the allocations with `onlyAllocations`. Returns what the
 * runs with a failure did, a throw as its class and message and a return as
 * "returned", the runs that leaked a statement, and what the last run did.
 *
 * Before `teardown`, it finalizes the statements the run prepared, also one
 * whose finalize failed before it finalized, so a statement node/binding.c
 * prepared and didn't finalize is one no handle holds, which only the close of
 * its database would finalize.
 */
const failEachCall = <T>({
  setup,
  act,
  teardown,
  onlyAllocations = false,
}: {
  setup: () => T;
  act: (state: T) => unknown;
  teardown: (state: T) => void;
  onlyAllocations?: boolean;
}): {
  readonly failures: ReadonlySet<string>;
  readonly leaks: ReadonlyArray<number>;
  readonly last: Outcome;
} => {
  const failures = new Set<string>();
  const leaks: Array<number> = [];
  for (let index = 0; ; index++) {
    prepared.length = 0;
    const { statements } = addon.heldMemory();
    const state = setup();
    addon.failCall(index, onlyAllocations);
    const outcome = outcomeOf(() => act(state));
    const isFailed = addon.callsLeft() === -1;
    addon.failCall(-1);
    for (const statement of prepared.splice(0)) {
      const finalized = outcomeOf(() => {
        statement.finalize();
      });
      // Unless the run finalized it.
      if ("threw" in finalized)
        assertEqual(finalized.threw, "Error: The statement is finalized.");
    }
    const isLeaked = addon.heldMemory().statements !== statements;
    teardown(state);
    if (isLeaked) leaks.push(index);
    if (!isFailed) return { failures, leaks, last: outcome };
    failures.add("threw" in outcome ? outcome.threw : "returned");
  }
};

/**
 * Like {@link failEachCall}, on a memory database that `setup` sets up for each
 * run, which still answers a query after it, and is closed.
 */
const failEachCallOn = <T>(
  setup: (database: NativeSqliteDatabase) => T,
  act: (database: NativeSqliteDatabase, state: T) => unknown,
  onlyAllocations = false,
) =>
  failEachCall({
    onlyAllocations,
    setup: () => {
      const database = binding.openMemory();
      return { database, state: setup(database) };
    },
    act: ({ database, state }) => act(database, state),
    teardown: ({ database }) => {
      assertEqual(database.run("select 1 as a", []), [{ a: 1 }]);
      database.close();
    },
  });

const settle = async () => {
  for (let attempt = 0; attempt < 5; attempt++) {
    await nextMacrotask();
    gc();
  }
  // Node-API runs finalizers from the loop.
  await nextMacrotask();
};

/**
 * Runs the sweeps twice, the first time so what an environment keeps for later
 * calls is there, and checks that the second left node/binding.c and SQLite
 * holding no more memory than before it, once the collector freed what the
 * handles held.
 */
const assertNoLeak = async (sweeps: () => void) => {
  sweeps();
  await settle();
  const before = addon.heldMemory();
  sweeps();
  await settle();
  assertEqual(addon.heldMemory(), before);
};

const parameters = (...values: Array<SqliteValue | number>) =>
  values as ReadonlyArray<SqliteValue>;

/**
 * Checks that every run with a failure threw what a failed allocation or
 * Node-API call throws, whose failure leaves no error info of its own, or one
 * of `others`, that no run leaked a statement, and that the last run did what
 * `expected` says.
 */
const assertFailures = (
  { failures, leaks, last }: ReturnType<typeof failEachCall>,
  expected: Outcome,
  others: ReadonlyArray<string> = [],
) => {
  const allowed = new Set([
    "Error: out of memory",
    "Error: Node-API call failed",
    ...others,
  ]);
  assertEqual(
    {
      unexpected: [...failures].filter((failure) => !allowed.has(failure)),
      leaks,
      last,
    },
    { unexpected: [], leaks: [], last: expected },
  );
};

// A database's run that fails to read whether its SQL is well-formed checks
// the SQL itself, and returns.
const checksSql = "returned";

const key = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const otherKey = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
const nonce = Uint8Array.from({ length: 24 }, (_, i) => i);

test("opening a database throws whichever call fails, and leaks nothing", async () => {
  const path = join(directory, "open.db");
  const encryptedPath = join(directory, "open-encrypted.db");
  const opened: Array<NativeSqliteDatabase> = [];
  const openWith = (open: () => NativeSqliteDatabase) =>
    failEachCall({
      setup: () => undefined,
      act: () => {
        const database = open();
        opened.push(database);
        const statement = database.prepare("select 1 as a");
        try {
          return statement.run([]);
        } finally {
          statement.finalize();
        }
      },
      teardown: () => {
        for (const database of opened.splice(0)) database.close();
      },
    });
  const notADatabase = "Error: file is not a database";
  const encrypted = binding.openEncryptedFile(encryptedPath, key);
  encrypted.run("create table t (a)", []);
  encrypted.close();

  await assertNoLeak(() => {
    for (const open of [
      () => binding.openMemory(),
      () => binding.openFile(path),
      () => binding.openEncryptedFile(encryptedPath, key),
    ])
      assertFailures(openWith(open), { returned: [{ a: 1 }] });
    assertFailures(
      openWith(() => binding.openEncryptedFile(encryptedPath, otherKey)),
      { threw: notADatabase },
      [notADatabase],
    );
    // A TypeError, and SQLite's error with an errno.
    const notAbsolute = "TypeError: The path isn't absolute.";
    assertFailures(
      openWith(() => binding.openFile("relative.db")),
      { threw: notAbsolute },
      [notAbsolute],
    );
    const cantOpen = "Error: unable to open database file";
    assertFailures(
      openWith(() => binding.openFile(`${path}/x.db`)),
      { threw: cantOpen },
      [cantOpen],
    );
  });
});

test("the binding's other functions throw whichever call fails, and leak nothing", async () => {
  const path = join(directory, "functions.db");
  binding.openFile(path).close();
  const plaintext = new Uint8Array([1, 2, 3]);
  const ciphertext = binding.encryptXChaCha20Poly1305(key, nonce, plaintext);
  const forged = ciphertext.slice();
  forged[0] ^= 1;
  const sweep = (act: () => unknown) =>
    failEachCall({ setup: () => undefined, act, teardown: () => undefined });
  const notAuthentic = "Error: The ciphertext doesn't authenticate.";

  await assertNoLeak(() => {
    assertFailures(
      sweep(() => binding.isFileOpen(path)),
      { returned: false },
    );
    assertFailures(
      sweep(() => {
        binding.deleteFile(join(directory, "missing.db"));
      }),
      { returned: undefined },
    );
    assertFailures(
      sweep(() => {
        binding.fillRandom(new Uint8Array(16));
      }),
      { returned: undefined },
    );
    assertFailures(
      sweep(() => binding.encryptXChaCha20Poly1305(key, nonce, plaintext)),
      { returned: ciphertext },
    );
    assertFailures(
      sweep(() => binding.decryptXChaCha20Poly1305(key, nonce, ciphertext)),
      { returned: plaintext },
    );
    assertFailures(
      sweep(() => binding.decryptXChaCha20Poly1305(key, nonce, forged)),
      { threw: notAuthentic },
      [notAuthentic],
    );
  });
});

test("prepare throws whichever call fails, also while it creates SQLite's error or its own, and leaks nothing", async () => {
  const prepareRun = (sql: string) =>
    failEachCallOn(
      () => undefined,
      (database) => {
        const statement = database.prepare(sql);
        try {
          return statement.run([]);
        } finally {
          statement.finalize();
        }
      },
    );

  await assertNoLeak(() => {
    assertFailures(prepareRun("select 1 as a"), { returned: [{ a: 1 }] });
    for (const [sql, error] of [
      ["select from", 'Error: near "from": syntax error'],
      ["", "Error: The SQL contains no statement."],
      [
        "select 1; select 2",
        "Error: The SQL contains more than one statement.",
      ],
      ["select '\0'", "Error: The SQL contains a NUL character."],
      ["select '\uD800'", "Error: The SQL contains a lone surrogate."],
    ])
      assertFailures(prepareRun(sql), { threw: error }, [error]);
  });
});

test("a statement's run, bind, step, reset and finalize throw whichever call fails, and leave the database usable and leak nothing", async () => {
  const statementRun = (
    sql: string,
    act: (statement: NativeSqliteStatement) => unknown,
  ) =>
    failEachCallOn(
      (database) => {
        // Rows of every kind of value, after the first values a call passes
        // as arguments too, with texts and blobs of their own.
        database.run("create table t (a, b, c, d, e, f, g, h)", []);
        database.run(
          `insert into t
            with recursive n (i) as (select 1 union all select i + 1 from n where i < 200)
            select i, 'short', 'non-ascii ${"é".repeat(40)}',
              'ascii ${"x".repeat(20)}', x'0102', randomblob(100), null, 0.5
            from n`,
          [],
        );
        return database.prepare(sql);
      },
      (_database, statement) => act(statement),
    );
  const firstRow = {
    a: 1,
    b: "short",
    c: `non-ascii ${"é".repeat(40)}`,
    d: `ascii ${"x".repeat(20)}`,
    e: new Uint8Array([1, 2]),
  };

  await assertNoLeak(() => {
    // A few numbers, a few values with a text, more with texts and blobs, and
    // no row.
    for (const [sql, rows] of [
      ["select 1 as a, null as b", [{ a: 1, b: null }]],
      ["select 'x' as a, 2 as b", [{ a: "x", b: 2 }]],
      [
        "select 'x' as a, x'01' as b, null as c, 0.5 as d",
        [{ a: "x", b: new Uint8Array([1]), c: null, d: 0.5 }],
      ],
      ["select 1 as a where 0", 0],
    ] as const)
      assertFailures(
        statementRun(sql, (statement) => statement.run([])),
        { returned: rows },
      );
    assertFailures(
      statementRun("insert into t (a) values (?)", (statement) =>
        statement.run(parameters(1)),
      ),
      { returned: 1 },
    );
    assertFailures(
      statementRun("select a, b, c, d, e from t", (statement) => {
        const rows = statement.run([]) as ReadonlyArray<unknown>;
        return [rows.length, rows[0]];
      }),
      { returned: [200, firstRow] },
    );
    // More parameters than Node-API reads into memory of its own.
    const sum = Array.from({ length: 17 }, (_, i) => `?${i + 1}`).join(" + ");
    assertFailures(
      statementRun(`select ${sum} as n`, (statement) =>
        statement.run(parameters(...Array.from({ length: 17 }, () => 1))),
      ),
      { returned: [{ n: 17 }] },
    );
    assertFailures(
      statementRun("select ? as a", (statement) => {
        statement.bind(parameters("x"));
        return [statement.step(), statement.step()];
      }),
      { returned: [{ a: "x" }, null] },
    );
    assertFailures(
      statementRun("select a, b, c, d, e from t", (statement) => {
        const row = statement.step();
        statement.reset();
        return row;
      }),
      { returned: firstRow },
    );
    assertFailures(
      statementRun("select 1", (statement) => {
        statement.finalize();
      }),
      { returned: undefined },
    );
  });
});

test("a call of more values than it passes as arguments throws whichever call fails while it collects and passes the others, and leaks nothing", async () => {
  // A few values of each kind after the first 1,024, which are numbers.
  const later = [
    ["'short'", "short"],
    [`'non-ascii ${"é".repeat(40)}'`, `non-ascii ${"é".repeat(40)}`],
    [`'ascii ${"x".repeat(20)}'`, `ascii ${"x".repeat(20)}`],
    ["cast(x'c3' as text)", "�"],
    ["x'0102'", new Uint8Array([1, 2])],
    ["zeroblob(100)", new Uint8Array(100)],
    ["null", null],
  ] as const;
  const setup = (database: NativeSqliteDatabase) => {
    database.run("create table t (a)", []);
    database.run(
      `insert into t
        with recursive n (i) as (select 1 union all select i + 1 from n where i < 1024)
        select i from n`,
      [],
    );
    for (const [sql] of later) database.run(`insert into t select ${sql}`, []);
    return database.prepare("select a from t");
  };
  const rows = later.map(([, value]) => ({ a: value }));

  await assertNoLeak(() => {
    assertFailures(
      failEachCallOn(setup, (_database, statement) =>
        (statement.run([]) as ReadonlyArray<unknown>).slice(1024),
      ),
      { returned: rows },
    );
    assertFailures(
      failEachCallOn(setup, (database) =>
        (database.run("select a from t", []) as ReadonlyArray<unknown>).slice(
          1024,
        ),
      ),
      { returned: rows },
      [checksSql],
    );
  });
});

test("a call of more values than it passes as arguments throws whichever allocation fails while it collects the others into arrays the environment kept none of, of each kind of value", async () => {
  const kinds = [
    ["'short'", "short"],
    [`'non-ascii ${"é".repeat(40)}'`, `non-ascii ${"é".repeat(40)}`],
    [`'ascii ${"x".repeat(20)}'`, `ascii ${"x".repeat(20)}`],
    ["x'0102'", new Uint8Array([1, 2])],
    ["zeroblob(100)", new Uint8Array(100)],
  ] as const;

  await assertNoLeak(() => {
    for (const [sql, value] of kinds)
      assertFailures(
        failEachCallOn(
          (database) => {
            // Rows whose values after the first 1,024 pass every limit of the
            // arrays an environment keeps, so a run of them leaves it none.
            database.run("create table cold (a, b, c)", []);
            database.run(
              `insert into cold
                with recursive n (i) as (select 1 union all select i + 1 from n where i < 23000)
                select 'twelve chars', x'000102030405060708090a0b', 'more than twelve chars'
                from n`,
              [],
            );
            database.run("create table t (a)", []);
            database.run(
              `insert into t
                with recursive n (i) as (select 1 union all select i + 1 from n where i < 1024)
                select i from n`,
              [],
            );
            database.run(`insert into t select ${sql}`, []);
            const statement = database.prepare("select a from t");
            database.run("select * from cold", []);
            return statement;
          },
          (_database, statement) =>
            (statement.run([]) as ReadonlyArray<unknown>).slice(1024),
          true,
        ),
        { returned: [{ a: value }] },
      );
  });
});

test("a statement's run throws whichever call fails while it reads the keys of its column names again, binds a blob, or settles the statement after a setter ran another, and a step or database run while it creates keys, and they leak nothing", async () => {
  // Fills the environment's lists of column names with others.
  const evict = (database: NativeSqliteDatabase) => {
    for (let i = 0; i < 8; i++) database.run(`select 1 as e${i}`, []);
  };

  await assertNoLeak(() => {
    assertFailures(
      failEachCallOn(
        (database) => {
          const statement = database.prepare("select 1 as a");
          statement.run([]);
          return statement;
        },
        (_database, statement) => statement.run([]),
      ),
      { returned: [{ a: 1 }] },
    );
    assertFailures(
      failEachCallOn(
        (database) => database.prepare("select ? as a"),
        (_database, statement) =>
          statement.run(parameters(new Uint8Array([1]))),
      ),
      { returned: [{ a: new Uint8Array([1]) }] },
    );
    assertFailures(
      failEachCallOn(
        (database) => {
          evict(database);
          return database.prepare("select 1 as a");
        },
        (_database, statement) => statement.step(),
      ),
      { returned: { a: 1 } },
    );
    assertFailures(
      failEachCallOn(evict, (database) => database.run("select 1 as a", [])),
      { returned: [{ a: 1 }] },
      [checksSql],
    );
    const settled = failEachCall({
      setup: () => {
        const database = binding.openMemory();
        const other = database.prepare("select 1");
        // oxlint-disable-next-line eslint/no-extend-native -- Appending a row must run JavaScript.
        Object.defineProperty(Array.prototype, "0", {
          configurable: true,
          // oxlint-disable-next-line eslint/accessor-pairs -- Only setting runs the hook.
          set(value: unknown) {
            other.reset();
            Object.defineProperty(this, "0", {
              value,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          },
        });
        return { database, statement: database.prepare("select 1 as a") };
      },
      act: ({ statement }) => statement.run([]),
      teardown: ({ database }) => {
        delete (Array.prototype as unknown as Record<string, unknown>)[0];
        database.close();
      },
    });
    assertFailures(settled, { returned: [{ a: 1 }] });
  });
});

test("a run of more columns than it passes as arguments throws whichever allocation fails, and leaks nothing", async () => {
  const columns = Array.from({ length: 1025 }, (_, i) => `${i} as c${i}`);

  await assertNoLeak(() => {
    const run = failEachCallOn(
      (database) => database.prepare(`select ${columns.join(", ")}`),
      (_database, statement) => {
        const [row] = statement.run([]) as ReadonlyArray<
          Record<string, number>
        >;
        return [Object.keys(row).length, row.c1024];
      },
      true,
    );
    assertFailures(run, { returned: [1025, 1024] });
  });
});

test("a call of more values than it passes as arguments throws whichever call fails while it creates the buffer an environment keeps for such calls", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { loadAddon } = await import(workerData.addonModule);
        const addon = loadAddon(workerData.addonPath);
        // An environment of its own, which keeps no buffer yet.
        const database = addon.createBinding().openMemory();
        database.run("create table t (a)", []);
        database.run(
          "insert into t with recursive n (i) as " +
            "(select 1 union all select i + 1 from n where i < 1024) " +
            "select i from n union all select 'more than twelve chars'",
          [],
        );
        const failures = new Set();
        for (let index = 0; ; index++) {
          // Names no list the environment keeps has, so each run creates
          // their keys, as the first did.
          const statement = database.prepare("select a as c" + index + " from t");
          addon.failCall(index);
          let outcome;
          try {
            outcome = statement.run([]).length;
          } catch (error) {
            outcome = error.name + ": " + error.message;
          }
          const isFailed = addon.callsLeft() === -1;
          addon.failCall(-1);
          statement.finalize();
          if (!isFailed) {
            parentPort.postMessage({ failures: [...failures].sort(), last: outcome });
            break;
          }
          failures.add(outcome);
        }
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );
  const [result] = (await once(worker, "message")) as [unknown];
  await worker.terminate();

  assertEqual(result, {
    failures: ["Error: Node-API call failed", "Error: out of memory"],
    last: 1025,
  });
});

test("opening or preparing throws when the environment's handles take all their slots or can't grow, and the slots grow from the first handle and at a full table", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { loadAddon } = await import(workerData.addonModule);
        const addon = loadAddon(workerData.addonPath);
        const binding = addon.createBinding();
        const outcomeOf = (act) => {
          try {
            act();
            return "returned";
          } catch (error) {
            return error.name + ": " + error.message;
          }
        };
        // Fails each allocation of a call in turn until it makes none fail.
        const failEachAllocation = (act) => {
          const outcomes = [];
          for (let index = 0; ; index++) {
            addon.failCall(index, true);
            const outcome = outcomeOf(act);
            const isFailed = addon.callsLeft() === -1;
            addon.failCall(-1);
            outcomes.push(outcome);
            if (!isFailed) return outcomes;
          }
        };
        const opened = [];
        // The first handle grows the table to 64 slots, and the 65th to 128.
        const first = failEachAllocation(() => {
          opened.push(binding.openMemory());
        });
        const database = opened[0];
        const statements = Array.from({ length: 63 }, () =>
          database.prepare("select 1"),
        );
        const growth = failEachAllocation(() => {
          statements.push(database.prepare("select 1"));
        });
        addon.limitSlots(65);
        const full = [
          outcomeOf(() => binding.openMemory()),
          outcomeOf(() => database.prepare("select 1")),
        ];
        parentPort.postMessage({ first, growth, full, opened: opened.length });
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );
  const [result] = (await once(worker, "message")) as [unknown];
  await worker.terminate();

  const outOfMemory = "Error: out of memory";
  assertEqual(result, {
    // The database, then the slots.
    first: [outOfMemory, outOfMemory, "returned"],
    // The SQL, its check for a lone surrogate, the statement, then the slots.
    growth: [outOfMemory, outOfMemory, outOfMemory, outOfMemory, "returned"],
    full: [outOfMemory, outOfMemory],
    opened: 1,
  });
});

test("a database's run throws whichever call fails, and leaves the database usable and leaks nothing", async () => {
  const databaseRun = (sql: string, values: ReadonlyArray<SqliteValue> = []) =>
    failEachCallOn(
      () => undefined,
      (database) => database.run(sql, values),
    );

  await assertNoLeak(() => {
    for (const [sql, rows] of [
      ["select 1 as a", [{ a: 1 }]],
      ["select 'x' as a, 'y' as b", [{ a: "x", b: "y" }]],
      [`select '${"x".repeat(2000)}' as a`, [{ a: "x".repeat(2000) }]],
      ["create table t (a)", 0],
    ] as const)
      assertFailures(databaseRun(sql), { returned: rows }, [checksSql]);
    assertFailures(
      databaseRun("select ? as a", parameters(1)),
      { returned: [{ a: 1 }] },
      [checksSql],
    );
  });
});

test("export and close throw whichever call fails and leak nothing, and an export that fails after the core exported frees what it exported at once, wiped", async () => {
  // How many exports each run handed over and freed with
  // evolu_database_free_export, which wipes them, by its end.
  const handovers: Array<string> = [];

  await assertNoLeak(() => {
    handovers.length = 0;
    assertFailures(
      failEachCallOn(
        (database) => {
          database.run("create table t (a)", []);
          addon.takeWipes();
        },
        (database) => {
          try {
            return database.export().byteLength;
          } finally {
            const { exports, freedExports } = addon.takeWipes();
            handovers.push(`${exports} handed over, ${freedExports} freed`);
          }
        },
      ),
      { returned: 8192 },
    );
    // A run that fails after the core exported frees the export at once, and
    // the last run's export waits for the collector.
    assertEqual(
      { failed: new Set(handovers.slice(0, -1)), last: handovers.at(-1) },
      {
        failed: new Set(["0 handed over, 0 freed", "1 handed over, 1 freed"]),
        last: "1 handed over, 0 freed",
      },
    );
    assertFailures(
      failEachCall({
        setup: () => binding.openMemory(),
        act: (database) => {
          database.close();
        },
        teardown: (database) => {
          database.close();
        },
      }),
      { returned: undefined },
    );
  });
});

test("a run, bind or database run whose parameter's getter throws rethrows its error whichever call fails while the binding handles it", async () => {
  const threw = "Error: The getter threw.";
  const throwing = (count: number) => {
    const values = Array.from({ length: count }, () => 1);
    Object.defineProperty(values, count - 1, {
      get: () => {
        throw new Error("The getter threw.");
      },
    });
    return values as unknown as ReadonlyArray<SqliteValue>;
  };

  await assertNoLeak(() => {
    for (const count of [1, 17]) {
      const sql = `select ${Array.from({ length: count }, (_, i) => `?${i + 1}`).join(" + ")} as n`;
      for (const act of [
        (_database: NativeSqliteDatabase, statement: NativeSqliteStatement) =>
          statement.run(throwing(count)),
        (_database: NativeSqliteDatabase, statement: NativeSqliteStatement) => {
          statement.bind(throwing(count));
        },
        (database: NativeSqliteDatabase) => database.run(sql, throwing(count)),
      ])
        assertFailures(
          failEachCallOn((database) => database.prepare(sql), act),
          { threw },
          [threw, checksSql],
        );
    }
  });
});

test("createBinding throws whichever call fails, leaves the environment to the next createBinding, and a row builder it connected keeps its environment", async () => {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { createNativeSqliteRowBuilder } = await import(workerData.addonModule);
        const addon = require(workerData.addonPath);
        let connects = 0;
        const rowBuilder = createNativeSqliteRowBuilder();
        const connected = {
          ...rowBuilder,
          connect: (...args) => {
            connects++;
            return rowBuilder.connect(...args);
          },
        };
        const before = addon.heldMemory().blocks;
        // Twice: with no environment, and then with the one the first
        // createBinding installed.
        const sweeps = [0, 1].map(() => {
          const failures = new Set();
          for (let index = 0; ; index++) {
            addon.failCall(index);
            let outcome;
            try {
              outcome = typeof addon.createBinding(connected).openMemory;
            } catch (error) {
              outcome = error.name + ": " + error.message;
            }
            const isFailed = addon.callsLeft() === -1;
            addon.failCall(-1);
            if (!isFailed) return { failures: [...failures].sort(), last: outcome };
            failures.add(outcome);
          }
        });
        parentPort.postMessage({
          sweeps,
          // The environment of each run that got to connect stays, as the
          // row builder can hold its natives, and one is installed.
          kept: addon.heldMemory().blocks - before - connects,
        });
      })();
    `,
    { eval: true, workerData: { addonPath, addonModule } },
  );
  const [result] = (await once(worker, "message")) as [unknown];
  await worker.terminate();

  assertEqual(result, {
    sweeps: [
      {
        failures: ["Error: Node-API call failed", "Error: out of memory"],
        last: "function",
      },
      { failures: ["Error: Node-API call failed"], last: "function" },
    ],
    // The run whose call of connect failed got to it too.
    kept: 1,
  });
});

test("the class of a database or a statement throws whichever call fails when JavaScript calls its constructor", () => {
  const database = binding.openMemory();
  try {
    const Constructor = (
      Object.getPrototypeOf(database) as { constructor: new () => unknown }
    ).constructor;

    assertFailures(
      failEachCall({
        setup: () => undefined,
        act: () => new Constructor(),
        teardown: () => undefined,
      }),
      { threw: "TypeError: Illegal constructor." },
    );
  } finally {
    database.close();
  }
});

test("fillRandom throws when the platform's random source fails, and a write that needs it fails with SqliteRandomSourceError", () => {
  const database = binding.openEncryptedFile(join(directory, "random.db"), key);
  try {
    addon.failRandom(true);
    let cause: unknown;
    try {
      assertEqual(
        outcomeOf(() => {
          binding.fillRandom(new Uint8Array(1));
        }),
        { threw: "Error: The platform's random source failed." },
      );
      try {
        database.run("create table t (a)", []);
      } catch (error) {
        cause = (error as Error).cause;
      }
    } finally {
      addon.failRandom(false);
    }

    assertEqual((cause as { readonly cause: unknown }).cause, {
      type: "SqliteCodecFailure",
      error: { type: "SqliteRandomSourceError" },
    });
    assertEqual(database.run("create table t (a)", []), 0);
  } finally {
    database.close();
  }
});

test("createBinding throws the build check's error when SQLite was compiled without sqlite_config.h's options", () => {
  const raw = createRequire(import.meta.url)(addonPath) as {
    readonly createBinding: (rowBuilder: unknown) => unknown;
  };
  addon.failBuildCheck(true);
  try {
    assertEqual(
      outcomeOf(() => raw.createBinding(createNativeSqliteRowBuilder())),
      {
        threw:
          "Error: SQLite was compiled without the options of sqlite_config.h.",
      },
    );
  } finally {
    addon.failBuildCheck(false);
  }
});
