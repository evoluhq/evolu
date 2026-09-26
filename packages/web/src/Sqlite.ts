import type { CreateSqliteDriver, SqliteRow } from "@evolu/common";
import {
  bytesToHex,
  createPreparedStatementsCache,
  exhaustiveCheck,
  ok,
  performanceDurationBetween,
  PositiveMillis,
  sleep,
  tryAsync,
} from "@evolu/common";
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
    // oxlint-disable-next-line eslint/no-console
    console.warn(arg);
  },
};

// Init ASAP.
const sqlite3Promise = sqlite3InitModule();

const fileName = "evolu1.db";

export const createWasmSqliteDriver: CreateSqliteDriver =
  (name, options) => async (run) => {
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
      // Evolu opens a database only while it holds the database lock, but a
      // DbWorker that ended without closing it, because its tab closed,
      // crashed or navigated away, can hold pool files after the lock has
      // passed on: WebKit releases a terminated worker's locks and its files
      // separately, in no set order. sqlite-wasm cannot set up a pool with a
      // held file, and it then deletes the pool directory, which the held file
      // usually but not always prevents. Only a worker that has ended can hold
      // the files, and it can only release them, so the pool is set up once
      // every file opens.
      const canOpenPoolFiles = async (): Promise<boolean> => {
        const root = await navigator.storage.getDirectory();
        // sqlite-wasm keeps the pool in `.${name}/.opaque` in both OPFS modes.
        const poolDirectory = await tryAsync(() =>
          root.getDirectoryHandle(`.${name}`),
        );
        if (!poolDirectory.ok) return true;
        const opaqueDirectory = await tryAsync(() =>
          poolDirectory.value.getDirectoryHandle(".opaque"),
        );
        if (!opaqueDirectory.ok) return true;
        for await (const handle of opaqueDirectory.value.values()) {
          if (handle.kind !== "file") continue;
          const accessHandle = await tryAsync(() =>
            handle.createSyncAccessHandle(),
          );
          if (!accessHandle.ok) {
            // WebKit rejects a held file with InvalidStateError, other
            // engines with NoModificationAllowedError, as the spec says.
            // WebKit also uses InvalidStateError for a closed or invalid
            // handle and a stopped context. A retry opens fresh handles from
            // a new listing, and a stopped context ends the loop with its
            // worker, so retrying those is harmless.
            if (
              accessHandle.error instanceof DOMException &&
              (accessHandle.error.name === "InvalidStateError" ||
                accessHandle.error.name === "NoModificationAllowedError")
            )
              return false;
            throw accessHandle.error;
          }
          accessHandle.value.close();
        }
        return true;
      };

      const waitStart = run.deps.time.performance.now();
      let retryDelay = 50;
      let isWaitReported = false;
      while (!(await canOpenPoolFiles())) {
        const waited = performanceDurationBetween(
          waitStart,
          run.deps.time.performance.now(),
        );
        if (!isWaitReported && waited >= 5000) {
          isWaitReported = true;
          run.deps.console.warn(
            `Waiting for an ended DbWorker to release the files of database ${name}.`,
          );
        }
        await run.ok(sleep(PositiveMillis.orThrow(retryDelay)));
        retryDelay = Math.min(retryDelay * 2, 1000);
      }

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
        // oxlint-disable-next-line react/rules-of-hooks -- useDatabase registers disposal and is not a React Hook.
        db = useDatabase(new sqlite3.oo1.DB(":memory:"));
        break;

      case "encrypted": {
        // MultipleCiphers encryption requires its VFS wrapper for OPFS SAH-pool.
        // @ts-expect-error Missing types (update @evolu/sqlite-wasm types)
        // oxlint-disable-next-line typescript/no-unsafe-call
        sqlite3.capi.sqlite3mc_vfs_create("opfs", 1);
        const pool = await createOpfsSAHPoolVfs({
          directory: `.${name}`,
        });
        // oxlint-disable-next-line react/rules-of-hooks -- useDatabase registers disposal and is not a React Hook.
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

      case undefined: {
        const pool = await createOpfsSAHPoolVfs({ name });
        // oxlint-disable-next-line react/rules-of-hooks -- useDatabase registers disposal and is not a React Hook.
        db = useDatabase(new pool.OpfsSAHPoolDb(`file:${fileName}`));
        break;
      }

      default:
        exhaustiveCheck(options);
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
