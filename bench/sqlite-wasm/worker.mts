/**
 * The worker side of the SQLite Wasm benchmark.
 *
 * Each stack has a worker module that calls {@link serveBenchStack} with a
 * function creating its {@link BenchStack}. The worker then answers the runner's
 * {@link BenchRequest}s, one at a time: it opens the stack in a directory of its
 * own, runs the whole workload on a fresh database per run, timing each
 * workload around {@link BenchDatabase.exec} only, and disposes the stack.
 *
 * The worker also counts the flushes and written bytes each workload asks of
 * OPFS, by wrapping the methods of `FileSystemSyncAccessHandle` that every
 * stack's VFS calls.
 *
 * @module
 */

import {
  array,
  Boolean,
  type InferType,
  nullOr,
  Number,
  object,
  record,
  String,
} from "@evolu/common";
import {
  contentChecksumSql,
  plaintextMarker,
  preamble,
  recordedPragmas,
  workloads,
  workloadsPath,
} from "./workload.mts";

/** A SQLite stack: a build, its JavaScript layer and a VFS on OPFS. */
export interface BenchStack {
  /** Opens a new database file in the stack's directory. */
  readonly openDatabase: (name: string) => Promise<BenchDatabase>;

  /**
   * Returns a closed database's whole file as stored, which is ciphertext in an
   * encrypted database, or null when the stack cannot read it.
   */
  readonly readFile: (name: string) => Promise<Uint8Array | null>;

  /** Deletes a closed database's files. */
  readonly deleteDatabase: (name: string) => Promise<void>;

  /** Closes the stack's files, such as a pool's handles. */
  readonly dispose: () => Promise<void>;
}

/** An open database of a {@link BenchStack}. */
export interface BenchDatabase {
  /**
   * Runs SQL of any number of statements, each to completion, discarding rows,
   * with the stack's own multi-statement API. The benchmark times this call.
   */
  readonly exec: (sql: string) => void | Promise<void>;

  /** Returns the first column of a query's first row. */
  readonly selectValue: (sql: string) => Promise<unknown>;

  readonly close: () => Promise<void>;
}

/** Options of a stack, which its worker module interprets. */
export type BenchStackOptions = Readonly<Record<string, string>>;

/** What a {@link CreateBenchStack} function gets. */
export interface CreateBenchStackOptions {
  /** A directory of the stack's own under the OPFS root. */
  readonly directory: string;
  readonly options: BenchStackOptions;
  /** Where the wa-sqlite clone is served, ending with a slash. */
  readonly waSqliteUrl: string;
}

/** Creates a stack, which keeps its files in its directory. */
export type CreateBenchStack = (
  options: CreateBenchStackOptions,
) => Promise<BenchStack>;

/** A request from the runner. */
export type BenchRequest =
  | {
      readonly type: "Open";
      readonly stack: CreateBenchStackOptions;
      /**
       * SQL each database runs right after opening, before the preamble and
       * outside the timed region, such as a pragma a variant of a stack sets.
       */
      readonly connectionSql: string;
    }
  | {
      readonly type: "Run";
      /** The name of the run's fresh database file. */
      readonly name: string;
      /** Whether to checksum the tables before the last workload drops them. */
      readonly verifyContent: boolean;
    }
  | { readonly type: "Dispose" };

/** The answer to a {@link BenchRequest}. */
export type BenchResponse =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

/** What an Open request returns. */
export const BenchOpenResult = /*#__PURE__*/ object({
  userAgent: String,
  /**
   * Whether the worker is cross-origin isolated, which makes engines time with
   * microseconds instead of a tenth of a millisecond or a millisecond.
   */
  crossOriginIsolated: Boolean,
  /** The smallest step of `performance.now()` the worker observed. */
  timerResolutionMs: Number,
});
export interface BenchOpenResult extends InferType<typeof BenchOpenResult> {}

/** What a workload asked of OPFS. */
export const BenchIo = /*#__PURE__*/ object({
  /** Calls of `FileSystemSyncAccessHandle.flush`. */
  flushes: Number,
  /** Bytes passed to `FileSystemSyncAccessHandle.write`. */
  writtenBytes: Number,
});
export interface BenchIo extends InferType<typeof BenchIo> {}

