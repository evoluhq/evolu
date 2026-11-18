/**
 * The SQLite driver of `@evolu/web` on the pinned binary over a fake OPFS: the
 * pool directory and the file of the databases `@evolu/web` 3 created with
 * `@evolu/sqlite-wasm` 2.2.4, which open unchanged, and the wait for a pool
 * file another context holds.
 */

import {
  assert,
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertThrowsInstanceOf,
  assertTrue,
  bytesToHex,
  createQueryBuilder,
  EncryptionKey,
  err,
  evoluJsonArrayFrom,
  evoluJsonObjectFrom,
  FiniteNumber,
  id,
  Millis,
  Name,
  ok,
  sql,
  sqliteQueryStringToSqliteQuery,
  testCreateRun,
  type SqliteDriverOptions,
} from "@evolu/common";
import { parseSqliteJsonArray } from "@evolu/common/local-first";
import { test } from "node:test";
import {
  createWaitForDatabaseRelease,
  createWasmSqliteDriver,
} from "../../../../packages/web/src/Sqlite.ts";
import {
  OpfsName,
  sahPoolHeaderSize,
  type SahPoolOptions,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import {
  createQuotaExceededError,
  setupFakeOpfs,
  type FakeOpfs,
} from "../sqlite-wasm/_fakeOpfs.ts";
import { setupSahPool } from "../sqlite-wasm/_sahPool.ts";
import {
  readSqliteJsFile,
  setupSqliteJs,
  writePoolFile,
} from "../sqlite-wasm/_sqliteJs.ts";
import { setupSqliteWasm } from "../sqlite-wasm/_sqliteWasm.ts";
import { describeSqliteDriverIterate } from "./_iterate.ts";
import {
  describeSqliteDriverPrepare,
  setupSqliteAndDriver,
} from "./_prepare.ts";

const testName = Name.orThrow("Test");
// The pool directory of testName.
const testDirectory = [OpfsName.orThrow(".Test")] as const;

const testKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 1),
);

/**
 * A driver factory and the wait for its files over the fake OPFS on a fresh
 * instance, and a test Run whose time the test advances.
 */
const setupDriver = async (fake: FakeOpfs) => {
  const { sqliteWasm } = await setupSqliteWasm();
  const run = testCreateRun();
  const deps = {
    opfsRoot: fake.opfsRoot,
    sqliteWasmLoad: Promise.resolve(ok(sqliteWasm)),
    subtleCrypto: crypto.subtle,
  };
  const createSqliteDriver = createWasmSqliteDriver(deps);
  return {
    run,
    createSqliteDriver,
    open: (options?: SqliteDriverOptions) =>
      run.ok(createSqliteDriver(testName, options)),
    openAbortable: (options?: SqliteDriverOptions) =>
      run.abortable(createSqliteDriver(testName, options)),
    waitForRelease: () => run(createWaitForDatabaseRelease(deps)(testName)),
  };
};

/** Returns the paths of the files in the pool of the directory. */
const getPoolPaths = async (
  fake: FakeOpfs,
  directory: SahPoolOptions["directory"],
) => {
  const t = await setupSahPool({ directory, fake });
  using _pool = t.pool;
  return t.pool.getPaths();
};

/** Returns the size of the slot of testName's pool whose header maps the path. */
const slotSize = (fake: FakeOpfs, path: string) =>
  fake
    .listFiles(".Test/.opaque")
    .map((fileName) => {
      const bytes = fake.readFile(`.Test/.opaque/${fileName}`);
      assert(bytes != null, "Expected the slot.");
      return bytes;
    })
    .find(
      (bytes) =>
        new TextDecoder().decode(bytes.subarray(0, bytes.indexOf(0))) === path,
    )?.length;

// Lets resolved promises settle before test time advances.
const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

