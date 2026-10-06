/**
 * Runs `@evolu/sqlite-wasm` in module workers for the browser tests.
 *
 * `FileSystemSyncAccessHandle` exists only in dedicated workers, except in
 * WebKit, so each test starts workers with {@link setupSqliteWorker} and sends
 * them steps. A test that needs two contexts, such as a held slot or a crash,
 * starts two workers and ends one with {@link SqliteWorker.terminate}, as
 * closing a tab does. {@link setupSqliteJsWorker} starts a worker running
 * SQLite's own JavaScript of `@evolu/sqlite-wasm` 2.2.4 instead.
 *
 * @module
 */

import { assertEqual, type Result } from "@evolu/common";
import {
  SQLITE_OK,
  type SqliteResultCode,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import type {
  SqliteDbPtr,
  SqliteStmtPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import {
  computeSahPoolDigest,
  OpfsName,
  sahPoolHeaderCorpusSize,
  sahPoolHeaderDigestOffset,
  sahPoolHeaderFlagsOffset,
  sahPoolHeaderSize,
  sahPoolOpaqueDirectoryName,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import type { HarnessSteps } from "./_harness.worker.ts";
import type { SqliteJsSteps } from "./_sqliteJs.worker.ts";
import type { WorkerSteps } from "./_serve.ts";

/**
 * Returns the value of an Ok, or throws with the error in the message, which
 * `getOrThrow` keeps only as a cause that Vitest does not print.
 */
export const okOrThrow = <T, E>(result: Result<T, E>): T => {
  if (result.ok) return result.value;
  throw new Error(`Expected an Ok result: ${JSON.stringify(result.error)}`);
};

/**
 * Returns the message of the error a step rejected with, or null when it
 * resolved, for steps that throw, as SQLite's JavaScript does.
 */
export const catchRejection = async (
  step: Promise<unknown>,
): Promise<string | null> => {
  try {
    await step;
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/**
 * A pool directory of its own under the OPFS root, which disposing removes.
 *
 * Every test uses one, because the tests share the browser's OPFS: the profile
 * persists, and on macOS, Playwright's WebKit keeps OPFS outside the profile.
 */
export interface PoolDirectory extends AsyncDisposable {
  readonly directory: OpfsName;
}

/**
 * Names a unique pool directory, which disposing removes once no worker holds
 * its files, retrying while a terminated worker still does.
 */
export const setupPoolDirectory = (): PoolDirectory => {
  const directory = OpfsName.orThrow(`sqlite-wasm-test-${crypto.randomUUID()}`);
  return {
    directory,
    [Symbol.asyncDispose]: async () => {
      const root = await navigator.storage.getDirectory();
      for (let attempt = 1; ; attempt++) {
        try {
          await root.removeEntry(directory, { recursive: true });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "NotFoundError")
            return;
          if (attempt === 100) throw error;
          await new Promise((resolve) => {
            setTimeout(resolve, 50);
          });
        }
      }
    },
  };
};

/**
 * Reads every slot file of a pool through OPFS on the page, which sees what a
 * worker flushed, also while the worker holds the files.
 */
export const readSlots = async (
  directory: OpfsName,
): Promise<ReadonlyMap<string, Uint8Array<ArrayBuffer>>> => {
  let handle = await navigator.storage.getDirectory();
  for (const name of [directory, sahPoolOpaqueDirectoryName])
    handle = await handle.getDirectoryHandle(name);
  const slots = new Map<string, Uint8Array<ArrayBuffer>>();
  for await (const entry of handle.values())
    if (entry.kind === "file")
      slots.set(
        entry.name,
        new Uint8Array(await (await entry.getFile()).arrayBuffer()),
      );
  return slots;
};

/** Returns the names of the entries of a pool directory, sorted. */
export const readPoolEntries = async (
  directory: OpfsName,
): Promise<ReadonlyArray<string>> => {
  const handle = await (
    await navigator.storage.getDirectory()
  ).getDirectoryHandle(directory);
  const names: Array<string> = [];
  for await (const entry of handle.values()) names.push(entry.name);
  return names.toSorted();
};

/** Decodes the NUL-padded path at the start of a slot's header. */
export const slotPath = (bytes: Uint8Array): string =>
  new TextDecoder().decode(bytes.subarray(0, bytes.indexOf(0)));

/** Returns the slot of {@link readSlots} that maps the path, by file name. */
export const findSlot = (
  slots: ReadonlyMap<string, Uint8Array<ArrayBuffer>>,
  path: string,
): readonly [string, Uint8Array<ArrayBuffer>] => {
  const slot = [...slots].find(([, bytes]) => slotPath(bytes) === path);
  if (slot == null) throw new Error(`No slot maps ${path}.`);
  return slot;
};

/**
 * Returns the header opfs-sahpool writes for a path: the path, the big-endian
 * flags and the digest, which is `[0, 0]` for flags without
 * `sahPoolDigestV2Flag`, as opfs-sahpool wrote before SQLite 3.50.
 */
export const createSlotHeader = (
  path: string,
  flags: number,
): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(sahPoolHeaderSize);
  new TextEncoder().encodeInto(path, bytes);
  new DataView(bytes.buffer).setUint32(sahPoolHeaderFlagsOffset, flags);
  bytes.set(
    new Uint8Array(
      computeSahPoolDigest(bytes.subarray(0, sahPoolHeaderCorpusSize), flags)
        .buffer,
    ),
    sahPoolHeaderDigestOffset,
  );
  return bytes;
};

/**
 * Waits until no context holds a slot of the pool, as after a worker ended by
 * {@link SqliteWorker.terminate}, for up to five seconds. SQLite's JavaScript
 * must not open a held pool, because it then removes the pool directory.
 */
export const waitForReleasedSlots = async (
  directory: OpfsName,
): Promise<void> => {
  using prober = await setupSqliteWorker();
  for (let attempt = 1; ; attempt++) {
    if (await prober.run("canAcquireSlots", directory)) return;
    if (attempt === 100)
      throw new Error(`The files of ${directory} stay held.`);
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
};

/**
 * A module worker, or a SharedWorker, running the steps of its module, such as
 * {@link HarnessSteps}.
 */
export interface HarnessWorker<Steps extends WorkerSteps> extends Disposable {
  /**
   * Runs a step in the worker and returns what it returned, or rejects with the
   * error it threw.
   */
  readonly run: <K extends keyof Steps & string>(
    step: K,
    ...args: Parameters<Steps[K]>
  ) => Promise<Awaited<ReturnType<Steps[K]>>>;

  /**
   * Ends the worker without disposing anything, as closing its tab does, and
   * rejects the steps still running. A SharedWorker, which cannot be
   * terminated, is asked to close itself.
   */
  readonly terminate: () => void;
}

/** A module worker running {@link HarnessSteps}. */
export interface SqliteWorker extends HarnessWorker<HarnessSteps> {}

/**
 * A module worker running SQLite's own JavaScript, as `@evolu/sqlite-wasm`
 * 2.2.4 ships it, through {@link SqliteJsSteps}.
 */
export interface SqliteJsWorker extends HarnessWorker<SqliteJsSteps> {}

/** A step request, which the worker answers with a {@link HarnessResponse}. */
export interface HarnessRequest {
  readonly id: number;
  readonly step: string;
  readonly args: ReadonlyArray<unknown>;
}

/** A step's result, or the error it threw. */
export type HarnessResponse =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | {
      readonly id: number;
      readonly ok: false;
      readonly error: {
        readonly name: string;
        readonly message: string;
        readonly stack: string | undefined;
      };
    };

/**
 * Starts a module worker that loads the binary, or, with `shared`, a
 * SharedWorker of its own.
 */
export const setupSqliteWorker = async ({
  shared = false,
}: { shared?: boolean } = {}): Promise<SqliteWorker> => {
  const worker = connectWorker<HarnessSteps>(
    shared
      ? new SharedWorker(new URL("./_harness.worker.ts", import.meta.url), {
          type: "module",
          name: crypto.randomUUID(),
        })
      : new Worker(new URL("./_harness.worker.ts", import.meta.url), {
          type: "module",
        }),
  );
  try {
    await worker.run("load", crypto.randomUUID());
  } catch (error) {
    worker.terminate();
    throw error;
  }
  return worker;
};

/** Starts a module worker that loads SQLite's JavaScript of 2.2.4. */
export const setupSqliteJsWorker = async (): Promise<SqliteJsWorker> => {
  const worker = connectWorker<SqliteJsSteps>(
    new Worker(new URL("./_sqliteJs.worker.ts", import.meta.url), {
      type: "module",
    }),
  );
  try {
    await worker.run("load");
  } catch (error) {
    worker.terminate();
    throw error;
  }
  return worker;
};

/** Sends steps to a worker that serves them with `serveSteps`. */
export const connectWorker = <Steps extends WorkerSteps>(
  worker: Worker | SharedWorker,
): HarnessWorker<Steps> => {
  const port = worker instanceof Worker ? worker : worker.port;
  let nextId = 0;
  const pending = new Map<
    number,
    {
      readonly resolve: (value: unknown) => void;
      readonly reject: (error: Error) => void;
    }
  >();

  const rejectAll = (error: Error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };

  port.addEventListener("message", (event) => {
    const { data } = event as MessageEvent<HarnessResponse>;
    const call = pending.get(data.id);
    if (call == null) return;
    pending.delete(data.id);
    if (data.ok) {
      call.resolve(data.value);
      return;
    }
    const error = new Error(data.error.message);
    error.name = data.error.name;
    if (data.error.stack != null) error.stack = data.error.stack;
    call.reject(error);
  });
  if (port instanceof MessagePort) port.start();
  // A worker module that fails to load reports only an ErrorEvent.
  worker.addEventListener("error", (event) => {
    rejectAll(
      new Error(
        `The worker failed: ${event instanceof ErrorEvent ? event.message : event.type}`,
      ),
    );
  });

  const terminate = () => {
    if (worker instanceof Worker) worker.terminate();
    else {
      worker.port.postMessage({
        id: -1,
        step: "closeWorker",
        args: [],
      } satisfies HarnessRequest);
      worker.port.close();
    }
    rejectAll(new Error("The worker was terminated."));
  };

  return {
    run: (step, ...args) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        port.postMessage({ id, step, args } satisfies HarnessRequest);
      }),
    terminate,
    [Symbol.dispose]: terminate,
  };
};

/**
 * The rows of table t and how many of them are unchanged, such as `300:300`,
 * where each row's v started as `zeroblob(3000)`.
 */
export const snapshotSql =
  "SELECT count(*) || ':' || sum(v = zeroblob(3000)) FROM t";

/**
 * Helpers that run C API steps on connections to a pool's VFS in the worker,
 * for scenarios that need several connections, read-only ones or result codes.
 */
export interface Connections {
  /**
   * Opens a connection to the path, `/test.db` by default, read-write unless
   * the flags say otherwise, failing the test unless it opens.
   */
  readonly connect: (flags?: number, path?: string) => Promise<SqliteDbPtr>;

  /** Runs SQL with `sqlite3_exec` and returns its result code. */
  readonly exec: (sql: string, db: SqliteDbPtr) => Promise<SqliteResultCode>;

  /** Returns the first column of a query's first row as text. */
  readonly selectText: (sql: string, db: SqliteDbPtr) => Promise<string | null>;

  /** Returns {@link snapshotSql} of a connection. */
  readonly snapshot: (db: SqliteDbPtr) => Promise<string | null>;

  readonly integrity: (db: SqliteDbPtr) => Promise<string | null>;

  /** Returns the pool's paths, sorted. */
  readonly getPaths: () => Promise<ReadonlyArray<string>>;

  readonly hasJournal: () => Promise<boolean>;

  /** Closes a connection, failing the test unless it closes fully. */
  readonly close: (db: SqliteDbPtr) => Promise<void>;

  readonly prepare: (sql: string, db: SqliteDbPtr) => Promise<SqliteStmtPtr>;

  /**
   * Steps a statement up to the given number of rows, or to its end, and
   * returns how many of them have 1 in the first column.
   */
  readonly step: (stmt: SqliteStmtPtr, rows?: number) => Promise<number>;

  readonly finalize: (stmt: SqliteStmtPtr) => Promise<SqliteResultCode>;
}

/** Creates {@link Connections} to the pool a worker has open in a directory. */
export const createConnections = (
  worker: SqliteWorker,
  directory: OpfsName,
  vfsName: string,
): Connections => ({
  connect: async (flags, path = "/test.db") => {
    const { rc, db } = await (flags == null
      ? worker.run("connect", vfsName, path)
      : worker.run("connect", vfsName, path, flags));
    assertEqual(rc, SQLITE_OK);
    return db;
  },
  exec: (sql, db) => worker.run("execSql", db, sql),
  selectText: (sql, db) => worker.run("selectText", db, sql),
  snapshot: (db) => worker.run("selectText", db, snapshotSql),
  integrity: (db) => worker.run("selectText", db, "PRAGMA integrity_check"),
  getPaths: async () => (await worker.run("getPaths", directory)).toSorted(),
  hasJournal: async () =>
    (await worker.run("getPaths", directory)).includes("/test.db-journal"),
  close: async (db) => {
    assertEqual(await worker.run("close", db), SQLITE_OK);
  },
  prepare: (sql, db) => worker.run("prepareStatement", db, sql),
  step: (stmt, rows) =>
    rows == null
      ? worker.run("stepRows", stmt)
      : worker.run("stepRows", stmt, rows),
  finalize: (stmt) => worker.run("finalizeStatement", stmt),
});