/** A summary of a closed database's file as stored. */
export const BenchFile = /*#__PURE__*/ object({
  byteLength: Number,
  /** The share of zero bytes, about 1/256 in an encrypted file. */
  zeroByteShare: Number,
  /**
   * Where SQLite's header, `SQLite format 3` and a NUL, occurs: at 0 only in a
   * plaintext file, and nowhere in an encrypted one.
   */
  sqliteHeaderOffsets: /*#__PURE__*/ array(Number),
  /** Whether the file contains {@link plaintextMarker}. */
  containsPlaintextMarker: Boolean,
});
export interface BenchFile extends InferType<typeof BenchFile> {}

/** What a Run request returns. */
export const BenchRunResult = /*#__PURE__*/ object({
  sqliteVersion: String,
  /** `PRAGMA compile_options` of the stack's build. */
  compileOptions: /*#__PURE__*/ array(String),
  /** The pragmas after the preamble, as the stack defaults them. */
  pragmas: /*#__PURE__*/ record(String, String),
  /** The duration of each workload, in order. */
  durationsMs: /*#__PURE__*/ array(Number),
  /** `total_changes()` after each workload. */
  totalChanges: /*#__PURE__*/ array(Number),
  /** What each workload asked of OPFS, in order. */
  io: /*#__PURE__*/ array(BenchIo),
  /** {@link contentChecksumSql} before the last workload, when requested. */
  contentChecksum: /*#__PURE__*/ nullOr(String),
  /** The number of schema objects after the last workload. */
  schemaObjectsAfter: Number,
  /** The database's file, or null when the stack cannot read it. */
  file: /*#__PURE__*/ nullOr(BenchFile),
});
export interface BenchRunResult extends InferType<typeof BenchRunResult> {}

/** Answers the runner's requests with the stack the function creates. */
export const serveBenchStack = (createStack: CreateBenchStack): void => {
  // Counted for the whole worker, which runs one workload at a time, so the
  // difference around a workload is that workload's.
  const ioCounts: IoCounts = { flushes: 0, writtenBytes: 0 };
  let stack: BenchStack | null = null;
  let workloadSql: ReadonlyArray<string> | null = null;
  let connectionSql = "";
  // Each request starts when the previous one settles.
  let queue: Promise<void> = Promise.resolve();

  const syncAccessHandlePrototype = FileSystemSyncAccessHandle.prototype;
  // oxlint-disable-next-line typescript/unbound-method -- The wrappers call them with their handle.
  const { flush, write } = syncAccessHandlePrototype;
  // Functions, as the methods get their handle as `this`.
  syncAccessHandlePrototype.flush = function (
    this: FileSystemSyncAccessHandle,
  ) {
    ioCounts.flushes++;
    flush.call(this);
  };
  syncAccessHandlePrototype.write = function (
    this: FileSystemSyncAccessHandle,
    buffer,
    options,
  ) {
    ioCounts.writtenBytes += buffer.byteLength;
    return write.call(this, buffer, options);
  };

  const handle = async (request: BenchRequest): Promise<unknown> => {
    switch (request.type) {
      case "Open": {
        workloadSql = await Promise.all(
          workloads.map(async (workload) => {
            const response = await fetch(
              `${request.stack.waSqliteUrl}${workloadsPath}${workload.file}`,
            );
            if (!response.ok)
              throw new Error(
                `Cannot fetch ${workload.file} (${response.status}).`,
              );
            return response.text();
          }),
        );
        connectionSql = request.connectionSql;
        stack = await createStack(request.stack);
        return {
          userAgent: navigator.userAgent,
          crossOriginIsolated,
          timerResolutionMs: measureTimerResolution(),
        } satisfies BenchOpenResult;
      }
      case "Run": {
        if (stack == null || workloadSql == null)
          throw new Error("The stack is not open.");
        return runWorkloads(
          stack,
          workloadSql,
          connectionSql,
          ioCounts,
          request,
        );
      }
      case "Dispose": {
        await stack?.dispose();
        stack = null;
        return null;
      }
    }
  };

  addEventListener("message", (event: MessageEvent<BenchRequest>) => {
    queue = queue.then(async () => {
      try {
        postMessage({
          ok: true,
          value: await handle(event.data),
        } satisfies BenchResponse);
      } catch (error) {
        postMessage({
          ok: false,
          error:
            error instanceof Error
              ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
              : globalThis.String(error),
        } satisfies BenchResponse);
      }
    });
  });
};

