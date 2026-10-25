/**
 * The SQLite driver of `@evolu/nodejs` on the addon `build-native.mts` builds
 * for this machine, loaded as the package loads it: the shared driver contract,
 * the database files in the working directory, encrypted, plaintext and memory
 * databases, an encrypted open of a plaintext file, and what a file connection
 * sets.
 */
import {
  assert,
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertThrows,
  assertTrue,
  EncryptionKey,
  Name,
  sql,
  testCreateRun,
  type SqliteDriverOptions,
} from "@evolu/common";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { buildNativeSqlite } from "../../../../packages/nodejs/scripts/build-native.mts";
import { checkLoadedNativeSqlite } from "../../../../packages/nodejs/scripts/check-native.mts";
import {
  isMusl,
  loadNativeSqlite,
  nativeSqliteTarget,
} from "../../../../packages/nodejs/src/NativeSqlite.ts";
import { createNodeJsSqliteDriver } from "../../../../packages/nodejs/src/Sqlite.ts";
import { describeSqliteDriverIterate } from "./_iterate.ts";
import { describeSqliteDriverPrepare } from "./_prepare.ts";

await buildNativeSqlite();

const testName = Name.orThrow("Test");
const path = `${testName}.db`;

const testKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 1),
);
const encrypted = { mode: "encrypted", encryptionKey: testKey } as const;

// Each test file runs in a process of its own, so the working directory, where
// the driver stores databases, is this file's.
const directory = mkdtempSync(join(tmpdir(), "evolu-nodejs-driver-"));
const workingDirectory = process.cwd();
before(() => {
  process.chdir(directory);
});
after(() => {
  process.chdir(workingDirectory);
  rmSync(directory, { recursive: true, force: true });
});

const open = (options?: SqliteDriverOptions) =>
  testCreateRun().ok(createNodeJsSqliteDriver(testName, options));

/** Removes the test database's files after a test. */
const setupFile = (t: { after: (fn: () => void) => void }): void => {
  t.after(() => {
    for (const suffix of ["", "-journal", "-wal", "-shm"])
      rmSync(`${path}${suffix}`, { force: true });
  });
};

// Not the header's check, whose glibc floor only the native jobs' AlmaLinux 8
// build meets, since an addon built on a newer glibc may need it.
// check-native.test.mts tests that check.
test("the built addon passes the load check CI runs on every target's", () => {
  const target = nativeSqliteTarget({
    platform: process.platform,
    arch: process.arch,
    isMusl,
  });
  assert(target !== null, "Expected a target.");

  checkLoadedNativeSqlite(target);
});

describeSqliteDriverIterate(() => open({ mode: "memory" }));

describeSqliteDriverPrepare(() => open({ mode: "memory" }));

test("an encrypted database is <name>.db in the working directory, stores no plaintext and reopens with its key", async (t) => {
  setupFile(t);
  {
    using driver = await open(encrypted);
    driver.exec(sql`create table t (data text);`);
    driver.exec(sql`insert into t (data) values (${"evolu-secret"});`);
  }

  const file = readFileSync(join(directory, path));
  assertFalse(file.includes("evolu-secret"));
  assertFalse(file.subarray(0, 16).equals(Buffer.from("SQLite format 3\0")));
  using driver = await open(encrypted);
  assertEqual(driver.exec(sql`select data from t;`).rows, [
    { data: "evolu-secret" },
  ]);
});

test("an encrypted open of a plaintext database, as an earlier @evolu/nodejs wrote, fails with NOTADB and changes no byte", async (t) => {
  setupFile(t);
  const plaintext = new DatabaseSync(path);
  plaintext.exec("create table t (data text); insert into t values ('plain');");
  plaintext.close();
  const before = readFileSync(path);

  const opened = await testCreateRun().abortable(
    createNodeJsSqliteDriver(testName, encrypted),
  );

  assert(!opened.ok, "Expected the open to fail.");
  assert(opened.error.reason.type === "PanicAbortReason", "Expected a panic.");
  const { defect } = opened.error.reason;
  assertInstanceOf(defect, Error);
  assertEqual(
    [
      defect.message,
      (defect.cause as { readonly extendedCode: number }).extendedCode,
    ],
    ["file is not a database", 26],
  );
  assertTrue(readFileSync(path).equals(before));
});

