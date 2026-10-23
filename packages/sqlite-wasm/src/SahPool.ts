/**
 * A VFS over a pool of OPFS sync access handles, byte-compatible with SQLite's
 * opfs-sahpool.
 *
 * Every file is a `FileSystemSyncAccessHandle` the pool holds exclusively, so
 * reads and writes are synchronous in the worker, with no helper worker and no
 * cross-origin isolation. As in opfs-sahpool, one pool may use a directory at a
 * time, across workers and wasm instances, so the caller must serialize opens
 * of a directory, as Evolu does with its leader Web Lock.
 *
 * SQLite reaches the pool only through Evolu's codec, in C, which encrypts
 * EncryptedFile databases, as Evolu's codec below describes.
 *
 * Status: implemented, and tested in Node.js over a fake OPFS, including the
 * lock table and recovery after a worker died, and in workers of Chromium,
 * Firefox and WebKit on real OPFS, including storage quotas, real in Chromium
 * and Firefox, and pools shared with SQLite's opfs-sahpool as
 * `@evolu/sqlite-wasm` 2.2.4 ships it.
 *
 * ## On-disk format
 *
 * The slots must stay byte for byte what opfs-sahpool writes. Existing users'
 * pools, and older tabs and cached PWAs running SQLite's JavaScript, share the
 * directory, and opfs-sahpool wipes any slot whose header it does not accept.
 *
 * - The pool creates only {@link sahPoolOpaqueDirectoryName} in the pool
 *   directory, such as `.evolu`, with one randomly named file per slot.
 * - Each slot starts with a {@link sahPoolHeaderSize}-byte header. Bytes 0-511
 *   hold the path in UTF-8, NUL-padded, so `xOpen` rejects a path of 511 bytes
 *   or more with SQLITE_CANTOPEN, and a database's path longer than
 *   {@link sahPoolMaxDatabasePathSize}, 498 bytes, whose super-journal's path
 *   would be that long, before it takes a slot. Bytes 512-515 hold the
 *   `SQLITE_OPEN_*` flags as a big-endian u32. Bytes 516-523 hold the digest as
 *   two platform-endian u32 values, which is little-endian everywhere Evolu
 *   runs.
 * - File data starts at offset {@link sahPoolHeaderSize}.
 * - A free slot has an all-zero path, flags 0 and digest `[0, 0]`, and is
 *   normally exactly {@link sahPoolHeaderSize} bytes long. A failed truncate can
 *   leave it longer, and the `xOpen` that takes it truncates it first.
 * - Paths are normalized with `new URL(name, "file://localhost/").pathname`, so
 *   `file:evolu1.db` and `evolu1.db` both become `/evolu1.db`, and the journal
 *   `/evolu1.db-journal`. URL paths percent-encode characters such as spaces
 *   and non-ASCII ones. A host is ignored, as in opfs-sahpool, because engines
 *   parse it differently. A name is rejected unless its path with `-journal`
 *   appended is the path of the name with `-journal` appended. Otherwise the
 *   suffix lands in a query, a fragment or a host, as for `/a?b.db`, `/a#b.db`
 *   or `//evolu.db`, mapping the database and its journal to one path.
 *
 * ## Setup
 *
 * - Setup does not serialize opens of a directory; the caller must, as
 *   opfs-sahpool documents. A held slot fails an open, but two openers of a new
 *   or empty directory list no slot to hold, and each can create its own slots.
 *   A file both then create exists twice, and on the next open only one version
 *   shows, while the other is kept hidden and never reused, as below. In WebKit
 *   on macOS, names that differ only in case name one directory, so spell each
 *   directory in one case, as {@link OpfsName} describes.
 * - Every slot's handle is acquired, in the default exclusive mode and never
 *   `readwrite-unsafe`, before anything is written. Setup waits for every
 *   acquisition to settle before it gives up, then closes every handle it
 *   obtained, including those that resolve after the first rejection. No header
 *   is read, repaired or truncated until every slot is held.
 * - Opening a directory this instance has open, or is opening, also while it
 *   waits for held slots, fails with {@link SahPoolAlreadyOpenError} before it
 *   touches OPFS. The claim is released when setup fails or the pool is
 *   disposed.
 * - When another context or instance still holds a slot, setup writes nothing,
 *   closes every handle it acquired, and fails with {@link SahPoolHeldError},
 *   even when another slot fails otherwise. With
 *   {@link SahPoolOptions.heldTimeout}, it first tries again from a new listing
 *   until the timeout passes, holding no slot in between. Handles can outlive a
 *   Web Lock an app serializes workers with, such as Evolu's: WebKit releases
 *   the two in no set order when a worker ends without closing its database,
 *   and Chromium keeps them for a page in the back/forward cache until it is
 *   evicted, and after site data is cleared on Windows until the browser
 *   restarts. Chromium also lets a worker that `Worker.terminate()` ended
 *   finish the task it runs, holding its handles, for up to two seconds.
 * - Each header is read into a zeroed buffer, so a short slot is not parsed with
 *   the previous slot's bytes, then classified as opfs-sahpool does: a
 *   transient or DELETEONCLOSE file, or a bad digest, is freed; a valid free
 *   slot is truncated to the header. Of slots whose headers map the same path,
 *   which two openers of a new or empty directory can leave, the one listed
 *   last maps the path, and the others stay unused, as in opfs-sahpool: no
 *   other file truncates, writes or reuses them. Unlike opfs-sahpool, deleting
 *   the path frees them too, so the deleted file does not come back on the next
 *   open.
 * - Slots are topped up to {@link sahPoolDefaultCapacity}.
 * - Any other failure, such as OPFS refusing access, a header that cannot be read
 *   or written, or a VFS that cannot be allocated or registered, fails with
 *   {@link SahPoolSetupError}. Every handle setup obtained is closed, also when
 *   setup throws. In a SharedWorker, Chromium and Firefox have no
 *   `createSyncAccessHandle`, as the spec says, so setup fails there with a
 *   `TypeError` as the cause; WebKit has sync access handles in SharedWorkers
 *   too.
 * - The directory is never removed. 2.2.4 removed it, database included, when
 *   setup failed.
 *
 * ## Locking
 *
 * - Locks live in a table per path, like `unixInodeInfo` in SQLite's `os_unix.c`,
 *   because several connections of one worker can open the same path. A lock
 *   that conflicts with another connection's lock returns SQLITE_BUSY, and a
 *   failed step from RESERVED to EXCLUSIVE leaves PENDING, which admits no new
 *   SHARED locks.
 * - The table accepts every sequence SQLite makes, as `unixLock` and
 *   `posixUnlock` in `os_unix.c` do: an `xLock` at or below the connection's
 *   level does nothing; RESERVED to EXCLUSIVE goes through PENDING, but SHARED
 *   straight to EXCLUSIVE, as a hot journal's rollback asks, takes no PENDING
 *   when it fails; `xUnlock` goes from any level to SHARED or NONE, and
 *   `xClose` to NONE. Each connection's own level guards the shared per-path
 *   state, so an unlock from a connection that never locked changes nothing.
 *   `xRead` and `xFileControl` work with no lock held.
 * - `xCheckReservedLock` reports whether any connection holds more than SHARED on
 *   the path. The exclusive handles make this pool the only writer of its
 *   slots, so the answer is authoritative, and SQLite rolls back a hot journal
 *   left by an interrupted commit. opfs-sahpool always answered yes before
 *   SQLite 3.54.0, so such a transaction stayed half-applied.
 * - `xSleep` does nothing. Contention can only come from connections in the same
 *   thread, which sleeping cannot resolve.
 *
 * ## I/O errors
 *
 * - Every method catches everything and returns a result code. Those
 *   {@link SqliteVfsMethod} lists record the first failure since
 *   {@link SahPool.clearFailure} as a {@link SqliteVfsFailure}, and the others,
 *   such as `xLock` returning SQLITE_BUSY, record none. `xGetLastError` never
 *   clears it.
 * - Every write's returned byte count is checked, header writes included. When
 *   storage is full, Chromium off the record returns 0xFFFFFFF8 and Firefox a
 *   short count instead of throwing.
 * - `xWrite` returns SQLITE_FULL when the handle wrote a different number of
 *   bytes than requested, recording a {@link SqliteShortWriteError}, or threw an
 *   error named `QuotaExceededError`, matched by name so subclasses and
 *   non-DOMException errors count. Any other error, including WebKit's
 *   `InvalidStateError` on a full disk, returns SQLITE_IOERR_WRITE.
 * - Over its quota, Chromium throws `QuotaExceededError`, and Firefox writes what
 *   fits, if anything, and returns the short count. Chromium reserves quota for
 *   a handle ahead of its writes and releases what the file does not use only
 *   when the handle closes, so a file the pool deletes frees no quota for the
 *   pool's other files until the pool is opened again.
 * - `xRead` zero-fills the rest of a short read and returns
 *   SQLITE_IOERR_SHORT_READ, as SQLite requires.
 * - Other methods return their specific code, such as SQLITE_IOERR_TRUNCATE,
 *   SQLITE_IOERR_FSYNC or SQLITE_IOERR_FSTAT, so the extended code says which
 *   operation failed.
 * - Exporting a database fails when the pool recorded a failure during the
 *   export, because SQLite zero-fills a page it cannot read and reports
 *   success.
 *
 * ## Files
 *
 * - `xOpen` with CREATE takes a free slot. A slot that is longer than the header,
 *   because an earlier shrink failed, is truncated first; if reading its size
 *   or truncating it fails, the open fails rather than letting a new journal
 *   inherit stale bytes, with SQLITE_FULL when `xWrite` would return it, and
 *   with SQLITE_CANTOPEN otherwise. With no free slot, the open fails with
 *   SQLITE_CANTOPEN and records a {@link SahPoolFullError}. A failed open leaves
 *   `pMethods` NULL, so SQLite does not call `xClose`.
 * - The codec opens only a main database, its journal and a super-journal, each
 *   with a name, so no temporary file, the only kind SQLite opens without a
 *   name or with DELETEONCLOSE, reaches the pool, and `xClose` deletes no file.
 *   A name that is no valid URL path, such as `//[`, or whose suffix would not
 *   land in its path, fails `xOpen` with SQLITE_CANTOPEN and `xDelete` with
 *   SQLITE_IOERR_DELETE, and `xAccess` finds no file.
 * - `xOpen` with CREATE and EXCLUSIVE, as SQLite opens a super-journal, fails
 *   with SQLITE_CANTOPEN when the path exists, as unix's O_EXCL does. It
 *   records no failure, because SQLite checks with `xAccess` that the path is
 *   free first.
 * - Before writing a new file's header, `xOpen` flushes the free slot, and every
 *   slot whose free header's flush failed, as below. That makes the truncate a
 *   delete, setup or an opfs-sahpool tab left unflushed durable before the path
 *   is. Otherwise a power loss can keep the new header but not the truncate,
 *   and SQLite reads the previous file's bytes. A deleted journal comes back
 *   hot and rolls a committed transaction back, wholly or partly, or corrupts
 *   the database, and a new database is NOTADB. A failed flush fails the open
 *   with SQLITE_IOERR_FSYNC, and the slot stays free. The header itself is
 *   written without a flush, because SQLite syncs a file before it relies on
 *   it. A failed header write fails the open with SQLITE_FULL when `xWrite`
 *   would return it, and with SQLITE_CANTOPEN otherwise, and the slot stays
 *   free.
 * - Deleting a file writes and flushes the free header first, which is the
 *   durable delete, and only then forgets the path and truncates the slot.
 *   Slots that its slot shadows are freed the same way before it. If writing a
 *   header fails before it changes a byte, the path stays mapped, its slot is
 *   not freed, and `xDelete` returns SQLITE_IOERR_DELETE, so SQLite rolls back
 *   from an intact journal. Once a byte changed, the header names no path on
 *   disk, so a short write, a failed flush or a failed truncate still succeeds,
 *   and a committed transaction is not reported as an error. Deleting a path
 *   the pool does not have succeeds, as in opfs-sahpool.
 * - A free header whose flush failed is flushed again before the pool writes any
 *   later header, as the first sync of a new journal in unix syncs its
 *   directory, and so is every slot free when the pool opened, because the pool
 *   whose flush of it failed may have ended first, as when its worker died. It
 *   is also flushed before the pool truncates a file, because SQLite truncates
 *   a database that shrank right after deleting its journal, and a journal that
 *   came back over the shorter file would lack the cut pages, as unix orders an
 *   unlink before a later truncate. When that flush fails again, an open fails
 *   before it takes a slot, a delete before it frees the path's slot, keeping
 *   the path mapped, and a truncate before it changes the file, with
 *   SQLITE_IOERR_TRUNCATE, so a COMMIT can fail although it committed, leaving
 *   the file longer than its database, which SQLite ignores and a later
 *   shrinking commit truncates. So a power loss can bring back only the file
 *   deleted last: a journal then rolls back its database's last commit as a
 *   whole, or repeats the rollback that deleted it, as SQLite accepts in
 *   synchronous FULL, which does not sync the directory after deleting a
 *   journal. When SQLite asks for a durable delete, as for a journal in
 *   synchronous EXTRA and for every super-journal, `xDelete` flushes again, and
 *   when that fails, returns SQLITE_IOERR_DIR_FSYNC although the file is
 *   deleted, as unix does when syncing the directory fails.
 * - {@link SahPool.unlink} deletes a database's `-journal` and `-wal` paths too,
 *   although SQLite deletes a leftover journal of an empty database anyway. It
 *   deletes the database before its journal, and the journal only once the
 *   database's free header is flushed, so neither a failure nor a power loss
 *   leaves the database without the journal that would roll it back. It throws
 *   when a connection has one of the files open, because its slot would be
 *   reused under it.
 * - Each slot is mapped to exactly one path, free, or unused because a slot
 *   listed after it maps its path, until that path is deleted.
 *
 * ## Evolu's codec
 *
 * The codec, which `evolu_codec.h` of `@evolu/sqlite-core` describes, encrypts
 * an EncryptedFile database and its rollback journal page by page, as SQLite3
 * Multiple Ciphers encrypts them with its `sqlcipher` scheme and that scheme's
 * default parameters, those of SQLCipher 4, so the databases `@evolu/web` 3
 * encrypted with `@evolu/sqlite-wasm` 2.2.4 open unchanged, and 2.2.4 opens
 * what the codec writes. The pool stores what the codec writes as it is, and
 * the codec does the checks of a hot journal before SQLite rolls it back,
 * refusing one of an encrypted database opened without its key, so the journal
 * stays for the key. A super-journal holds only file names, and the build opens
 * no `-wal` file and keeps temporary files in memory. Tabs of the builds whose
 * pool encrypted in TypeScript can share the pool in DELETE journal mode only,
 * as `Database.ts` describes.
 *
 * `@evolu/web` 1.0.1-preview.6 to 2.4.0 also ran `PRAGMA legacy = 4`, which
 * writes SQLCipher 4's own format: 4096-byte pages, and page 1 encrypted and
 * authenticated from byte 16. Those databases have not opened since
 * `@evolu/web` 3.0.0, which dropped the pragma, and the codec does not open
 * them: page 1 fails to authenticate. Like the databases of `@evolu/web` 3,
 * they were keyed with the `x'<hex>'` text, so their key is the one
 * {@link deriveLegacySqliteKey} derives.
 *
 * ## The VFS
 *
 * - The pool's name is `opfs-sahpool:` followed by the names of the directory
 *   joined with `/`, so `[".evolu"]` gets `opfs-sahpool:.evolu` and `["a",
 *   "b"]` gets `opfs-sahpool:a/b`, which no other names get, because no
 *   {@link OpfsName} contains `/`, NUL, where SQLite ends the name, or a lone
 *   surrogate, which UTF-8 cannot encode.
 * - Once per name and wasm instance, the VFS is registered under the internal
 *   name `evolu-raw:` followed by the pool's name, then Evolu's codec over it
 *   under the pool's name, and then the VFS is unregistered, also when the
 *   codec's registration failed, as when an app holds the pool's name. So SQL
 *   reaches the pool only through the codec, also through the `vfs` parameter
 *   of a URI that `ATTACH` or `VACUUM INTO` names, and on failure nothing stays
 *   registered or allocated, and setup fails with {@link SahPoolSetupError}. It
 *   is all allocated and registered through `SqliteWasm.call`, so on a broken
 *   instance opening a new directory throws before anything is allocated, and
 *   an exception that escapes the registration breaks the instance.
 * - The VFS struct is version 2 with `xCurrentTimeInt64`, and the I/O methods are
 *   version 1 without the shared memory only WAL uses.
 * - Every slot of both structs up to their declared version is a real function,
 *   except the `xDl*` slots: the build omits loadable extensions, so SQLite
 *   never calls them. Evolu's codec forwards most of them without NULL checks,
 *   though it tolerates a NULL `xDelete`, `xSectorSize` or `xGetLastError`, as
 *   SQLite does. `xGetLastError` reports no system error, writing nothing, so
 *   it accepts nBuf 0 and a NULL buffer.
 * - `xFileControl` returns SQLITE_NOTFOUND for every opcode, as in opfs-sahpool.
 *   The codec handles its own file controls, such as the keying pragmas, and
 *   forwards the rest.
 * - `xDeviceCharacteristics` returns 0, and `xSectorSize` returns 4096.
 *   opfs-sahpool returns SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN, which makes SQLite
 *   keep a PERSIST or TRUNCATE journal open after it unlocks. A connection in
 *   DELETE mode could then delete the journal, freeing its slot, and a crash
 *   would leave a transaction half-applied. With 0, SQLite closes the journal
 *   when it unlocks, as with unix, and only a connection holding RESERVED
 *   deletes a journal.
 * - The VFS struct, the I/O methods struct and the internal name are allocated
 *   once and never freed, and so is the codec.
 *
 * ## Pausing
 *
 * Disposing a {@link SahPool} pauses it: every handle closes, so another worker
 * can take the files over. Evolu's codec over the VFS stays registered under
 * the pool's name for the lifetime of the wasm instance. While no pool holds
 * its files, `xOpen` fails with SQLITE_CANTOPEN, `xAccess` finds no file, and
 * `xDelete` returns SQLITE_IOERR_DELETE. Opening the same directory again
 * unpauses it.
 *
 * @module
 */