const runWorkloads = async (
  stack: BenchStack,
  workloadSql: ReadonlyArray<string>,
  connectionSql: string,
  ioCounts: IoCounts,
  { name, verifyContent }: { name: string; verifyContent: boolean },
): Promise<BenchRunResult> => {
  const database = await stack.openDatabase(name);
  let result: Omit<BenchRunResult, "file">;
  try {
    if (connectionSql !== "") await database.exec(connectionSql);
    await database.exec(preamble);
    const sqliteVersion = globalThis.String(
      await database.selectValue("SELECT sqlite_version()"),
    );
    // An option such as COMPILER can contain spaces.
    const compileOptions = globalThis
      .String(
        await database.selectValue(
          "SELECT group_concat(compile_options, char(10)) FROM pragma_compile_options",
        ),
      )
      .split("\n");
    const pragmas: Record<string, string> = {};
    for (const pragma of recordedPragmas)
      pragmas[pragma] = globalThis.String(
        await database.selectValue(`PRAGMA ${pragma}`),
      );

    const durationsMs: Array<number> = [];
    const totalChanges: Array<number> = [];
    const io: Array<BenchIo> = [];
    let contentChecksum: string | null = null;
    for (const [index, sql] of workloadSql.entries()) {
      // Before the last workload, which drops the tables.
      if (verifyContent && index === workloadSql.length - 1)
        contentChecksum = globalThis.String(
          await database.selectValue(contentChecksumSql),
        );

      const ioBefore = { ...ioCounts };
      const start = performance.now();
      const executed = database.exec(sql);
      // Synchronous stacks are timed without awaiting a microtask.
      if (executed instanceof Promise) await executed;
      durationsMs.push(performance.now() - start);
      io.push({
        flushes: ioCounts.flushes - ioBefore.flushes,
        writtenBytes: ioCounts.writtenBytes - ioBefore.writtenBytes,
      });

      totalChanges.push(
        globalThis.Number(await database.selectValue("SELECT total_changes()")),
      );
    }
    const schemaObjectsAfter = globalThis.Number(
      await database.selectValue("SELECT count(*) FROM sqlite_schema"),
    );
    result = {
      sqliteVersion,
      compileOptions,
      pragmas,
      durationsMs,
      totalChanges,
      io,
      contentChecksum,
      schemaObjectsAfter,
    };
  } finally {
    await database.close();
  }
  const file = await stack.readFile(name);
  await stack.deleteDatabase(name);
  return { ...result, file: file == null ? null : summarizeFile(file) };
};

const summarizeFile = (bytes: Uint8Array): BenchFile => {
  let zeroBytes = 0;
  for (const byte of bytes) if (byte === 0) zeroBytes++;
  // A single-byte encoding, so offsets in the text are offsets in the file.
  const text = new TextDecoder("latin1").decode(bytes);
  const sqliteHeaderOffsets: Array<number> = [];
  for (
    let offset = text.indexOf(sqliteHeader);
    offset !== -1;
    offset = text.indexOf(sqliteHeader, offset + 1)
  )
    sqliteHeaderOffsets.push(offset);
  return {
    byteLength: bytes.length,
    zeroByteShare: bytes.length === 0 ? 0 : zeroBytes / bytes.length,
    sqliteHeaderOffsets,
    containsPlaintextMarker: text.includes(plaintextMarker),
  };
};

const sqliteHeader = "SQLite format 3\0";

/**
 * Returns the smallest step of `performance.now()` among the first 20 steps or
 * within 100 ms, because engines coarsen it without cross-origin isolation.
 */
const measureTimerResolution = (): number => {
  const start = performance.now();
  let previous = start;
  let smallest = Infinity;
  let steps = 0;
  while (steps < 20) {
    const now = performance.now();
    if (now !== previous) {
      smallest = Math.min(smallest, now - previous);
      previous = now;
      steps++;
    }
    if (now - start > 100) break;
  }
  return smallest;
};

/** Running totals of {@link BenchIo}, which the worker increments. */
interface IoCounts {
  flushes: number;
  writtenBytes: number;
}