test("a plaintext database is an SQLite file, which another SQLite opens, and opens what another SQLite wrote", async (t) => {
  setupFile(t);
  {
    using driver = await open();
    driver.exec(sql`create table t (data text);`);
    driver.exec(sql`insert into t (data) values (${"relay"});`);
  }

  const other = new DatabaseSync(path);
  assertEqual(other.prepare("select data from t").all(), [{ data: "relay" }]);
  other.exec("insert into t values ('other');");
  other.close();

  using driver = await open();
  assertEqual(driver.exec(sql`select data from t order by data;`).rows, [
    { data: "other" },
    { data: "relay" },
  ]);
});

/**
 * Writes the test database with better-sqlite3, as `@evolu/nodejs` did before
 * Evolu's SQLite, in `journalMode`: 100 committed rows, which WAL keeps in its
 * log, then a transaction of 200 more, whose pages a cache of one page spills
 * to the files, before the process is killed.
 */
const crashBetterSqlite3 = async (journalMode: "delete" | "wal") => {
  const child = spawn(
    process.execPath,
    [
      "-e",
      `
        const Database = require(process.argv[1]);
        const database = new Database(process.argv[2]);
        database.pragma("journal_mode = ${journalMode}");
        database.pragma("wal_autocheckpoint = 0");
        database.pragma("cache_size = 1");
        database.exec("create table t (id integer primary key, data blob)");
        const insert = database.prepare(
          "insert into t (data) values (randomblob(4096))",
        );
        database.transaction(() => {
          for (let i = 0; i < 100; i++) insert.run();
        })();
        database.exec("begin");
        for (let i = 0; i < 200; i++) insert.run();
        process.kill(process.pid, "SIGKILL");
      `,
      fileURLToPath(import.meta.resolve("better-sqlite3")),
      join(directory, path),
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  assertEqual(await once(child, "exit"), [null, "SIGKILL"]);
};

test("a plaintext database better-sqlite3 left by a crash, in DELETE and in WAL mode, fails an encrypted open, which keeps every committed row, and opens in plaintext with them", async (t) => {
  setupFile(t);
  // An encrypted open of a hot journal truncates the database to the size the
  // journal's header stores, dropping only the pages the transaction appended,
  // before the rollback fails at its first record. The codec refuses a WAL log.
  for (const [journalMode, left, extendedCodes] of [
    ["delete", "-journal", [26, 11]],
    ["wal", "-wal", [14]],
  ] as const) {
    await crashBetterSqlite3(journalMode);
    const [database, log] = [path, `${path}${left}`].map((file) =>
      readFileSync(file),
    );

    const opened = await testCreateRun().abortable(
      createNodeJsSqliteDriver(testName, encrypted),
    );

    assert(!opened.ok, "Expected the open to fail.");
    assert(
      opened.error.reason.type === "PanicAbortReason",
      "Expected a panic.",
    );
    const { cause } = opened.error.reason.defect as Error;
    assertTrue(
      (extendedCodes as ReadonlyArray<number>).includes(
        (cause as { readonly extendedCode: number }).extendedCode,
      ),
    );
    const truncated = readFileSync(path);
    assertTrue(database.subarray(0, truncated.length).equals(truncated));
    assertTrue(readFileSync(`${path}${left}`).equals(log));

    using driver = await open();

    assertEqual(driver.exec(sql`select count(*) as n from t;`).rows, [
      { n: 100 },
    ]);
    assertEqual(driver.exec(sql`pragma integrity_check;`).rows, [
      { integrity_check: "ok" },
    ]);
    driver.deleteDatabase();
  }
});

test("a plaintext database opens with plain SQLite, not through the codec, so it can use WAL, which an encrypted one can't", async (t) => {
  setupFile(t);
  {
    using driver = await open();
    assertEqual(driver.exec(sql`pragma journal_mode = wal;`).rows, [
      { journal_mode: "wal" },
    ]);
    assertEqual(driver.exec(sql`pragma journal_mode = delete;`).rows, [
      { journal_mode: "delete" },
    ]);
    driver.deleteDatabase();
  }
  using driver = await open(encrypted);
  assertEqual(driver.exec(sql`pragma journal_mode = wal;`).rows, [
    { journal_mode: "delete" },
  ]);
});

test("a file a plaintext connection holds refuses another connection of the process, plaintext or encrypted", (t) => {
  setupFile(t);
  const nativeSqlite = loadNativeSqlite();
  const file = join(directory, path);
  const holder = nativeSqlite.openFile(file);
  try {
    for (const second of [
      () => nativeSqlite.openFile(file),
      () => nativeSqlite.openEncryptedFile(file, testKey),
    ])
      assertThrows(second, (error) => {
        assertInstanceOf(error, Error);
        assertEqual(error.cause, { type: "DatabaseFileHeldError" });
      });
    assertTrue(nativeSqlite.isFileOpen(file));
  } finally {
    holder.close();
  }
  assertFalse(nativeSqlite.isFileOpen(file));
});

/**
 * Starts a process that opens the test database with `@evolu/nodejs`'s SQLite,
 * with `key` or in plaintext, takes its write lock, inserts a row, and commits
 * about half a second later. Resolves once it holds the lock, with the promise
 * of the process's exit code and signal.
 */
const holdWriteLock = async (key: Uint8Array | null) => {
  const loader = new URL(
    "../../../../packages/nodejs/src/NativeSqlite.ts",
    import.meta.url,
  ).href;
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        const { loadNativeSqlite } = await import(${JSON.stringify(loader)});
        const [path, hex] = process.argv.slice(1);
        const sqlite = loadNativeSqlite();
        const database = hex === ""
          ? sqlite.openFile(path)
          : sqlite.openEncryptedFile(path, Uint8Array.from(Buffer.from(hex, "hex")));
        const run = (sql) => {
          const statement = database.prepare(sql);
          statement.run([]);
          statement.finalize();
        };
        run("begin exclusive");
        run("insert into t values (1)");
        process.stdout.write("locked");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
        run("commit");
        database.close();
      `,
      join(directory, path),
      key === null ? "" : Buffer.from(key).toString("hex"),
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const exited = once(child, "exit");
  const [chunk] = (await once(child.stdout, "data")) as [Buffer];
  assertEqual(String(chunk), "locked");
  return { exited };
};

test("an open of a file another process is writing waits for its lock, plaintext or encrypted", async (t) => {
  setupFile(t);
  for (const options of [undefined, encrypted] as const) {
    {
      using driver = await open(options);
      driver.exec(sql`create table t (a);`);
    }
    const { exited } = await holdWriteLock(
      options === undefined ? null : options.encryptionKey,
    );

    using driver = await open(options);

    assertEqual(driver.exec(sql`select count(*) as n from t;`).rows, [
      { n: 1 },
    ]);
    assertEqual(await exited, [0, null]);
    driver.deleteDatabase();
  }
});

test("opens never wait for Node.js's diagnostic report, which waits for every worker thread, as they read the C library from /proc on Linux", async () => {
  // A process of its own, whose loader hasn't read the C library yet.
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        let reports = 0;
        process.report.getReport = () => {
          reports++;
          return { header: {} };
        };
        const [common, sqlite] = process.argv.slice(1);
        const { Name, testCreateRun } = await import(common);
        const { createNodeJsSqliteDriver } = await import(sqlite);
        const run = testCreateRun();
        for (const name of ["First", "Second"]) {
          const driver = await run.ok(createNodeJsSqliteDriver(Name.orThrow(name)));
          driver.deleteDatabase();
        }
        process.stdout.write(String(reports));
      `,
      import.meta.resolve("@evolu/common"),
      new URL("../../../../packages/nodejs/src/Sqlite.ts", import.meta.url)
        .href,
    ],
    { cwd: directory, stdio: ["ignore", "pipe", "inherit"] },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += String(chunk);
  });

  assertEqual(await once(child, "exit"), [0, null]);
  assertEqual(output, "0");
});