test("a plain database is /evolu1.db of the pool in .<name> and reopens", async () => {
  const fake = setupFakeOpfs();
  const setup = await setupDriver(fake);
  await using _run = setup.run;
  {
    using driver = await setup.open();
    driver.exec(sql`create table t (data text);`);
    driver.exec(sql`insert into t (data) values (${"plain"});`);
  }

  assertEqual(await getPoolPaths(fake, testDirectory), ["/evolu1.db"]);
  using driver = await setup.open();
  assertEqual(driver.exec(sql`select data from t;`).rows, [{ data: "plain" }]);
});

test("an encrypted database is /evolu1.db of the pool in .<name>, stores no plaintext and reopens with the key", async () => {
  const fake = setupFakeOpfs();
  const setup = await setupDriver(fake);
  await using _run = setup.run;
  const options = { mode: "encrypted", encryptionKey: testKey } as const;
  {
    using driver = await setup.open(options);
    driver.exec(sql`create table t (data text);`);
    driver.exec(sql`insert into t (data) values (${"secret"});`);
  }

  assertEqual(await getPoolPaths(fake, testDirectory), ["/evolu1.db"]);
  for (const fileName of fake.listFiles(".Test/.opaque")) {
    const bytes = fake.readFile(`.Test/.opaque/${fileName}`);
    assert(bytes != null, "Expected the slot.");
    assertFalse(Buffer.from(bytes).includes("secret"));
  }
  using driver = await setup.open(options);
  assertEqual(driver.exec(sql`select data from t;`).rows, [{ data: "secret" }]);
});

test("an encrypted database holds its lock in exclusive locking mode and keeps its journal empty between transactions until it closes, which deletes the journal", async () => {
  const fake = setupFakeOpfs();
  const setup = await setupDriver(fake);
  await using _run = setup.run;
  {
    using driver = await setup.open({
      mode: "encrypted",
      encryptionKey: testKey,
    });

    assertEqual(driver.exec(sql`pragma locking_mode;`).rows, [
      { locking_mode: "exclusive" },
    ]);
    driver.exec(sql`create table t (data blob);`);
    driver.exec(sql`insert into t (data) values (randomblob(100000));`);
    driver.exec(sql`update t set data = randomblob(100000);`);
    assertEqual(slotSize(fake, "/evolu1.db-journal"), sahPoolHeaderSize);
  }

  assertEqual(await getPoolPaths(fake, testDirectory), ["/evolu1.db"]);
});

test("an encrypted database ignores the empty journal a worker terminated between transactions left, and closing after its first write deletes it", async () => {
  const fake = setupFakeOpfs();
  const options = { mode: "encrypted", encryptionKey: testKey } as const;
  const terminated = await setupDriver(fake);
  await using _terminatedRun = terminated.run;
  // Never disposed, as a terminated worker never closes its database.
  const driver = await terminated.open(options);
  driver.exec(sql`create table t (data text);`);
  driver.exec(sql`insert into t (data) values (${"kept"});`);
  fake.releaseHandles();

  assertEqual(await getPoolPaths(fake, testDirectory), [
    "/evolu1.db",
    "/evolu1.db-journal",
  ]);
  assertEqual(slotSize(fake, "/evolu1.db-journal"), sahPoolHeaderSize);
  const setup = await setupDriver(fake);
  await using _run = setup.run;
  {
    using reopened = await setup.open(options);
    assertEqual(reopened.exec(sql`select data from t;`).rows, [
      { data: "kept" },
    ]);
    reopened.exec(sql`insert into t (data) values (${"added"});`);
    assertEqual(slotSize(fake, "/evolu1.db-journal"), sahPoolHeaderSize);
  }
  assertEqual(await getPoolPaths(fake, testDirectory), ["/evolu1.db"]);
});