import {
  assert,
  brand,
  disposable,
  durationToMillis,
  err,
  isNonEmptyArray,
  mapArray,
  ok,
  performanceDurationBetween,
  safelyStringifyUnknownValue,
  sleep,
  String,
  tryAsync,
  trySync,
  zipArray,
  type NonEmptyReadonlyArray,
  type NonNegativeInt,
  type PositiveDuration,
  type PositiveMillis,
  type Random,
  type RandomBytesDep,
  type ReportDefectDep,
  type Result,
  type Task,
  type TimeDep,
  type Typed,
  type TypeError,
} from "@evolu/common";
import {
  SQLITE_BUSY,
  SQLITE_CANTOPEN,
  SQLITE_FULL,
  SQLITE_IOERR_DELETE,
  SQLITE_IOERR_DIR_FSYNC,
  SQLITE_IOERR_FSTAT,
  SQLITE_IOERR_FSYNC,
  SQLITE_IOERR_READ,
  SQLITE_IOERR_SHORT_READ,
  SQLITE_IOERR_TRUNCATE,
  SQLITE_IOERR_WRITE,
  SQLITE_LOCK_EXCLUSIVE,
  SQLITE_LOCK_NONE,
  SQLITE_LOCK_PENDING,
  SQLITE_LOCK_RESERVED,
  SQLITE_LOCK_SHARED,
  SQLITE_NOTFOUND,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_DELETEONCLOSE,
  SQLITE_OPEN_EXCLUSIVE,
  SQLITE_OPEN_MAIN_DB,
  SQLITE_OPEN_MAIN_JOURNAL,
  SQLITE_OPEN_MEMORY,
  SQLITE_OPEN_SUPER_JOURNAL,
  SQLITE_OPEN_WAL,
  sqlite3_file_layout,
  sqlite3_io_methods_layout,
  sqlite3_vfs_layout,
  type SqliteLockLevel,
  type SqliteResultCode,
} from "./Constants.ts";
import type {
  SqliteError,
  SqliteShortWriteError,
  SqliteVfsFailure,
  SqliteVfsIoError,
  SqliteVfsMethod,
  SqliteVfsPath,
  deriveLegacySqliteKey,
} from "./Database.ts";
import { evolu_codec_register } from "./EvoluCApi.ts";
import {
  allocCString,
  allocWasm,
  readCString,
  type SqliteNoMemError,
} from "./Memory.ts";
import type {
  CStringPtr,
  SqliteFilePtr,
  SqliteVfsPtr,
  WasmPtr,
} from "./Pointer.ts";
import {
  installWasmFunctions,
  type SqliteWasmDep,
  type SqliteWasmFunction,
  type SqliteWasmInitializeError,
} from "./Wasm.ts";