test("a file connection a worker thread opens also waits 5 seconds for a lock, and its memory database doesn't", async (t) => {
  setupFile(t);
  // The worker's environment loads the addon again, which registers SQLite's
  // automatic extension again.
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const { loadNativeSqlite } = await import(workerData.loader);
        const sqlite = loadNativeSqlite();
        const timeouts = [];
        for (const database of [
          sqlite.openFile(workerData.path),
          sqlite.openMemory(),
        ]) {
          const statement = database.prepare("pragma busy_timeout");
          timeouts.push(statement.run([]).rows[0].timeout);
          statement.finalize();
          database.close();
        }
        parentPort.postMessage(timeouts);
      })();
    `,
    {
      eval: true,
      workerData: {
        loader: new URL(
          "../../../../packages/nodejs/src/NativeSqlite.ts",
          import.meta.url,
        ).href,
        path: join(directory, path),
      },
    },
  );

  const [timeouts] = (await once(worker, "message")) as [unknown];

  assertEqual(timeouts, [5000, 0]);
  await worker.terminate();
});

test("a memory database writes no file", async () => {
  using driver = await open({ mode: "memory" });
  driver.exec(sql`create table t (a);`);

  assertFalse(existsSync(path));
});

test("a file connection waits 5 seconds for another process's lock and caches about 16 MB of pages, foreign keys are off, and a memory database keeps SQLite's cache", async (t) => {
  setupFile(t);
  for (const options of [undefined, encrypted] as const) {
    using driver = await open(options);
    assertEqual(
      [
        driver.exec(sql`pragma busy_timeout;`).rows,
        driver.exec(sql`pragma cache_size;`).rows,
        driver.exec(sql`pragma foreign_keys;`).rows,
      ],
      [[{ timeout: 5000 }], [{ cache_size: -16000 }], [{ foreign_keys: 0 }]],
    );
    driver.deleteDatabase();
  }
  using memory = await open({ mode: "memory" });
  assertEqual(
    [
      memory.exec(sql`pragma busy_timeout;`).rows,
      memory.exec(sql`pragma cache_size;`).rows,
      memory.exec(sql`pragma foreign_keys;`).rows,
    ],
    [[{ timeout: 0 }], [{ cache_size: -2000 }], [{ foreign_keys: 0 }]],
  );
});

test("exec returns a read's rows with no changes, and a write's changes, also with RETURNING", async () => {
  using driver = await open({ mode: "memory" });
  driver.exec(sql`create table t (id integer primary key, name text);`);
  driver.exec(sql`insert into t (name) values (${"Alice"});`);

  assertEqual(driver.exec(sql`select name from t;`), {
    rows: [{ name: "Alice" }],
    changes: 0,
  });
  const insert = sql`
    insert into t (id, name)
    values (${2}, ${"Bob"})
    on conflict do nothing
    returning id;
  `;
  assertEqual(driver.exec(insert), { rows: [{ id: 2 }], changes: 1 });
  assertEqual(driver.exec(insert), { rows: [], changes: 0 });
  assertEqual(
    driver.exec(sql`update t set name = upper(name) returning name;`),
    {
      rows: [{ name: "ALICE" }, { name: "BOB" }],
      changes: 2,
    },
  );
  assertEqual(driver.exec(sql`delete from t;`), { rows: [], changes: 2 });
});

test("export returns an encrypted database as a plaintext file another SQLite opens", async (t) => {
  setupFile(t);
  using driver = await open(encrypted);
  driver.exec(sql`create table t (data text);`);
  driver.exec(sql`insert into t (data) values (${"exported"});`);

  const bytes = driver.export();

  assertInstanceOf(bytes.buffer, ArrayBuffer);
  const copy = join(directory, "export.db");
  writeFileSync(copy, bytes);
  const other = new DatabaseSync(copy);
  assertEqual(other.prepare("select data from t").all(), [
    { data: "exported" },
  ]);
  other.close();
  rmSync(copy);
});

test("disposing a driver again does nothing", async () => {
  const driver = await open({ mode: "memory" });

  driver[Symbol.dispose]();
  driver[Symbol.dispose]();
});

test("every connection is in SQLite's defensive mode, which ignores writable_schema", async (t) => {
  setupFile(t);
  for (const options of [undefined, encrypted, { mode: "memory" }] as const) {
    using driver = await open(options);

    driver.exec(sql`pragma writable_schema = on;`);

    assertEqual(driver.exec(sql`pragma writable_schema;`).rows, [
      { writable_schema: 0 },
    ]);
    driver.deleteDatabase();
  }
});

test("deleteDatabase deletes <name>.db, which a new driver then creates empty", async (t) => {
  setupFile(t);
  const driver = await open(encrypted);
  driver.exec(sql`create table t (a);`);

  driver.deleteDatabase();

  assertFalse(existsSync(path));
  using reopened = await open(encrypted);
  assertEqual(
    reopened.exec(sql`select count(*) as n from sqlite_schema;`).rows,
    [{ n: 0 }],
  );
});
