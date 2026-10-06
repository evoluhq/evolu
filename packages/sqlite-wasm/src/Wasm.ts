/**
 * SQLite's Emscripten wasm, loaded without Emscripten's or SQLite's JavaScript.
 *
 * The package ships SQLite's own wasm, built with SQLite's own makefile, and
 * replaces the generated JavaScript with a small loader and the standalone
 * functions of `@evolu/sqlite-wasm/c-api`.
 *
 * ## Loading
 *
 * {@link createSqliteWasm} runs these steps and fails with a
 * {@link SqliteWasmError} when one fails. Steps 1 to 3 fail before any wasm code
 * runs, and steps 4 and 5 run only the stack setup, static constructors and
 * `sqlite3__wasm_enum_json()`, before any SQLite API call:
 *
 * 1. Compile, while downloading a `Response` of type `application/wasm`.
 * 2. Import guard: every import the binary declares must be one the loader
 *    implements, or instantiation never happens. A new Emscripten or SQLite
 *    release that adds an import is caught here, not at the first call that
 *    reaches it. The list matches the release recipe exactly.
 * 3. A fresh `WebAssembly.Memory` of at least the size the binary declares, which
 *    the JavaScript API does not expose (256 pages covers every build so far),
 *    and a maximum of 32768 pages, so pointers stay positive i32 values. An
 *    engine that cannot allocate it, as on a device low on memory, fails
 *    loading with {@link SqliteWasmCompileError}.
 * 4. Instantiate, then set up the C stack for Emscripten's stack check: call
 *    `emscripten_stack_init`, then `__set_stack_limits` with what
 *    `emscripten_stack_get_base` and `emscripten_stack_get_end` return. The
 *    check compares each new stack pointer with limits that start at 0, so they
 *    are set before any code moves it. Then call `__wasm_call_ctors` exactly
 *    once. A binary without one of these functions fails the build guard.
 * 5. Build guard: the hash {@link sqliteWasmBuildHash} defines, computed from the
 *    string `sqlite3__wasm_enum_json()` returns and the names
 *    `WebAssembly.Module.exports` lists, must equal it. A match means the
 *    binary has the pinned build's export names, so it exports every function
 *    in {@link SqliteCExports}, and the generated constants, struct layouts and
 *    {@link SQLITE_WASM_DEALLOC} describe it. The hash does not cover wasm
 *    types: the generator checked the bindings against the pinned types, and
 *    `scripts/generate.mts --verify-build` checks a new binary's. A binary
 *    without `sqlite3__wasm_enum_json`, or whose call returns NULL, hashes the
 *    string as empty and fails. No JSON is parsed at runtime.
 * 6. `sqlite3_initialize()`, whose result code is checked.
 * 7. Register the default VFS, then run {@link initializeSqliteWasm}, which makes
 *    it the default and calls `sqlite3_randomness(0, 0)`. SQLite's random
 *    number generator seeds itself from the default VFS at its first use, and
 *    again at the first use after that call resets it. Without Emscripten's
 *    file system, SQLite's unix VFS seeds it from the time and a constant pid,
 *    so two instances seeded in the same second would share `randomblob()`
 *    values and journal nonces. Nothing uses the generator while loading, so
 *    the reset is defensive here; it matters after `sqlite3_shutdown()`. It
 *    also unregisters SQLite's kvvfs, which `sqlite3_initialize()` registers
 *    but whose storage only SQLite's JavaScript provides, so opening it, as the
 *    names `:localStorage:` and `:sessionStorage:` do on any VFS, fails with
 *    SQLITE_ERROR instead of trapping. Allocating, finding or registering the
 *    VFS fails with {@link SqliteWasmInitializeError}, and compiling the
 *    generated module that installs its methods, which a Content Security
 *    Policy without 'wasm-unsafe-eval' forbids, fails with
 *    {@link SqliteWasmCompileError}. `sqlite3_initialize()` after
 *    `sqlite3_shutdown()` makes the unix VFS the default again, so
 *    {@link initializeSqliteWasm} must run instead.
 *
 * ## The default VFS
 *
 * `evolu-memory`, of version 2, has no files, so only `:memory:` databases use
 * it:
 *
 * - `xFullPathname` fails with SQLITE_CANTOPEN, so opening a file path fails
 *   before SQLite would open a file. `xOpen` is NULL: SQLite opens a file
 *   without a path only for a temporary file, which this build keeps in memory.
 *   `xAccess` finds no file, and `xDelete` returns SQLITE_IOERR_DELETE_NOENT.
 * - `xRandomness` fills memory from {@link RandomBytes}, in chunks of at most
 *   65536 bytes, as `crypto.getRandomValues` requires.
 * - `xCurrentTime` and `xCurrentTimeInt64` read `Time.now` of {@link Time}.
 * - `xSleep` returns at once, having slept 0 microseconds. Contention can only
 *   come from connections in the same thread, which sleeping cannot resolve.
 * - `xGetLastError` reports no system error.
 *
 * ## Imports
 *
 * About ten imports do real work:
 *
 * - `memory`, see step 3.
 * - `__handle_stack_overflow`, which the build's stack check
 *   (`-sSTACK_OVERFLOW_CHECK=2`) calls instead of moving the stack pointer
 *   outside the C stack, throws a `WebAssembly.RuntimeError`, as a trap does.
 *   The C stack has 512 KiB directly above SQLite's static data, and SQL that
 *   is legal but nests deeply enough, such as a chain of 600 triggers, would
 *   otherwise overwrite that data silently.
 * - `emscripten_resize_heap` grows memory to the requested size, read as
 *   unsigned, and returns 1, or 0 when it cannot, never throwing.
 * - The clocks read {@link Time}: `emscripten_date_now` returns `Time.now`,
 *   `emscripten_get_now` returns `Time.performance.now`, and WASI
 *   `clock_time_get` writes BigInt nanoseconds of the first for the realtime
 *   clock and of the second for the monotonic and CPU-time clocks, and returns
 *   EINVAL for any other.
 * - `_localtime_js`, for SQL `localtime`, reads `Date` in the local time zone and
 *   fails for a time `Date` cannot represent. It fills only the `struct tm`
 *   fields SQLite reads, from `tm_sec` to `tm_year`, and zeroes the others.
 *   `_tzset_js` writes nothing: only `localtime_r` reads what it would write,
 *   to set `tm_zone`, which nothing reads.
 * - `environ_sizes_get` and `environ_get` describe an empty environment.
 * - `fd_write`, for C-side diagnostics, writes complete lines of stdout with
 *   {@link Console.log} and of stderr with {@link Console.error}, and fails any
 *   other descriptor with EBADF.
 *
 * The `__syscall_*` imports return -ENOSYS (-52), and the remaining WASI `fd_*`
 * imports return ENOSYS (52), as WASI errors are positive: only `openat` of
 * `/dev/urandom` is ever reached, and step 7 covers it.
 *
 * Every import's wasm type and the memory limits are pinned in
 * `scripts/upstream/sqlite3-wasm-imports.json`, and `scripts/generate.mts
 * --verify-build` checks a binary against them.
 *
 * ## Rules for everything that uses the instance
 *
 * - Synchronous only. The build has neither Asyncify nor JSPI, and nothing in the
 *   SQLite call path returns a promise.
 * - Any call that can allocate, including a VFS callback running inside
 *   `sqlite3_step`, can grow memory, which detaches the previous `ArrayBuffer`.
 *   Take heap views with {@link SqliteWasm.getHeapU8} after such calls and never
 *   keep one across them.
 * - No JavaScript exception may cross into wasm. Every function installed with
 *   {@link installWasmFunctions} catches what it throws, reports it as a defect
 *   and returns SQLITE_ERROR.
 * - A trap or a C stack overflow throws a `WebAssembly.RuntimeError`, which
 *   installed functions let through. When the static constructors trap, loading
 *   fails with {@link SqliteWasmCompileError}.
 * - Any exception or trap that escapes a wasm call is a defect. It unwound C
 *   frames without cleanup, so the C stack and SQLite's state are left
 *   inconsistent: it is rethrown, the instance refuses every later call, and
 *   its worker should end. {@link SqliteWasm.call} enforces this. The CApi
 *   functions return the exports themselves, so code that calls them directly
 *   must call through it. An installed function that returns once the instance
 *   is broken, as one that caught what a nested call rethrew, or whose
 *   {@link ReportDefect} broke it, throws that refusal instead, so SQLite never
 *   resumes on that state.
 *
 * @module
 */