for (const encrypted of [false, true])
  test(`opens a${encrypted ? "n encrypted" : " plain"} database @evolu/web 3 created with @evolu/sqlite-wasm 2.2.4`, async () => {
    const sqliteJs = await setupSqliteJs();
    const created = new sqliteJs.oo1.DB("/evolu1.db", "c");
    // As @evolu/web 3 keyed it.
    if (encrypted)
      created.exec(
        `PRAGMA cipher = 'sqlcipher'; PRAGMA key = "x'${bytesToHex(testKey)}'";`,
      );
    created.exec(`
      create table t (data text);
      insert into t (data) values ('created by 2.2.4');
    `);
    created.close();
    const fake = setupFakeOpfs();
    {
      const t = await setupSahPool({ directory: testDirectory, fake });
      using _pool = t.pool;
      writePoolFile(t, "/evolu1.db", readSqliteJsFile(sqliteJs, "/evolu1.db"));
    }
    const setup = await setupDriver(fake);
    await using _run = setup.run;

    using driver = await setup.open(
      encrypted ? { mode: "encrypted", encryptionKey: testKey } : undefined,
    );

    assertEqual(driver.exec(sql`select data from t;`).rows, [
      { data: "created by 2.2.4" },
    ]);
  });

// The DbWorker of @evolu/common switches every database to auto_vacuum with
// one VACUUM, after the driver's setup wrote the database's first page.
for (const [title, options] of [
  ["a plain", undefined],
  ["an encrypted", { mode: "encrypted", encryptionKey: testKey }],
] as const) {
  test(`${title} database the driver set up switches to auto_vacuum full with a VACUUM, keeps its rows, and a deletion then truncates its file`, async () => {
    const fake = setupFakeOpfs();
    const setup = await setupDriver(fake);
    await using _run = setup.run;
    const rowsSql = sql`select id, data from t where id in (1, 200, 400);`;
    {
      using driver = await setup.open(options);
      driver.exec(sql`create table t (id integer primary key, data blob);`);
      driver.exec(sql`
        with recursive
          c(i) as (
            select 1
            union all
            select i + 1 from c where i < 400
          )
        insert into t (data)
        select randomblob(1000) from c;
      `);
      assertEqual(driver.exec(sql`pragma auto_vacuum;`).rows, [
        { auto_vacuum: 0 },
      ]);
      const { rows } = driver.exec(rowsSql);

      driver.exec(sql`pragma auto_vacuum = full;`);
      driver.exec(sql`vacuum;`);

      assertEqual(driver.exec(sql`pragma auto_vacuum;`).rows, [
        { auto_vacuum: 1 },
      ]);
      assertEqual(driver.exec(rowsSql).rows, rows);
      const size = slotSize(fake, "/evolu1.db");
      assert(size != null, "Expected the database's slot.");
      driver.exec(sql`delete from t where id > 100;`);
      const sizeAfter = slotSize(fake, "/evolu1.db");
      assert(sizeAfter != null, "Expected the database's slot.");
      assertTrue(sizeAfter < size / 2);
      assertEqual(driver.exec(sql`pragma freelist_count;`).rows, [
        { freelist_count: 0 },
      ]);
    }

    using driver = await setup.open(options);
    assertEqual(driver.exec(sql`select count(*) as count from t;`).rows, [
      { count: 100 },
    ]);
    assertEqual(driver.exec(sql`pragma integrity_check;`).rows, [
      { integrity_check: "ok" },
    ]);
  });

  test(`${title} database the driver set up switches to auto_vacuum full with a VACUUM while empty, so a deletion of rows stored after it truncates its file`, async () => {
    const fake = setupFakeOpfs();
    const setup = await setupDriver(fake);
    await using _run = setup.run;
    {
      using driver = await setup.open(options);
      // The setup of an encrypted database already wrote its first page.
      assertEqual(driver.exec(sql`pragma auto_vacuum;`).rows, [
        { auto_vacuum: 0 },
      ]);

      driver.exec(sql`pragma auto_vacuum = full;`);
      driver.exec(sql`vacuum;`);

      assertEqual(driver.exec(sql`pragma auto_vacuum;`).rows, [
        { auto_vacuum: 1 },
      ]);
      driver.exec(sql`create table t (id integer primary key, data blob);`);
      driver.exec(sql`
        with recursive
          c(i) as (
            select 1
            union all
            select i + 1 from c where i < 400
          )
        insert into t (data)
        select randomblob(1000) from c;
      `);
      const size = slotSize(fake, "/evolu1.db");
      assert(size != null, "Expected the database's slot.");
      driver.exec(sql`delete from t where id > 100;`);
      const sizeAfter = slotSize(fake, "/evolu1.db");
      assert(sizeAfter != null, "Expected the database's slot.");
      assertTrue(sizeAfter < size / 2);
    }

    using driver = await setup.open(options);
    assertEqual(driver.exec(sql`pragma auto_vacuum;`).rows, [
      { auto_vacuum: 1 },
    ]);
    assertEqual(driver.exec(sql`select count(*) as count from t;`).rows, [
      { count: 100 },
    ]);
    assertEqual(driver.exec(sql`pragma integrity_check;`).rows, [
      { integrity_check: "ok" },
    ]);
  });

  // The VACUUM writes the database's pages to its journal, which grows to the
  // database's size, then the rewritten pages over the database. A full
  // storage fails the writes that would grow a file, and stays full while the
  // DbWorker closes the database and opens it again. A failing write to the
  // database itself, as of a device that fails, leaves a hot journal, which
  // the open after the close rolls back once writes work again.
  for (const [failure, failAt] of [
    ["full storage", 1],
    ["full storage", 40],
    ["failing database writes", 1],
    ["failing database writes", 25],
  ] as const)
    test(`a VACUUM of ${title} database that fails with ${failure}, from write ${failAt}, leaves the database as it was once it is closed and opened again, and a later VACUUM switches it`, async () => {
      const fake = setupFakeOpfs();
      const setup = await setupDriver(fake);
      await using _run = setup.run;
      const rowsSql = sql`
        select count(*) as count, sum(length(data)) as bytes from t;
      `;
      const rows = [{ count: 400, bytes: 400_000 }];
      {
        using driver = await setup.open(options);
        driver.exec(sql`create table t (id integer primary key, data blob);`);
        driver.exec(sql`
          with recursive
            c(i) as (
              select 1
              union all
              select i + 1 from c where i < 400
            )
          insert into t (data)
          select randomblob(1000) from c;
        `);
        const database = fake
          .listFiles(".Test/.opaque")
          .map((fileName) => `.Test/.opaque/${fileName}`)
          .find((path) => {
            const bytes = fake.readFile(path);
            assert(bytes != null, "Expected the slot.");
            return (
              new TextDecoder().decode(bytes.subarray(0, bytes.indexOf(0))) ===
              "/evolu1.db"
            );
          });
        assert(database != null, "Expected the database's slot.");
        let writes = 0;
        fake.inject((call) => {
          if (call.method !== "write") return null;
          const fails =
            failure === "full storage"
              ? call.at + call.length > (fake.readFile(call.path)?.length ?? 0)
              : call.path === database;
          return fails && ++writes >= failAt
            ? { type: "Throw", error: createQuotaExceededError() }
            : null;
        });
        driver.exec(sql`pragma auto_vacuum = full;`);

        assertThrowsInstanceOf(() => driver.exec(sql`vacuum;`), Error);
      }
      // A device that failed works again; a full storage stays full.
      if (failure === "failing database writes") fake.inject(null);

      {
        using driver = await setup.open(options);
        assertEqual(driver.exec(sql`pragma auto_vacuum;`).rows, [
          { auto_vacuum: 0 },
        ]);
        assertEqual(driver.exec(rowsSql).rows, rows);
        assertEqual(driver.exec(sql`pragma integrity_check;`).rows, [
          { integrity_check: "ok" },
        ]);
        fake.inject(null);

        driver.exec(sql`pragma auto_vacuum = full;`);
        driver.exec(sql`vacuum;`);

        assertEqual(driver.exec(sql`pragma auto_vacuum;`).rows, [
          { auto_vacuum: 1 },
        ]);
        assertEqual(driver.exec(rowsSql).rows, rows);
        assertEqual(driver.exec(sql`pragma integrity_check;`).rows, [
          { integrity_check: "ok" },
        ]);
      }
    });
}

