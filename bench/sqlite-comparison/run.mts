/**
 * One run of a stack, which the Node.js children, the web workers and the React
 * Native app share, so every platform runs and times the workloads the same
 * way. It imports nothing platform-specific.
 *
 * A stack adapts its library to {@link BenchApi}. A run drives that API with the
 * same loops for every stack, timing only the loops: synchronous loops for a
 * synchronous API, so no stack pays for promises it doesn't use, and awaited
 * ones for an asynchronous API.
 *
 * @module
 */

import {
  contentChecksumSql,
  plaintextMarker,
} from "../sqlite-wasm/workload.mts";
import {
  connectionPragmas,
  createDriverPointSelectKeys,
  driverCreateSql,
  driverInsertSql,
  driverPointSelectCount,
  driverRowCount,
  driverSelectAllCount,
  driverSelectAllSql,
  driverSelectByKeySql,
  driverValue,
  recordedPragmas,
} from "./workload.mts";

/** A value a statement binds. */
export type BenchValue = null | number | string | Uint8Array;

/** A library's API, as a stack adapts it. */
export type BenchApi = BenchSyncApi | BenchAsyncApi;

export interface BenchSyncApi {
  readonly type: "Sync";
  /**
   * Runs one statement once with the library's cheapest way to do so, steps it
   * to completion and discards its rows.
   */
  readonly runOnce: (sql: string) => void;
  /** Returns the first column of the first row, or null without a row. */
  readonly selectValue: (sql: string) => unknown;
  readonly prepare: (sql: string) => BenchSyncStatement;
}

export interface BenchSyncStatement {
  readonly run: (parameters: ReadonlyArray<BenchValue>) => void;
  /** Returns the first row, in the library's row form, or undefined. */
  readonly get: (parameters: ReadonlyArray<BenchValue>) => unknown;
  /** Returns every row, in the library's row form. */
  readonly all: (
    parameters: ReadonlyArray<BenchValue>,
  ) => ReadonlyArray<unknown>;
  readonly finalize: () => void;
}

export interface BenchAsyncApi {
  readonly type: "Async";
  readonly runOnce: (sql: string) => Promise<void>;
  readonly selectValue: (sql: string) => Promise<unknown>;
  readonly prepare: (sql: string) => Promise<BenchAsyncStatement>;
}

export interface BenchAsyncStatement {
  readonly run: (parameters: ReadonlyArray<BenchValue>) => Promise<void>;
  readonly get: (parameters: ReadonlyArray<BenchValue>) => Promise<unknown>;
  readonly all: (
    parameters: ReadonlyArray<BenchValue>,
  ) => Promise<ReadonlyArray<unknown>>;
  readonly finalize: () => Promise<void>;
}

/** A SQLite stack: a library, its build of SQLite and a file system. */
export interface BenchStack {
  /** Opens a new database file. */
  readonly openDatabase: (name: string) => Promise<BenchDatabase>;
  /**
   * Returns a closed database's whole file as stored, which is ciphertext in an
   * encrypted database, or null when the stack can't read it.
   */
  readonly readFile: (name: string) => Promise<Uint8Array | null>;
  /** Deletes a closed database's files. */
  readonly deleteDatabase: (name: string) => Promise<void>;
  readonly dispose: () => Promise<void>;
}

export interface BenchDatabase {
  readonly api: BenchApi;
  readonly close: () => Promise<void>;
}

/** What a run gets besides its stack. */
export interface BenchRunInput {
  /** The name of the run, which its databases' file names start with. */
  readonly name: string;
  /** The statements of each workload, in order. */
  readonly workloads: ReadonlyArray<ReadonlyArray<string>>;
  readonly encrypted: boolean;
  /** Whether to checksum the tables before the last workload drops them. */
  readonly verifyContent: boolean;
}

/** A summary of a closed database's file as stored. */
export interface BenchFile {
  readonly byteLength: number;
  /** The share of zero bytes, about 1/256 in an encrypted file. */
  readonly zeroByteShare: number;
  /**
   * Where SQLite's header, `SQLite format 3` and a NUL, occurs: at 0 only in a
   * plaintext file, and nowhere in an encrypted one.
   */
  readonly sqliteHeaderOffsets: ReadonlyArray<number>;
  /** Whether the file contains the workloads' text. */
  readonly containsPlaintextMarker: boolean;
}

