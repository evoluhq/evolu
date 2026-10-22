/**
 * React Native's SQLite driver on the N-API mirror of the binding, with real
 * files: the shared iterate contract, cached statements, export, delete, memory
 * and encrypted databases, wrong keys, and the waits for a file another
 * connection holds, on a test Run's time.
 */
import {
  assert,
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertSame,
  assertThrows,
  assertTrue,
  bytesToHex,
  EncryptionKey,
  err,
  Millis,
  Name,
  ok,
  sql,
  testCreateRun,
  type SqliteDriverOptions,
} from "@evolu/common";
import {
  defaultBuildDirectory,
  defaultCacheDirectory,
} from "@evolu/sqlite-core/scripts/paths.mts";
import { setupAddon } from "@evolu/sqlite-core/test/setup-addon.mts";
import {
  buildSqlcipherFixture,
  expoSqliteReleases,
  runSqlcipherFixture,
} from "@evolu/sqlite-core/test/sqlcipher.mts";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test, type TestContext } from "node:test";
import { describeSqliteDriverIterate } from "../../../../test/integration/nodejs/Sqlite/_iterate.ts";
import type {
  NativeSqlite,
  NativeSqliteDatabase,
} from "../../src/sqlite/Binding.ts";
import { createNativeSqliteDriver } from "../../src/sqlite/Driver.ts";
import { createWaitForDatabaseRelease } from "../../src/sqlite/WaitForDatabaseRelease.ts";

const binding = (await setupAddon()).createBinding() as NativeSqlite;

const testName = Name.orThrow("Test");

const testKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index * 5 + 3),
);
const encrypted = { mode: "encrypted", encryptionKey: testKey } as const;

/** A new directory for a test's databases, removed after it. */
const setupDirectory = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-react-native-driver-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
};

/**
 * The driver and the wait over the databases in `directory`, through
 * `nativeSqlite`, and a test Run whose time the test advances.
 */
const setupDriver = (directory: string, nativeSqlite = binding) => {
  const run = testCreateRun();
  const deps = { nativeSqlite, databaseDirectory: directory };
  const createSqliteDriver = createNativeSqliteDriver(deps);
  return {
    run,
    path: join(directory, `evolu1-${testName}.db`),
    open: (options?: SqliteDriverOptions) =>
      run.ok(createSqliteDriver(testName, options)),
    openAbortable: (options?: SqliteDriverOptions) =>
      run.abortable(createSqliteDriver(testName, options)),
    waitForRelease: () => run(createWaitForDatabaseRelease(deps)(testName)),
  };
};

/** The error a driver's open threw, which panicked its Run. */
const openError = async (
  setup: ReturnType<typeof setupDriver>,
  options?: SqliteDriverOptions,
): Promise<Error> => {
  const opened = await setup.openAbortable(options);
  assert(!opened.ok, "Expected the open to fail.");
  assert(opened.error.reason.type === "PanicAbortReason", "Expected a panic.");
  const { defect } = opened.error.reason;
  assertInstanceOf(defect, Error);
  return defect;
};

// Lets resolved promises settle before test time advances.
const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const memoryDirectory = mkdtempSync(
  join(tmpdir(), "evolu-react-native-memory-"),
);
after(() => {
  rmSync(memoryDirectory, { recursive: true, force: true });
});

describeSqliteDriverIterate(() =>
  setupDriver(memoryDirectory).open({ mode: "memory" }),
);

test("a plain database is evolu1-<name>.db in the directory and reopens", async (t) => {
  const setup = setupDriver(setupDirectory(t));
  await using _run = setup.run;
  {
    using driver = await setup.open();
    driver.exec(sql`create table t (data text);`);
    driver.exec(sql`insert into t (data) values (${"plain"});`);
  }

  assertEqual(
    bytesToHex(readFileSync(setup.path).subarray(0, 6)),
    "53514c697465",
  );
  using driver = await setup.open();
  assertEqual(driver.exec(sql`select data from t;`).rows, [{ data: "plain" }]);
});

test("an encrypted database stores no plaintext and reopens with its key", async (t) => {
  const setup = setupDriver(setupDirectory(t));
  await using _run = setup.run;
  {
    using driver = await setup.open(encrypted);
    driver.exec(sql`create table t (data text);`);
    driver.exec(sql`insert into t (data) values (${"evolu-secret"});`);
  }

  const file = readFileSync(setup.path);
  assertFalse(file.includes("evolu-secret"));
  assertFalse(file.subarray(0, 6).equals(Buffer.from("SQLite")));
  using driver = await setup.open(encrypted);
  assertEqual(driver.exec(sql`select data from t;`).rows, [
    { data: "evolu-secret" },
  ]);
});

