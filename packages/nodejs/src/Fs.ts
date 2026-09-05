/**
 * File system operations using Node.js.
 *
 * @module
 */

import {
  assert,
  ByteLength,
  disposable,
  err,
  ok,
  tryAsync,
  type Fs,
  type FsEncoding,
  type FsEntryType,
  type FsError,
  type FsErrorReason,
  type FsMetadata,
  type FsPath,
  type Task,
} from "@evolu/common";
import { constants, type Stats } from "node:fs";
import {
  access,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

/**
 * Creates a {@link Fs} backed by `node:fs/promises`.
 *
 * `readFile` and `writeFile` pass the Run's abort signal to Node and propagate
 * the Run's abort reason if Node rejects after cancellation. Cancellation can
 * leave a write partially completed. Successful operations return their values
 * even if an abort was requested. Other operations run to completion and return
 * their results once started, so callers also receive created temporary
 * directories and can dispose them.
 *
 * Temporary directory parents are resolved through the file system, preserving
 * the meaning of symbolic links followed by `..`. Returned paths are absolute,
 * so cleanup still targets the created directory after a change to the
 * process's working directory.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertFalse,
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
 *   const temp = await run(fs.createTempDirectory({ prefix: "evolu-" }));
 *   if (!temp.ok) return temp;
 *
 *   {
 *     await using directory = temp.value;
 *     const path = join(directory.path, "config.json");
 *
 *     const result = await run(fs.writeFile(path, '{ "port": 4000 }'));
 *     if (!result.ok) return result;
 *
 *     const text = await run(fs.readFile(path, "utf8"));
 *     if (!text.ok) return text;
 *     assertEqual(text.value, '{ "port": 4000 }');
 *   }
 *
 *   const exists = await run(fs.exists(temp.value.path));
 *   if (!exists.ok) return exists;
 *   assertFalse(exists.value);
 *   return ok();
 * };
 *
 * await runMain({ fs: createNodeFs() }, { mode: "command" })(main);
 * ```
 */
export const createNodeFs = (): Fs => {
  function readFileTask(path: FsPath): Task<Uint8Array, FsError>;
  function readFileTask(
    path: FsPath,
    encoding: FsEncoding | { readonly encoding: FsEncoding },
  ): Task<string, FsError>;
  function readFileTask(
    path: FsPath,
    encoding?: FsEncoding | { readonly encoding: FsEncoding },
  ): Task<Uint8Array | string, FsError> {
    return async (run) => {
      const { signal } = run;
      const result = await tryAsync((): Promise<Uint8Array | string> =>
        encoding === undefined
          ? readFile(path, { signal })
          : readFile(path, { ...toEncodingOptions(encoding), signal }),
      );
      if (result.ok) return result;
      signal.throwIfAborted();
      return err(createFsError("readFile", path, result.error));
    };
  }

  return {
    readFile: readFileTask,

    writeFile: (path, data, options) => async (run) => {
      const { signal } = run;
      const result = await tryAsync(() =>
        writeFile(path, data, { ...options, signal }),
      );
      if (result.ok) return result;
      signal.throwIfAborted();
      return err(createFsError("writeFile", path, result.error));
    },

    readDirectory: (path, options) => async () => {
      const result = await tryAsync(() => readdir(path, options));
      return result.ok
        ? result
        : err(createFsError("readDirectory", path, result.error));
    },

    createDirectory: (path, options) => async () => {
      const result = await tryAsync(async () => {
        await mkdir(path, options);
      });
      return result.ok
        ? ok()
        : err(createFsError("createDirectory", path, result.error));
    },

    copy: (source, destination, options) => async () => {
      const result = await tryAsync(() =>
        cp(source, destination, { ...options, recursive: true }),
      );
      return result.ok
        ? ok()
        : err(createFsError("copy", source, result.error, destination));
    },

    copyFile:
      (source, destination, { overwrite = false } = {}) =>
      async () => {
        const result = await tryAsync(() =>
          copyFile(
            source,
            destination,
            overwrite ? 0 : constants.COPYFILE_EXCL,
          ),
        );
        return result.ok
          ? ok()
          : err(createFsError("copyFile", source, result.error, destination));
      },

    rename: (source, destination) => async () => {
      const result = await tryAsync(() => rename(source, destination));
      return result.ok
        ? ok()
        : err(createFsError("rename", source, result.error, destination));
    },

    remove: (path, options) => async () => {
      const result = await tryAsync(() => rm(path, options));
      return result.ok
        ? ok()
        : err(createFsError("remove", path, result.error));
    },

    getMetadata: (path) => async () => {
      const result = await tryAsync(() => stat(path));
      return result.ok
        ? ok(statsToFsMetadata(result.value))
        : err(createFsError("getMetadata", path, result.error));
    },

    exists: (path) => async () => {
      const result = await tryAsync(() => access(path));
      if (result.ok) return ok(true);
      const error = createFsError("exists", path, result.error);
      return error.reason === "NotFound" ? ok(false) : err(error);
    },

    createTempDirectory:
      ({ directory, prefix = "" } = {}) =>
      async () => {
        const parent = directory ?? tmpdir();
        const resolvedParent = await tryAsync(
          () => realpath(parent || "."),
          (error) => createFsError("createTempDirectory", parent, error),
        );
        if (!resolvedParent.ok) return resolvedParent;

        // Keep the parent separator even when the name prefix is empty.
        const pathPrefix = join(resolvedParent.value, sep) + prefix;
        const result = await tryAsync(
          () => mkdtemp(pathPrefix),
          (error) => createFsError("createTempDirectory", pathPrefix, error),
        );
        if (!result.ok) return result;

        const path = result.value;
        const disposer = new AsyncDisposableStack();
        disposer.defer(() => rm(path, { recursive: true, force: true }));
        return ok(disposable({ path }, disposer));
      },
  };
};

const toEncodingOptions = (
  encoding: FsEncoding | { readonly encoding: FsEncoding },
): { readonly encoding: FsEncoding } =>
  typeof encoding === "string" ? { encoding } : encoding;

const fsErrorReasonByCode: Readonly<Record<string, FsErrorReason>> = {
  ENOENT: "NotFound",
  EEXIST: "AlreadyExists",
  EACCES: "PermissionDenied",
  EPERM: "PermissionDenied",
  EISDIR: "IsDirectory",
  ERR_FS_EISDIR: "IsDirectory",
  ERR_FS_CP_EEXIST: "AlreadyExists",
  ERR_FS_CP_NON_DIR_TO_DIR: "IsDirectory",
  ERR_FS_CP_DIR_TO_NON_DIR: "NotDirectory",
  ENOTDIR: "NotDirectory",
  ENOTEMPTY: "NotEmpty",
  EBUSY: "Busy",
};

const createFsError = (
  method: string,
  path: FsPath,
  error: unknown,
  destination?: FsPath,
): FsError => {
  assert(error instanceof Error, "Node fs rejects with an Error.");
  const { code, syscall } = error as NodeJS.ErrnoException;

  return {
    type: "FsError",
    reason: fsErrorReasonByCode[String(code)] ?? "Unknown",
    path: typeof path === "string" ? path : path.href,
    ...(destination === undefined
      ? {}
      : {
          destination:
            typeof destination === "string" ? destination : destination.href,
        }),
    syscall: syscall ?? method,
    message: error.message,
  };
};

const fsEntryTypeByMode: Readonly<Record<number, FsEntryType>> = {
  [constants.S_IFREG]: "File",
  [constants.S_IFDIR]: "Directory",
  [constants.S_IFLNK]: "SymbolicLink",
  [constants.S_IFBLK]: "BlockDevice",
  [constants.S_IFCHR]: "CharacterDevice",
  [constants.S_IFIFO]: "FIFO",
  [constants.S_IFSOCK]: "Socket",
};

const statsToFsMetadata = (stats: Stats): FsMetadata => ({
  type: fsEntryTypeByMode[stats.mode & constants.S_IFMT] ?? "Unknown",
  dev: stats.dev,
  ino: stats.ino,
  mode: stats.mode,
  nlink: stats.nlink,
  uid: stats.uid,
  gid: stats.gid,
  rdev: stats.rdev,
  size: ByteLength.orThrow(stats.size),
  blksize: stats.blksize,
  blocks: stats.blocks,
  atimeMs: stats.atimeMs,
  mtimeMs: stats.mtimeMs,
  ctimeMs: stats.ctimeMs,
  birthtimeMs: stats.birthtimeMs,
  atime: stats.atime,
  mtime: stats.mtime,
  ctime: stats.ctime,
  birthtime: stats.birthtime,
});