/**
 * A pool of sync access handles, and the VFS SQLite opens its files with, on
 * which File and EncryptedFile databases open.
 */
export interface SahPool extends Disposable {
  /**
   * The name of the pool's VFS, which a database opens its path with, such as
   * `opfs-sahpool:.evolu`. It names Evolu's codec over the pool.
   */
  readonly vfsName: string;

  /**
   * Returns the first failure a method of the pool recorded since the last
   * {@link SahPool.clearFailure}, which a {@link SqliteError} carries as its
   * cause.
   */
  readonly getFailure: () => SqliteVfsFailure | null;

  /**
   * Forgets the recorded failure; a database calls it before each operation
   * that does not run inside another operation on the pool.
   */
  readonly clearFailure: () => void;

  /**
   * Returns the canonical paths of the files the pool has, databases and their
   * journals, such as `/evolu1.db`, so a database opened at a
   * {@link SqliteVfsPath} is listed by that path. A file SQLite's opfs-sahpool
   * opened as `evolu1.db` is listed as `/evolu1.db`.
   */
  readonly getPaths: () => ReadonlyArray<string>;

  /**
   * Deletes the file with a canonical path, as {@link SahPool.getPaths} returns
   * it, and the files SQLite keeps beside it, such as its `-journal`. The file
   * goes first, so a failure never leaves a database without the journal that
   * would roll it back. Returns false when the pool has no file with the path,
   * as for a path that is not canonical, and throws when a connection has one
   * of the files open.
   */
  readonly unlink: (path: string) => Result<boolean, SqliteVfsIoError>;

  /**
   * Reads bytes of a file without SQLite, such as the first 16 bytes of an
   * encrypted database, which are its cipher salt. The path is one
   * {@link SahPool.getPaths} returns, and the offset counts from the start of
   * the file's data, after the header. Fewer bytes come back at the end of the
   * file.
   */
  readonly read: (
    path: string,
    offset: NonNegativeInt,
    byteLength: NonNegativeInt,
  ) => Result<
    Uint8Array<ArrayBuffer>,
    SahPoolFileNotFoundError | SqliteVfsIoError
  >;
}

/** Options for {@link openSahPool}. */
export interface SahPoolOptions {
  /**
   * The pool directory, as the {@link OpfsName}s of the directories from the
   * OPFS root to it, such as `[".evolu"]`. Missing directories are created. The
   * names joined with `/` name the VFS, such as `opfs-sahpool:.evolu`, which no
   * other names get.
   *
   * As in opfs-sahpool, one pool may use a directory at a time, across workers
   * and wasm instances, so serialize opens of a directory, as Evolu does with
   * its leader Web Lock. Otherwise, two openers of a new or empty directory can
   * each create their own slots, and a file both create then exists twice: on
   * the next open only one version shows, and the other is kept hidden and
   * never reused.
   */
  readonly directory: NonEmptyReadonlyArray<OpfsName>;

  /**
   * How long to keep trying to open the pool while another context holds a slot
   * of it. The pool is opened again 50 ms after a held attempt, then after
   * twice the previous delay, up to a second, and the open fails with
   * {@link SahPoolHeldError} once an attempt ends at least this long after the
   * first one started. Without it, a held slot fails the open at once.
   */
  readonly heldTimeout?: PositiveDuration;
}

/**
 * Opens the pool in a directory, registering its VFS on first use.
 *
 * Dispose every database on the pool before the pool; disposing a pool with an
 * open file throws, because closing a handle under SQLite would corrupt its
 * state, unless a trap broke the instance, after which SQLite never runs
 * again.
 */
