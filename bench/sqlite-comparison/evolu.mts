/**
 * The stacks of Evolu's SQLite on Node.js and React Native, which reach it
 * through the same binding, `@evolu/common`'s `NativeSqlite`: a Node-API addon
 * on Node.js and a JSI module on React Native. It imports only types, so it
 * runs on both.
 *
 * A statement that runs once goes through the database's `run`, which prepares,
 * runs and finalizes it in one call, as Evolu's driver runs one.
 *
 * @module
 */
import type {
  NativeSqliteDatabase,
  NativeSqliteRunResult,
  SqliteExecResult,
  SqliteValue,
} from "@evolu/common";
import type { BenchSyncApi, BenchSyncStatement, BenchValue } from "./run.mts";

/** Creates the key of the encrypted stacks, the same for every run. */
export const createEvoluBenchKey = (): Uint8Array =>
  new Uint8Array(32).map((_, index) => index + 1);

/** Adapts a database of the binding. */
export const createEvoluApi = (
  database: NativeSqliteDatabase,
): BenchSyncApi => ({
  type: "Sync",
  runOnce: (sql) => {
    database.run(sql, []);
  },
  selectValue: (sql) => {
    const [row] = rowsOf(database.run(sql, []));
    return row == null ? null : ((Object.values(row)[0] as unknown) ?? null);
  },
  prepare: (sql): BenchSyncStatement => {
    const statement = database.prepare(sql);
    // The workloads bind only finite numbers.
    const run = (parameters: ReadonlyArray<BenchValue>) =>
      rowsOf(statement.run(parameters as ReadonlyArray<SqliteValue>));
    return {
      run: (parameters) => {
        run(parameters);
      },
      get: (parameters) => run(parameters)[0],
      all: run,
      finalize: () => {
        statement.finalize();
      },
    };
  },
});

/**
 * The rows of a run's result: none for its changes, which a run returns when it
 * returned no row, or its rows.
 */
const rowsOf = (result: NativeSqliteRunResult): ReadonlyArray<object> =>
  typeof result === "number"
    ? []
    : Array.isArray(result)
      ? (result as ReadonlyArray<object>)
      : (result as SqliteExecResult).rows;