import {
  constVoid,
  disposable,
  err,
  isNonEmptyArray,
  mapArray,
  mapObject,
  ok,
  reportDefectAfterMicrotask,
  tryAsync,
  trySync,
  type Console,
  type ConsoleDep,
  type NonEmptyReadonlyArray,
  type RandomBytes,
  type RandomBytesDep,
  type ReadonlyRecord,
  type ReportDefect,
  type ReportDefectDep,
  type Result,
  type Task,
  type Time,
  type TimeDep,
  type Typed,
  zipArray,
} from "@evolu/common";
import type { SqliteCExports } from "./CApi.ts";
import {
  SQLITE_CANTOPEN,
  SQLITE_ERROR,
  SQLITE_IOERR_DELETE_NOENT,
  SQLITE_MISUSE,
  SQLITE_NOMEM,
  SQLITE_OK,
  sqlite3_file_layout,
  sqlite3_vfs_layout,
  sqliteWasmBuildHash,
  type SQLITE_WASM_DEALLOC,
  type SqliteResultCode,
} from "./Constants.ts";
import { allocCString, allocWasm } from "./Memory.ts";
import type {
  CStringPtr,
  SqliteFunctionPtr,
  SqliteVfsPtr,
  WasmPtr,
} from "./Pointer.ts";

/**
 * A loaded SQLite wasm instance.
 *
 * One instance serves every database of a worker. It cannot be disposed; it
 * lives until the worker ends.
 */
export interface SqliteWasm {
  /**
   * The C functions, and the build's shims of the variadic ones, as the wasm
   * exports them.
   *
   * Prefer the standalone functions of `@evolu/sqlite-wasm/c-api`, which read
   * these once per database.
   */
  readonly exports: SqliteCExports;

