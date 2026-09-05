/**
 * File system operations for {@link Task}s.
 *
 * {@link Fs} reads, writes, copies, and renames files; lists and manages
 * directories; and provides metadata and existence checks. Each operation
 * returns a Task.
 *
 * Tasks can sequence file operations without synchronous I/O. Node.js's
 * synchronous methods are intentionally omitted to avoid accidentally blocking
 * the event loop.
 *
 * Inject {@link @evolu/nodejs!createNodeFs | createNodeFs} through
 * {@link @evolu/nodejs!runMain | runMain} or {@link createRun}. Tasks declare
 * {@link FsDep} and access the file system through `run.deps.fs`.
 *
 * {@link FsError} includes the path, a diagnostic message, and a
 * {@link FsErrorReason} such as `NotFound` or `PermissionDenied`.
 * {@link Fs.exists} returns `false` for `NotFound` and preserves other errors.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   ok,
 *   type FsDep,
 *   type FsError,
 *   type Task,
 * } from "@evolu/common";
 * import { createNodeFs, runMain } from "@evolu/nodejs";
 * import { join } from "node:path";
 *
 * const main: Task<void, FsError, FsDep> = async (run) => {
 *   const { fs } = run.deps;
 *   const temp = await run(
 *     fs.createTempDirectory({ prefix: "evolu-fs-" }),
 *   );
 *   if (!temp.ok) return temp;
 *
 *   await using directory = temp.value;
 *   const path = join(directory.path, "message.txt");
 *
 *   const result = await run(fs.writeFile(path, "hello"));
 *   if (!result.ok) return result;
 *
 *   const text = await run(fs.readFile(path, "utf8"));
 *   if (!text.ok) return text;
 *   assertEqual(text.value, "hello");
 *
 *   return ok();
 * };
 *
 * await runMain({ fs: createNodeFs() }, { mode: "command" })(main);
 * ```
 *
 * @module
 */

import type { ByteLength } from "./Bytes.ts";
import type { createRun, Task } from "./Task.ts";
import type { Typed } from "./Type.ts";

/** Asynchronous file system operations. */
export interface Fs {
  /**
   * Reads a whole file, as bytes by default or as a string with an encoding. An
   * abort requests cancellation; pending operating system reads may still
   * finish.
   */
  readonly readFile: FsReadFile;

  /**
   * Writes a file, creating it or truncating an existing file by default. An
   * abort requests cancellation and can leave the file partially written or
   * truncated.
   */
  readonly writeFile: (
    path: FsPath,
    data: string | Uint8Array,
    options?: FsWriteFileOptions,
  ) => Task<void, FsError>;

  /**
   * Lists entry names relative to `path`, in unspecified order. With
   * `recursive`, includes nested entries with their relative paths.
   */
  readonly readDirectory: (
    path: FsPath,
    options?: FsReadDirectoryOptions,
  ) => Task<ReadonlyArray<string>, FsError>;

  /**
   * Creates a directory. Without `recursive`, an existing directory fails with
   * `AlreadyExists` and a missing parent with `NotFound`.
   */
  readonly createDirectory: (
    path: FsPath,
    options?: FsCreateDirectoryOptions,
  ) => Task<void, FsError>;

  /**
   * Copies a file or directory tree using Node's recursive `cp` semantics. By
   * default, existing directories are merged and files are replaced. Symbolic
   * links follow Node's rules: `force: false` and `errorOnExist` do not
   * guarantee that destination links are preserved.
   *
   * Copying is neither exclusive nor atomic, and a failure can leave a partial
   * copy. Use {@link Fs.copyFile} for exclusive creation of a single file.
   */
  readonly copy: (
    source: FsPath,
    destination: FsPath,
    options?: FsCopyOptions,
  ) => Task<void, FsError>;

  /**
   * Copies a single file. An existing destination fails with `AlreadyExists`
   * unless `overwrite` is enabled. Without overwrite, destination creation is
   * exclusive even when other copies run concurrently. File contents are not
   * published atomically; a failure can leave a partial copy.
   */
  readonly copyFile: (
    source: FsPath,
    destination: FsPath,
    options?: FsCopyFileOptions,
  ) => Task<void, FsError>;

  /**
   * Renames or moves a file or directory using the platform's rename semantics.
   * An existing destination file can be replaced.
   */
  readonly rename: (source: FsPath, destination: FsPath) => Task<void, FsError>;