test("evoluJsonArrayFrom and evoluJsonObjectFrom return a REAL exactly as stored", async () => {
  const setup = await setupDriver(setupFakeOpfs());
  await using _run = setup.run;
  using driver = await setup.open({ mode: "memory" });
  // SQLite's JSON functions before 3.53.2 converted floats to text with 15
  // significant digits, which round this double, 0.30000000000000004, to 0.3.
  const value = 0.1 + 0.2;
  driver.exec(sql`create table point (id text, x any) strict;`);
  driver.exec(sql`insert into point (id, x) values (${"a"}, ${value});`);
  const createQuery = createQueryBuilder({
    point: { id: id("Point"), x: FiniteNumber },
  });

  const query = createQuery((db) =>
    db
      .selectFrom("point")
      .select((eb) => [
        evoluJsonArrayFrom(eb.selectFrom("point").select("x")).as("points"),
        evoluJsonObjectFrom(eb.selectFrom("point").select("x")).as("point"),
      ]),
  );
  const { rows } = driver.exec(sqliteQueryStringToSqliteQuery(query));

  assertEqual(parseSqliteJsonArray(rows), [
    { points: [{ x: value }], point: { x: value } },
  ]);
});

/**
 * Creates the pool in `.Test` and holds the file of one of its slots, as a
 * worker that ended without closing it does, until the returned function
 * releases it.
 */