test("memory databases are each their own and write no file", async (t) => {
  const directory = setupDirectory(t);
  const setup = setupDriver(directory);
  await using _run = setup.run;
  using first = await setup.open({ mode: "memory" });
  using second = await setup.open({ mode: "memory" });

  first.exec(sql`create table t (a);`);

  assertEqual(second.exec(sql`select count(*) as n from sqlite_schema;`).rows, [
    { n: 0 },
  ]);
  assertFalse(existsSync(setup.path));
});

test("exec runs a query that asks to be prepared on its cached statement, and another on a statement it finalizes at once", async (t) => {
  const prepared: Array<string> = [];
  let finalized = 0;
  // The binding, with each prepare and finalize of a memory database counted.
  const countingBinding: NativeSqlite = {
    ...binding,
    openMemory: () => {
      const database = binding.openMemory();
      const counted: NativeSqliteDatabase = {
        prepare: (sqlText) => {
          prepared.push(sqlText);
          const statement = database.prepare(sqlText);
          return {
            run: (parameters) => statement.run(parameters),
            bind: (parameters) => {
              statement.bind(parameters);
            },
            step: () => statement.step(),
            reset: () => {
              statement.reset();
            },
            finalize: () => {
              finalized++;
              statement.finalize();
            },
          };
        },
        export: () => database.export(),
        close: () => {
          database.close();
        },
      };
      return counted;
    },
  };
  const setup = setupDriver(setupDirectory(t), countingBinding);
  await using _run = setup.run;
  const driver = await setup.open({ mode: "memory" });
  driver.exec(sql`create table t (a);`);
  const insert = {
    ...sql`insert into t (a) values (${1}) returning a;`,
    options: { prepare: true },
  };
  const select = sql`select count(*) as n from t;`;

  assertEqual(driver.exec(insert), { rows: [{ a: 1 }], changes: 1 });
  assertEqual(driver.exec(insert), { rows: [{ a: 1 }], changes: 1 });
  assertEqual(driver.exec(select), { rows: [{ n: 2 }], changes: 0 });
  assertEqual(driver.exec(select), { rows: [{ n: 2 }], changes: 0 });

  assertEqual(prepared.filter((text) => text === insert.sql).length, 1);
  assertEqual(prepared.filter((text) => text === select.sql).length, 2);
  assertEqual(finalized, prepared.length - 1);
  driver[Symbol.dispose]();
  assertEqual(finalized, prepared.length);
});

test("iterate rethrows what onRow throws on a row of a write with RETURNING whose commit then fails", async (t) => {
  const setup = setupDriver(setupDirectory(t));
  await using _run = setup.run;
  using driver = await setup.open({ mode: "memory" });
  driver.exec(sql`pragma foreign_keys = on;`);
  driver.exec(sql`create table p (id integer primary key);`);
  driver.exec(sql`
    create table c (pid integer references p deferrable initially deferred);
  `);
  const insert = sql`
    insert into c
    values
      (1),
      (2)
    returning pid;
  `;
  const thrown = new Error("onRow failed");

  assertThrows(
    () => {
      driver.iterate(insert, () => {
        throw thrown;
      });
    },
    (error) => {
      assertSame(error, thrown);
    },
  );
  // An early stop completes the statement, whose commit's error it throws.
  assertThrows(
    () => {
      driver.iterate(insert, () => false);
    },
    (error) => {
      assertInstanceOf(error, Error);
      assertEqual(error.message, "FOREIGN KEY constraint failed");
    },
  );
  assertEqual(driver.exec(sql`select count(*) as n from c;`).rows, [{ n: 0 }]);
});

test("export returns the plaintext database as a Uint8Array over an ArrayBuffer of its own, which opens as a plain file", async (t) => {
  const directory = setupDirectory(t);
  const setup = setupDriver(directory);
  await using _run = setup.run;
  using driver = await setup.open(encrypted);
  driver.exec(sql`create table t (data text);`);
  driver.exec(sql`insert into t (data) values (${"exported"});`);

  const bytes = driver.export();

  assertInstanceOf(bytes, Uint8Array);
  assertInstanceOf(bytes.buffer, ArrayBuffer);
  assertEqual([bytes.byteOffset, bytes.buffer.byteLength], [0, bytes.length]);
  const copy = join(directory, "export.db");
  writeFileSync(copy, bytes);
  const database = binding.openFile(copy);
  try {
    const statement = database.prepare("select data from t");
    assertEqual(statement.run([]).rows, [{ data: "exported" }]);
    statement.finalize();
  } finally {
    database.close();
  }
});

