import type { CreateSqliteDriver, SqliteRow } from "@evolu/common";
import { bytesToHex, createPreparedStatementsCache, ok } from "@evolu/common";
import sqlite3InitModule, {
  type Database,
  type PreparedStatement,
  type SAHPoolUtil,
} from "@evolu/sqlite-wasm";

// @ts-expect-error Missing types.
globalThis.sqlite3ApiConfig = {
  warn: (arg: unknown) => {
    // Ignore irrelevant warning.
    // https://github.com/sqlite/sqlite-wasm/issues/62
    if (
      typeof arg === "string" &&
      arg.startsWith("Ignoring inability to install OPFS sqlite3_vfs")
    )
      return;
    // eslint-disable-next-line no-console
    console.warn(arg);
  },
};

// Init ASAP.
const sqlite3Promise = sqlite3InitModule();

const fileName = "evolu1.db";

export const createWasmSqliteDriver: CreateSqliteDriver =
  (name, options) => async () => {
    const sqlite3 = await sqlite3Promise;

    using disposer = new DisposableStack();
    const useDatabase = (database: Database): Database =>
      disposer.adopt(database, (database) => {
        database.close();
      });

    let deleteDatabaseFile = false;
    const createOpfsSAHPoolVfs = async (
      options: Parameters<typeof sqlite3.installOpfsSAHPoolVfs>[0],
    ): Promise<SAHPoolUtil> => {
      const pool = await sqlite3.installOpfsSAHPoolVfs(options);
      if (pool.isPaused()) await pool.unpauseVfs();
      disposer.defer(() => {
        if (deleteDatabaseFile) pool.unlink(`/${fileName}`);
        pool.pauseVfs();
      });
      return pool;
    };

    let db: Database;

    switch (options?.mode) {
      case "memory":
        db = useDatabase(new sqlite3.oo1.DB(":memory:"));
        break;

      case "encrypted": {
        // MultipleCiphers encryption requires its VFS wrapper for OPFS SAH-pool.
        // @ts-expect-error Missing types (update @evolu/sqlite-wasm types)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        sqlite3.capi.sqlite3mc_vfs_create("opfs", 1);
        const pool = await createOpfsSAHPoolVfs({
          directory: `.${name}`,
        });
        db = useDatabase(
          new pool.OpfsSAHPoolDb(
            // SQLite normalizes this URI filename to SAH-pool path "/evolu1.db".
            `file:${fileName}?vfs=multipleciphers-opfs-sahpool`,
          ),
        );
        db.exec(`
          PRAGMA cipher = 'sqlcipher';
          PRAGMA key = "x'${bytesToHex(options.encryptionKey)}'";
        `);
        break;
      }

      default: {
        const pool = await createOpfsSAHPoolVfs({ name });
        db = useDatabase(new pool.OpfsSAHPoolDb(`file:${fileName}`));
      }
    }

    const cache = disposer.use(
      createPreparedStatementsCache<PreparedStatement>(
        (sql) => db.prepare(sql),
        (statement) => {
          statement.finalize();
        },
      ),
    );

    const disposables = disposer.move();

    return ok({
      exec: (query) => {
        const prepared = cache.get(query);

        if (prepared) {
          if (query.parameters.length > 0) prepared.bind(query.parameters);

          const rows = [];
          while (prepared.step()) {
            rows.push(prepared.get({}));
          }
          prepared.reset();

          return {
            rows: rows as ReadonlyArray<SqliteRow>,
            changes: db.changes(),
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

      deleteDatabase: () => {
        deleteDatabaseFile = true;
        disposables.dispose();
      },

      [Symbol.dispose]: () => {
        disposables.dispose();
      },
    });
  };
