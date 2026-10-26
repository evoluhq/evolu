/**
 * Loads the test-only Node-API addon of the C core (node/addon.c), which
 * scripts/build-addon.mts builds, and types its functions. node/addon.c
 * documents their behavior.
 *
 * @module
 */
import { emptyPrototype, type Brand } from "@evolu/common";
import { createRequire } from "node:module";

// `@evolu/nodejs`'s `NativeSqliteRows.ts`, loaded by its URL, since TypeScript
// can't import another project's source.
const nativeSqliteRows = (await import(
  new URL("../../nodejs/src/NativeSqliteRows.ts", import.meta.url).href
)) as {
  readonly createNativeSqliteRowBuilder: (
    rowPrototype: object,
  ) => Readonly<Record<string, unknown>>;
};

/**
 * Creates the row builder the addon's `createBinding` takes, whose rows have
 * `@evolu/common`'s `emptyPrototype`, as `@evolu/nodejs`'s do.
 */
export const createNativeSqliteRowBuilder = (): Readonly<
  Record<string, unknown>
> => nativeSqliteRows.createNativeSqliteRowBuilder(emptyPrototype);

/** An open, or closed, database connection. */
export type SqliteCoreDatabase = Brand<"SqliteCoreDatabase">;

/** A prepared, or finalized, statement. */
export type SqliteCoreStatement = Brand<"SqliteCoreStatement">;

/**
 * A value bound to a parameter or read from a column. A number binds as INTEGER
 * when it's a safe integer and as REAL otherwise; INTEGER reads as a number
 * within the safe integer range and as a bigint outside it.
 */
export type SqliteCoreValue = null | number | bigint | string | Uint8Array;

/**
 * An error SQLite reported, with `sqlite3_errmsg` as its message. Other errors,
 * such as using a closed database, are plain `Error`, `TypeError` and
 * `RangeError` instances without these properties.
 */
export interface SqliteCoreError extends Error {
  /** The primary result code, such as 19 for SQLITE_CONSTRAINT. */
  readonly resultCode: number;
  /** The extended result code, such as 2067 for SQLITE_CONSTRAINT_UNIQUE. */
  readonly extendedCode: number;
}

/**
 * The error {@link SqliteCoreAddon.openCodec} throws, with the failure the codec
 * recorded, when it recorded one.
 */
export interface SqliteCoreCodecError extends SqliteCoreError {
  readonly codecFailure?: SqliteCoreCodecFailure;
}

/**
 * Copies the database and its journal, when it has one, to `copy` and
 * `copy-journal` before the connection's write numbered `write`, counted from 1
 * at the open, as a power loss would leave them, and then writes on.
 */
export interface SqliteCoreCrashCopy {
  readonly write: number;
  readonly copy: string;
}

/** A failure the codec recorded, as src/evolu_codec.h describes them. */
export interface SqliteCoreCodecFailure {
  readonly type: "PageAuthentication" | "EncryptionUnsupported" | "Random";
  /** The page that failed to authenticate; otherwise 0. */
  readonly pageNumber: number;
}