test("deleteDatabase disposes the driver, then deletes its file, which a new driver then creates empty", async (t) => {
  const setup = setupDriver(setupDirectory(t));
  await using _run = setup.run;
  const driver = await setup.open(encrypted);
  driver.exec(sql`create table t (a);`);
  writeFileSync(`${setup.path}-wal`, "");

  driver.deleteDatabase();

  assertFalse(existsSync(setup.path));
  assertFalse(existsSync(`${setup.path}-wal`));
  assertFalse(binding.isFileOpen(setup.path));
  using reopened = await setup.open(encrypted);
  assertEqual(
    reopened.exec(sql`select count(*) as n from sqlite_schema;`).rows,
    [{ n: 0 }],
  );
});

test("deleteDatabase of a memory database closes it and deletes no file", async (t) => {
  let closed = 0;
  // The binding, with each close of a memory database counted.
  const countingBinding: NativeSqlite = {
    ...binding,
    openMemory: () => {
      const database = binding.openMemory();
      const counted: NativeSqliteDatabase = {
        prepare: (sqlText) => database.prepare(sqlText),
        export: () => database.export(),
        close: () => {
          closed++;
          database.close();
        },
      };
      return counted;
    },
  };
  const setup = setupDriver(setupDirectory(t), countingBinding);
  await using _run = setup.run;
  // A file at the path a file database of the name would have.
  writeFileSync(setup.path, "");
  const driver = await setup.open({ mode: "memory" });

  driver.deleteDatabase();

  assertEqual(closed, 1);
  assertTrue(existsSync(setup.path));
});

test("a wrong key fails with NOTADB and page 1's authentication failure, and changes no byte (G10)", async (t) => {
  const directory = setupDirectory(t);
  {
    const setup = setupDriver(directory);
    await using _run = setup.run;
    using driver = await setup.open(encrypted);
    driver.exec(sql`create table t (a);`);
  }
  const setup = setupDriver(directory);
  await using _run = setup.run;
  const before = readFileSync(setup.path);

  const error = await openError(setup, {
    mode: "encrypted",
    encryptionKey: EncryptionKey.orThrow(new Uint8Array(32).fill(7)),
  });

  assertEqual(
    [error.message, error.cause],
    [
      "file is not a database",
      {
        type: "SqliteError",
        operation: "open",
        extendedCode: 26,
        message: "file is not a database",
        sqlOffset: null,
        systemErrno: null,
        cause: {
          type: "SqliteCodecFailure",
          error: { type: "SqlitePageAuthenticationError", pageNumber: 1 },
        },
      },
    ],
  );
  assertTrue(readFileSync(setup.path).equals(before));
  assertFalse(binding.isFileOpen(setup.path));
});

test(
  "a wrong key on a database crashed at any write fails with NOTADB or CORRUPT and a page's authentication failure, changes no byte of it or its journal, and the right key then restores every row",
  { timeout: 600_000 },
  async (t) => {
    const expoSqlite = expoSqliteReleases.at(-1);
    assert(expoSqlite != null, "Expected an expo-sqlite release.");
    const fixture = await buildSqlcipherFixture({
      expoSqlite,
      cacheDirectory: defaultCacheDirectory(process.env),
      buildDirectory: defaultBuildDirectory(process.env),
    });
    const directory = setupDirectory(t);
    const hexKey = bytesToHex(testKey);
    const rows = 30;
    const base = join(directory, "base.db");
    const work = join(directory, "work.db");
    assertEqual(
      runSqlcipherFixture(fixture, ["create", base, hexKey, String(rows)])
        .status,
      0,
    );
    const wrongKey = EncryptionKey.orThrow(new Uint8Array(32).fill(9));
    let crashes = 0;

    for (let write = 1; ; write++) {
      const setup = setupDriver(directory);
      await using _run = setup.run;
      copyFileSync(base, work);
      rmSync(`${work}-journal`, { force: true });
      rmSync(`${setup.path}-journal`, { force: true });
      const crashed = runSqlcipherFixture(fixture, [
        "crash",
        work,
        hexKey,
        String(write),
        setup.path,
      ]);
      if (crashed.status === 0) break;
      assertEqual(crashed.status, 3);
      const journal = `${setup.path}-journal`;
      if (!existsSync(journal) || readFileSync(journal)[0] !== 0xd9) continue;
      const database = readFileSync(setup.path);
      const journalBytes = readFileSync(journal);

      const error = await openError(setup, {
        mode: "encrypted",
        encryptionKey: wrongKey,
      });

      const cause = error.cause as {
        readonly extendedCode: number;
        readonly cause: unknown;
      };
      assertTrue(cause.extendedCode === 26 || cause.extendedCode === 11);
      assertEqual(
        (cause.cause as { readonly error: { readonly type: string } }).error
          .type,
        "SqlitePageAuthenticationError",
      );
      assertTrue(readFileSync(setup.path).equals(database));
      assertTrue(readFileSync(journal).equals(journalBytes));
      const restored = setupDriver(directory);
      await using _restoredRun = restored.run;
      using driver = await restored.open(encrypted);
      assertEqual(
        driver.exec(sql`
          select count(*) as n from t where v like 'evolu-secret-row%';
        `).rows,
        [{ n: rows }],
      );
      crashes++;
    }
    assert(crashes > 10, `Only ${crashes} hot journals.`);
  },
);

