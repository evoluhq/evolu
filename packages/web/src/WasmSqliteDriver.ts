import {
  constVoid,
  createPreparedStatementsCache,
  CreateSqliteDriver,
  SqliteDriver,
  SqliteRow,
} from "@evolu/common";
import sqlite3InitModule, { PreparedStatement, Database } from "sqlite-wasm-cipher";

// TODO: Do we still need that?
// https://github.com/sqlite/sqlite-wasm/issues/62
// @ts-expect-error Missing types.
globalThis.sqlite3ApiConfig = {
  warn: constVoid,
};

// Init ASAP.
const sqlite3Promise = sqlite3InitModule();

export const createWasmSqliteDriver: CreateSqliteDriver = async (
  name,
  options,
) => {
  const sqlite3 = await sqlite3Promise;
  // This is used to make OPFS default vfs for multipleciphers
  // @ts-expect-error Missing types (update sqlite-wasm-cipher types)
  sqlite3.capi.sqlite3mc_vfs_create('opfs', 1);

  let db: Database;
  if (options?.memory) {
    db = new sqlite3.oo1.DB(":memory:");
  } else if (options?.encryptionKey) {
    // TODO: figure out why setting pool name breaks V
    const pool = await sqlite3.installOpfsSAHPoolVfs({});
    db = new pool.OpfsSAHPoolDb('file:evolu1.db?vfs=multipleciphers-opfs-sahpool');
    db.exec(`
      PRAGMA cipher = 'sqlcipher';
      PRAGMA legacy = 4;
      PRAGMA key = '${options.encryptionKey}';
    `);
  } else {
    const pool = await sqlite3.installOpfsSAHPoolVfs({name});
    db = new pool.OpfsSAHPoolDb('file:evolu1.db');
  }

  let isDisposed = false;

  const cache = createPreparedStatementsCache<PreparedStatement>(
    (sql) => db.prepare(sql),
    (statement) => {
      statement.finalize();
    },
  );

  const driver: SqliteDriver = {
    exec: (query, isMutation) => {
      const prepared = cache.get(query);

      if (prepared) {
        prepared.bind(query.parameters);

        if (isMutation) {
          prepared.stepReset();
          return {
            rows: [] as ReadonlyArray<SqliteRow>,
            changes: db.changes(),
          };
        }

        const rows = [];
        while (prepared.step()) {
          rows.push(prepared.get({}));
        }
        prepared.reset();

        return {
          rows: rows as ReadonlyArray<SqliteRow>,
          changes: 0,
        };
      }

      const rows = db.exec(query.sql, {
        returnValue: "resultRows",
        rowMode: "object",
        bind: query.parameters,
      }) as ReadonlyArray<SqliteRow>;

      const changes = db.changes();

      return { rows, changes };
    },

    export: () => sqlite3.capi.sqlite3_js_db_export(db),

    [Symbol.dispose]: () => {
      if (isDisposed) return;
      isDisposed = true;
      // poolUtil.unlink?
      cache[Symbol.dispose]();
      db.close();
    },
  };

  return driver;
};
