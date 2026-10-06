/**
 * The module worker the browser tests of `@evolu/sqlite-wasm` run SQLite in,
 * because `FileSystemSyncAccessHandle` exists only in dedicated workers, except
 * in WebKit. It also runs as a SharedWorker.
 *
 * It runs the steps `setupSqliteWorker` in `_harness.ts` sends, through
 * `serveSteps`. The first step loads the binary, fetched from Vite as
 * `application/wasm`, so it compiles as it streams. A step fails once the
 * binary has reported a defect, such as an exception a VFS method threw,
 * because SQLite ignores the result of some methods, such as `xClose`.
 *
 * @module
 */

import {
  assert,
  createTime,
  getOrThrow,
  NonNegativeInt,
  ok,
  testCreateDeps,
  testCreateRun,
  type EncryptionKey,
  type Result,
  type SqliteRow,
  type SqliteValue,
  type TestRunDefaultDeps,
} from "@evolu/common";
import { installPolyfills } from "@evolu/common/polyfills";
import {
  sqlite3_close_v2,
  sqlite3_column_bytes,
  sqlite3_column_int,
  sqlite3_column_text,
  sqlite3_errmsg,
  sqlite3_exec,
  sqlite3_extended_errcode,
  sqlite3_finalize,
  sqlite3_get_autocommit,
  sqlite3_libversion,
  sqlite3_open_v2,
  sqlite3_prepare_v2,
  sqlite3_step,
  sqlite3_vfs_find,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_DONE,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_READWRITE,
  SQLITE_ROW,
  type SqliteResultCode,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  createEncryptedSqliteDatabase,
  createSqliteDatabase,
  SqliteVfsPath,
  type SqliteDatabase,
  type SqliteError,
  type SqliteExecError,
  type SqliteKeyDerivation,
  type SqlitePrepareError,
  type SqliteRunError,
  type SqliteVfsIoError,
  type SubtleCryptoDep,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import {
  allocCString,
  allocWasm,
  readCString,
  readUtf8,
} from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type {
  SqliteDbPtr,
  SqliteStmtPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import {
  openSahPool,
  sahPoolOpaqueDirectoryName,
  type OpfsDirectoryHandle,
  type OpfsFileHandle,
  type OpfsName,
  type OpfsRoot,
  type OpfsRootDep,
  type OpfsSyncAccessHandle,
  type SahPool,
  type SahPoolError,
  type SahPoolOptions,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import {
  createSqliteWasm,
  type SqliteWasmDep,
} from "../../../../packages/sqlite-wasm/src/Wasm.ts";
import { serveSteps } from "./_serve.ts";

installPolyfills();

const sqliteWasmUrl = new URL(
  "../../../../packages/sqlite-wasm/wasm/sqlite3.wasm",
  import.meta.url,
);

let loaded: (TestRunDefaultDeps & SqliteWasmDep & OpfsRootDep) | null = null;

const getDeps = () => {
  assert(loaded != null, "The worker has not loaded the binary.");
  return loaded;
};

const poolsByDirectory = new Map<OpfsName, SahPool>();

const getPool = (directory: OpfsName): SahPool => {
  const pool = poolsByDirectory.get(directory);
  assert(pool != null, `The worker has no pool in ${directory}.`);
  return pool;
};

const databasesById = new Map<number, SqliteDatabase>();
let nextDatabaseId = 1;

const getDatabase = (id: number): SqliteDatabase => {
  const database = databasesById.get(id);
  assert(database != null, `The worker has no database ${id}.`);
  return database;
};

/** Keeps an open database for later steps and returns its id. */
const addDatabase = (database: SqliteDatabase): number => {
  const id = nextDatabaseId++;
  databasesById.set(id, database);
  return id;
};

/** A NUL-terminated copy of the string, which the instance never frees. */
const cString = (value: string) => getOrThrow(allocCString(getDeps())(value));

/** Reads a connection's error message. */
const errmsg = (db: SqliteDbPtr): string | null => {
  const deps = getDeps();
  const message = sqlite3_errmsg(deps)(db);
  return message === 0 ? null : readCString(deps)(message);
};

/** Prepares one statement with the C API, throwing with SQLite's message. */
const prepare = (db: SqliteDbPtr, sql: string): SqliteStmtPtr => {
  const deps = getDeps();
  const pStmt = getOrThrow(allocWasm(deps)(4));
  const rc = sqlite3_prepare_v2(deps)(db, cString(sql), -1, pStmt, 0);
  if (rc !== SQLITE_OK)
    throw new Error(`Cannot prepare ${sql}: ${rc} ${errmsg(db)}`);
  return deps.sqliteWasm
    .getHeapDataView()
    .getUint32(pStmt, true) as SqliteStmtPtr;
};

/**
 * Wraps `navigator.storage` so the files of the pools opened on it hold at most
 * the quota in bytes together, for an engine whose quota a test cannot limit. A
 * write or truncate past it throws `QuotaExceededError`, as the File System
 * spec says a write over quota does.
 */
const createQuotaOpfsRoot = (quota: number): OpfsRoot => {
  const handles = new Set<OpfsSyncAccessHandle>();

  const requestGrowth = (handle: OpfsSyncAccessHandle, newSize: number) => {
    let used = 0;
    for (const open of handles) used += open.getSize();
    if (used + Math.max(0, newSize - handle.getSize()) > quota)
      throw new DOMException(
        "The pool's injected quota has been exceeded.",
        "QuotaExceededError",
      );
  };

  const wrapFile = (file: FileSystemFileHandle): OpfsFileHandle => ({
    kind: "file",
    name: file.name,
    createSyncAccessHandle: async () => {
      const handle = await file.createSyncAccessHandle();
      const wrapped: OpfsSyncAccessHandle = {
        read: (buffer, options) => handle.read(buffer, options),
        write: (buffer, options) => {
          requestGrowth(wrapped, options.at + buffer.length);
          return handle.write(buffer, options);
        },
        truncate: (newSize) => {
          requestGrowth(wrapped, newSize);
          handle.truncate(newSize);
        },
        getSize: () => handle.getSize(),
        flush: () => {
          handle.flush();
        },
        close: () => {
          handles.delete(wrapped);
          handle.close();
        },
      };
      handles.add(wrapped);
      return wrapped;
    },
  });

  const wrapDirectory = (
    directory: FileSystemDirectoryHandle,
  ): OpfsDirectoryHandle => ({
    kind: "directory",
    getDirectoryHandle: async (name, options) =>
      wrapDirectory(await directory.getDirectoryHandle(name, options)),
    getFileHandle: async (name, options) =>
      wrapFile(await directory.getFileHandle(name, options)),
    values: async function* () {
      for await (const entry of directory.values())
        yield entry.kind === "file" ? wrapFile(entry) : wrapDirectory(entry);
    },
  });

  return {
    getDirectory: async () =>
      wrapDirectory(await navigator.storage.getDirectory()),
  };
};

/** Returns the directory of a pool's slots. */
const getOpaqueDirectory = async (
  directory: OpfsName,
): Promise<FileSystemDirectoryHandle> => {
  let handle = await navigator.storage.getDirectory();
  for (const name of [directory, sahPoolOpaqueDirectoryName])
    handle = await handle.getDirectoryHandle(name);
  return handle;
};

// A slot's sync access handle the worker holds, as another context would.
let heldSlot: FileSystemSyncAccessHandle | null = null;

const steps = {
  /** Loads the binary, with test dependencies from the seed. */
  load: async (seed: string): Promise<void> => {
    const deps = testCreateDeps({ seed });
    await using run = testCreateRun(deps);
    const response = await fetch(sqliteWasmUrl);
    if (!response.ok)
      throw new Error(
        `Cannot fetch ${sqliteWasmUrl.pathname} (${response.status}). Download it with pnpm sqlite-wasm:download in the repository root, or build it from source as packages/sqlite-wasm/README.md#the-webassembly describes.`,
      );
    const sqliteWasm = getOrThrow(await run(createSqliteWasm(response)));
    loaded = { ...deps, sqliteWasm, opfsRoot: navigator.storage };
  },

  libversion: (): string => {
    const deps = getDeps();
    return deps.sqliteWasm.call(() =>
      readCString(deps)(sqlite3_libversion(deps)()),
    );
  },

  /**
   * Opens the pool in the directory on `navigator.storage`, or, with a quota,
   * on {@link createQuotaOpfsRoot}. With `heldTimeout`, it waits for held files
   * in real time.
   */
  openPool: async (
    directory: OpfsName,
    {
      quota,
      ...options
    }: Omit<SahPoolOptions, "directory"> & { quota?: number | undefined } = {},
  ): Promise<Result<{ readonly vfsName: string }, SahPoolError>> => {
    await using run = testCreateRun<OpfsRootDep & SqliteWasmDep>({
      ...getDeps(),
      ...(quota == null ? {} : { opfsRoot: createQuotaOpfsRoot(quota) }),
      // The test time never fires a timeout on its own.
      ...(options.heldTimeout == null ? {} : { time: createTime() }),
    });
    const opened = await run(
      openSahPool({ ...options, directory: [directory] }),
    );
    if (!opened.ok) return opened;
    poolsByDirectory.set(directory, opened.value);
    return ok({ vfsName: opened.value.vfsName });
  },

  /** Disposes the pool, which throws while a database has a file open. */
  disposePool: (directory: OpfsName): void => {
    getPool(directory)[Symbol.dispose]();
    poolsByDirectory.delete(directory);
  },

  getPaths: (directory: OpfsName): ReadonlyArray<string> =>
    getPool(directory).getPaths(),

  read: (
    directory: OpfsName,
    path: string,
    offset: number,
    byteLength: number,
  ) =>
    getPool(directory).read(
      path,
      NonNegativeInt.orThrow(offset),
      NonNegativeInt.orThrow(byteLength),
    ),

  unlink: (directory: OpfsName, path: string) =>
    getPool(directory).unlink(path),

  /** Opens a File database on the pool and returns its id. */
  openDatabase: (
    directory: OpfsName,
    path: string,
  ): Result<number, SqliteError> => {
    const opened = createSqliteDatabase(getDeps())({
      type: "File",
      vfs: getPool(directory),
      path: SqliteVfsPath.orThrow(path),
    });
    if (!opened.ok) return opened;
    return ok(addDatabase(opened.value));
  },

  /**
   * Opens an EncryptedFile database on the pool with the key and returns its
   * id.
   */
  openEncryptedDatabase: (
    directory: OpfsName,
    path: string,
    key: EncryptionKey,
  ): Result<number, SqliteError> => {
    const opened = createSqliteDatabase(getDeps())({
      type: "EncryptedFile",
      vfs: getPool(directory),
      path: SqliteVfsPath.orThrow(path),
      key,
    });
    if (!opened.ok) return opened;
    return ok(addDatabase(opened.value));
  },

  /**
   * Opens an encrypted database with `createEncryptedSqliteDatabase`, which
   * falls back to the key `@evolu/sqlite-wasm` 2.2.4 derived, with the worker's
   * WebCrypto, and returns its id and which key opened it.
   */
  openEncryptedDatabaseWithFallback: async (
    directory: OpfsName,
    path: string,
    key: EncryptionKey,
  ): Promise<
    Result<
      {
        readonly database: number;
        readonly keyDerivation: SqliteKeyDerivation;
      },
      SqliteError | SqliteVfsIoError
    >
  > => {
    await using run = testCreateRun<SqliteWasmDep & SubtleCryptoDep>({
      ...getDeps(),
      subtleCrypto: crypto.subtle,
    });
    const opened = await run(
      createEncryptedSqliteDatabase({
        type: "EncryptedFile",
        vfs: getPool(directory),
        path: SqliteVfsPath.orThrow(path),
        key,
      }),
    );
    if (!opened.ok) return opened;
    return ok({
      database: addDatabase(opened.value.database),
      keyDerivation: opened.value.keyDerivation,
    });
  },

  exec: (database: number, sql: string) => getDatabase(database).exec(sql),

  /**
   * Runs SQL again and again, at most the given number of times, until it
   * fails, and returns how many runs succeeded and the error that ended them,
   * or null.
   */
  runUntilError: (
    database: number,
    sql: string,
    maxRuns: number,
  ): { readonly runs: number; readonly error: SqliteExecError | null } => {
    for (let runs = 0; runs < maxRuns; runs++) {
      const result = getDatabase(database).exec(sql);
      if (!result.ok) return { runs, error: result.error };
    }
    return { runs: maxRuns, error: null };
  },

  export: (database: number) => getDatabase(database).export(),

  run: (
    database: number,
    sql: string,
    parameters: ReadonlyArray<SqliteValue>,
  ) => getDatabase(database).run(sql, parameters),

  /**
   * Runs statements one after another and returns the rows of each, or the
   * first error.
   */
  runStatements: (
    database: number,
    statements: ReadonlyArray<{
      readonly sql: string;
      readonly parameters: ReadonlyArray<SqliteValue>;
    }>,
  ): Result<
    ReadonlyArray<ReadonlyArray<SqliteRow>>,
    SqlitePrepareError | SqliteRunError
  > => {
    const rows: Array<ReadonlyArray<SqliteRow>> = [];
    for (const { sql, parameters } of statements) {
      const result = getDatabase(database).run(sql, parameters);
      if (!result.ok) return result;
      rows.push(result.value.rows);
    }
    return ok(rows);
  },

  disposeDatabase: (database: number): void => {
    getDatabase(database)[Symbol.dispose]();
    databasesById.delete(database);
  },

  /**
   * Opens a connection on the VFS with the C API, as a read-write connection by
   * default, and returns the result code and the handle SQLite returns even on
   * failure.
   */
  connect: (
    vfsName: string,
    path: string,
    flags: number = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
  ): { readonly rc: SqliteResultCode; readonly db: SqliteDbPtr } => {
    const deps = getDeps();
    return deps.sqliteWasm.call(() => {
      const pDb = getOrThrow(allocWasm(deps)(4));
      const rc = sqlite3_open_v2(deps)(
        cString(path),
        pDb,
        flags,
        cString(vfsName),
      );
      const db = deps.sqliteWasm
        .getHeapDataView()
        .getUint32(pDb, true) as SqliteDbPtr;
      return { rc, db };
    });
  },

  /** Closes a connection with `sqlite3_close_v2`. */
  close: (db: SqliteDbPtr): SqliteResultCode => {
    const deps = getDeps();
    return deps.sqliteWasm.call(() => sqlite3_close_v2(deps)(db));
  },

  /** Runs SQL on a connection with `sqlite3_exec` and returns its code. */
  execSql: (db: SqliteDbPtr, sql: string): SqliteResultCode => {
    const deps = getDeps();
    return deps.sqliteWasm.call(() =>
      sqlite3_exec(deps)(db, cString(sql), 0, 0, 0),
    );
  },

  /**
   * Runs SQL on a connection again and again for the given time, as a busy
   * worker does, and returns how many times it ran.
   */
  execSqlFor: (db: SqliteDbPtr, sql: string, milliseconds: number): number => {
    const deps = getDeps();
    return deps.sqliteWasm.call(() => {
      const zSql = cString(sql);
      const end = performance.now() + milliseconds;
      let runs = 0;
      while (performance.now() < end) {
        const rc = sqlite3_exec(deps)(db, zSql, 0, 0, 0);
        if (rc !== SQLITE_OK) throw new Error(`Cannot run ${sql}: ${rc}`);
        runs++;
      }
      return runs;
    });
  },

  /**
   * Returns the first column of a query's first row as text, throwing with
   * SQLite's message when it fails.
   */
  selectText: (db: SqliteDbPtr, sql: string): string | null => {
    const deps = getDeps();
    return deps.sqliteWasm.call(() => {
      const stmt = prepare(db, sql);
      const rc = sqlite3_step(deps)(stmt);
      const ptr = rc === SQLITE_ROW ? sqlite3_column_text(deps)(stmt, 0) : 0;
      const text =
        ptr === 0
          ? null
          : readUtf8(deps)(ptr, sqlite3_column_bytes(deps)(stmt, 0));
      sqlite3_finalize(deps)(stmt);
      if (rc !== SQLITE_ROW)
        throw new Error(`Cannot select ${sql}: ${rc} ${errmsg(db)}`);
      return text;
    });
  },

  /** Prepares a statement with the C API and returns it. */
  prepareStatement: (db: SqliteDbPtr, sql: string): SqliteStmtPtr =>
    getDeps().sqliteWasm.call(() => prepare(db, sql)),

  /** Steps a statement once and returns the result code. */
  stepStatement: (stmt: SqliteStmtPtr): SqliteResultCode => {
    const deps = getDeps();
    return deps.sqliteWasm.call(() => sqlite3_step(deps)(stmt));
  },

  /**
   * Steps a statement over the given number of rows, or to its end, and returns
   * how many of them have 1 in the first column.
   */
  stepRows: (stmt: SqliteStmtPtr, rows = Infinity): number => {
    const deps = getDeps();
    return deps.sqliteWasm.call(() => {
      let ones = 0;
      for (let row = 0; row < rows; row++) {
        const rc = sqlite3_step(deps)(stmt);
        if (rc === SQLITE_DONE && rows === Infinity) break;
        if (rc !== SQLITE_ROW) throw new Error(`Cannot step: ${rc}`);
        ones += sqlite3_column_int(deps)(stmt, 0);
      }
      return ones;
    });
  },

  finalizeStatement: (stmt: SqliteStmtPtr): SqliteResultCode => {
    const deps = getDeps();
    return deps.sqliteWasm.call(() => sqlite3_finalize(deps)(stmt));
  },

  extendedErrcode: (db: SqliteDbPtr): SqliteResultCode => {
    const deps = getDeps();
    return deps.sqliteWasm.call(() => sqlite3_extended_errcode(deps)(db));
  },

  isAutocommit: (db: SqliteDbPtr): boolean => {
    const deps = getDeps();
    return deps.sqliteWasm.call(() => sqlite3_get_autocommit(deps)(db) !== 0);
  },

  /** Takes a slot's sync access handle, as another context would. */
  holdSlot: async (directory: OpfsName, fileName: string): Promise<void> => {
    const opaque = await getOpaqueDirectory(directory);
    heldSlot = await (
      await opaque.getFileHandle(fileName)
    ).createSyncAccessHandle();
  },

  releaseSlot: (): void => {
    heldSlot?.close();
    heldSlot = null;
  },

  /**
   * Whether every slot of the pool can be acquired, which it then releases, so
   * no context holds any. Other failures throw.
   */
  canAcquireSlots: async (directory: OpfsName): Promise<boolean> => {
    const opaque = await getOpaqueDirectory(directory);
    for await (const entry of opaque.values()) {
      if (entry.kind !== "file") continue;
      try {
        (await entry.createSyncAccessHandle()).close();
      } catch (error) {
        // WebKit rejects a held file with InvalidStateError, other engines
        // with NoModificationAllowedError, as the spec says
        // (https://bugs.webkit.org/show_bug.cgi?id=326135).
        if (
          error instanceof DOMException &&
          (error.name === "NoModificationAllowedError" ||
            error.name === "InvalidStateError")
        )
          return false;
        throw error;
      }
    }
    return true;
  },

  /** Writes bytes to a slot at offset 0, as another implementation would. */
  writeSlot: async (
    directory: OpfsName,
    fileName: string,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<void> => {
    const opaque = await getOpaqueDirectory(directory);
    const handle = await (
      await opaque.getFileHandle(fileName)
    ).createSyncAccessHandle();
    try {
      if (handle.write(bytes, { at: 0 }) !== bytes.length)
        throw new Error(`Cannot write ${fileName}.`);
      handle.flush();
    } finally {
      handle.close();
    }
  },

  /**
   * Takes the Web Lock, as Evolu's DbWorker does for a database, and holds it
   * until the worker ends.
   */
  holdLock: (name: string): Promise<void> =>
    new Promise((granted) => {
      void navigator.locks.request(name, () => {
        granted();
        // Never settles, so the lock is held until the worker ends.
        return new Promise<never>(() => {
          // Nothing to do.
        });
      });
    }),

  /** Closes the worker once it has answered, as a worker that ends itself. */
  closeWorker: (): void => {
    setTimeout(() => {
      close();
    }, 0);
  },

  /** Whether SQLite has a VFS of the name. */
  findVfs: (vfsName: string): boolean => {
    const deps = getDeps();
    return deps.sqliteWasm.call(
      () => sqlite3_vfs_find(deps)(cString(vfsName)) !== 0,
    );
  },
};

/** The steps the worker runs, by name. */
export type HarnessSteps = typeof steps;

serveSteps(
  Object.fromEntries(
    Object.entries(steps).map(([name, step]) => {
      const runStep: (...args: Array<never>) => unknown = step;
      return [
        name,
        async (...args: Array<never>) => {
          const value = await runStep(...args);
          const defects = loaded?.reportDefect.getDefects() ?? [];
          if (defects.length > 0)
            throw new Error(`The binary reported a defect by step ${name}.`, {
              cause: defects,
            });
          return value;
        },
      ];
    }),
  ),
);
