/**
 * What the Hermes host evaluates, compiled by `scripts/hermes.mts` to one
 * script that defines `EvoluHermesSuite`: the binding's conformance suite and
 * the tests that need the host's hooks, registered against the binding of the
 * host's runtime. `host.cpp` runs the tests that drive runtimes and threads
 * itself.
 *
 * @module
 */
import { assert, assertEqual, assertTrue } from "@evolu/common";
// @ts-expect-error Runtime polyfill package has no TypeScript declarations.
import toSorted from "array.prototype.tosorted";
import {
  nativeSqliteAbiVersion,
  type NativeSqlite,
  type NativeSqliteDatabase,
} from "../../src/sqlite/Binding.ts";
import { describeBindingConformance } from "../bindingConformance.ts";

/** The hooks only the host's build has, which the tests set and reset. */
export interface HermesHost {
  /**
   * Gives the connections opened after it a SQL function, `write_log()`, which
   * inserts two rows into its connection's table `log`, until it's called with
   * false.
   */
  readonly autoRegisterWriteLog: (isRegistered: boolean) => void;
  /**
   * Starts a backup from each connection opened after it, which SQLite then
   * can't close, until it's called with false.
   */
  readonly startBackupOnOpen: (isStarted: boolean) => void;
  /** Finishes the backups started so far. */
  readonly finishBackups: () => void;
  /**
   * Makes SQLite's allocations fail from the one after `count` more on, or none
   * at -1, and returns whether one failed since the last call.
   */
  readonly failSqliteAllocations: (count: number) => boolean;
  /** Makes the platform's random source fail, until it's called with false. */
  readonly failRandom: (isFailing: boolean) => void;
}

/**
 * Registers the suites against `binding`, with their files under `directory`,
 * which holds two empty directories, `conformance` and `hermes`.
 */
