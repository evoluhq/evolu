/**
 * SQLite's own wasm build and JavaScript, `@sqlite.org/sqlite-wasm`, with its
 * opfs-sahpool VFS, which Evolu's pool rewrites and which `@evolu/web` used
 * until Evolu's SQLite.
 *
 * A statement that runs once goes through the `oo1` API's `DB.exec`, and a
 * prepared one binds, steps and resets a `PreparedStatement`. It reads rows as
 * objects as `oo1`'s `exec` with `rowMode: "object"` does, with the column
 * names read once, not for every row as `Stmt.get({})` reads them.
 *
 * @module
 */

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { BenchSyncApi, BenchValue } from "../../run.mts";
import { serveWebStack } from "../worker.mts";

serveWebStack(async ({ directory }) => {
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({
    name: `bench-${directory}`,
    directory,
  });
  const pathOf = (name: string) => `/${name}`;

  return {
    openDatabase: (name) => {
      const database = new pool.OpfsSAHPoolDb(pathOf(name));
      const api: BenchSyncApi = {
        type: "Sync",
        runOnce: (sql) => {
          database.exec(sql);
        },
        selectValue: (sql) => database.selectValue(sql) ?? null,
        prepare: (sql) => {
          const statement = database.prepare(sql);
          // It throws for a statement without columns.
          const columnNames =
            statement.columnCount > 0 ? statement.getColumnNames() : [];
          // A statement without parameters takes no bindings.
          const bind = (parameters: ReadonlyArray<BenchValue>) => {
            if (parameters.length > 0) statement.bind(parameters);
          };
          const readRow = () => {
            const values = statement.get([]);
            const row: Record<string, unknown> = {};
            for (const [index, name] of columnNames.entries())
              row[name] = values[index];
            return row;
          };
          return {
            run: (parameters) => {
              bind(parameters);
              statement.stepReset();
            },
            get: (parameters) => {
              bind(parameters);
              const row = statement.step() ? readRow() : undefined;
              statement.reset();
              return row;
            },
            all: (parameters) => {
              bind(parameters);
              const rows: Array<unknown> = [];
              while (statement.step()) rows.push(readRow());
              statement.reset();
              return rows;
            },
            finalize: () => {
              statement.finalize();
            },
          };
        },
      };
      return Promise.resolve({
        api,
        close: () => {
          database.close();
          return Promise.resolve();
        },
      });
    },
    readFile: (name) => Promise.resolve(pool.exportFile(pathOf(name))),
    deleteDatabase: (name) => {
      if (!pool.unlink(pathOf(name)))
        throw new Error(`The pool has no ${pathOf(name)}.`);
      return Promise.resolve();
    },
    dispose: () => {
      pool.pauseVfs();
      return Promise.resolve();
    },
  };
});
