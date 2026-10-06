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
  type SahPoolOptions,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import { setupFakeOpfs, type FakeOpfs } from "../sqlite-wasm/_fakeOpfs.ts";
import { setupSahPool } from "../sqlite-wasm/_sahPool.ts";
import {
  readSqliteJsFile,
  setupSqliteJs,
  writePoolFile,
} from "../sqlite-wasm/_sqliteJs.ts";
import { setupSqliteWasm } from "../sqlite-wasm/_sqliteWasm.ts";

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