/** The functions of the addon, each a thin layer over its SQLite C function. */
export interface SqliteCoreAddon {
  /**
   * Whether the addon was built with AddressSanitizer and
   * UndefinedBehaviorSanitizer.
   */
  readonly isSanitized: boolean;
  readonly libversion: () => string;
  readonly sourceid: () => string;
  readonly compileOptionUsed: (name: string) => boolean;
  /**
   * Registers, with true, an auto extension that gives every connection opened
   * after it `write_log()`, a SQL function that inserts two rows into the
   * connection's table `log` and returns NULL, and resets SQLite's auto
   * extensions with false.
   */
  readonly autoRegisterWriteLog: (isRegistered: boolean) => void;
  /**
   * Starts, with true, a backup from every connection opened after it into a
   * memory database of its own, which SQLite then can't close, and stops
   * starting them with false.
   */
  readonly startBackupOnOpen: (isStarted: boolean) => void;
  /** Finishes the backups started so far. */
  readonly finishBackups: () => void;
  /**
   * Returns the N-API mirror of React Native's binding, node/binding.c, which
   * `@evolu/common` types as `NativeSqlite`, with `@evolu/nodejs`'s row
   * builder, which {@link loadAddon} passes it.
   */
  readonly createBinding: () => unknown;
  /**
   * Opens a connection with `sqlite3_open_v2` and SQLite's open flags,
   * SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE by default, always adding
   * SQLITE_OPEN_NOMUTEX.
   */
  readonly open: (path: string, flags?: number) => SqliteCoreDatabase;
  /**
   * Opens a connection with `evolu_codec_open` on the codec VFS, keyed with a
   * 32-byte key or plaintext with null, and its flags, such as
   * {@link CODEC_SQLCIPHER_FILES}, and with a {@link SqliteCoreCrashCopy} when
   * given. It throws a {@link SqliteCoreCodecError}.
   */
  readonly openCodec: (
    path: string,
    key: Uint8Array | null,
    flags?: number,
    crashCopy?: SqliteCoreCrashCopy,
  ) => SqliteCoreDatabase;
  /** Returns and clears the failure the codec recorded, or null. */
  readonly takeCodecFailure: (
    db: SqliteCoreDatabase,
  ) => SqliteCoreCodecFailure | null;
  readonly exec: (db: SqliteCoreDatabase, sql: string) => void;
  /** Prepares the one statement of `sql`. */
  readonly prepare: (
    db: SqliteCoreDatabase,
    sql: string,
  ) => SqliteCoreStatement;
  /** Binds a value to the parameter at a 1-based `index`. */
  readonly bind: (
    statement: SqliteCoreStatement,
    index: number,
    value: SqliteCoreValue,
  ) => void;
  /** Returns true for a row and false when the statement is done. */
  readonly step: (statement: SqliteCoreStatement) => boolean;
  readonly columnCount: (statement: SqliteCoreStatement) => number;
  /** The name of the column at a 0-based `index`, `sqlite3_column_name`'s. */
  readonly columnName: (
    statement: SqliteCoreStatement,
    index: number,
  ) => string;
  /** The rows the last INSERT, UPDATE or DELETE changed, `sqlite3_changes64`. */
  readonly changes: (db: SqliteCoreDatabase) => number;
  /** Reads the column at a 0-based `index` of the current row. */
  readonly column: (
    statement: SqliteCoreStatement,
    index: number,
  ) => SqliteCoreValue;
  /** Resets a statement, keeping its bindings. */
  readonly reset: (statement: SqliteCoreStatement) => void;
  /** Finalizes a statement; finalizing it again does nothing. */
  readonly finalize: (statement: SqliteCoreStatement) => void;
  /**
   * Finalizes the statements of a connection and closes it, throwing the first
   * error that finalizing a statement whose last step returned a row meets, as
   * {@link SqliteCoreAddon.finalize} throws it; closing it again does nothing.
   */
  readonly close: (db: SqliteCoreDatabase) => void;
}

/**
 * Open flags of `sqlite3_open_v2`, for {@link SqliteCoreAddon.open}.
 * SQLITE_OPEN_NOMUTEX is always added.
 */
export const SQLITE_OPEN_READONLY = 0x01;
export const SQLITE_OPEN_READWRITE = 0x02;
export const SQLITE_OPEN_CREATE = 0x04;

/** EVOLU_CODEC_SQLCIPHER_FILES, for {@link SqliteCoreAddon.openCodec}. */
export const CODEC_SQLCIPHER_FILES = 1;

/** EVOLU_CODEC_PLAINTEXT_CHECKSUMS, for {@link SqliteCoreAddon.openCodec}. */
export const CODEC_PLAINTEXT_CHECKSUMS = 2;

/** Loads the addon built at `path`. */
export const loadAddon = (path: string): SqliteCoreAddon => {
  const addon = createRequire(import.meta.url)(path) as Omit<
    SqliteCoreAddon,
    "createBinding"
  > & { readonly createBinding: (rowBuilder: unknown) => unknown };
  return {
    ...addon,
    createBinding: () => addon.createBinding(createNativeSqliteRowBuilder()),
  };
};
