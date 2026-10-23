import {
  assert,
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertSame,
  assertThrows,
  assertThrowsInstanceOf,
  assertTrue,
} from "@evolu/common";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { before, describe, it, type TestContext } from "node:test";
import { setImmediate as nextMacrotask } from "node:timers/promises";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { Worker } from "node:worker_threads";
import { buildAddon, sanitizerPreload } from "../scripts/build-addon.mts";
import { bindingDirectory, cSources } from "../scripts/compile.mts";
import { sqliteSource } from "../scripts/sqlite-source.mts";
import {
  loadAddon,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_READONLY,
  SQLITE_OPEN_READWRITE,
  type SqliteCoreAddon,
  type SqliteCoreDatabase,
  type SqliteCoreStatement,
  type SqliteCoreValue,
} from "./addon.mts";
import { setupFakeBuild } from "./fake-build.mts";
import { setupAddonPath, setupAddonTimeout } from "./setup-addon.mts";

// V8 exposes gc to contexts created after this flag is set.
setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;

describe("buildAddon", () => {
  it("refuses to build without the Node.js headers", (t) => {
    const prefix = setupDirectory(t);

    assertEqual(
      thrownMessage(
        () =>
          buildAddon({
            sqlite: {
              directory: join(prefix, sqliteSource.directory),
              sqlite3c: join(prefix, "sqlite3.c"),
              sqlite3h: join(prefix, "sqlite3.h"),
            },
            outputDirectory: join(prefix, "build"),
            nodeExecutable: join(prefix, "bin", "node"),
          }),
        Error,
      ),
      `${join(prefix, "include", "node")} has no node_api.h: the addon needs the Node.js headers that official Node.js builds install next to bin/node`,
    );
  });

  it("links a bundle on macOS and a shared library elsewhere, which the sanitized build links against the shared runtime", (t) => {
    const build = setupFakeBuild(t);
    const platformFlags = new Set([
      "-bundle",
      "-undefined",
      "dynamic_lookup",
      "-shared",
      "-shared-libasan",
    ]);
    const linkFlags = (platform: NodeJS.Platform) => {
      buildAddon({
        sqlite: build.sqlite,
        outputDirectory: build.env.SQLITE_CORE_BUILD,
        cc: build.cc,
        sanitize: true,
        platform,
      });
      const link = build.commands().at(-1);
      assert(link != null, "The addon was linked.");
      return link.filter((arg) => platformFlags.has(arg));
    };

    assertEqual(linkFlags("darwin"), [
      "-bundle",
      "-undefined",
      "dynamic_lookup",
    ]);
    assertEqual(linkFlags("linux"), ["-shared", "-shared-libasan"]);
  });

  it("compiles the N-API mirror of React Native's binding, node/binding.c, with the binding's header, into the addon", (t) => {
    const build = setupFakeBuild(t);

    buildAddon({
      sqlite: build.sqlite,
      outputDirectory: build.env.SQLITE_CORE_BUILD,
      cc: build.cc,
    });

    const commands = build.commands();
    const compile = commands.find((command) =>
      command.includes(join(import.meta.dirname, "../node/binding.c")),
    );
    assert(compile != null, "node/binding.c was compiled.");
    assertTrue(compile.includes(`-I${bindingDirectory}`));
    const link = commands.at(-1) ?? [];
    assertTrue(link.some((arg) => basename(arg).startsWith("binding-")));
  });

  it("links the binding's units into the addon", (t) => {
    const build = setupFakeBuild(t);

    buildAddon({
      sqlite: build.sqlite,
      outputDirectory: build.env.SQLITE_CORE_BUILD,
      cc: build.cc,
    });

    const link = build.commands().at(-1) ?? [];
    for (const source of cSources(bindingDirectory))
      assertTrue(
        link.some((arg) =>
          basename(arg).startsWith(`${basename(source, ".c")}-`),
        ),
      );
  });
});

describe("sanitizerPreload", () => {
  it("finds the runtime of the platform and the architecture, and names the variable that preloads it", (t) => {
    const { cc, directory } = setupFakeBuild(t);
    const runtime = (name: string): string => {
      const path = join(directory, name);
      writeFileSync(path, "");
      return path;
    };
    const macos = runtime("libclang_rt.asan_osx_dynamic.dylib");
    const aarch64 = runtime("libclang_rt.asan-aarch64.so");

    assertEqual(sanitizerPreload({ cc, platform: "darwin", arch: "arm64" }), {
      variable: "DYLD_INSERT_LIBRARIES",
      path: macos,
    });
    assertEqual(sanitizerPreload({ cc, platform: "linux", arch: "arm64" }), {
      variable: "LD_PRELOAD",
      path: aarch64,
    });
    // Without one named for the architecture, the one of a per-target runtime
    // directory.
    const perTarget = runtime("libclang_rt.asan.so");
    assertEqual(sanitizerPreload({ cc, platform: "linux", arch: "x64" }), {
      variable: "LD_PRELOAD",
      path: perTarget,
    });
  });

  it("throws when the compiler has no shared runtime", (t) => {
    const { cc } = setupFakeBuild(t);

    assertEqual(
      thrownMessage(
        () => sanitizerPreload({ cc, platform: "linux", arch: "x64" }),
        Error,
      ),
      `${cc} has no shared AddressSanitizer runtime: libclang_rt.asan-x86_64.so, libclang_rt.asan.so`,
    );
  });

  it("throws the error of a compiler that doesn't run", () => {
    assertThrows(
      () => sanitizerPreload({ cc: "evolu-sqlite-core-no-such-cc" }),
      (error) => {
        assertEqual((error as NodeJS.ErrnoException).code, "ENOENT");
      },
    );
  });
});