  /** The wasm function table, where C function pointers point. */
  readonly functionTable: WebAssembly.Table;

  /**
   * Returns a view of the whole heap, created again when memory has grown since
   * the previous call.
   */
  readonly getHeapU8: () => Uint8Array<ArrayBuffer>;

  /** Returns a `DataView` of the whole heap, like {@link SqliteWasm.getHeapU8}. */
  readonly getHeapDataView: () => DataView<ArrayBuffer>;

  /**
   * Calls a function that calls into wasm, and returns its result.
   *
   * Anything the function throws breaks the instance, as the module
   * documentation explains: it is rethrown, and this and every later call throw
   * without calling the function. Databases call wasm through it, and so should
   * code that calls the CApi functions directly.
   */
  readonly call: <T>(fn: () => T) => T;

  /**
   * Whether an error escaped {@link SqliteWasm.call}, so the instance refuses
   * calls.
   */
  readonly isBroken: () => boolean;
}

/** Dependency wrapper for {@link SqliteWasm}. */
export interface SqliteWasmDep {
  readonly sqliteWasm: SqliteWasm;
}

/**
 * The wasm binary, compiled or not.
 *
 * A `Response` or a promise of one, such as `fetch` returns, compiles while it
 * downloads when its `Content-Type` is exactly `application/wasm`, which keeps
 * Chromium's code cache too. That is the only type every engine's
 * `WebAssembly.compileStreaming` accepts, so any other compiles from its bytes
 * once it has downloaded. A failed fetch fails with
 * {@link SqliteWasmCompileError}, and so does a response whose status is not ok,
 * such as a 404 for a wrong URL, with a `TypeError` naming the status as its
 * cause. A `WebAssembly.Module` suits a module compiled elsewhere. Loading
 * compiles a small generated module, so a Content Security Policy must allow
 * 'wasm-unsafe-eval' even for a precompiled Module.
 */
export type SqliteWasmSource =
  WebAssembly.Module | BufferSource | Response | PromiseLike<Response>;

/**
 * Loads the wasm, following the steps in the module documentation.
 *
 * Start it as early as possible, in the worker's composition root, and pass the
 * instance to everything else through {@link SqliteWasmDep}.
 */