  /**
   * Removes a file, or a directory with `recursive`. Removing a directory
   * without `recursive` fails with `IsDirectory`. With `force`, a missing path
   * succeeds.
   */
  readonly remove: (
    path: FsPath,
    options?: FsRemoveOptions,
  ) => Task<void, FsError>;

  /** Reads file metadata, following symbolic links. */
  readonly getMetadata: (path: FsPath) => Task<FsMetadata, FsError>;

  /**
   * Checks whether a path exists. `NotFound` produces `false`; other errors are
   * returned. A `true` result does not establish read or write permission.
   */
  readonly exists: (path: FsPath) => Task<boolean, FsError>;

  /**
   * Creates a unique directory in the system temporary directory by default.
   * Options can specify a parent directory and a name prefix. The returned
   * resource removes the directory and its contents on disposal. Use `await
   * using` for cleanup; disposal can throw if removal fails.
   *
   * Once started, this operation returns its result even if its Run aborts.
   */
  readonly createTempDirectory: (
    options?: FsCreateTempDirectoryOptions,
  ) => Task<FsTempDirectory, FsError>;
}

/** Dependency wrapper for {@link Fs}. */
export interface FsDep {
  readonly fs: Fs;
}

/** A file system path, or a `file:` URL. */
export type FsPath = string | URL;

/** Supported text encodings. */
export type FsEncoding =
  | "ascii"
  | "utf8"
  | "utf-8"
  | "utf16le"
  | "utf-16le"
  | "ucs2"
  | "ucs-2"
  | "base64"
  | "base64url"
  | "latin1"
  | "binary"
  | "hex";

/** Supported file opening modes for {@link Fs.writeFile}. */
export type FsOpenFlag =
  | "a"
  | "ax"
  | "a+"
  | "ax+"
  | "as"
  | "as+"
  | "r"
  | "r+"
  | "rs+"
  | "w"
  | "wx"
  | "w+"
  | "wx+";

/** Reads bytes by default, or text when an encoding is specified. */
export interface FsReadFile {
  (path: FsPath): Task<Uint8Array, FsError>;
  (
    path: FsPath,
    encoding: FsEncoding | { readonly encoding: FsEncoding },
  ): Task<string, FsError>;
}

/** Options for {@link Fs.writeFile}. */
export interface FsWriteFileOptions {
  /** Encoding of string data. Defaults to `utf8`. */
  readonly encoding?: FsEncoding;
  /** File mode of a created file. Defaults to `0o666`. */
  readonly mode?: number;
  /** Open flag. Defaults to `w`; use `wx` to fail when the file exists. */
  readonly flag?: FsOpenFlag;
}

/** Options for {@link Fs.readDirectory}. */
export interface FsReadDirectoryOptions {
  /** Includes entries from nested directories. Defaults to `false`. */
  readonly recursive?: boolean;
}

/** Options for {@link Fs.createDirectory}. */
export interface FsCreateDirectoryOptions {
  /** Creates missing parents and accepts an existing directory. */
  readonly recursive?: boolean;
  /** Directory mode. Defaults to `0o777`. */
  readonly mode?: number;
}

/** Options for {@link Fs.copy}. */
export interface FsCopyOptions {
  /**
   * Node's `force` option. Replaces existing files; `false` skips them unless
   * `errorOnExist` is enabled. Defaults to `true`. This does not protect
   * destination symbolic links.
   */
  readonly force?: boolean;
  /**
   * Node's `errorOnExist` option. With `force: false`, existing files and
   * directories fail with `AlreadyExists`. Defaults to `false`. Symbolic links
   * retain Node's behavior and may still be replaced.
   */
  readonly errorOnExist?: boolean;
  /** Preserves access and modification times. Defaults to `false`. */
  readonly preserveTimestamps?: boolean;
}

/** Options for {@link Fs.copyFile}. */
export interface FsCopyFileOptions {
  /** Replaces an existing destination file. Defaults to `false`. */
  readonly overwrite?: boolean;
}

/** Options for {@link Fs.remove}. */
export interface FsRemoveOptions {
  /** Removes directories and their contents. */
  readonly recursive?: boolean;
  /** Ignores a missing path. */
  readonly force?: boolean;
  /**
   * Number of retries for `EBUSY`, `EMFILE`, `ENFILE`, `ENOTEMPTY`, or `EPERM`
   * on Node.js. Applies only with `recursive: true`. Defaults to `0`.
   */
  readonly maxRetries?: number;
  /**
   * Base retry delay in milliseconds. Each retry waits one additional interval.
   * Applies only with `recursive: true`. Defaults to `100`.
   */
  readonly retryDelay?: number;
}