/** What a run returns, as plain data. */
export interface BenchRunOutput {
  readonly sqliteVersion: string;
  /**
   * `sqlite_source_id()`, which tells builds apart when an app links several:
   * `sqlite_version()` reads the global `sqlite3_version`, which another SQLite
   * in the app can define.
   */
  readonly sqliteSourceId: string;
  readonly compileOptions: ReadonlyArray<string>;
  readonly pragmas: Readonly<Record<string, string>>;
  /** The duration of each workload, in order. */
  readonly workloadMs: ReadonlyArray<number>;
  /** `total_changes()` after each workload. */
  readonly totalChanges: ReadonlyArray<number>;
  readonly contentChecksum: string | null;
  /** The number of schema objects after the last workload. */
  readonly schemaObjectsAfter: number;
  /** The workloads' database file, or null when the stack can't read it. */
  readonly file: BenchFile | null;
  /** The duration of each driver operation. */
  readonly driverMs: {
    readonly insert: number;
    readonly selectByKey: number;
    readonly selectAll: number;
  };
}

/**
 * Runs the workloads on a fresh database and the driver workload on another,
 * and deletes both. It throws when the driver workload reads anything other
 * than what it wrote; the caller checks the rest against its reference.
 */
export const runBench = async (
  stack: BenchStack,
  { name, workloads, encrypted, verifyContent }: BenchRunInput,
): Promise<BenchRunOutput> => {
  const workloadsName = `${name}.db`;
  const database = await stack.openDatabase(workloadsName);
  let result: Omit<BenchRunOutput, "file" | "driverMs">;
  try {
    const { api } = database;
    for (const pragma of connectionPragmas(encrypted))
      await api.runOnce(pragma);
    const sqliteVersion = String(
      await api.selectValue("SELECT sqlite_version()"),
    );
    const sqliteSourceId = String(
      await api.selectValue("SELECT sqlite_source_id()"),
    );
    // An option such as COMPILER can contain spaces.
    const compileOptions = String(
      await api.selectValue(
        "SELECT group_concat(compile_options, char(10)) FROM pragma_compile_options",
      ),
    ).split("\n");
    const pragmas: Record<string, string> = {};
    for (const pragma of recordedPragmas)
      pragmas[pragma] = String(await api.selectValue(`PRAGMA ${pragma}`));

    const workloadMs: Array<number> = [];
    const totalChanges: Array<number> = [];
    let contentChecksum: string | null = null;
    for (const [index, statements] of workloads.entries()) {
      // Before the last workload, which drops the tables.
      if (verifyContent && index === workloads.length - 1)
        contentChecksum = String(await api.selectValue(contentChecksumSql));
      workloadMs.push(await timeStatements(api, statements));
      totalChanges.push(
        Number(await api.selectValue("SELECT total_changes()")),
      );
    }
    result = {
      sqliteVersion,
      sqliteSourceId,
      compileOptions,
      pragmas,
      workloadMs,
      totalChanges,
      contentChecksum,
      schemaObjectsAfter: Number(
        await api.selectValue("SELECT count(*) FROM sqlite_schema"),
      ),
    };
  } finally {
    await database.close();
  }
  const file = await stack.readFile(workloadsName);
  await stack.deleteDatabase(workloadsName);

  const driverName = `${name}-driver.db`;
  const driverDatabase = await stack.openDatabase(driverName);
  let driverMs: BenchRunOutput["driverMs"];
  try {
    driverMs = await runDriver(driverDatabase.api, encrypted);
  } finally {
    await driverDatabase.close();
  }
  await stack.deleteDatabase(driverName);

  return {
    ...result,
    file: file == null ? null : summarizeFile(file),
    driverMs,
  };
};

const timeStatements = async (
  api: BenchApi,
  statements: ReadonlyArray<string>,
): Promise<number> => {
  if (api.type === "Sync") {
    const start = performance.now();
    for (const statement of statements) api.runOnce(statement);
    return performance.now() - start;
  }
  const start = performance.now();
  for (const statement of statements) await api.runOnce(statement);
  return performance.now() - start;
};