export const createSqliteWasm =
  (
    source: SqliteWasmSource,
  ): Task<
    SqliteWasm,
    SqliteWasmError,
    ConsoleDep & RandomBytesDep & ReportDefectDep & TimeDep
  > =>
  async (run) => {
    const toCompileError = (cause: unknown): SqliteWasmCompileError => ({
      type: "SqliteWasmCompileError",
      cause,
    });

    // 1. Compile.
    const compiled = await tryAsync(async () => {
      if (source instanceof WebAssembly.Module) return source;
      if (source instanceof ArrayBuffer || ArrayBuffer.isView(source))
        return WebAssembly.compile(source);
      const response = await source;
      // A wrong URL's error page would otherwise fail to compile as HTML.
      if (!response.ok)
        throw new TypeError(
          `Fetching the SQLite wasm failed with HTTP status ${response.status}.`,
        );
      // The only type every engine's compileStreaming accepts: browsers reject
      // any parameter, as the spec says, and Node.js also rejects another
      // case, although the spec matches the type case-insensitively.
      return response.headers.get("Content-Type") === "application/wasm"
        ? WebAssembly.compileStreaming(response)
        : WebAssembly.compile(await response.arrayBuffer());
    }, toCompileError);
    if (!compiled.ok) return compiled;
    const module = compiled.value;

    // 2. Import guard.
    const unknownImports = WebAssembly.Module.imports(module)
      .filter(
        (entry) =>
          !Object.hasOwn(sqliteWasmImports, entry.module) ||
          !Object.hasOwn(sqliteWasmImports[entry.module], entry.name),
      )
      .map((entry) => `${entry.module}.${entry.name}`);
    if (isNonEmptyArray(unknownImports))
      return err({ type: "SqliteWasmUnknownImport", imports: unknownImports });

    // 3. Memory.
    const createdMemory = trySync(
      () =>
        new WebAssembly.Memory({
          initial: initialMemoryPages,
          maximum: maximumMemoryPages,
        }),
      toCompileError,
    );
    if (!createdMemory.ok) return createdMemory;
    const memory = createdMemory.value;
    let heapU8 = new Uint8Array(memory.buffer);
    let heapDataView = new DataView(memory.buffer);
    const getHeapU8 = (): Uint8Array<ArrayBuffer> => {
      if (heapU8.buffer !== memory.buffer)
        heapU8 = new Uint8Array(memory.buffer);
      return heapU8;
    };
    const getHeapDataView = (): DataView<ArrayBuffer> => {
      if (heapDataView.buffer !== memory.buffer)
        heapDataView = new DataView(memory.buffer);
      return heapDataView;
    };

    // 4. Instantiate, set the C stack's limits and run the static constructors.
    const context: SqliteWasmImportContext = {
      ...run.deps,
      memory,
      getHeapU8,
      getHeapDataView,
    };
    const imports = mapObject(sqliteWasmImports, (namespace) =>
      mapObject(namespace, (createImport) => createImport(context)),
    );
    const instantiated = await tryAsync(async () => {
      const instance = await WebAssembly.instantiate(module, imports);
      // As Emscripten's stackCheckInit and setStackLimits do.
      callExport(instance, "emscripten_stack_init");
      callExport(
        instance,
        "__set_stack_limits",
        callExport(instance, "emscripten_stack_get_base"),
        callExport(instance, "emscripten_stack_get_end"),
      );
      callExport(instance, "__wasm_call_ctors");
      return instance;
    }, toCompileError);
    if (!instantiated.ok) return instantiated;
    const instance = instantiated.value;

    // 5. Build guard.
    let hash = 0x811c9dc5;
    const hashBytes = (bytes: Uint8Array): void => {
      for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
    };
    const enumJsonPtr = callExport(instance, "sqlite3__wasm_enum_json");
    const heap = getHeapU8();
    hashBytes(
      enumJsonPtr === 0
        ? Uint8Array.of(0)
        : heap.subarray(enumJsonPtr, heap.indexOf(0, enumJsonPtr) + 1),
    );
    const encoder = new TextEncoder();
    for (const name of WebAssembly.Module.exports(module)
      .map((entry) => entry.name)
      .toSorted())
      hashBytes(encoder.encode(`${name}\0`));
    const actualHash = hash >>> 0;
    if (actualHash !== sqliteWasmBuildHash)
      return err({
        type: "SqliteWasmBuildMismatch",
        expectedHash: sqliteWasmBuildHash,
        actualHash,
      });
    const exports = instance.exports as unknown as SqliteCExports;

    // 6. Initialize.
    const code = exports.sqlite3_initialize();
    if (code !== SQLITE_OK)
      return err({ type: "SqliteWasmInitializeError", code });

    // What escaped a call and broke the instance.
    let brokenBy: { readonly error: unknown } | null = null;

    const sqliteWasm: SqliteWasm = {
      exports,
      functionTable: instance.exports
        .__indirect_function_table as WebAssembly.Table,
      getHeapU8,
      getHeapDataView,
      call: (fn) => {
        if (brokenBy)
          throw new Error(
            "The SQLite wasm instance is broken: an exception escaped a wasm call.",
            { cause: brokenBy.error },
          );
        try {
          return fn();
        } catch (error) {
          brokenBy ??= { error };
          throw error;
        }
      },
      isBroken: () => brokenBy != null,
    };

    // 7. Register the default VFS.
    const vfsName = encoder.encode(`${defaultVfsName}\0`);
    const allocated = allocWasm({ sqliteWasm })(
      sqlite3_vfs_layout.sizeof + vfsName.length,
    );
    if (!allocated.ok)
      return err({ type: "SqliteWasmInitializeError", code: SQLITE_NOMEM });
    const vfs = allocated.value as WasmPtr as SqliteVfsPtr;
    const zName = vfs + sqlite3_vfs_layout.sizeof;
    const { members } = sqlite3_vfs_layout;
    const vfsMethods: NonEmptyReadonlyArray<
      readonly [keyof typeof members, SqliteWasmFunction["fn"]]
    > = [
      [
        "xAccess",
        (
          _vfs: SqliteVfsPtr,
          _zName: WasmPtr,
          _flags: number,
          pResOut: WasmPtr,
        ) => {
          getHeapDataView().setInt32(pResOut, 0, true);
          return SQLITE_OK;
        },
      ],
      ["xDelete", () => SQLITE_IOERR_DELETE_NOENT],
      ["xFullPathname", () => SQLITE_CANTOPEN],
      [
        "xRandomness",
        (_vfs: SqliteVfsPtr, byteLength: number, pOut: WasmPtr) => {
          for (let offset = 0; offset < byteLength; offset += 65536)
            getHeapU8().set(
              run.deps.randomBytes.create(Math.min(65536, byteLength - offset)),
              pOut + offset,
            );
          return byteLength;
        },
      ],
      ["xSleep", () => 0],
      ["xGetLastError", () => 0],
      [
        "xCurrentTime",
        (_vfs: SqliteVfsPtr, pTime: WasmPtr) => {
          getHeapDataView().setFloat64(
            pTime,
            context.time.now() / 86_400_000 + 2_440_587.5,
            true,
          );
          return SQLITE_OK;
        },
      ],
      [
        "xCurrentTimeInt64",
        (_vfs: SqliteVfsPtr, pTime: WasmPtr) => {
          // Milliseconds since the Julian day epoch, noon in Greenwich on
          // November 24, 4714 BC.
          getHeapDataView().setBigInt64(
            pTime,
            BigInt(context.time.now()) + 210_866_760_000_000n,
            true,
          );
          return SQLITE_OK;
        },
      ],
    ];
    const installed = trySync(
      () =>
        installWasmFunctions({ ...run.deps, sqliteWasm })(
          mapArray(vfsMethods, ([name, fn]) => ({
            signature: members[name].signature,
            fn,
          })),
        ),
      toCompileError,
    );
    if (!installed.ok) return installed;
    const { pointers } = installed.value;

    getHeapU8().fill(0, vfs, zName);
    getHeapU8().set(vfsName, zName);
    const vfsView = getHeapDataView();
    for (const [name, value] of [
      ["iVersion", 2],
      ["szOsFile", sqlite3_file_layout.sizeof],
      ["mxPathname", 1024],
      ["zName", zName],
    ] as const)
      vfsView.setInt32(vfs + members[name].offset, value, true);
    for (const [[name], pointer] of zipArray([vfsMethods, pointers]))
      vfsView.setInt32(vfs + members[name].offset, pointer, true);
    const registered = exports.sqlite3_vfs_register(vfs, 0);
    if (registered !== SQLITE_OK)
      return err({ type: "SqliteWasmInitializeError", code: registered });
    const initialized = initializeSqliteWasm({ sqliteWasm })();
    if (!initialized.ok) return initialized;

    return ok(sqliteWasm);
  };