/** File metadata as data, with Node's numeric and timestamp field names. */
export interface FsMetadata {
  readonly type: FsEntryType;
  readonly dev: number;
  readonly ino: number;
  readonly mode: number;
  readonly nlink: number;
  readonly uid: number;
  readonly gid: number;
  readonly rdev: number;
  readonly size: ByteLength;
  readonly blksize: number;
  readonly blocks: number;
  readonly atimeMs: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
  readonly birthtimeMs: number;
  readonly atime: Date;
  readonly mtime: Date;
  readonly ctime: Date;
  readonly birthtime: Date;
}

/** The kind of file system entry described by {@link FsMetadata}. */
export type FsEntryType =
  | "File"
  | "Directory"
  | "SymbolicLink"
  | "BlockDevice"
  | "CharacterDevice"
  | "FIFO"
  | "Socket"
  | "Unknown";

/** Options for {@link Fs.createTempDirectory}. */
export interface FsCreateTempDirectoryOptions {
  /** Existing parent directory. Defaults to the system temporary directory. */
  readonly directory?: string;
  /** Prefix for the directory name. Defaults to an empty string. */
  readonly prefix?: string;
}

/** A temporary directory removed, with its contents, on asynchronous disposal. */
export interface FsTempDirectory extends AsyncDisposable {
  readonly path: string;
}

/** A failed file system operation. */
export interface FsError extends Typed<"FsError"> {
  readonly reason: FsErrorReason;
  /**
   * The operation's path, or source for copying and renaming. URL inputs use
   * their `href`. Temporary directories use the supplied parent if its
   * resolution fails, or the resolved parent combined with the name prefix if
   * creation fails.
   */
  readonly path: string;
  /**
   * Destination for copying and renaming, with URL inputs represented by
   * `href`.
   */
  readonly destination?: string;
  /** The failing system call, or the method name when the platform reports none. */
  readonly syscall: string;
  /** The platform's diagnostic message. */
  readonly message: string;
}

/** Why a file system operation failed, mapped from the platform's error code. */
export type FsErrorReason =
  | "NotFound"
  | "AlreadyExists"
  | "PermissionDenied"
  | "IsDirectory"
  | "NotDirectory"
  | "NotEmpty"
  | "Busy"
  | "Unknown";

/**
 * Creates a test {@link Fs} with the supplied operation overrides.
 *
 * Unconfigured operations throw a defect naming the method when their Task
 * runs. Constructing a Task does not execute it. This helper performs no file
 * system I/O; overrides provide the behavior needed by each test.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertOk,
 *   ok,
 *   testCreateFs,
 *   testCreateRun,
 *   type FsDep,
 *   type FsError,
 *   type Task,
 * } from "@evolu/common";
 *
 * const saveMessage: Task<void, FsError, FsDep> = (run) =>
 *   run(run.deps.fs.writeFile("message.txt", "hello"));
 *
 * await using run = testCreateRun({
 *   fs: testCreateFs({
 *     writeFile: (path, data) => () => {
 *       assertEqual(path, "message.txt");
 *       assertEqual(data, "hello");
 *       return ok();
 *     },
 *   }),
 * });
 *
 * assertOk(await run(saveMessage));
 * ```
 */
export const testCreateFs = (overrides: Partial<Fs> = {}): Fs => ({
  readFile: createUnexpectedFsOperation("readFile"),
  writeFile: createUnexpectedFsOperation("writeFile"),
  readDirectory: createUnexpectedFsOperation("readDirectory"),
  createDirectory: createUnexpectedFsOperation("createDirectory"),
  copy: createUnexpectedFsOperation("copy"),
  copyFile: createUnexpectedFsOperation("copyFile"),
  rename: createUnexpectedFsOperation("rename"),
  remove: createUnexpectedFsOperation("remove"),
  getMetadata: createUnexpectedFsOperation("getMetadata"),
  exists: createUnexpectedFsOperation("exists"),
  createTempDirectory: createUnexpectedFsOperation("createTempDirectory"),
  ...overrides,
});

const createUnexpectedFsOperation =
  (method: keyof Fs) => (): Task<never> => () => {
    throw new Error(`Unexpected Fs.${method} call`);
  };