const runDriver = async (
  api: BenchApi,
  encrypted: boolean,
): Promise<BenchRunOutput["driverMs"]> => {
  for (const pragma of connectionPragmas(encrypted)) await api.runOnce(pragma);
  await api.runOnce(driverCreateSql);
  const rows: ReadonlyArray<ReadonlyArray<BenchValue>> = Array.from(
    { length: driverRowCount },
    (_, index) => [index + 1, driverValue(index + 1)],
  );
  const pointSelectKeys = createDriverPointSelectKeys();
  const keys = pointSelectKeys.map((key) => [key]);

  const insert = await api.prepare(driverInsertSql);
  const selectByKey = await api.prepare(driverSelectByKeySql);
  const selectAll = await api.prepare(driverSelectAllSql);
  // What the reads read, checked after their timed regions. The loops read
  // every column they select, as an app would, so a library whose rows
  // convert their values only when read, as op-sqlite's prepared statements'
  // do, does that work in the timed region too.
  const values: Array<unknown> = [];
  const totals = { rows: 0, keys: 0, valueLengths: 0 };
  const readRows = (rows: ReadonlyArray<unknown>) => {
    for (const row of rows) {
      totals.keys += column(row, "key", 0) as number;
      totals.valueLengths += (column(row, "value", 1) as string).length;
    }
    totals.rows += rows.length;
  };
  let insertMs: number;
  let selectByKeyMs: number;
  let selectAllMs: number;

  await api.runOnce("BEGIN");
  if (api.type === "Sync") {
    const syncInsert = insert as BenchSyncStatement;
    const syncSelectByKey = selectByKey as BenchSyncStatement;
    const syncSelectAll = selectAll as BenchSyncStatement;
    let start = performance.now();
    for (const row of rows) syncInsert.run(row);
    insertMs = performance.now() - start;
    api.runOnce("COMMIT");
    api.runOnce("BEGIN");

    start = performance.now();
    for (const key of keys)
      values.push(column(syncSelectByKey.get(key), "value", 0));
    selectByKeyMs = performance.now() - start;

    start = performance.now();
    for (let read = 0; read < driverSelectAllCount; read++)
      readRows(syncSelectAll.all([]));
    selectAllMs = performance.now() - start;
    api.runOnce("COMMIT");
  } else {
    const asyncInsert = insert as BenchAsyncStatement;
    const asyncSelectByKey = selectByKey as BenchAsyncStatement;
    const asyncSelectAll = selectAll as BenchAsyncStatement;
    let start = performance.now();
    for (const row of rows) await asyncInsert.run(row);
    insertMs = performance.now() - start;
    await api.runOnce("COMMIT");
    await api.runOnce("BEGIN");

    start = performance.now();
    for (const key of keys)
      values.push(column(await asyncSelectByKey.get(key), "value", 0));
    selectByKeyMs = performance.now() - start;

    start = performance.now();
    for (let read = 0; read < driverSelectAllCount; read++)
      readRows(await asyncSelectAll.all([]));
    selectAllMs = performance.now() - start;
    await api.runOnce("COMMIT");
  }
  for (const statement of [insert, selectByKey, selectAll])
    await statement.finalize();

  const count = Number(await api.selectValue("SELECT count(*) FROM kv"));
  if (count !== driverRowCount)
    throw new Error(`The driver workload inserted ${count} rows.`);
  if (values.length !== driverPointSelectCount)
    throw new Error(`The point selects read ${values.length} rows.`);
  for (const [index, key] of pointSelectKeys.entries())
    if (values[index] !== driverValue(key))
      throw new Error(
        `The point select of key ${key} read ${String(values[index])}.`,
      );
  let valueLengths = 0;
  for (const [, value] of rows) valueLengths += String(value).length;
  const expected = {
    rows: driverRowCount * driverSelectAllCount,
    keys: ((driverRowCount * (driverRowCount + 1)) / 2) * driverSelectAllCount,
    valueLengths: valueLengths * driverSelectAllCount,
  };
  if (JSON.stringify(totals) !== JSON.stringify(expected))
    throw new Error(
      `The reads of every row read ${JSON.stringify(totals)}, not ${JSON.stringify(expected)}.`,
    );

  return {
    insert: insertMs,
    selectByKey: selectByKeyMs,
    selectAll: selectAllMs,
  };
};

/**
 * A column of a row, by name in a row object, as most libraries return rows, or
 * by index in a row array, as wa-sqlite does.
 */
const column = (row: unknown, name: string, index: number): unknown =>
  Array.isArray(row)
    ? (row as ReadonlyArray<unknown>)[index]
    : (row as Readonly<Record<string, unknown>> | undefined)?.[name];

const summarizeFile = (bytes: Uint8Array): BenchFile => {
  let zeroBytes = 0;
  for (const byte of bytes) if (byte === 0) zeroBytes++;
  // A single-byte encoding, so offsets in the text are offsets in the file.
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
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
 * The order of the stacks in a round, rotated by one each round, so a burst of
 * load slows one run of several stacks rather than every run of one, and no
 * stack always runs right after the same one.
 */
export const rotate = <T,>(
  items: ReadonlyArray<T>,
  round: number,
): ReadonlyArray<T> => {
  const shift = items.length === 0 ? 0 : round % items.length;
  return [...items.slice(shift), ...items.slice(0, shift)];
};