export const openSahPool =
  ({
    directory,
    heldTimeout,
  }: SahPoolOptions): Task<
    SahPool,
    SahPoolError,
    OpfsRootDep & SqliteWasmDep
  > =>
  async (run) => {
    const { opfsRoot, random, sqliteWasm, time } = run.deps;
    // No OpfsName contains "/", NUL or a lone surrogate, so no other names get
    // this name, also as the UTF-8 C string SQLite reads up to its NUL.
    const vfsName = `opfs-sahpool:${directory.join("/")}`;
    const claimed =
      claimedVfsNamesByTable.get(sqliteWasm.functionTable) ?? new Set<string>();
    claimedVfsNamesByTable.set(sqliteWasm.functionTable, claimed);

    // Claimed before the first await, so a second open in this instance fails
    // as already open rather than on the slots this instance holds or by
    // creating slots of its own in a new directory, and never replaces the
    // first's methods on the shared registration.
    if (claimed.has(vfsName))
      return err({ type: "SahPoolAlreadyOpenError", directory });
    claimed.add(vfsName);
    using disposer = new DisposableStack();
    disposer.defer(() => {
      claimed.delete(vfsName);
    });

    const toSetupError = (cause: unknown): SahPoolSetupError => ({
      type: "SahPoolSetupError",
      cause,
    });

    const waitStart = time.performance.now();
    const slots: Array<Slot> = [];
    disposer.defer(() => {
      for (const slot of slots) slot.handle.close();
    });
    let opaque: OpfsDirectoryHandle;
    for (let retryDelay = 50; ; retryDelay = Math.min(retryDelay * 2, 1000)) {
      const listed = await tryAsync(async () => {
        let handle = await opfsRoot.getDirectory();
        for (const name of directory)
          handle = await handle.getDirectoryHandle(name, { create: true });
        handle = await handle.getDirectoryHandle(sahPoolOpaqueDirectoryName, {
          create: true,
        });
        const files: Array<OpfsFileHandle> = [];
        for await (const entry of handle.values())
          if (entry.kind === "file") files.push(entry);
        return { opaque: handle, files };
      }, toSetupError);
      if (!listed.ok) return listed;
      const { files } = listed.value;

      // Every acquisition settles before setup gives up, so none that resolves
      // after a rejection is left open. An async function turns a synchronous
      // throw into a rejection: a SharedWorker of Chromium or Firefox has no
      // createSyncAccessHandle, so calling it throws a TypeError.
      const acquired = await Promise.allSettled(
        files.map(async (file) => file.createSyncAccessHandle()),
      );
      const rejected: Array<{
        readonly fileName: string;
        readonly cause: unknown;
      }> = [];
      for (const [file, result] of zipArray([files, acquired]))
        if (result.status === "fulfilled")
          slots.push({ fileName: file.name, handle: result.value });
        else rejected.push({ fileName: file.name, cause: result.reason });
      if (!isNonEmptyArray(rejected)) {
        opaque = listed.value.opaque;
        break;
      }

      // A held slot decides, so the error does not depend on the order OPFS
      // lists the slots in.
      const held = rejected.find(({ cause }) => isHeldError(cause));
      if (held == null) return err(toSetupError(rejected[0].cause));

      // A worker that ended without closing its database, because its tab
      // closed, crashed or navigated away, can still hold the pool's files
      // after a Web Lock that serializes workers has passed on: WebKit
      // releases a terminated worker's locks and its files separately, in no
      // set order (https://bugs.webkit.org/show_bug.cgi?id=301520), and
      // Chromium lets a terminated worker finish its task, holding them, for up
      // to two seconds. Such a worker can only release them, so the pool is
      // opened again until they are. A browser can also keep them until it
      // restarts, as Chromium does after site data is cleared on Windows, so
      // the wait has a bound.
      if (
        heldTimeout == null ||
        performanceDurationBetween(waitStart, time.performance.now()) >=
          durationToMillis(heldTimeout)
      )
        return err({ type: "SahPoolHeldError", ...held });
      for (const slot of slots.splice(0)) slot.handle.close();
      await run.ok(sleep(retryDelay as PositiveMillis));
    }

    const slotByPath = new Map<string, Slot>();
    // Slots to flush before the pool writes another header: those free when it
    // opened, those a delete freed whose flush failed, and those xOpen could
    // not flush.
    const unflushedSlots = new Set<Slot>();
    // The paths of slots that a slot listed after them maps. As in
    // opfs-sahpool, they stay unused, so no other file truncates or reuses
    // them, but deleting their path frees them too.
    const shadowedPathBySlot = new Map<Slot, string>();
    // Classifies the slots and tops them up. A failed write is returned, and
    // anything thrown is caught.
    const prepared = await tryAsync(
      async (): Promise<Result<void, unknown>> => {
        // As opfs-sahpool's getAssociatedPath, but each header is read into a
        // zeroed buffer, so a short slot is not parsed with the previous one's.
        for (const slot of slots) {
          const header = new Uint8Array(sahPoolHeaderDigestOffset + 8);
          slot.handle.read(header, { at: 0 });
          const flags = new DataView(header.buffer).getUint32(
            sahPoolHeaderFlagsOffset,
          );
          const digest = computeSahPoolDigest(
            header.subarray(0, sahPoolHeaderCorpusSize),
            flags,
          );
          const stored = new Uint32Array(
            header.buffer,
            sahPoolHeaderDigestOffset,
            2,
          );
          const pathLength = header.indexOf(0);
          if (
            (pathLength !== 0 &&
              ((flags & SQLITE_OPEN_DELETEONCLOSE) !== 0 ||
                (flags & sahPoolPersistentFileTypes) === 0)) ||
            stored[0] !== digest[0] ||
            stored[1] !== digest[1]
          ) {
            const freed = writeHeader(slot.handle, "", 0);
            if (!freed.ok) return freed;
            slot.handle.flush();
            slot.handle.truncate(sahPoolHeaderSize);
          } else if (pathLength === 0) {
            slot.handle.truncate(sahPoolHeaderSize);
            unflushedSlots.add(slot);
          } else {
            const path = utf8Decoder.decode(header.subarray(0, pathLength));
            const shadowed = slotByPath.get(path);
            if (shadowed != null) shadowedPathBySlot.set(shadowed, path);
            slotByPath.set(path, slot);
          }
        }

        while (slots.length < sahPoolDefaultCapacity) {
          const fileName = createRandomName(random);
          const file = await opaque.getFileHandle(fileName, { create: true });
          const handle = await file.createSyncAccessHandle();
          slots.push({ fileName, handle });
          handle.truncate(sahPoolHeaderSize);
        }
        return ok();
      },
      err,
    );
    const failed = prepared.ok ? prepared.value : prepared.error;
    if (!failed.ok) return err(toSetupError(failed.error));

    const openFiles = new Map<SqliteFilePtr, OpenFile>();
    const lockByPath = new Map<string, PathLock>();
    // The first failure since the last clear.
    let failure: SqliteVfsFailure | null = null;
    const getOpenFile = (pFile: SqliteFilePtr): OpenFile => {
      const file = openFiles.get(pFile);
      assert(file != null, "The file is not open.");
      return file;
    };

    const recordFailure = (
      method: SqliteVfsMethod,
      path: string | null,
      error: unknown,
    ): void => {
      failure ??= { type: "SqliteVfsFailure", method, path, error };
    };

    // Runs a file's handle operation, which returns a result code, and records
    // what it throws, returning the method's own code.
    const runIo = (
      method: SqliteVfsMethod,
      file: OpenFile,
      code: SqliteResultCode,
      operation: (handle: OpfsSyncAccessHandle) => SqliteResultCode,
    ): SqliteResultCode => {
      try {
        return operation(file.slot.handle);
      } catch (error) {
        recordFailure(method, file.path, error);
        return code;
      }
    };

    const registrations =
      registrationsByTable.get(sqliteWasm.functionTable) ??
      new Map<string, SahPoolRegistration>();
    registrationsByTable.set(sqliteWasm.functionTable, registrations);
    let registration = registrations.get(vfsName);
    if (registration == null) {
      const registered = registerSahPoolVfs(run.deps, vfsName);
      if (!registered.ok) return err(toSetupError(registered.error));
      registration = registered.value;
      registrations.set(vfsName, registration);
    }
    const { ioMethods } = registration;

    // Flushes the unflushed slots, returning the first failure, so no header
    // written after a delete reaches the disk before the delete does, as the
    // first sync of a new journal in unix syncs its directory.
    const flushUnflushed = (): Result<void, unknown> => {
      for (const unflushed of unflushedSlots) {
        const flushed = trySync(
          () => unflushed.handle.flush(),
          (error) => error,
        );
        if (!flushed.ok) return flushed;
        unflushedSlots.delete(unflushed);
      }
      return ok();
    };

    // Writes and flushes the free header, which is the durable delete, and only
    // then forgets the path and truncates the slot. Returns false for a path
    // the pool does not have. It fails, keeping the path mapped, only before a
    // header write changed a byte of the path's slot: when the write changed
    // none, or when an earlier free header still cannot be flushed. Once a byte
    // changed, the header names no path on disk, and failing would make SQLite
    // roll back in this session from a journal that a worker dying during the
    // rollback loses, leaving the transaction half undone with integrity_check
    // ok. Restoring the header instead would need another write and flush on
    // the handle that just failed, so a failed flush leaves the slot to flush
    // before any later header.
    const deletePath = (path: string): Result<boolean, unknown> => {
      const slot = slotByPath.get(path);
      if (slot == null) return ok(false);
      // The slots it shadows too, or the next open would map the path to one
      // of them again, and first, so a failure leaves the path mapped.
      const slotsToFree = [...shadowedPathBySlot]
        .filter(([, shadowedPath]) => shadowedPath === path)
        .map(([shadowed]) => shadowed);
      slotsToFree.push(slot);
      for (const freeing of slotsToFree) {
        const ordered = flushUnflushed();
        if (!ordered.ok) return ordered;
        const written = writeHeader(freeing.handle, "", 0);
        // A count above the requested one is no count: Chromium off the record
        // returns FILE_ERROR_NO_SPACE, -8, for a write it refused before
        // copying a byte.
        const changed =
          written.ok ||
          (isShortWrite(written.error) &&
            written.error.written > 0 &&
            written.error.written < written.error.requested);
        if (!changed) return written;
        const flushed = trySync(
          () => freeing.handle.flush(),
          (error) => error,
        );
        if (!flushed.ok) unflushedSlots.add(freeing);
        shadowedPathBySlot.delete(freeing);
        // A failed truncate leaves the slot longer than the header, and the
        // xOpen that takes it next truncates it first, so a committed
        // transaction is not reported as an error.
        trySync(
          () => freeing.handle.truncate(sahPoolHeaderSize),
          (error) => error,
        );
      }
      slotByPath.delete(path);
      return ok(true);
    };

    // Lowers a file's lock to SHARED or NONE, as posixUnlock in os_unix.c does.
    const unlockFile = (pFile: SqliteFilePtr, level: SqliteLockLevel): void => {
      const file = getOpenFile(pFile);
      // The file's own level guards the path's lock.
      if (file.lock <= level) return;
      const pathLock = lockByPath.get(file.path);
      assert(pathLock != null, "The path is not locked.");
      const shared =
        level === SQLITE_LOCK_NONE ? pathLock.shared - 1 : pathLock.shared;
      if (shared === 0) lockByPath.delete(file.path);
      else
        lockByPath.set(file.path, {
          level:
            file.lock > SQLITE_LOCK_SHARED
              ? SQLITE_LOCK_SHARED
              : pathLock.level,
          shared,
        });
      openFiles.set(pFile, { ...file, lock: level });
    };

    const toPath = (zName: CStringPtr): Result<string, unknown> =>
      nameToPath(readCString({ sqliteWasm })(zName));

    const methods: SahPoolMethods = {
      xOpen: (
        _vfs: SqliteVfsPtr,
        zName: CStringPtr,
        pFile: SqliteFilePtr,
        flags: number,
        pOutFlags: WasmPtr | 0,
      ) => {
        const name = readCString({ sqliteWasm })(zName);
        const named = nameToPath(name);
        if (!named.ok) {
          recordFailure("xOpen", null, named.error);
          return SQLITE_CANTOPEN;
        }
        const path = named.value;
        const rejectTooLong = (): number => {
          recordFailure("xOpen", path, {
            type: "SahPoolInvalidPath",
            name,
          } satisfies SahPoolInvalidPathError);
          return SQLITE_CANTOPEN;
        };
        // Its journal's and super-journal's paths must fit a header too, or
        // every write, or every commit that writes an attached database, would
        // fail.
        if (
          (flags & SQLITE_OPEN_MAIN_DB) !== 0 &&
          utf8Encoder.encode(path).length > sahPoolMaxDatabasePathSize
        )
          return rejectTooLong();
        let slot = slotByPath.get(path);
        // SQLite creates a super-journal with SQLITE_OPEN_EXCLUSIVE, which
        // must not open a file that exists, as unix opens it with O_EXCL.
        if (
          slot != null &&
          (flags & (SQLITE_OPEN_CREATE | SQLITE_OPEN_EXCLUSIVE)) ===
            (SQLITE_OPEN_CREATE | SQLITE_OPEN_EXCLUSIVE)
        )
          return SQLITE_CANTOPEN;
        if (slot == null && (flags & SQLITE_OPEN_CREATE) !== 0) {
          if (!fitsHeader(path)) return rejectTooLong();
          const used = new Set([
            ...slotByPath.values(),
            ...shadowedPathBySlot.keys(),
          ]);
          slot = slots.find((free) => !used.has(free));
          if (slot == null) {
            recordFailure("xOpen", path, {
              type: "SahPoolFull",
              capacity: slots.length,
            } satisfies SahPoolFullError);
            return SQLITE_CANTOPEN;
          }
          const { handle } = slot;
          // An earlier delete could not shrink it.
          const truncated = trySync(
            () => {
              if (handle.getSize() > sahPoolHeaderSize)
                handle.truncate(sahPoolHeaderSize);
            },
            (error) => error,
          );
          if (!truncated.ok) {
            recordFailure("xOpen", path, truncated.error);
            return isStorageFull(truncated.error)
              ? SQLITE_FULL
              : SQLITE_CANTOPEN;
          }
          // A delete, setup or another pool may have left this slot's truncate
          // unflushed; a power loss could otherwise keep the new header with
          // the previous file's bytes behind it. Every unflushed delete too, so
          // this file cannot reach the disk before it.
          unflushedSlots.add(slot);
          const flushed = flushUnflushed();
          if (!flushed.ok) {
            recordFailure("xOpen", path, flushed.error);
            return SQLITE_IOERR_FSYNC;
          }
          const written = writeHeader(
            slot.handle,
            path,
            flags | sahPoolDigestV2Flag,
          );
          if (!written.ok) {
            recordFailure("xOpen", path, written.error);
            return isStorageFull(written.error) ? SQLITE_FULL : SQLITE_CANTOPEN;
          }
          slotByPath.set(path, slot);
        }
        if (slot == null) return SQLITE_CANTOPEN;
        openFiles.set(pFile, { path, slot, lock: SQLITE_LOCK_NONE });
        const view = sqliteWasm.getHeapDataView();
        view.setInt32(
          pFile + sqlite3_file_layout.members.pMethods.offset,
          ioMethods,
          true,
        );
        if (pOutFlags !== 0) view.setInt32(pOutFlags, flags, true);
        return SQLITE_OK;
      },
      xDelete: (_vfs: SqliteVfsPtr, zName: CStringPtr, syncDir: number) => {
        const path = toPath(zName);
        if (!path.ok) {
          recordFailure("xDelete", null, path.error);
          return SQLITE_IOERR_DELETE;
        }
        const deleted = deletePath(path.value);
        if (!deleted.ok) {
          recordFailure("xDelete", path.value, deleted.error);
          return SQLITE_IOERR_DELETE;
        }
        if (syncDir === 0) return SQLITE_OK;
        // A durable delete, as unixDelete syncs the directory after the
        // unlink and fails when that does.
        const synced = flushUnflushed();
        if (synced.ok) return SQLITE_OK;
        recordFailure("xDelete", path.value, synced.error);
        return SQLITE_IOERR_DIR_FSYNC;
      },
      xAccess: (
        _vfs: SqliteVfsPtr,
        zName: CStringPtr,
        _flags: number,
        pResOut: WasmPtr,
      ) => {
        const path = toPath(zName);
        sqliteWasm
          .getHeapDataView()
          .setInt32(
            pResOut,
            path.ok && slotByPath.has(path.value) ? 1 : 0,
            true,
          );
        return SQLITE_OK;
      },
      xClose: (pFile: SqliteFilePtr) => {
        unlockFile(pFile, SQLITE_LOCK_NONE);
        openFiles.delete(pFile);
        return SQLITE_OK;
      },
      xRead: (
        pFile: SqliteFilePtr,
        pBuf: WasmPtr,
        amount: number,
        offset: bigint,
      ) =>
        runIo("xRead", getOpenFile(pFile), SQLITE_IOERR_READ, (handle) => {
          const buffer = sqliteWasm.getHeapU8().subarray(pBuf, pBuf + amount);
          const read = handle.read(buffer, {
            at: sahPoolHeaderSize + Number(offset),
          });
          // SQLite requires the rest to be zeros.
          buffer.fill(0, read);
          return read === amount ? SQLITE_OK : SQLITE_IOERR_SHORT_READ;
        }),
      xWrite: (
        pFile: SqliteFilePtr,
        pBuf: WasmPtr,
        amount: number,
        offset: bigint,
      ) => {
        const file = getOpenFile(pFile);
        const written = writeBytes(
          file.slot.handle,
          sqliteWasm.getHeapU8().subarray(pBuf, pBuf + amount),
          sahPoolHeaderSize + Number(offset),
        );
        if (written.ok) return SQLITE_OK;
        recordFailure("xWrite", file.path, written.error);
        return isStorageFull(written.error) ? SQLITE_FULL : SQLITE_IOERR_WRITE;
      },
      xTruncate: (pFile: SqliteFilePtr, size: bigint) => {
        const file = getOpenFile(pFile);
        // SQLite truncates a database that shrank right after deleting its
        // journal, so the delete must reach the disk first, as unix orders an
        // unlink before a later truncate.
        const ordered = flushUnflushed();
        if (!ordered.ok) {
          recordFailure("xTruncate", file.path, ordered.error);
          return SQLITE_IOERR_TRUNCATE;
        }
        return runIo("xTruncate", file, SQLITE_IOERR_TRUNCATE, (handle) => {
          handle.truncate(sahPoolHeaderSize + Number(size));
          return SQLITE_OK;
        });
      },
      xSync: (pFile: SqliteFilePtr) =>
        runIo("xSync", getOpenFile(pFile), SQLITE_IOERR_FSYNC, (handle) => {
          handle.flush();
          return SQLITE_OK;
        }),
      xFileSize: (pFile: SqliteFilePtr, pSize: WasmPtr) =>
        runIo("xFileSize", getOpenFile(pFile), SQLITE_IOERR_FSTAT, (handle) => {
          const size = handle.getSize() - sahPoolHeaderSize;
          sqliteWasm.getHeapDataView().setBigInt64(pSize, BigInt(size), true);
          return SQLITE_OK;
        }),
      xLock: (pFile: SqliteFilePtr, level: SqliteLockLevel) => {
        const file = getOpenFile(pFile);
        if (file.lock >= level) return SQLITE_OK;
        const pathLock = lockByPath.get(file.path) ?? {
          level: SQLITE_LOCK_NONE,
          shared: 0,
        };
        // Another connection's lock precludes it.
        if (
          file.lock !== pathLock.level &&
          (pathLock.level >= SQLITE_LOCK_PENDING || level > SQLITE_LOCK_SHARED)
        )
          return SQLITE_BUSY;
        if (level === SQLITE_LOCK_EXCLUSIVE && pathLock.shared > 1) {
          // A failed step from RESERVED leaves PENDING, which admits no new
          // SHARED lock, as unixLock does.
          if (file.lock === SQLITE_LOCK_RESERVED) {
            lockByPath.set(file.path, {
              ...pathLock,
              level: SQLITE_LOCK_PENDING,
            });
            openFiles.set(pFile, { ...file, lock: SQLITE_LOCK_PENDING });
          }
          return SQLITE_BUSY;
        }
        lockByPath.set(
          file.path,
          level === SQLITE_LOCK_SHARED
            ? {
                // Beside another SHARED or a RESERVED, the path keeps its level.
                level:
                  pathLock.level === SQLITE_LOCK_NONE ? level : pathLock.level,
                shared: pathLock.shared + 1,
              }
            : { ...pathLock, level },
        );
        openFiles.set(pFile, { ...file, lock: level });
        return SQLITE_OK;
      },
      xUnlock: (pFile: SqliteFilePtr, level: SqliteLockLevel) => {
        unlockFile(pFile, level);
        return SQLITE_OK;
      },
      xCheckReservedLock: (pFile: SqliteFilePtr, pResOut: WasmPtr) => {
        const pathLock = lockByPath.get(getOpenFile(pFile).path);
        sqliteWasm
          .getHeapDataView()
          .setInt32(
            pResOut,
            pathLock != null && pathLock.level > SQLITE_LOCK_SHARED ? 1 : 0,
            true,
          );
        return SQLITE_OK;
      },
    };
    registration.setMethods(methods);
    disposer.defer(() => {
      registration.setMethods(null);
    });

    const pool = disposable<SahPool>(
      {
        vfsName,
        getPaths: () => [...slotByPath.keys()],
        read: (path, offset, byteLength) => {
          const slot = slotByPath.get(path);
          if (slot == null) return err({ type: "SahPoolFileNotFound", path });
          const bytes = new Uint8Array(byteLength);
          const read = trySync(
            () => slot.handle.read(bytes, { at: sahPoolHeaderSize + offset }),
            (cause): SqliteVfsIoError => ({ type: "SqliteVfsIoError", cause }),
          );
          if (!read.ok) return read;
          // Fewer at the end of the file.
          return ok(
            read.value === byteLength ? bytes : bytes.slice(0, read.value),
          );
        },
        unlink: (path) => {
          // The database first, and its free header is flushed before the
          // journal's is written, so neither a failure nor a power loss leaves
          // it without the journal that would roll it back.
          const paths = [path, `${path}-journal`, `${path}-wal`];
          for (const file of openFiles.values())
            if (paths.includes(file.path))
              throw new Error(`Cannot unlink ${path}, which is open.`);
          let found = false;
          for (const [index, filePath] of paths.entries()) {
            const deleted = deletePath(filePath);
            if (!deleted.ok)
              return err({ type: "SqliteVfsIoError", cause: deleted.error });
            if (index === 0) found = deleted.value;
          }
          return ok(found);
        },
        getFailure: () => failure,
        clearFailure: () => {
          failure = null;
        },
      },
      disposer,
    );
    return ok({
      ...pool,
      [Symbol.dispose]: () => {
        // A Disposable that throws is still disposed, so this checks first.
        // After a trap, SQLite never runs again, so its open files no longer
        // keep the pool.
        if (openFiles.size > 0 && !sqliteWasm.isBroken())
          throw new Error(
            "Cannot dispose a SahPool with an open file, because closing its handle would corrupt SQLite's state.",
          );
        pool[Symbol.dispose]();
      },
    });
  };