describe("addon", () => {
  let addonPath: string;
  let addon: SqliteCoreAddon;

  before(
    async () => {
      addonPath = await setupAddonPath();
      addon = loadAddon(addonPath);
    },
    { timeout: setupAddonTimeout },
  );

  it("exports exactly what its loader types", () => {
    const functions: ReadonlyArray<keyof SqliteCoreAddon> = [
      "autoRegisterWriteLog",
      "bind",
      "changes",
      "close",
      "column",
      "columnCount",
      "columnName",
      "compileOptionUsed",
      "createBinding",
      "exec",
      "finalize",
      "finishBackups",
      "libversion",
      "open",
      "openCodec",
      "prepare",
      "reset",
      "sourceid",
      "startBackupOnOpen",
      "step",
      "takeCodecFailure",
    ];

    assertEqual(
      Object.keys(addon).toSorted(),
      [...functions, "isSanitized"].toSorted(),
    );
    assertEqual(
      functions.filter((name) => typeof addon[name] !== "function"),
      [],
    );
  });

  it("is the sanitized build exactly when the run asks for one", () => {
    assertEqual(addon.isSanitized, process.env.SQLITE_CORE_SANITIZE === "1");
  });

  it("runs the pinned SQLite release", () => {
    const sourceId = addon.sourceid();

    assertEqual(addon.libversion(), sqliteSource.version);
    assertEqual(
      sourceId.slice(-sqliteSource.checkIn.length),
      sqliteSource.checkIn,
    );
  });

  it("uses the core compile options of src/sqlite_config.h", () => {
    const options = [
      "THREADSAFE=2",
      "TEMP_STORE=3",
      "OMIT_LOAD_EXTENSION",
      "DQS=0",
      "ENABLE_MATH_FUNCTIONS",
      "OMIT_AUTHORIZATION",
      "OMIT_INCRBLOB",
      "OMIT_INTROSPECTION_PRAGMAS",
      "OMIT_PROGRESS_CALLBACK",
    ];

    assertEqual(
      options.filter((option) => !addon.compileOptionUsed(option)),
      [],
    );
    // SQLite's default, for plain databases.
    assertTrue(addon.compileOptionUsed("DIRECT_OVERFLOW_READ"));
    // Memory statistics, off in the core, are on for the tests' sake, as by
    // SQLite's default, which it doesn't list.
    assertFalse(addon.compileOptionUsed("DEFAULT_MEMSTATUS=0"));
  });

  it("runs a plain database in WAL mode", (t) => {
    const path = join(setupDirectory(t), "db.sqlite");
    const db = addon.open(path);
    t.after(() => {
      addon.close(db);
    });

    assertEqual(selectRows(db, "pragma journal_mode = wal"), [["wal"]]);
    addon.exec(db, "create table t (v); insert into t values (1)");
    assertTrue(existsSync(`${path}-wal`));
    assertEqual(selectRows(db, "select v from t"), [[1]]);
  });

  it("maps a plain database once PRAGMA mmap_size asks for it", (t) => {
    const path = join(setupDirectory(t), "db.sqlite");
    const db = addon.open(path);
    t.after(() => {
      addon.close(db);
    });
    addon.exec(db, "create table t (v); insert into t values (1)");

    assertEqual(selectRows(db, "pragma mmap_size = 1048576"), [[1048576]]);
    assertEqual(selectRows(db, "select v from t"), [[1]]);
  });

  it("opens with SQLite's open flags", (t) => {
    const directory = setupDirectory(t);
    const path = join(directory, "db.sqlite");
    const created = addon.open(path);
    addon.exec(created, "create table t (v)");
    addon.close(created);

    const readOnly = addon.open(path, SQLITE_OPEN_READONLY);

    assertThrows(
      () => {
        addon.exec(readOnly, "insert into t values (1)");
      },
      sqliteErrorIs("attempt to write a readonly database", 8, 8),
    );
    addon.close(readOnly);
    assertThrows(
      () => {
        addon.open(join(directory, "missing.sqlite"), SQLITE_OPEN_READWRITE);
      },
      sqliteErrorIs("unable to open database file", 14, 14),
    );
    addon.close(
      addon.open(
        join(directory, "created.sqlite"),
        SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
      ),
    );
  });

  it("executes every statement of SQL", (t) => {
    const db = setupDatabase(t);

    addon.exec(
      db,
      "create table t (v); insert into t values (1); insert into t values (2);",
    );

    assertEqual(selectRows(db, "select v from t order by v"), [[1], [2]]);
  });

  it("prepares exactly one statement", (t) => {
    const db = setupDatabase(t);

    addon.finalize(addon.prepare(db, " select 1 ;; \t\n\f\r"));
    assertEqual(
      [
        "",
        " ;",
        "-- comment",
        "select 1; select 2",
        "select 1; -- comment",
      ].map((sql) => thrownMessage(() => addon.prepare(db, sql), Error)),
      [
        "SQL has no statement",
        "SQL has no statement",
        "SQL has no statement",
        "only whitespace and semicolons may follow the statement",
        "only whitespace and semicolons may follow the statement",
      ],
    );
  });

  it("steps a statement's rows and reads their columns", (t) => {
    const db = setupDatabase(t);
    const statement = addon.prepare(db, "values (1, 'a'), (2, 'b')");

    assertEqual(addon.columnCount(statement), 2);
    assertEqual(readRows(statement), [
      [1, "a"],
      [2, "b"],
    ]);
    addon.finalize(statement);
  });

  it("reads the names of a statement's columns, within its column count", (t) => {
    const db = setupDatabase(t);
    const statement = addon.prepare(db, 'select 1 as a, 2 as "b c", 3');
    t.after(() => {
      addon.finalize(statement);
    });

    assertEqual(
      [0, 1, 2].map((index) => addon.columnName(statement, index)),
      ["a", "b c", "3"],
    );
    const { columnName } = addon;
    for (const index of [-1, 3])
      assertEqual(
        thrownMessage(() => columnName(statement, index), RangeError),
        "column index out of range",
      );
  });

  it("returns the rows the last statement inserted, updated or deleted", (t) => {
    const db = setupDatabase(t);
    addon.exec(db, "create table t (v); insert into t values (1), (2), (3)");
    assertEqual(addon.changes(db), 3);

    addon.exec(db, "update t set v = v + 1 where v > 1");
    assertEqual(addon.changes(db), 2);
    // A query leaves the count.
    addon.exec(db, "select * from t");
    assertEqual(addon.changes(db), 2);
  });

  it("resets a statement so it runs again, keeping its bindings", (t) => {
    const db = setupDatabase(t);
    const statement = addon.prepare(db, "values (1), (2)");
    const bound = addon.prepare(db, "select ?");
    addon.bind(bound, 1, 7);
    assertTrue(addon.step(statement));
    assertTrue(addon.step(bound));

    addon.reset(statement);
    addon.reset(bound);

    assertEqual(readRows(statement), [[1], [2]]);
    assertEqual(readRows(bound), [[7]]);
    addon.finalize(statement);
    addon.finalize(bound);
  });

  it("reads a column only on a row and within the column count", (t) => {
    const db = setupDatabase(t);
    const statement = addon.prepare(db, "select 1");
    const noRow = (): string =>
      thrownMessage(() => addon.column(statement, 0), Error);

    assertEqual(noRow(), "statement has no row");
    assertTrue(addon.step(statement));
    assertEqual(
      [1, -1].map((index) =>
        thrownMessage(() => addon.column(statement, index), RangeError),
      ),
      ["column index out of range", "column index out of range"],
    );
    assertEqual(addon.column(statement, 0), 1);
    addon.reset(statement);
    assertEqual(noRow(), "statement has no row");
    assertTrue(addon.step(statement));
    assertFalse(addon.step(statement));
    assertEqual(noRow(), "statement has no row");
    addon.finalize(statement);
  });

  it("binds and reads null", (t) => {
    const db = setupDatabase(t);

    assertEqual(storeValues(db, [null]), [[null, "null"]]);
  });

  it("binds a safe integer as INTEGER and any other number as REAL", (t) => {
    const db = setupDatabase(t);

    assertEqual(
      storeValues(db, [
        3_000_000_000,
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
        -0,
        1.5,
        2 ** 53,
        -(2 ** 53),
        Infinity,
        NaN,
      ]),
      [
        [3_000_000_000, "integer"],
        [Number.MAX_SAFE_INTEGER, "integer"],
        [Number.MIN_SAFE_INTEGER, "integer"],
        [0, "integer"],
        [1.5, "real"],
        [2 ** 53, "real"],
        [-(2 ** 53), "real"],
        [Infinity, "real"],
        // SQLite stores a NaN double as NULL.
        [null, "null"],
      ],
    );
  });

  it("binds a bigint as INTEGER and reads one outside the safe range as a bigint", (t) => {
    const db = setupDatabase(t);

    assertEqual(
      storeValues(db, [
        2n ** 53n + 1n,
        -(2n ** 53n) - 1n,
        2n ** 63n - 1n,
        -(2n ** 63n),
        5n,
      ]),
      [
        [2n ** 53n + 1n, "integer"],
        [-(2n ** 53n) - 1n, "integer"],
        [2n ** 63n - 1n, "integer"],
        [-(2n ** 63n), "integer"],
        [5, "integer"],
      ],
    );
  });

  it("reads an integer as a number exactly within the safe range", (t) => {
    const db = setupDatabase(t);

    assertEqual(
      storeValues(db, [
        2n ** 53n - 1n,
        2n ** 53n,
        -(2n ** 53n) + 1n,
        -(2n ** 53n),
      ]).map(([value]) => value),
      [2 ** 53 - 1, 2n ** 53n, -(2 ** 53) + 1, -(2n ** 53n)],
    );
  });

  it("refuses a bigint outside the int64 range", (t) => {
    const db = setupDatabase(t);
    const statement = addon.prepare(db, "select ?");

    assertEqual(
      [2n ** 63n, -(2n ** 63n) - 1n].map((value) =>
        thrownMessage(() => addon.bind(statement, 1, value), RangeError),
      ),
      ["bigint outside the int64 range", "bigint outside the int64 range"],
    );
    addon.finalize(statement);
  });

  it("binds and reads text exactly, with NUL and non-ASCII characters", (t) => {
    const db = setupDatabase(t);
    const text = "a\u0000b ěščř 😀 \u0000";

    assertEqual(storeValues(db, [text, ""]), [
      [text, "text"],
      ["", "text"],
    ]);
    assertEqual(selectRows(db, "select hex(v) from t order by rowid"), [
      [Buffer.from(text).toString("hex").toUpperCase()],
      [""],
    ]);
    // Text that isn't UTF-8 reads with U+FFFD for each invalid sequence.
    assertEqual(selectRows(db, "select cast(x'61ff62c3' as text)"), [
      ["a\uFFFDb\uFFFD"],
    ]);
  });

  it("binds a lone surrogate as U+FFFD, which UTF-8 can't encode", (t) => {
    const db = setupDatabase(t);

    assertEqual(storeValues(db, ["a\uD800b"]), [["a�b", "text"]]);
  });

  it("binds and reads a Uint8Array as a BLOB of its exact bytes", (t) => {
    const db = setupDatabase(t);
    const bytes = new Uint8Array([0, 255, 1, 128, 0]);
    const view = new Uint8Array([9, 1, 2, 3, 9]).subarray(1, 4);

    assertEqual(storeValues(db, [bytes, view, new Uint8Array()]), [
      [bytes, "blob"],
      [new Uint8Array([1, 2, 3]), "blob"],
      [new Uint8Array(), "blob"],
    ]);
  });

  it("binds a copy of a Uint8Array's bytes, which later changes leave as bound", (t) => {
    const db = setupDatabase(t);
    addon.exec(db, "create table t (v)");
    const insert = addon.prepare(db, "insert into t (v) values (?), (?)");
    const bytes = new Uint8Array([1, 2, 3]);
    const view = new Uint8Array([0, 4, 5, 6, 0]).subarray(1, 4);
    addon.bind(insert, 1, bytes);
    addon.bind(insert, 2, view);
    bytes.fill(9);
    view.fill(9);

    assertFalse(addon.step(insert));
    addon.finalize(insert);
    assertEqual(selectRows(db, "select v from t order by rowid"), [
      [new Uint8Array([1, 2, 3])],
      [new Uint8Array([4, 5, 6])],
    ]);
  });

  it("reads a BLOB as a copy in a Uint8Array of its own", (t) => {
    const db = setupDatabase(t);
    const statement = addon.prepare(db, "select x'0102'");
    assertTrue(addon.step(statement));

    const blob = addon.column(statement, 0);

    assertInstanceOf(blob, Uint8Array);
    assertSame(Object.getPrototypeOf(blob), Uint8Array.prototype);
    assertEqual(blob.buffer.byteLength, 2);
    blob.fill(9);
    assertEqual(addon.column(statement, 0), new Uint8Array([1, 2]));
    addon.finalize(statement);
  });

  it("throws SQLITE_NOMEM when reading a TEXT value runs out of memory", () => {
    // In a process of its own, because the heap limit is the process's and
    // the pragma only lowers it. SQLite's heap use peaks near 12 MB in the
    // step and near 28 MB in reading the text, which converts the text of a
    // UTF-16 database to UTF-8, so a limit of 18 MB fails only the reading.
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        [
          "const addon = require(process.argv[1]);",
          'const db = addon.open(":memory:");',
          "addon.exec(db, \"pragma encoding = 'UTF-16le'\");",
          'const statement = addon.prepare(db, "select cast(zeroblob(4000000) as text)");',
          'addon.exec(db, "pragma hard_heap_limit = 18000000");',
          "addon.step(statement);",
          "let outcome;",
          "try { outcome = { length: addon.column(statement, 0).length }; }",
          "catch (error) { outcome = { resultCode: error.resultCode }; }",
          "process.stdout.write(JSON.stringify(outcome));",
        ].join("\n"),
        addonPath,
      ],
      { encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" },
    );

    assertEqual(result.stderr, "");
    assertEqual(JSON.parse(result.stdout), { resultCode: 7 });
  });

  it("refuses booleans, undefined and objects other than a Uint8Array", (t) => {
    const db = setupDatabase(t);
    const statement = addon.prepare(db, "select ?");
    const values: ReadonlyArray<unknown> = [
      true,
      false,
      undefined,
      Symbol("value"),
      () => 1,
      {},
      [],
      new ArrayBuffer(1),
      new DataView(new ArrayBuffer(1)),
      new Uint8ClampedArray(1),
      new Uint16Array(1),
    ];

    assertEqual(
      values.map((value) =>
        thrownMessage(
          () => addon.bind(statement, 1, value as SqliteCoreValue),
          TypeError,
        ),
      ),
      values.map(
        () => "expected null, a number, a bigint, a string or a Uint8Array",
      ),
    );
    addon.finalize(statement);
  });

  it("throws SQLite's errors with their message and result codes", (t) => {
    const db = setupDatabase(t);
    addon.exec(db, "create table t (v unique); insert into t values (1);");
    const insert = addon.prepare(db, "insert into t values (?)");

    assertThrows(
      () => {
        addon.bind(insert, 2, 1);
      },
      sqliteErrorIs("column index out of range", 25, 25),
    );
    addon.bind(insert, 1, 1);
    assertThrows(
      () => {
        addon.step(insert);
      },
      sqliteErrorIs("UNIQUE constraint failed: t.v", 19, 2067),
    );
    assertThrows(
      () => {
        addon.prepare(db, "selec 1");
      },
      sqliteErrorIs('near "selec": syntax error', 1, 1),
    );
    assertThrows(
      () => {
        addon.exec(db, "insert into missing values (1)");
      },
      sqliteErrorIs("no such table: missing", 1, 1),
    );
    assertThrows(
      () => {
        addon.open(join(setupDirectory(t), "missing", "db.sqlite"));
      },
      sqliteErrorIs("unable to open database file", 14, 14),
    );
    // A failed codec open, plain or keyed, gives a connection with no codec
    // file.
    const missing = join(setupDirectory(t), "missing", "db.sqlite");
    assertThrows(
      () => {
        addon.openCodec(missing, null);
      },
      sqliteErrorIs("unable to open database file", 14, 14),
    );
    assertThrows(
      () => {
        addon.openCodec(missing, new Uint8Array(32));
      },
      sqliteErrorIs("unable to open database file", 14, 14),
    );
    addon.finalize(insert);
  });

  it("refuses a string argument that isn't a string or has a NUL character or a lone surrogate", (t) => {
    const db = setupDatabase(t);
    const refused = "expected a well-formed string without NUL characters";

    assertEqual(
      [
        () => addon.open(1 as unknown as string),
        () => addon.open(":memory:\u0000"),
        () => addon.exec(db, "select 1\u0000"),
        () => addon.prepare(db, "select 1\u0000"),
        () => addon.compileOptionUsed("OMIT_WAL\u0000"),
        // UTF-8 can't encode a lone surrogate, so it would become U+FFFD, and
        // two paths or two SQL texts would be one.
        () => addon.open(":memory:\uD800"),
        () => addon.openCodec(":memory:\uDC00", null),
        () => addon.exec(db, "select '\uDC00'"),
        () => addon.prepare(db, "select '\uD800'"),
        () => addon.compileOptionUsed("OMIT_WAL\uD800x"),
      ].map((use) => thrownMessage(use, TypeError)),
      [
        "expected a string",
        refused,
        refused,
        refused,
        refused,
        refused,
        refused,
        refused,
        refused,
        refused,
      ],
    );
    // A surrogate pair is a character, also at the end.
    assertEqual(selectRows(db, "select '\uD83D\uDE00'"), [["\uD83D\uDE00"]]);
    assertFalse(addon.compileOptionUsed("DQS=0\uD83D\uDE00"));
  });

  it("throws a commit error that reset or finalize meets after a step returned a row", (t) => {
    const db = setupDatabase(t);
    addon.exec(
      db,
      "pragma foreign_keys = on; create table parent (id integer primary key);" +
        "create table child (p integer references parent (id) deferrable initially deferred)",
    );
    const insertSql = "insert into child values (99), (98) returning p";
    const commitFailed = sqliteErrorIs(
      "FOREIGN KEY constraint failed",
      19,
      787,
    );

    // The statement commits when it's stopped after its first row.
    const reset = addon.prepare(db, insertSql);
    t.after(() => {
      addon.finalize(reset);
    });
    assertTrue(addon.step(reset));
    assertThrows(() => {
      addon.reset(reset);
    }, commitFailed);
    // Reset again, the statement has no row and repeats no error.
    addon.reset(reset);

    const finalize = addon.prepare(db, insertSql);
    assertTrue(addon.step(finalize));
    assertThrows(() => {
      addon.finalize(finalize);
    }, commitFailed);
    addon.finalize(finalize);

    const count = addon.prepare(db, "select count(*) from child");
    t.after(() => {
      addon.finalize(count);
    });
    assertTrue(addon.step(count));
    assertEqual(addon.column(count, 0), 0);
  });

  it("throws the commit error that closing meets for a statement whose step returned a row", () => {
    const db = addon.open(":memory:");
    addon.exec(
      db,
      "pragma foreign_keys = on; create table parent (id integer primary key);" +
        "create table child (p integer references parent (id) deferrable initially deferred)",
    );
    const insert = addon.prepare(
      db,
      "insert into child values (99), (98) returning p",
    );
    assertTrue(addon.step(insert));

    assertThrows(
      () => {
        addon.close(db);
      },
      sqliteErrorIs("FOREIGN KEY constraint failed", 19, 787),
    );
    // Closed anyway, and again a no-op.
    addon.close(db);
    assertEqual(
      thrownMessage(() => addon.exec(db, "select 1"), Error),
      "database is closed",
    );
  });

  it("finishes finalizing before creating the commit error, which can run JS", () => {
    const schema =
      "pragma foreign_keys = on; create table parent (id integer primary key);" +
      "create table child (p integer references parent (id) deferrable initially deferred)";
    const insertSql = "insert into child values (99), (98) returning p";
    // Setting a code on the error calls a setter on Error.prototype once.
    const throwsWhileErrorIsCreated = (
      run: () => unknown,
      nested: () => unknown,
    ): string => {
      let nestedMessage = "the setter wasn't called";
      // oxlint-disable-next-line no-extend-native -- Only a setter on the prototype runs JS while the addon sets the error's codes.
      Object.defineProperty(Error.prototype, "resultCode", {
        configurable: true,
        // oxlint-disable-next-line accessor-pairs -- Nothing reads it.
        set() {
          delete (Error.prototype as { resultCode?: unknown }).resultCode;
          nestedMessage = thrownMessage(nested, Error);
        },
      });
      try {
        assertEqual(thrownMessage(run, Error), "FOREIGN KEY constraint failed");
      } finally {
        delete (Error.prototype as { resultCode?: unknown }).resultCode;
      }
      return nestedMessage;
    };

    const db = addon.open(":memory:");
    addon.exec(db, schema);
    const insert = addon.prepare(db, insertSql);
    assertTrue(addon.step(insert));
    assertEqual(
      throwsWhileErrorIsCreated(
        () => {
          addon.finalize(insert);
        },
        () => addon.step(insert),
      ),
      "statement is finalized",
    );

    const other = addon.prepare(db, insertSql);
    assertTrue(addon.step(other));
    assertEqual(
      throwsWhileErrorIsCreated(
        () => {
          addon.close(db);
        },
        () => {
          addon.close(db);
          addon.exec(db, "select 1");
        },
      ),
      "database is closed",
    );
    assertEqual(
      thrownMessage(() => addon.step(other), Error),
      "statement is finalized",
    );
  });

  it("resets and closes after a step that failed, without repeating its error", () => {
    const db = addon.open(":memory:");
    addon.exec(db, "create table t (v unique); insert into t values (1)");
    const insert = addon.prepare(db, "insert into t values (1)");
    const failed = sqliteErrorIs("UNIQUE constraint failed: t.v", 19, 2067);

    assertThrows(() => addon.step(insert), failed);
    addon.reset(insert);
    assertThrows(() => addon.step(insert), failed);
    addon.close(db);

    assertEqual(
      thrownMessage(() => addon.step(insert), Error),
      "statement is finalized",
    );
  });

  it("leaves no row after a step that fails after a row, and repeats no error", () => {
    const db = addon.open(":memory:");
    const overflowSql =
      "select abs(column1) from (values (1), (-9223372036854775808))";
    const overflowed = sqliteErrorIs("integer overflow", 1, 1);
    const failAfterRow = (): SqliteCoreStatement => {
      const statement = addon.prepare(db, overflowSql);
      assertTrue(addon.step(statement));
      assertThrows(() => addon.step(statement), overflowed);
      return statement;
    };

    const reset = failAfterRow();
    assertEqual(
      thrownMessage(() => addon.column(reset, 0), Error),
      "statement has no row",
    );
    addon.reset(reset);
    addon.finalize(reset);
    addon.finalize(failAfterRow());
    failAfterRow();
    addon.close(db);
  });

  it("throws finalize's commit error after its database handle was collected", async () => {
    const { statement, database } = (() => {
      const db = addon.open(":memory:");
      addon.exec(
        db,
        "pragma foreign_keys = on; create table parent (id integer primary key);" +
          "create table child (p integer references parent (id) deferrable initially deferred)",
      );
      const insert = addon.prepare(
        db,
        "insert into child values (99), (98) returning p",
      );
      assertTrue(addon.step(insert));
      return { statement: insert, database: new WeakRef(db) };
    })();
    await collectGarbage();

    assertSame(database.deref(), undefined);
    assertThrows(
      () => {
        addon.finalize(statement);
      },
      sqliteErrorIs("FOREIGN KEY constraint failed", 19, 787),
    );
  });

  it("refuses an index or flags that isn't a 32-bit integer", (t) => {
    const db = setupDatabase(t);
    const statement = addon.prepare(db, "select ?");
    t.after(() => {
      addon.finalize(statement);
    });

    assertEqual(
      [
        () => addon.bind(statement, "1" as unknown as number, 1),
        () => addon.open(":memory:", null as unknown as number),
      ].map((use) => thrownMessage(use, TypeError)),
      ["expected an integer", "expected an integer"],
    );
    const outOfRange = [
      () => addon.bind(statement, 1.5, 1),
      () => addon.bind(statement, 2 ** 31, 1),
      () => addon.column(statement, NaN),
    ];
    assertEqual(
      outOfRange.map((use) => thrownMessage(use, RangeError)),
      outOfRange.map(
        () => "expected an integer from -2147483648 to 2147483647",
      ),
    );
    // An index below 1 fails as SQLite's own range check fails, for a value of
    // each kind, whose bind functions would compute the index less 1.
    const { bind } = addon;
    for (const index of [0, -(2 ** 31)])
      for (const value of [1, 1.5, null, "text", new Uint8Array(1), 1n])
        assertThrows(
          () => {
            bind(statement, index, value);
          },
          sqliteErrorIs("column index out of range", 25, 25),
        );
  });

  it("fails the write of a crash copy that can't be copied, and refuses a crash copy whose write or copy isn't one", (t) => {
    const directory = setupDirectory(t);
    const path = join(directory, "crash-copy.db");
    const copy = join(directory, "missing", "copy.db");

    const db = addon.openCodec(path, null, 0, { write: 1, copy });
    assertThrows(
      () => {
        addon.exec(db, "create table t (x)");
      },
      sqliteErrorIs("disk I/O error", 10, 778),
    );
    addon.close(db);

    const { openCodec } = addon;
    assertEqual(
      [
        () => openCodec(path, null, 0, { write: "1", copy } as never),
        () => openCodec(path, null, 0, { write: 1, copy: 1 } as never),
        () => openCodec(path, null, 0, { write: 1, copy: `${copy}\0` }),
      ].map((use) => thrownMessage(use, TypeError)),
      [
        "expected an integer",
        "expected a string",
        "expected a well-formed string without NUL characters",
      ],
    );
    assertEqual(
      thrownMessage(
        () => openCodec(path, null, 0, { write: 1.5, copy }),
        RangeError,
      ),
      "expected an integer from -2147483648 to 2147483647",
    );
  });

  it("refuses a handle of the other kind and any other value", (t) => {
    const db = setupDatabase(t);
    const statement = addon.prepare(db, "select 1");
    t.after(() => {
      addon.finalize(statement);
    });

    assertEqual(
      [
        () => addon.step(db as unknown as SqliteCoreStatement),
        () => addon.close(statement as unknown as SqliteCoreDatabase),
        () => addon.exec({} as SqliteCoreDatabase, "select 1"),
        () => addon.finalize(undefined as unknown as SqliteCoreStatement),
      ].map((use) => thrownMessage(use, TypeError)),
      [
        "expected a statement",
        "expected a database",
        "expected a database",
        "expected a statement",
      ],
    );
  });

  it("throws on a finalized statement, and finalizing it again does nothing", (t) => {
    const db = setupDatabase(t);
    const statement = addon.prepare(db, "select ?");

    addon.finalize(statement);

    const uses = [
      () => addon.bind(statement, 1, 1),
      () => addon.step(statement),
      () => addon.columnCount(statement),
      () => addon.column(statement, 0),
      () => addon.columnName(statement, 0),
      () => addon.reset(statement),
    ];
    assertEqual(
      uses.map((use) => thrownMessage(use, Error)),
      uses.map(() => "statement is finalized"),
    );
    addon.finalize(statement);
  });

  it("throws on a closed database, and closing it again does nothing", () => {
    const db = addon.open(":memory:");

    addon.close(db);

    const uses = [
      () => addon.exec(db, "select 1"),
      () => addon.prepare(db, "select 1"),
      () => addon.changes(db),
      () => addon.takeCodecFailure(db),
    ];
    assertEqual(
      uses.map((use) => thrownMessage(use, Error)),
      uses.map(() => "database is closed"),
    );
    addon.close(db);
  });

  it("finalizes the statements of a database it closes", () => {
    const db = addon.open(":memory:");
    const first = addon.prepare(db, "select 1");
    const second = addon.prepare(db, "select 2");
    const third = addon.prepare(db, "select 3");
    addon.finalize(second);

    addon.close(db);

    assertEqual(
      [first, second, third].map((statement) =>
        thrownMessage(() => addon.step(statement), Error),
      ),
      [
        "statement is finalized",
        "statement is finalized",
        "statement is finalized",
      ],
    );
    addon.finalize(first);
  });

  it("keeps a connection open until its handle and statements are collected", async (t) => {
    const path = join(setupDirectory(t), "db.sqlite");
    const other = addon.open(path);
    t.after(() => {
      addon.close(other);
    });
    // A connection in exclusive locking mode keeps its lock until it closes.
    const isLocked = (): boolean => {
      try {
        addon.exec(other, "select * from t");
        return false;
      } catch (error) {
        sqliteErrorIs("database is locked", 5, 5)(error);
        return true;
      }
    };
    const prepareOnLockedConnection = () => {
      const db = addon.open(path);
      addon.exec(
        db,
        "pragma locking_mode = exclusive; create table t (v); insert into t values (1);",
      );
      return {
        database: new WeakRef(db),
        statement: addon.prepare(db, "select v from t"),
      };
    };

    // Returning ends the only strong reference to the statement.
    const statement = await (async () => {
      const handles = prepareOnLockedConnection();

      await collectGarbage();

      assertSame(handles.database.deref(), undefined);
      assertTrue(addon.step(handles.statement));
      assertEqual(addon.column(handles.statement, 0), 1);
      assertTrue(isLocked());
      return new WeakRef(handles.statement);
    })();
    await collectGarbage();

    assertSame(statement.deref(), undefined);
    assertFalse(isLocked());
  });

  it("finalizes a collected statement while its database stays open", async (t) => {
    const path = join(setupDirectory(t), "db.sqlite");
    const db = addon.open(path);
    const other = addon.open(path);
    t.after(() => {
      addon.close(other);
      addon.close(db);
    });
    addon.exec(db, "create table t (v); insert into t values (1), (2)");
    const isLocked = (): boolean => {
      try {
        addon.exec(other, "insert into t values (3)");
        return false;
      } catch (error) {
        sqliteErrorIs("database is locked", 5, 5)(error);
        return true;
      }
    };

    // A statement in the middle of its rows holds the database's shared lock.
    const statement = (() => {
      const prepared = addon.prepare(db, "select v from t");
      assertTrue(addon.step(prepared));
      assertTrue(isLocked());
      return new WeakRef(prepared);
    })();
    await collectGarbage();

    assertSame(statement.deref(), undefined);
    assertFalse(isLocked());
    assertEqual(selectRows(db, "select count(*) from t"), [[3]]);
  });

  it("closes the connections of a worker that exits with them open", async (t) => {
    const path = join(setupDirectory(t), "db.sqlite");
    const worker = new Worker(
      [
        'const { workerData } = require("node:worker_threads");',
        "const addon = require(workerData.addonPath);",
        "const db = addon.open(workerData.path);",
        'addon.exec(db, "pragma locking_mode = exclusive; create table t (v); insert into t values (1)");',
        'addon.step(addon.prepare(db, "select v from t"));',
      ].join("\n"),
      { eval: true, workerData: { addonPath, path } },
    );
    const exitCode = await new Promise<number>((resolve, reject) => {
      worker.once("exit", resolve);
      worker.once("error", reject);
    });

    assertEqual(exitCode, 0);
    // Its exclusive lock ended with its connection.
    const db = addon.open(path);
    t.after(() => {
      addon.close(db);
    });
    addon.exec(db, "insert into t values (2)");
    assertEqual(selectRows(db, "select count(*) from t"), [[2]]);
  });

  const setupDatabase = (t: TestContext): SqliteCoreDatabase => {
    const db = addon.open(":memory:");
    t.after(() => {
      addon.close(db);
    });
    return db;
  };

  /** Steps a statement to its end and returns its rows. */
  const readRows = (
    statement: SqliteCoreStatement,
  ): ReadonlyArray<ReadonlyArray<SqliteCoreValue>> => {
    const rows: Array<ReadonlyArray<SqliteCoreValue>> = [];
    while (addon.step(statement)) {
      const row: Array<SqliteCoreValue> = [];
      for (let index = 0; index < addon.columnCount(statement); index++)
        row.push(addon.column(statement, index));
      rows.push(row);
    }
    return rows;
  };

  const selectRows = (
    db: SqliteCoreDatabase,
    sql: string,
  ): ReadonlyArray<ReadonlyArray<SqliteCoreValue>> => {
    const statement = addon.prepare(db, sql);
    const rows = readRows(statement);
    addon.finalize(statement);
    return rows;
  };

  /**
   * Stores each value in a column without type affinity and reads them back,
   * each with its storage class.
   */
  const storeValues = (
    db: SqliteCoreDatabase,
    values: ReadonlyArray<SqliteCoreValue>,
  ): ReadonlyArray<ReadonlyArray<SqliteCoreValue>> => {
    addon.exec(db, "create table t (v)");
    const insert = addon.prepare(db, "insert into t (v) values (?)");
    for (const value of values) {
      addon.bind(insert, 1, value);
      assertFalse(addon.step(insert));
      addon.reset(insert);
    }
    addon.finalize(insert);
    return selectRows(db, "select v, typeof(v) from t order by rowid");
  };
});

/** Runs a full garbage collection and the finalizers it schedules. */
const collectGarbage = async (): Promise<void> => {
  // A WeakRef keeps its target until the end of the job that created it.
  await nextMacrotask();
  gc();
  // Node-API runs the finalizers of collected handles after the collection.
  await nextMacrotask();
  await nextMacrotask();
};

/** Returns the message of what `run` throws, exactly an instance of `type`. */
const thrownMessage = (run: () => unknown, type: ErrorConstructor): string => {
  const error = assertThrowsInstanceOf(run, type);
  assertSame(Object.getPrototypeOf(error), type.prototype);
  return error.message;
};

/**
 * Checks that an error is a plain `Error` with SQLite's message and result
 * codes as its only own enumerable properties.
 */
const sqliteErrorIs =
  (message: string, resultCode: number, extendedCode: number) =>
  (error: unknown): void => {
    assertInstanceOf(error, Error);
    assertSame(Object.getPrototypeOf(error), Error.prototype);
    assertEqual(
      {
        message: error.message,
        properties: Object.fromEntries(Object.entries(error)),
      },
      { message, properties: { resultCode, extendedCode } },
    );
  };

const setupDirectory = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "evolu-sqlite-core-addon-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
};