/**
 * Initializes the library as loading steps 6 and 7 do, for use after
 * `sqlite3_shutdown` and `sqlite3_config`.
 *
 * `sqlite3_initialize` alone, or any call that initializes the library itself,
 * such as an open, makes SQLite's `unix-none` VFS the default again and
 * registers kvvfs again, so opening `:localStorage:` or `:sessionStorage:`
 * traps and breaks the instance. Initializing leaves SQLite's random number
 * generator as it is, but while `unix-none` is the default, a generator reset
 * with `sqlite3_randomness(0, 0)`, or not used since loading, seeds itself at
 * its next use from the time and a constant pid instead of {@link RandomBytes},
 * so instances seeded in the same second share `randomblob()` values and
 * journal nonces. This function resets the generator once `evolu-memory` is the
 * default.
 *
 * Fails with {@link SqliteWasmInitializeError}, with SQLITE_MISUSE when
 * `sqlite3_vfs_unregister` removed `evolu-memory`.
 */
export const initializeSqliteWasm =
  (deps: SqliteWasmDep) => (): Result<void, SqliteWasmInitializeError> =>
    deps.sqliteWasm.call(() => {
      const { exports } = deps.sqliteWasm;
      const code = exports.sqlite3_initialize();
      if (code !== SQLITE_OK)
        return err({ type: "SqliteWasmInitializeError", code });
      // Both names in one allocation, the second after the first's NUL.
      const names = allocCString(deps)(`${defaultVfsName}\0kvvfs`);
      if (!names.ok)
        return err({ type: "SqliteWasmInitializeError", code: SQLITE_NOMEM });
      const vfs = exports.sqlite3_vfs_find(names.value);
      const kvvfs = exports.sqlite3_vfs_find(
        (names.value + defaultVfsName.length + 1) as CStringPtr,
      );
      exports.sqlite3_free(names.value);
      // Only sqlite3_vfs_unregister removes it.
      if (vfs === 0)
        return err({ type: "SqliteWasmInitializeError", code: SQLITE_MISUSE });
      // sqlite3_initialize registers SQLite's kvvfs, whose storage only
      // SQLite's JavaScript provides, so an open of it, which the names
      // :localStorage: and :sessionStorage: are, would call NULL and trap.
      if (kvvfs !== 0) exports.sqlite3_vfs_unregister(kvvfs);
      const registered = exports.sqlite3_vfs_register(vfs, 1);
      if (registered !== SQLITE_OK)
        return err({ type: "SqliteWasmInitializeError", code: registered });
      exports.sqlite3_randomness(0, 0);
      return ok();
    });

/** Why {@link createSqliteWasm} failed. */
export type SqliteWasmError =
  | SqliteWasmCompileError
  | SqliteWasmUnknownImportError
  | SqliteWasmBuildMismatchError
  | SqliteWasmInitializeError;

/**
 * The source could not be fetched, compiled or instantiated, its memory could
 * not be allocated, its static constructors failed, or the module that installs
 * the default VFS's methods could not be compiled.
 */
export interface SqliteWasmCompileError extends Typed<"SqliteWasmCompileError"> {
  readonly cause: unknown;
}

/** The binary declares imports the loader does not implement. */
export interface SqliteWasmUnknownImportError extends Typed<"SqliteWasmUnknownImport"> {
  /** Each as `module.name`. */
  readonly imports: NonEmptyReadonlyArray<string>;
}

/**
 * The binary's {@link sqliteWasmBuildHash} differs, so it is not the build the
 * generated code describes.
 *
 * To use this binary, pin it with `node scripts/generate.mts --pin-build
 * <wasm>` and regenerate.
 */
export interface SqliteWasmBuildMismatchError extends Typed<"SqliteWasmBuildMismatch"> {
  readonly expectedHash: number;
  readonly actualHash: number;
}

/**
 * `sqlite3_initialize` failed, or allocating, finding or registering the
 * default VFS did, for example when out of memory.
 */
export interface SqliteWasmInitializeError extends Typed<"SqliteWasmInitializeError"> {
  readonly code: SqliteResultCode;
}

const defaultVfsName = "evolu-memory";

/**
 * Calls a function the instance exports with i32 arguments and returns its
 * result, or returns 0 when it exports no function of that name. Loading uses
 * it before the build guard, which fails a binary without the function.
 */