/** Why {@link openSahPool} failed. */
export type SahPoolError =
  SahPoolAlreadyOpenError | SahPoolHeldError | SahPoolSetupError;

/**
 * This instance has a pool in the directory open, or is opening one. A retry
 * succeeds once that pool is disposed or its open failed.
 */
export interface SahPoolAlreadyOpenError extends Typed<"SahPoolAlreadyOpenError"> {
  /** The {@link SahPoolOptions.directory}. */
  readonly directory: NonEmptyReadonlyArray<OpfsName>;
}

/**
 * Another context or instance holds a slot of the pool. The pool wrote nothing,
 * and a retry succeeds once the slot is released.
 *
 * In WebKit, the error can also mean that the context opening the pool is
 * stopping, because WebKit reports that with the same `InvalidStateError` as a
 * held file, so retries need a bound.
 */
export interface SahPoolHeldError extends Typed<"SahPoolHeldError"> {
  /** The slot's file name in {@link sahPoolOpaqueDirectoryName}. */
  readonly fileName: string;
  /**
   * What `createSyncAccessHandle` threw: `NoModificationAllowedError`, or
   * `InvalidStateError` in WebKit.
   */
  readonly cause: unknown;
}

/**
 * OPFS failed while the pool was being set up, or its VFS could not be
 * registered.
 */