test("an open of a file another connection holds tries again and succeeds once that connection closes", async (t) => {
  const setup = setupDriver(setupDirectory(t));
  await using _run = setup.run;
  const holder = binding.openEncryptedFile(setup.path, testKey);

  const opened = setup.open(encrypted);
  let isOpened = false;
  void opened.then(() => {
    isOpened = true;
  });
  // Attempts at 0, 50 and 150 ms find it held, and the next comes at 350 ms.
  for (let elapsed = 0; elapsed < 300; elapsed += 10) {
    await flushMicrotasks();
    setup.run.deps.time.advance(Millis.orThrow(10));
  }
  await flushMicrotasks();
  assertFalse(isOpened);
  holder.close();
  for (let elapsed = 300; elapsed < 340; elapsed += 10) {
    await flushMicrotasks();
    setup.run.deps.time.advance(Millis.orThrow(10));
  }
  await flushMicrotasks();
  assertFalse(isOpened);
  setup.run.deps.time.advance(Millis.orThrow(10));
  await flushMicrotasks();

  assertTrue(isOpened);
  using driver = await opened;
  driver.exec(sql`create table t (a);`);
});

test("an open of a file another connection still holds 10 seconds after the first attempt throws DatabaseFileHeldError", async (t) => {
  const setup = setupDriver(setupDirectory(t));
  await using _run = setup.run;
  const holder = binding.openFile(setup.path);
  t.after(() => {
    holder.close();
  });

  const opened = openError(setup);
  let isSettled = false;
  void opened.then(() => {
    isSettled = true;
  });
  // Each 100 ms step fires at most one delay, so the attempts come at 0, 100,
  // 200, 400, 800 and 1600 ms, then every second, and the one at 10600 ms, the
  // first 10 seconds after the first attempt, throws.
  for (let elapsed = 0; elapsed < 10_500; elapsed += 100) {
    await flushMicrotasks();
    setup.run.deps.time.advance(Millis.orThrow(100));
  }
  await flushMicrotasks();
  assertFalse(isSettled);
  setup.run.deps.time.advance(Millis.orThrow(100));
  await flushMicrotasks();

  assertTrue(isSettled);
  const error = await opened;
  assertEqual(
    [error.message, error.cause],
    [
      "Another connection of this process has the database open.",
      { type: "DatabaseFileHeldError" },
    ],
  );
});

test("the wait fails with DatabaseHeldError when another connection still holds the file after 10 seconds", async (t) => {
  const setup = setupDriver(setupDirectory(t));
  await using _run = setup.run;
  const holder = binding.openFile(setup.path);
  t.after(() => {
    holder.close();
  });

  const released = setup.waitForRelease();
  let isSettled = false;
  void released.then(() => {
    isSettled = true;
  });
  // Each second of test time ends one retry delay, so the attempts are a
  // second apart, and the one at 10 seconds is the last.
  for (let second = 1; second <= 10; second += 1) {
    await flushMicrotasks();
    assertFalse(isSettled);
    setup.run.deps.time.advance(Millis.orThrow(1000));
  }
  await flushMicrotasks();
  assertTrue(isSettled);

  assertEqual(
    await released,
    err({ type: "DatabaseHeldError", name: testName }),
  );
});

test("the wait ends once the other connection closes, and the database opens", async (t) => {
  const setup = setupDriver(setupDirectory(t));
  await using _run = setup.run;
  const holder = binding.openFile(setup.path);

  const released = setup.waitForRelease();
  let isReleased = false;
  void released.then(() => {
    isReleased = true;
  });
  for (let second = 1; second <= 5; second += 1) {
    await flushMicrotasks();
    setup.run.deps.time.advance(Millis.orThrow(1000));
  }
  await flushMicrotasks();
  assertFalse(isReleased);
  holder.close();
  setup.run.deps.time.advance(Millis.orThrow(1000));

  assertEqual(await released, ok());
  using _driver = await setup.open();
});

test("the wait finds the database of a directory that doesn't exist yet free at once", async (t) => {
  const setup = setupDriver(join(setupDirectory(t), "SQLite"));
  await using _run = setup.run;

  assertEqual(await setup.waitForRelease(), ok());
});