const holdPoolFile = async (fake: FakeOpfs) => {
  const setup = await setupDriver(fake);
  await using _run = setup.run;
  (await setup.open())[Symbol.dispose]();
  const [fileName] = fake.listFiles(".Test/.opaque");
  assert(fileName != null, "Expected a slot.");
  return { release: fake.hold(`.Test/.opaque/${fileName}`) };
};

test("the driver fails at once while another context holds a pool file", async () => {
  const fake = setupFakeOpfs();
  await holdPoolFile(fake);
  const setup = await setupDriver(fake);
  await using _run = setup.run;

  const opened = await setup.openAbortable();

  assert(!opened.ok, "Expected the driver to fail.");
  assert(opened.error.reason.type === "PanicAbortReason", "Expected a panic.");
  assertInstanceOf(opened.error.reason.defect, Error);
  assertEqual(opened.error.reason.defect.message, "SahPoolHeldError");
});

test("the wait fails with DatabaseHeldError when another context still holds a pool file after 10 seconds", async () => {
  const fake = setupFakeOpfs();
  await holdPoolFile(fake);
  const setup = await setupDriver(fake);
  await using _run = setup.run;

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

test("the wait ends once another context releases its pool file, and the database opens", async () => {
  const fake = setupFakeOpfs();
  const { release } = await holdPoolFile(fake);
  const setup = await setupDriver(fake);
  await using _run = setup.run;

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
  release();
  setup.run.deps.time.advance(Millis.orThrow(1000));

  assertEqual(await released, ok());
  using _driver = await setup.open();
});

test("deleteDatabase finalizes the statements a Sqlite keeps, which the Sqlite then disposes", async () => {
  const fake = setupFakeOpfs();
  const { createSqliteDriver } = await setupDriver(fake);
  const { run, sqlite, driver } = await setupSqliteAndDriver(
    createSqliteDriver,
    testName,
  );
  await using _run = run;
  sqlite.prepared`select 1;`;

  driver.deleteDatabase();
  await sqlite[Symbol.asyncDispose]();

  assertEqual(await getPoolPaths(fake, testDirectory), []);
});

describeSqliteDriverIterate(async () =>
  (await setupDriver(setupFakeOpfs())).open({ mode: "memory" }),
);

describeSqliteDriverPrepare(async () =>
  (await setupDriver(setupFakeOpfs())).open({ mode: "memory" }),
);