export interface SahPoolSetupError extends Typed<"SahPoolSetupError"> {
  /**
   * What OPFS threw, a {@link SqliteShortWriteError}, or a
   * {@link SqliteNoMemError} or {@link SqliteWasmInitializeError} from
   * registering the VFS.
   */
  readonly cause: unknown;
}

/** The pool has no file with the path. */
export interface SahPoolFileNotFoundError extends Typed<"SahPoolFileNotFound"> {
  readonly path: string;
}

/**
 * No slot of the pool is free for a new file, which `xOpen` records when it
 * fails with SQLITE_CANTOPEN.
 */
export interface SahPoolFullError extends Typed<"SahPoolFull"> {
  /** The number of slots, none of them free. */
  readonly capacity: number;
}

/**
 * A name `xOpen`, `xDelete` or `xAccess` cannot map to a pool path, because the
 * suffix SQLite appends would land in its query, fragment or host, which would
 * map a database and its journal to the same file. `xOpen` also records it for
 * a path that would not fit a slot's header, or a database's path whose
 * super-journal's path would not.
 */
export interface SahPoolInvalidPathError extends Typed<"SahPoolInvalidPath"> {
  readonly name: string;
}

/**
 * Access to the OPFS root, which `navigator.storage` provides in a dedicated
 * worker.
 *
 * It and the handle interfaces below declare only the part of the File System
 * API the pool uses, which the browser's objects implement, so a test can pass
 * a fake.
 */
export interface OpfsRoot {
  readonly getDirectory: () => Promise<OpfsDirectoryHandle>;
}

/** The part of `FileSystemDirectoryHandle` the pool uses. */
export interface OpfsDirectoryHandle {
  readonly kind: "directory";
  readonly getDirectoryHandle: (
    name: string,
    options: { readonly create: true },
  ) => Promise<OpfsDirectoryHandle>;
  readonly getFileHandle: (
    name: string,
    options: { readonly create: true },
  ) => Promise<OpfsFileHandle>;
  readonly values: () => AsyncIterable<OpfsDirectoryHandle | OpfsFileHandle>;
}

/** The part of `FileSystemFileHandle` the pool uses. */
export interface OpfsFileHandle {
  readonly kind: "file";
  readonly name: string;
  readonly createSyncAccessHandle: () => Promise<OpfsSyncAccessHandle>;
}

/** The part of `FileSystemSyncAccessHandle` the pool uses. */
export interface OpfsSyncAccessHandle {
  readonly read: (
    buffer: Uint8Array<ArrayBuffer>,
    options: { readonly at: number },
  ) => number;
  readonly write: (
    buffer: Uint8Array<ArrayBuffer>,
    options: { readonly at: number },
  ) => number;
  readonly truncate: (newSize: number) => void;
  readonly getSize: () => number;
  readonly flush: () => void;
  readonly close: () => void;
}

/** Dependency wrapper for {@link OpfsRoot}. */
export interface OpfsRootDep {
  readonly opfsRoot: OpfsRoot;
}

/** Error returned when a string is not a valid {@link OpfsName}. */
export interface OpfsNameError extends TypeError<"OpfsName"> {
  readonly value: string;
}

/**
 * The name of a file or directory in OPFS, a [valid file
 * name](https://fs.spec.whatwg.org/#valid-file-name) of the File System
 * Standard on every platform in one spelling: not empty, not `.` or `..`,
 * without `/` or `\`, which is a path separator on Windows, without NUL or a
 * lone surrogate, and in Unicode NFC.
 *
 * Names that differ only in case are different names, but in WebKit on macOS,
 * whose file system ignores case by default, they name one directory, and two
 * pools can hold it at once, because WebKit locks a file by its path as
 * spelled. Spell each directory in one case.
 */
export const OpfsName = /*#__PURE__*/ brand(
  "OpfsName",
  String,
  (value) =>
    value === "" ||
    value === "." ||
    value === ".." ||
    // SQLite reads a VFS name only up to its first NUL, and Chromium a file
    // name, and the File System API and TextEncoder replace a lone surrogate
    // with U+FFFD, so such a name would share a VFS or directory with another.
    /[/\\\0\p{Cs}]/u.test(value) ||
    // WebKit on macOS keeps OPFS as files of a file system that ignores
    // Unicode normalization, but locks a file by its path as spelled, so two
    // normalizations of a name would both hold one directory.
    value.normalize("NFC") !== value
      ? err<OpfsNameError>({ type: "OpfsName", value })
      : ok(),
  (error) =>
    `The value ${safelyStringifyUnknownValue(error.value)} is not a valid OpfsName.`,
);
export type OpfsName = typeof OpfsName.Output;

/** The size of a slot's header, where the file's data starts. */
export const sahPoolHeaderSize = 4096;

/** The bytes reserved for the NUL-padded path at the start of the header. */
export const sahPoolHeaderPathSize = 512;

/**
 * The longest path of a database a pool opens, in UTF-8 bytes, 498. SQLite
 * names the other files of a database by appending a suffix to its path, at
 * most the 12 bytes of a super-journal's `-mjXXXXXX9XX`, and each path must fit
 * a slot's header with its NUL, as opfs-sahpool requires, which allows 510
 * bytes.
 */
export const sahPoolMaxDatabasePathSize = sahPoolHeaderPathSize - 2 - 12;