export const registerSuites = ({
  binding,
  host,
  directory,
  test,
}: {
  binding: NativeSqlite;
  host: HermesHost;
  directory: string;
  test: (name: string, fn: () => void) => unknown;
}): void => {
  // React Native's Hermes has no Array.prototype.toSorted, which the suite
  // calls and apps get from @evolu/react-native/polyfills.
  (toSorted as { readonly shim: () => void }).shim();

  describeBindingConformance({
    binding,
    abiVersion: nativeSqliteAbiVersion,
    directory: `${directory}/conformance`,
    test,
    assertEqual,
  });

  const pathOf = (name: string): string => `${directory}/hermes/${name}`;

  /** What `fn` throws, as the conformance suite describes it. */
  const thrownBy = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      assertTrue(error instanceof Error);
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

  const closerOf = (database: NativeSqliteDatabase) => (): void => {
    database.close();
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

  test("rows are created without running JavaScript, so a replaced Object.create neither runs nor changes them", () => {
    const database = binding.openMemory();
    const create = Object.create;
    let calls = 0;
    Object.create = (prototype: object | null) => {
      calls++;
      database.close();
      return create(prototype) as unknown;
    };
    try {
      const statement = database.prepare("select 1 as a");
      const rows = statement.run([]).rows;
      statement.bind([]);
      const row = statement.step();

      assertEqual([rows, row, calls], [[{ a: 1 }], { a: 1 }, 0]);
      assertEqual(Object.getPrototypeOf(row), null);
    } finally {
      Object.create = create;
      database.close();
    }
  });

  test("changes is 0 for a read-only statement whose function writes, and a write's own rows when its function writes too", () => {
    host.autoRegisterWriteLog(true);
    const database = binding.openMemory();
    host.autoRegisterWriteLog(false);
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
    const path = pathOf("unfinished-backup.db");
    // The hook and the backups are the process's, so they never outlive the
    // test.
    const database = (() => {
      host.startBackupOnOpen(true);
      try {
        return binding.openFile(path);
      } finally {
        host.startBackupOnOpen(false);
      }
    })();
    try {
      const prepared = database.prepare("select 1 as a");

      assertEqual(database.close(), undefined);
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
      host.finishBackups();
      database.close();
    }

    assertEqual(binding.isFileOpen(path), false);
    assertEqual(
      thrownBy(() => database.prepare("select 1")),
      { kind: "Error", message: "The database is closed.", cause: undefined },
    );
  });

  test("fillRandom throws when the platform's random source fails", () => {
    host.failRandom(true);
    try {
      assertEqual(
        thrownBy(() => {
          binding.fillRandom(new Uint8Array(8));
        }),
        {
          kind: "Error",
          message: "The platform's random source failed.",
          cause: undefined,
        },
      );
    } finally {
      host.failRandom(false);
    }
  });

  test("a write to an encrypted file fails with the codec's random source failure when the platform's random source fails", () => {
    const database = binding.openEncryptedFile(
      pathOf("random.db"),
      Uint8Array.from({ length: 32 }, (_, i) => i),
    );
    try {
      database.prepare("create table t (a)").run([]);
      const insert = database.prepare("insert into t values (1)");
      host.failRandom(true);
      let thrown: unknown;
      try {
        thrown = thrownBy(() => insert.run([]));
      } finally {
        host.failRandom(false);
      }

      assertEqual(thrown, {
        kind: "Error",
        message: "disk I/O error",
        cause: {
          type: "SqliteError",
          operation: "step",
          extendedCode: 778,
          message: "disk I/O error",
          sqlOffset: null,
          systemErrno: null,
          cause: {
            type: "SqliteCodecFailure",
            error: { type: "SqliteRandomSourceError" },
          },
        },
      });
      assertEqual(insert.run([]).changes, 1);
    } finally {
      database.close();
    }
  });

  test("each SQLite allocation of a call failing in turn fails it with SQLITE_NOMEM and no codec failure, and leaves no connection open, until it succeeds", () => {
    const key = Uint8Array.from({ length: 32 }, (_, i) => i);
    const file = pathOf("allocations.db");
    const plainFile = pathOf("allocations-plain.db");
    const setup = binding.openEncryptedFile(file, key);
    const setupRun = (sql: string) => {
      const statement = setup.prepare(sql);
      statement.run([]);
      statement.finalize();
    };
    setupRun("create table t (a, b)");
    setupRun("insert into t values ('kůň', x'0102'), (zeroblob(3), 2.5)");
    setup.close();
    binding.openFile(plainFile).close();

    // Each call returns what closes the database it opened.
    const calls: ReadonlyArray<
      readonly [name: string, call: () => () => void]
    > = [
      ["openMemory", () => closerOf(binding.openMemory())],
      ["openFile", () => closerOf(binding.openFile(plainFile))],
      [
        "openEncryptedFile",
        () => closerOf(binding.openEncryptedFile(file, key)),
      ],
      [
        "prepare, run, bind, step, reset, reads that allocate and export",
        () => {
          const database = binding.openEncryptedFile(file, key);
          try {
            const statement = database.prepare(
              "select a, b from t where b is not ?",
            );
            assertEqual(statement.run([null]).rows, [
              { a: "kůň", b: new Uint8Array([1, 2]) },
              { a: new Uint8Array(3), b: 2.5 },
            ]);
            statement.bind(["x"]);
            assertEqual(statement.step(), {
              a: "kůň",
              b: new Uint8Array([1, 2]),
            });
            statement.reset();
            // Reading the cast's text allocates the NUL its bound bytes lack.
            const cast = database.prepare("select cast(? as text) as t");
            assertEqual(cast.run([Uint8Array.of(0x6b, 0xc5, 0xaf)]).rows, [
              { t: "ků" },
            ]);
            assertTrue(database.export().byteLength > 0);
          } catch (error) {
            database.close();
            throw error;
          }
          return closerOf(database);
        },
      ],
    ];
    for (const [name, call] of calls) {
      let failures = 0;
      for (let count = 0; ; count++) {
        // Each attempt starts from no connection, so a failed one leaves
        // none open.
        assertEqual(
          [binding.isFileOpen(file), binding.isFileOpen(plainFile)],
          [false, false],
        );
        host.failSqliteAllocations(count);
        let close: (() => void) | null = null;
        let thrown: unknown = null;
        let isReached = false;
        try {
          close = call();
        } catch (error) {
          thrown = error;
        } finally {
          isReached = host.failSqliteAllocations(-1);
        }
        if (close !== null) {
          close();
          assert(
            !isReached,
            `${name} succeeded with allocation ${count} failing`,
          );
          break;
        }
        assert(isReached, `${name} failed with no allocation failing`);
        assert(thrown instanceof Error, name);
        const { type, extendedCode, cause } = thrown.cause as {
          readonly type: string;
          readonly extendedCode: number;
          readonly cause: unknown;
        };
        assertEqual(
          [name, count, type, extendedCode, cause],
          [name, count, "SqliteError", 7, null],
        );
        failures++;
      }
      assert(failures > 0, name);
    }
  });
};