const callExport = (
  instance: WebAssembly.Instance,
  name: string,
  ...args: ReadonlyArray<number>
): number => {
  const fn = instance.exports[name];
  return typeof fn === "function"
    ? (fn as (...args: ReadonlyArray<number>) => number)(...args)
    : 0;
};

interface SqliteWasmImportContext extends ConsoleDep, TimeDep {
  readonly memory: WebAssembly.Memory;
  readonly getHeapU8: SqliteWasm["getHeapU8"];
  readonly getHeapDataView: SqliteWasm["getHeapDataView"];
}

// The JavaScript API does not expose the minimum a binary declares for its
// memory import, so this covers every build so far: the pinned one declares 128.
const initialMemoryPages = 256;

// 2 GiB, so every address is a non-negative i32.
const maximumMemoryPages = 32768;

const wasmPageSize = 65536;

// WASI's ENOSYS, "function not supported". WASI functions return it, and
// Emscripten's syscalls return it negated, as Linux does.
const ENOSYS = 52;

const failSyscall = (): number => -ENOSYS;

// WASI's EINVAL, "invalid argument".
const EINVAL = 28;

// WASI's EBADF, "bad file descriptor".
const EBADF = 8;

// Every import the loader implements, by module and name, each created from
// the instance's context.
const sqliteWasmImports: ReadonlyRecord<
  string,
  ReadonlyRecord<
    string,
    (context: SqliteWasmImportContext) => WebAssembly.ImportValue
  >
> = {
  env: {
    // Emscripten's version aborts. It must not return, because the function
    // that called it then moves the stack pointer anyway.
    __handle_stack_overflow: () => () => {
      throw new WebAssembly.RuntimeError("SQLite's C stack overflowed.");
    },
    __syscall_chmod: () => failSyscall,
    __syscall_faccessat: () => failSyscall,
    __syscall_fchmod: () => failSyscall,
    __syscall_fchown32: () => failSyscall,
    __syscall_fcntl64: () => failSyscall,
    __syscall_fstat64: () => failSyscall,
    __syscall_ftruncate64: () => failSyscall,
    __syscall_getcwd: () => failSyscall,
    __syscall_ioctl: () => failSyscall,
    __syscall_lstat64: () => failSyscall,
    __syscall_mkdirat: () => failSyscall,
    __syscall_newfstatat: () => failSyscall,
    __syscall_openat: () => failSyscall,
    __syscall_readlinkat: () => failSyscall,
    __syscall_rmdir: () => failSyscall,
    __syscall_stat64: () => failSyscall,
    __syscall_unlinkat: () => failSyscall,
    __syscall_utimensat: () => failSyscall,
    _localtime_js:
      ({ getHeapDataView }) =>
      (time: bigint, pTm: number) => {
        const date = new Date(Number(time) * 1000);
        if (Number.isNaN(date.getTime())) return 1;
        const heap = getHeapDataView();
        // The fields of struct tm from tm_sec to tm_year, each 4 bytes. They
        // are all SQLite's toLocaltime reads. Of tm_wday, tm_yday, tm_isdst and
        // tm_gmtoff, which follow, the pinned binary reads only tm_isdst, in
        // Emscripten's localtime_r, to point tm_zone at a time zone name that
        // nothing reads either, so they are zero.
        for (const [index, value] of [
          date.getSeconds(),
          date.getMinutes(),
          date.getHours(),
          date.getDate(),
          date.getMonth(),
          date.getFullYear() - 1900,
          0,
          0,
          0,
          0,
        ].entries())
          heap.setInt32(pTm + index * 4, value, true);
        return 0;
      },
    // Emscripten's tzset calls it once to fill timezone, daylight and the time
    // zone names. In the pinned binary, only localtime_r reads them, to point
    // tm_zone at a name, which nothing reads, so they stay zero.
    _tzset_js: () => () => {},
    emscripten_date_now:
      ({ time }) =>
      (): number =>
        time.now(),
    emscripten_get_now:
      ({ time }) =>
      (): number =>
        time.performance.now(),
    emscripten_resize_heap:
      ({ memory }) =>
      (requestedSize: number) => {
        try {
          memory.grow(
            Math.ceil(
              ((requestedSize >>> 0) - memory.buffer.byteLength) / wasmPageSize,
            ),
          );
          return 1;
        } catch {
          return 0;
        }
      },
    memory: ({ memory }) => memory,
  },
  wasi_snapshot_preview1: {
    clock_time_get:
      ({ time, getHeapDataView }) =>
      (clockId: number, _precision: bigint, pTime: number) => {
        // CLOCK_REALTIME is 0; the monotonic and CPU-time clocks are 1 to 3.
        if (clockId < 0 || clockId > 3) return EINVAL;
        const millis = clockId === 0 ? time.now() : time.performance.now();
        // Nanoseconds since 1970 exceed 2^53, so only microseconds, which
        // clocks report at most anyway, are computed as a number.
        getHeapDataView().setBigInt64(
          pTime,
          BigInt(Math.round(millis * 1000)) * 1000n,
          true,
        );
        return 0;
      },
    environ_get: () => () => 0,
    environ_sizes_get:
      ({ getHeapDataView }) =>
      (pCount: number, pBufferSize: number) => {
        const heap = getHeapDataView();
        heap.setUint32(pCount, 0, true);
        heap.setUint32(pBufferSize, 0, true);
        return 0;
      },
    fd_close: () => () => ENOSYS,
    fd_fdstat_get: () => () => ENOSYS,
    fd_read: () => () => ENOSYS,
    fd_seek: () => () => ENOSYS,
    fd_sync: () => () => ENOSYS,
    fd_write: ({ console, getHeapU8, getHeapDataView }) => {
      // Lines of stdout and stderr, written when complete.
      const streams = new Map(
        [console.log, console.error].map((write, index) => [
          index + 1,
          { write, decoder: new TextDecoder(), line: "" },
        ]),
      );
      return (
        fd: number,
        iovs: number,
        iovsLength: number,
        pWritten: number,
      ) => {
        const stream = streams.get(fd);
        if (stream == null) return EBADF;
        const heap = getHeapDataView();
        let written = 0;
        for (let index = 0; index < iovsLength; index++) {
          const ptr = heap.getUint32(iovs + index * 8, true);
          const length = heap.getUint32(iovs + index * 8 + 4, true);
          stream.line += stream.decoder.decode(
            getHeapU8().subarray(ptr, ptr + length),
            { stream: true },
          );
          written += length;
        }
        const lines = stream.line.split("\n");
        // split returns at least one string, the line still incomplete.
        stream.line = lines.pop()!;
        for (const line of lines) stream.write(line);
        // A fresh view, because a Console that calls back into this instance
        // can grow memory, which detaches the one taken before it wrote.
        getHeapDataView().setUint32(pWritten, written, true);
        return 0;
      };
    },
  },
};