/** Where the header's big-endian u32 flags start, after the path. */
export const sahPoolHeaderFlagsOffset = 512;

/** The size of the path and flags, which the digest covers. */
export const sahPoolHeaderCorpusSize = 516;

/** Where the header's digest, two platform-endian u32 values, starts. */
export const sahPoolHeaderDigestOffset = 516;

/**
 * The flag that marks a header digest as version 2.
 *
 * Opfs-sahpool before SQLite 3.50 computed every digest as `[0, 0]` because of
 * an overflow. The fix repurposed SQLITE_OPEN_MEMORY, which never reaches a
 * VFS, to mark headers written with the fixed digest, so older headers stay
 * valid.
 */
export const sahPoolDigestV2Flag = SQLITE_OPEN_MEMORY;

/**
 * The file types that persist across sessions: SQLITE_OPEN_MAIN_DB,
 * SQLITE_OPEN_MAIN_JOURNAL, SQLITE_OPEN_SUPER_JOURNAL and SQLITE_OPEN_WAL,
 * combined. A slot with another type is freed at setup.
 */
export const sahPoolPersistentFileTypes =
  SQLITE_OPEN_MAIN_DB |
  SQLITE_OPEN_MAIN_JOURNAL |
  SQLITE_OPEN_SUPER_JOURNAL |
  SQLITE_OPEN_WAL;

/** The pool subdirectory that holds the slots. Renaming it orphans them. */
export const sahPoolOpaqueDirectoryName = ".opaque";

// What opfs-sahpool's xSectorSize returns.
const sahPoolSectorSize = 4096;

/** The number of slots setup ensures: a database, its journal, and spares. */
export const sahPoolDefaultCapacity = 6;

/**
 * Computes the digest of a header's first {@link sahPoolHeaderCorpusSize} bytes,
 * as opfs-sahpool does.
 *
 * Without {@link sahPoolDigestV2Flag} in the flags, the digest is the legacy
 * `[0, 0]`. Otherwise `h1` starts at `0xdeadbeef` and `h2` at `0x41c6ce57`; for
 * each byte, `h1 = Math.imul(h1 ^ byte, 2654435761)` and `h2 = Math.imul(h2 ^
 * byte, 104729)`; the digest is `[h1 >>> 0, h2 >>> 0]`. The result's bytes are
 * written to the header as they are.
 */
export const computeSahPoolDigest = (
  corpus: Uint8Array,
  flags: number,
): Uint32Array<ArrayBuffer> => {
  if ((flags & sahPoolDigestV2Flag) === 0) return new Uint32Array(2);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const byte of corpus) {
    h1 = Math.imul(h1 ^ byte, 2654435761);
    h2 = Math.imul(h2 ^ byte, 104729);
  }
  return Uint32Array.of(h1 >>> 0, h2 >>> 0);
};

const utf8Encoder = /*#__PURE__*/ new TextEncoder();
// Keeps a leading byte order mark, which the default decoder strips, so a
// header's path decodes as written.
const utf8Decoder = /*#__PURE__*/ new TextDecoder("utf-8", { ignoreBOM: true });

/** A file of the pool and its sync access handle. */
interface Slot {
  readonly fileName: string;
  readonly handle: OpfsSyncAccessHandle;
}

/** The names of the VFS and I/O methods that need a pool's files. */
type SahPoolMethodName =
  | "xOpen"
  | "xDelete"
  | "xAccess"
  | "xClose"
  | "xRead"
  | "xWrite"
  | "xTruncate"
  | "xSync"
  | "xFileSize"
  | "xLock"
  | "xUnlock"
  | "xCheckReservedLock";

/**
 * The methods that need a pool's files, with the arguments SQLite passes,
 * including the VFS or the file.
 */
type SahPoolMethods = Readonly<
  Record<SahPoolMethodName, SqliteWasmFunction["fn"]>
>;

/** A file SQLite opened. */
interface OpenFile {
  readonly path: string;
  readonly slot: Slot;
  readonly lock: SqliteLockLevel;
}

/**
 * The lock of a path, as `unixInodeInfo` in `os_unix.c` keeps it: the level of
 * the connection that holds the most, and how many hold SHARED or more.
 */
interface PathLock {
  readonly level: SqliteLockLevel;
  readonly shared: number;
}

/**
 * The VFS of a pool directory, with Evolu's codec over it, registered once per
 * instance.
 */
interface SahPoolRegistration {
  /** The `sqlite3_io_methods` struct a successful `xOpen` sets. */
  readonly ioMethods: WasmPtr;
  /** Hands the VFS to a pool's methods, or pauses it with null. */
  readonly setMethods: (methods: SahPoolMethods | null) => void;
}

// The VFS names of the pools each instance has open or is opening.
const claimedVfsNamesByTable = /*#__PURE__*/ new WeakMap<
  WebAssembly.Table,
  Set<string>
>();

// The VFS of each pool directory, with Evolu's codec over it registered, by
// the instance's function table.
const registrationsByTable = /*#__PURE__*/ new WeakMap<
  WebAssembly.Table,
  Map<string, SahPoolRegistration>
>();

/**
 * Allocates and registers a VFS whose methods call the active pool's, never to
 * be freed, under an internal name, then registers Evolu's codec over it under
 * the pool's name and unregisters it, so SQL reaches the pool only through the
 * codec. On failure, nothing stays registered or allocated.
 */
const registerSahPoolVfs = (
  deps: RandomBytesDep & ReportDefectDep & SqliteWasmDep & TimeDep,
  vfsName: string,
): Result<
  SahPoolRegistration,
  SqliteNoMemError | SqliteWasmInitializeError
