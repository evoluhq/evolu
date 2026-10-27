/**
 * Wa-sqlite's synchronous build with its `AccessHandlePoolVFS`, the design of
 * opfs-sahpool, from the clone the runner serves.
 *
 * Its API is asynchronous. A statement that runs once goes through its `exec`,
 * and a prepared one is the first statement `statements` yields with
 * `unscoped`, which leaves it to the caller to finalize; rows are read as
 * arrays, its row form. Its files cannot be read.
 *
 * @module
 */

import type {
  BenchAsyncApi,
  BenchAsyncStatement,
  BenchValue,
} from "../../run.mts";
import { serveWebStack } from "../worker.mts";

/** The part of wa-sqlite's `sqlite-api.js` API the stack uses. */
interface WaSqliteApi {
  readonly vfs_register: (vfs: WaSqliteVfs, makeDefault: boolean) => number;
  readonly open_v2: (filename: string) => Promise<number>;
  readonly exec: (
    db: number,
    sql: string,
    callback?: (row: ReadonlyArray<unknown>) => void,
  ) => Promise<number>;
  readonly statements: (
    db: number,
    sql: string,
    options: { readonly unscoped: boolean },
  ) => AsyncGenerator<number, void>;
  readonly bind_collection: (
    stmt: number,
    bindings: ReadonlyArray<BenchValue>,
  ) => number;
  readonly step: (stmt: number) => Promise<number>;
  readonly row: (stmt: number) => ReadonlyArray<unknown>;
  readonly reset: (stmt: number) => Promise<number>;
  readonly finalize: (stmt: number) => Promise<number>;
  readonly close: (db: number) => Promise<number>;
}

/** A wa-sqlite VFS, which also has the `j` methods of its `FacadeVFS`. */
interface WaSqliteVfs {
  readonly close: () => void | Promise<void>;
  readonly jDelete: (filename: string, syncDir: number) => number;
}

interface WaSqliteVfsClass {
  readonly create: (name: string, module: unknown) => Promise<WaSqliteVfs>;
}

// SQLite's result code of a step that returned a row.
const sqliteRow = 100;

/**
 * Imports a module of the clone. The specifier is computed, so the runner's
 * Vite server serves the file as it is.
 */
const importWaSqlite = <T,>(url: string, path: string): Promise<T> =>
  import(
    /* @vite-ignore */
    `${url}${path}`
  ) as Promise<T>;

serveWebStack(async ({ directory, waSqliteUrl }) => {
  const [{ default: createModule }, { Factory }, { AccessHandlePoolVFS }] =
    await Promise.all([
      importWaSqlite<{ readonly default: () => Promise<unknown> }>(
        waSqliteUrl,
        "dist/wa-sqlite.mjs",
      ),
      importWaSqlite<{ readonly Factory: (module: unknown) => WaSqliteApi }>(
        waSqliteUrl,
        "src/sqlite-api.js",
      ),
      importWaSqlite<{ readonly AccessHandlePoolVFS?: WaSqliteVfsClass }>(
        waSqliteUrl,
        "src/examples/AccessHandlePoolVFS.js",
      ),
    ]);
  if (AccessHandlePoolVFS == null)
    throw new Error("wa-sqlite has no AccessHandlePoolVFS.");
  const module = await createModule();
  const sqlite3 = Factory(module);
  // The VFS keeps its pool in the directory named after it.
  const vfs = await AccessHandlePoolVFS.create(directory, module);
  sqlite3.vfs_register(vfs, true);
  const pathOf = (name: string) => `/${name}`;

  return {
    openDatabase: async (name) => {
      const db = await sqlite3.open_v2(pathOf(name));
      const api: BenchAsyncApi = {
        type: "Async",
        runOnce: async (sql) => {
          await sqlite3.exec(db, sql);
        },
        selectValue: async (sql) => {
          let value: unknown = null;
          let isFirstRow = true;
          await sqlite3.exec(db, sql, (row) => {
            if (isFirstRow) value = row[0];
            isFirstRow = false;
          });
          return value;
        },
        prepare: async (sql): Promise<BenchAsyncStatement> => {
          const iterator = sqlite3.statements(db, sql, { unscoped: true });
          const { value: stmt } = await iterator.next();
          // Ends the generator, which frees its copy of the SQL.
          await iterator.return();
          if (stmt == null) throw new Error(`No statement in ${sql}`);
          return {
            run: async (parameters) => {
              sqlite3.bind_collection(stmt, parameters);
              while ((await sqlite3.step(stmt)) === sqliteRow);
              await sqlite3.reset(stmt);
            },
            get: async (parameters) => {
              sqlite3.bind_collection(stmt, parameters);
              const row =
                (await sqlite3.step(stmt)) === sqliteRow
                  ? sqlite3.row(stmt)
                  : undefined;
              await sqlite3.reset(stmt);
              return row;
            },
            all: async (parameters) => {
              sqlite3.bind_collection(stmt, parameters);
              const rows: Array<unknown> = [];
              while ((await sqlite3.step(stmt)) === sqliteRow)
                rows.push(sqlite3.row(stmt));
              await sqlite3.reset(stmt);
              return rows;
            },
            finalize: async () => {
              await sqlite3.finalize(stmt);
            },
          };
        },
      };
      return {
        api,
        close: async () => {
          await sqlite3.close(db);
        },
      };
    },
    readFile: () => Promise.resolve(null),
    deleteDatabase: (name) => {
      vfs.jDelete(pathOf(name), 0);
      return Promise.resolve();
    },
    dispose: async () => {
      await vfs.close();
    },
  };
});