/**
 * A JavaScript function to install into the function table.
 *
 * The signature uses the notation of {@link sqlite3_vfs_layout}, such as
 * `i(ppij)`: the result, then the parameters in parentheses. `i`, `p` and `s`
 * are i32, `j` is i64 (a bigint), `d` is f64, and a `v` result is no result.
 * The result is `i` or `v`, because every callback SQLite calls in this build
 * returns an int or nothing.
 */
export interface SqliteWasmFunction {
  readonly signature: string;
  readonly fn: (...args: never) => number | void;
}

/** Functions installed by {@link installWasmFunctions}. */
export interface SqliteWasmFunctions extends Disposable {
  /** The functions' pointers, in the order they were given. */
  readonly pointers: NonEmptyReadonlyArray<SqliteFunctionPtr>;
}

/**
 * Installs functions into the function table.
 *
 * No engine exposes `WebAssembly.Function`, so a JavaScript function becomes a
 * wasm function by being imported into a generated module that re-exports it.
 * All functions of one call share one generated module. A call through one
 * costs a few nanoseconds more than a call to a plain import, for the wrapper
 * that catches exceptions: 12 ns against 9 ns in Node.js 24. A signature the
 * notation does not cover throws. Compiling the generated module needs
 * 'wasm-unsafe-eval' under a Content Security Policy; without it, this throws a
 * `WebAssembly.CompileError`.
 *
 * No exception crosses into wasm. What a function throws is reported with
 * {@link ReportDefect}, and the call returns SQLITE_ERROR, or nothing for a `v`
 * result. So a commit hook rolls back, an `sqlite3_exec` callback aborts, and a
 * VFS method fails, but a busy handler retries, forever if it always throws,
 * and a SQL function's `xFunc` returns NULL. A function whose failure must mean
 * something else catches its own errors, such as an `xFunc` calling
 * `sqlite3_result_error`. An `i` function that returns something other than a
 * number, or undefined for 0, is also reported as a defect and returns
 * SQLITE_ERROR. Two kinds pass through, because they unwound C frames without
 * cleanup: a `WebAssembly.RuntimeError`, which comes from a trap or a C stack
 * overflow in wasm the function called, and anything thrown once the instance
 * is broken, such as a JavaScript stack overflow that escaped a nested
 * {@link SqliteWasm.call}. A function that returns once the instance is broken,
 * as one that caught what a nested call rethrew, or whose ReportDefect broke
 * it, throws the refusal of a broken instance instead, so SQLite never resumes
 * on that state.
 *
 * Disposing the result empties its slots and keeps them for later installs, so
 * per-database callbacks, such as an update hook, do not grow the table with
 * each open. Dispose only once SQLite can no longer call the functions, for
 * example after closing the database that holds them or replacing a hook: a
 * call through an emptied slot traps, and a reused slot calls another function.
 * A VFS's methods stay installed for the lifetime of the instance.
 */