> => {
  const { randomBytes, sqliteWasm, time } = deps;

  // Null while paused, when no file can be open.
  let methods: SahPoolMethods | null = null;

  const callMethod = (
    name: SahPoolMethodName,
    args: ReadonlyArray<unknown>,
  ): number => {
    assert(methods != null, "The pool is paused.");
    return (methods[name] as (...args: ReadonlyArray<unknown>) => number)(
      ...args,
    );
  };
  const forward =
    (name: SahPoolMethodName) =>
    (...args: ReadonlyArray<unknown>): number =>
      callMethod(name, args);

  const { members } = sqlite3_vfs_layout;
  const vfsMethods: NonEmptyReadonlyArray<
    readonly [keyof typeof members, SqliteWasmFunction["fn"]]
  > = [
    [
      "xOpen",
      (
        vfs: SqliteVfsPtr,
        zName: CStringPtr,
        pFile: SqliteFilePtr,
        flags: number,
        pOutFlags: WasmPtr | 0,
      ) => {
        // A failed open leaves it NULL, so SQLite does not call xClose.
        sqliteWasm
          .getHeapDataView()
          .setInt32(
            pFile + sqlite3_file_layout.members.pMethods.offset,
            0,
            true,
          );
        if (methods == null) return SQLITE_CANTOPEN;
        return callMethod("xOpen", [vfs, zName, pFile, flags, pOutFlags]);
      },
    ],
    [
      "xDelete",
      (...args: ReadonlyArray<unknown>) =>
        methods == null ? SQLITE_IOERR_DELETE : callMethod("xDelete", args),
    ],
    [
      "xAccess",
      (
        vfs: SqliteVfsPtr,
        zName: CStringPtr,
        flags: number,
        pResOut: WasmPtr,
      ) => {
        if (methods != null)
          return callMethod("xAccess", [vfs, zName, flags, pResOut]);
        sqliteWasm.getHeapDataView().setInt32(pResOut, 0, true);
        return SQLITE_OK;
      },
    ],
    [
      "xFullPathname",
      (_vfs: SqliteVfsPtr, zName: CStringPtr, nOut: number, pOut: WasmPtr) => {
        const heap = sqliteWasm.getHeapU8();
        // With its NUL.
        const length = heap.indexOf(0, zName) - zName + 1;
        if (length > nOut) return SQLITE_CANTOPEN;
        heap.copyWithin(pOut, zName, zName + length);
        return SQLITE_OK;
      },
    ],
    [
      "xRandomness",
      (_vfs: SqliteVfsPtr, byteLength: number, pOut: WasmPtr) => {
        // In chunks of at most 65536 bytes, as crypto.getRandomValues requires,
        // each created before the heap view, since RandomBytes can grow the
        // memory.
        for (let offset = 0; offset < byteLength; offset += 65536) {
          const bytes = randomBytes.create(
            Math.min(65536, byteLength - offset),
          );
          sqliteWasm.getHeapU8().set(bytes, pOut + offset);
        }
        return byteLength;
      },
    ],
    // Contention can only come from connections in the same thread, which
    // sleeping cannot resolve.
    ["xSleep", () => 0],
    [
      "xCurrentTime",
      (_vfs: SqliteVfsPtr, pTime: WasmPtr) => {
        sqliteWasm
          .getHeapDataView()
          .setFloat64(pTime, time.now() / 86_400_000 + 2_440_587.5, true);
        return SQLITE_OK;
      },
    ],
    ["xGetLastError", () => 0],
    [
      "xCurrentTimeInt64",
      (_vfs: SqliteVfsPtr, pTime: WasmPtr) => {
        // Milliseconds since the Julian day epoch, noon in Greenwich on
        // November 24, 4714 BC.
        sqliteWasm
          .getHeapDataView()
          .setBigInt64(pTime, BigInt(time.now()) + 210_866_760_000_000n, true);
        return SQLITE_OK;
      },
    ],
  ];
  const ioMembers = sqlite3_io_methods_layout.members;
  const ioMethods: NonEmptyReadonlyArray<
    readonly [keyof typeof ioMembers, SqliteWasmFunction["fn"]]
  > = [
    ["xClose", forward("xClose")],
    ["xRead", forward("xRead")],
    ["xWrite", forward("xWrite")],
    ["xTruncate", forward("xTruncate")],
    ["xSync", forward("xSync")],
    ["xFileSize", forward("xFileSize")],
    ["xLock", forward("xLock")],
    ["xUnlock", forward("xUnlock")],
    ["xCheckReservedLock", forward("xCheckReservedLock")],
    // Evolu's codec above handles the file controls of its files, such as the
    // keying pragmas, and forwards the rest here.
    ["xFileControl", () => SQLITE_NOTFOUND],
    ["xSectorSize", () => sahPoolSectorSize],
    // opfs-sahpool returns SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN, which makes
    // SQLite keep a PERSIST or TRUNCATE journal open after it unlocks, but
    // xDelete frees the slot of an open file.
    ["xDeviceCharacteristics", () => 0],
  ];
  // A prefix no pool's name has, since each starts with opfs-sahpool:.
  const name = utf8Encoder.encode(`evolu-raw:${vfsName}\0`);
  // The VFS struct, the I/O methods struct and the name, in one block,
  // allocated through call, so a broken instance throws before anything is
  // allocated or installed.
  const allocated = sqliteWasm.call(() =>
    allocWasm(deps)(
      sqlite3_vfs_layout.sizeof +
        sqlite3_io_methods_layout.sizeof +
        name.length,
    ),
  );
  if (!allocated.ok) return allocated;
  // The codec copies its name, so this one is freed once it registered.
  const codecName = sqliteWasm.call(() => allocCString(deps)(vfsName));
  if (!codecName.ok) {
    sqliteWasm.call(() => {
      sqliteWasm.exports.sqlite3_free(allocated.value);
    });
    return codecName;
  }
  const vfs = allocated.value as WasmPtr as SqliteVfsPtr;
  const ioMethodsPtr = (vfs + sqlite3_vfs_layout.sizeof) as WasmPtr;
  const zName = ioMethodsPtr + sqlite3_io_methods_layout.sizeof;

  const installed = installWasmFunctions(deps)([
    ...mapArray(vfsMethods, ([member, fn]) => ({
      signature: members[member].signature,
      fn,
    })),
    ...mapArray(ioMethods, ([member, fn]) => ({
      signature: ioMembers[member].signature,
      fn,
    })),
  ]);

  return sqliteWasm.call(() => {
    const heap = sqliteWasm.getHeapU8();
    heap.fill(0, vfs, zName);
    heap.set(name, zName);
    const view = sqliteWasm.getHeapDataView();
    for (const [member, value] of [
      ["iVersion", 2],
      ["szOsFile", sqlite3_file_layout.sizeof],
      ["mxPathname", sahPoolHeaderPathSize],
      ["zName", zName],
    ] as const)
      view.setInt32(vfs + members[member].offset, value, true);
    for (const [[member], pointer] of zipArray([
      vfsMethods,
      installed.pointers.slice(0, vfsMethods.length),
    ]))
      view.setInt32(vfs + members[member].offset, pointer, true);
    view.setInt32(ioMethodsPtr + ioMembers.iVersion.offset, 1, true);
    for (const [[member], pointer] of zipArray([
      ioMethods,
      installed.pointers.slice(vfsMethods.length),
    ]))
      view.setInt32(ioMethodsPtr + ioMembers[member].offset, pointer, true);

    const registered = sqliteWasm.exports.sqlite3_vfs_register(vfs, 0);
    const code =
      registered === SQLITE_OK
        ? evolu_codec_register(deps)(codecName.value, zName as CStringPtr)
        : registered;
    // Also when the codec failed to register, as when an app holds the pool's
    // name, so no SQL ever reaches the pool without it.
    if (registered === SQLITE_OK)
      sqliteWasm.exports.sqlite3_vfs_unregister(vfs);
    sqliteWasm.exports.sqlite3_free(codecName.value);
    if (code !== SQLITE_OK) {
      installed[Symbol.dispose]();
      sqliteWasm.exports.sqlite3_free(allocated.value);
      return err({ type: "SqliteWasmInitializeError", code });
    }
    return ok({
      ioMethods: ioMethodsPtr,
      setMethods: (newMethods) => {
        methods = newMethods;
      },
    });
  });
};

/**
 * Writes a slot's header: its path, flags and digest, failing as
 * {@link writeBytes} does.
 */
const writeHeader = (
  handle: OpfsSyncAccessHandle,
  path: string,
  flags: number,
): Result<void, unknown> => {
  const header = new Uint8Array(sahPoolHeaderDigestOffset + 8);
  utf8Encoder.encodeInto(path, header.subarray(0, sahPoolHeaderPathSize));
  new DataView(header.buffer).setUint32(sahPoolHeaderFlagsOffset, flags);
  header.set(
    new Uint8Array(
      computeSahPoolDigest(header.subarray(0, sahPoolHeaderCorpusSize), flags)
        .buffer,
    ),
    sahPoolHeaderDigestOffset,
  );
  return writeBytes(handle, header, 0);
};

/**
 * Whether a path fits a slot's header with its NUL, as opfs-sahpool requires,
 * which allows 510 UTF-8 bytes.
 */
const fitsHeader = (path: string): boolean =>
  utf8Encoder.encode(path).length < sahPoolHeaderPathSize - 1;

/** Returns a random name of letters and digits, as opfs-sahpool creates them. */
const createRandomName = (random: Random): string =>
  random.next().toString(36).slice(2);

/** Whether a value is an error with the name, such as a `DOMException`. */
const hasName = (error: unknown, name: string): boolean =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  error.name === name;

/**
 * Whether acquiring a sync access handle failed because another context or
 * instance holds the file.
 */
const isHeldError = (error: unknown): boolean =>
  // WebKit rejects a held file with InvalidStateError, other engines with
  // NoModificationAllowedError, as the spec says
  // (https://bugs.webkit.org/show_bug.cgi?id=326135). WebKit also uses
  // InvalidStateError for a closed or invalid handle and a stopped context. A
  // retry acquires fresh handles from a new listing, and a stopped context
  // ends with its worker, so a bounded retry of those is harmless.
  hasName(error, "NoModificationAllowedError") ||
  hasName(error, "InvalidStateError");

/**
 * Writes all the bytes, failing with what the handle threw, or with a
 * {@link SqliteShortWriteError} when it wrote another count.
 */
const writeBytes = (
  handle: OpfsSyncAccessHandle,
  bytes: Uint8Array<ArrayBuffer>,
  at: number,
): Result<void, unknown> => {
  const written = trySync(
    () => handle.write(bytes, { at }),
    (error) => error,
  );
  if (!written.ok) return written;
  if (written.value === bytes.length) return ok();
  return err({
    type: "SqliteShortWrite",
    requested: bytes.length,
    written: written.value,
  } satisfies SqliteShortWriteError);
};

/**
 * Whether a write failed because storage is full: an error named
 * `QuotaExceededError`, matched by name so subclasses and non-DOMException
 * errors count, or a {@link SqliteShortWriteError}.
 */
const isStorageFull = (error: unknown): boolean =>
  hasName(error, "QuotaExceededError") || isShortWrite(error);

/** Whether a write failed with a {@link SqliteShortWriteError}. */
const isShortWrite = (error: unknown): error is SqliteShortWriteError =>
  typeof error === "object" &&
  error !== null &&
  "type" in error &&
  error.type === "SqliteShortWrite";

/**
 * Maps a name to the pool's path, as the module documentation describes.
 *
 * A name such as `//[` is not a valid URL. A query, a fragment or a host would
 * swallow the suffix SQLite appends, so `/a?b.db` and its journal
 * `/a?b.db-journal` would both be `/a`, and deleting the journal at commit
 * would delete the database.
 */
const nameToPath = (name: string): Result<string, unknown> => {
  // The paths are compared rather than the host read, because engines parse
  // the host of a file URL differently: Chromium keeps localhost, so every
  // name has a host there (https://github.com/whatwg/url/issues/618), and
  // Firefox discards any host, so `//evolu.db` is `/` without one
  // (https://bugzilla.mozilla.org/show_bug.cgi?id=1507354).
  const paths = trySync(
    () =>
      [
        new URL(name, "file://localhost/").pathname,
        new URL(`${name}-journal`, "file://localhost/").pathname,
      ] as const,
    (error) => error,
  );
  if (!paths.ok) return paths;
  const [path, journalPath] = paths.value;
  if (journalPath !== `${path}-journal`)
    return err({
      type: "SahPoolInvalidPath",
      name,
    } satisfies SahPoolInvalidPathError);
  return ok(path);
};