export const installWasmFunctions =
  (deps: ReportDefectDep & SqliteWasmDep) =>
  (
    functions: NonEmptyReadonlyArray<SqliteWasmFunction>,
  ): SqliteWasmFunctions => {
    const table = deps.sqliteWasm.functionTable;
    const freeSlots = freeSlotsByTable.get(table) ?? [];
    freeSlotsByTable.set(table, freeSlots);

    // The module imports each function from "" under its index, with the type
    // its signature describes, and exports it under the same name.
    const types = functions.map(({ signature }) => {
      const parsed = /^([iv])\(([ipsjd]*)\)$/u.exec(signature);
      if (parsed == null)
        throw new Error(`Invalid wasm function signature: ${signature}`);
      const [, result, params] = parsed as unknown as readonly [
        string,
        string,
        string,
      ];
      return [
        0x60,
        ...wasmVector(Array.from(params, (letter) => [wasmValueTypes[letter]])),
        ...wasmVector(result === "v" ? [] : [[wasmValueTypes.i]]),
      ];
    });
    const names = functions.map((_, index) => wasmName(String(index)));
    const module = new WebAssembly.Module(
      Uint8Array.from([
        ...wasmModuleHeader,
        ...wasmSection(wasmTypeSection, types),
        ...wasmSection(
          wasmImportSection,
          names.map((name, index) => [
            ...wasmName(""),
            ...name,
            wasmFunctionKind,
            ...wasmUnsigned(index),
          ]),
        ),
        ...wasmSection(
          wasmExportSection,
          names.map((name, index) => [
            ...name,
            wasmFunctionKind,
            ...wasmUnsigned(index),
          ]),
        ),
      ]),
    );

    const imports = functions.map(({ signature, fn }) => {
      const call = fn as (...args: ReadonlyArray<unknown>) => unknown;
      const hasResult = signature.startsWith("i");
      const failure = hasResult ? SQLITE_ERROR : undefined;
      return (...args: ReadonlyArray<unknown>): unknown => {
        try {
          const result = call(...args);
          // A call the function made broke the instance, and the function
          // caught what escaped it. Returning would resume the C frames below
          // on the state that left inconsistent, so this throws the refusal of
          // a broken instance, whose cause is what broke it, and the catch
          // below lets it through.
          if (deps.sqliteWasm.isBroken()) deps.sqliteWasm.call(constVoid);
          if (!hasResult) return;
          // Converting a result to i32 happens after this function returns, so
          // a bigint, symbol or object that cannot become a number would throw
          // into wasm, past this catch.
          if (result === undefined || typeof result === "number") return result;
          throw new TypeError(
            `A wasm function with an int result returned a ${typeof result}`,
          );
        } catch (error) {
          if (
            error instanceof WebAssembly.RuntimeError ||
            deps.sqliteWasm.isBroken()
          )
            throw error;
          try {
            deps.reportDefect(error);
          } catch (reporterError) {
            reportDefectAfterMicrotask(
              new AggregateError(
                [error, reporterError],
                "ReportDefect failed while reporting a defect",
              ),
            );
          }
          // ReportDefect can break the instance too, by a nested call, so this
          // throws the refusal as above instead of returning into SQLite.
          if (deps.sqliteWasm.isBroken()) deps.sqliteWasm.call(constVoid);
          return failure;
        }
      };
    });
    const { exports } = new WebAssembly.Instance(module, {
      "": Object.fromEntries(imports.entries()),
    });

    const pointers = mapArray(functions, (_, index) => {
      const pointer = freeSlots.pop() ?? (table.grow(1) as SqliteFunctionPtr);
      table.set(pointer, exports[index]);
      return pointer;
    });

    using disposer = new DisposableStack();
    disposer.defer(() => {
      for (const pointer of pointers) {
        table.set(pointer, null);
        freeSlots.push(pointer);
      }
    });

    return disposable<SqliteWasmFunctions>({ pointers }, disposer);
  };

// The emptied slots of each instance's function table.
const freeSlotsByTable = /*#__PURE__*/ new WeakMap<
  WebAssembly.Table,
  Array<SqliteFunctionPtr>
>();

// The binary format's magic number and version 1.
const wasmModuleHeader = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

const wasmTypeSection = 1;
const wasmImportSection = 2;
const wasmExportSection = 7;
const wasmFunctionKind = 0x00;

// The encodings of i32, i64 and f64, by signature letter.
const wasmValueTypes: ReadonlyRecord<string, number> = {
  i: 0x7f,
  p: 0x7f,
  s: 0x7f,
  j: 0x7e,
  d: 0x7c,
};

/** Encodes an unsigned integer as LEB128. */
const wasmUnsigned = (value: number): Array<number> => {
  const bytes: Array<number> = [];
  do {
    const low = value & 0x7f;
    value >>>= 7;
    bytes.push(value === 0 ? low : low | 0x80);
  } while (value !== 0);
  return bytes;
};

/** Encodes items, each already encoded, as a vector: their count, then them. */
const wasmVector = (
  items: ReadonlyArray<ReadonlyArray<number>>,
): Array<number> => [...wasmUnsigned(items.length), ...items.flat()];

/** Encodes an ASCII name. */
const wasmName = (name: string): Array<number> =>
  wasmVector(Array.from(name, (char) => [char.charCodeAt(0)]));

/** Encodes a section of encoded items. */
const wasmSection = (
  id: number,
  items: ReadonlyArray<ReadonlyArray<number>>,
): Array<number> => {
  const body = wasmVector(items);
  return [id, ...wasmUnsigned(body.length), ...body];
};
