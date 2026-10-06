import {
  assert,
  assertEqual,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertNotSame,
  assertOk,
  assertSame,
  assertThrows,
  assertTrue,
  getOrThrow,
  Millis,
  ok,
  testCreateDeps,
  testCreateRun,
  testCreateTime,
  trySync,
  type PerformanceTime,
  type Result,
  type Time,
} from "@evolu/common";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import createWabt from "wabt";
import {
  sqlite3_free,
  sqlite3_libversion,
  sqlite3_libversion_number,
  sqlite3_malloc,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_MISUSE,
  SQLITE_NOMEM,
  sqlite3_file_layout,
  sqlite3_vfs_layout,
  sqliteWasmBuildHash,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import { createSqliteDatabase } from "../../../../packages/sqlite-wasm/src/Database.ts";
import {
  createSqliteWasm,
  initializeSqliteWasm,
  type SqliteWasmError,
} from "../../../../packages/sqlite-wasm/src/Wasm.ts";
import {
  setupDatabase,
  setupSqliteWasm,
  sqliteWasmBinary,
  sqliteWasmModule,
  trapEveryOpen,
} from "./_sqliteWasm.ts";

const wabt = await createWabt();

const upstream = new URL(
  "../../../../packages/sqlite-wasm/scripts/upstream/",
  import.meta.url,
);
const pinnedEnumJson = await readFile(
  new URL("sqlite3-wasm-enum.json", upstream),
);
const pinnedExportNames = Object.keys(
  JSON.parse(
    await readFile(new URL("sqlite3-wasm-exports.json", upstream), "utf8"),
  ) as Record<string, unknown>,
);

/**
 * Assembles a fake build that passes the build guard: it exports every pinned
 * name, and its `sqlite3__wasm_enum_json` returns the pinned string. Every
 * other export is a no-op, except the given `__wasm_call_ctors` and
 * `sqlite3_initialize` bodies, which share the mutable i32 global `$state`, and
 * the given functions.
 */
const assembleFakeBuild = ({
  ctors,
  initialize,
  functions = {},
}: {
  ctors: string;
  initialize: string;
  /** Other exports, by name, each as the function's type and body. */
  functions?: Readonly<Record<string, string>>;
}): Uint8Array<ArrayBuffer> => {
  const ownExports = new Set([
    "__indirect_function_table",
    "__wasm_call_ctors",
    "sqlite3__wasm_enum_json",
    "sqlite3_initialize",
    ...Object.keys(functions),
  ]);
  const escapedEnumJson = [...pinnedEnumJson]
    .map((byte) => `\\${byte.toString(16).padStart(2, "0")}`)
    .join("");
  return assembleWat(`(module
    (import "env" "memory" (memory 1))
    (table (export "__indirect_function_table") 1 funcref)
    (global $state (mut i32) (i32.const 0))
    (data (i32.const 1024) "${escapedEnumJson}\\00")
    (func (export "__wasm_call_ctors") ${ctors})
    (func (export "sqlite3__wasm_enum_json") (result i32) i32.const 1024)
    (func (export "sqlite3_initialize") (result i32) ${initialize})
    ${Object.entries(functions)
      .map(([name, func]) => `(func (export "${name}") ${func})`)
      .join("\n")}
    (func ${pinnedExportNames
      .filter((name) => !ownExports.has(name))
      .map((name) => `(export "${name}")`)
      .join(" ")}))`);
};

const pinnedImports = JSON.parse(
  await readFile(new URL("sqlite3-wasm-imports.json", upstream), "utf8"),
) as Record<string, { readonly kind: string; readonly type: string }>;

const watValueTypes: Record<string, string> = {
  i: "i32",
  j: "i64",
  d: "f64",
};

/**
 * Assembles a binary whose constructors call each pinned function import with
 * zero arguments and trap when its result differs from the expected one.
 */
const assembleImportResultCheck = (
  expectedResults: ReadonlyArray<readonly [importName: string, result: number]>,
): Uint8Array<ArrayBuffer> => {
  const imports = expectedResults.map(([importName], index) => {
    const pinned = pinnedImports[importName];
    assert(pinned?.kind === "function", `${importName} is not pinned`);
    const [, result, params] = /^(\w)\((\w*)\)$/u.exec(pinned.type) ?? [];
    assert(result === "i" && params != null, `${importName}: ${pinned.type}`);
    const [moduleName, name] = importName.split(".");
    const paramTypes = params.split("").map((param) => watValueTypes[param]);
    return {
      declaration: `(import "${moduleName}" "${name}" (func $import${index} (param ${paramTypes.join(" ")}) (result i32)))`,
      call: `${paramTypes.map((type) => `${type}.const 0`).join(" ")} call $import${index}`,
    };
  });
  return assembleWat(`(module
    (import "env" "memory" (memory 1))
    ${imports.map(({ declaration }) => declaration).join("\n")}
    (func (export "__wasm_call_ctors")
      ${expectedResults
        .map(
          ([, expected], index) => `${imports[index]?.call}
            i32.const ${expected}
            i32.ne
            if
              unreachable
            end`,
        )
        .join("\n")}))`);
};

/**
 * Asserts that the binary's constructors returned, so loading went on to fail
 * the build guard, as any binary but the pinned one does.
 */
const assertConstructorsReturned = (
  result: Result<unknown, SqliteWasmError>,
): void => {
  assertErr(result);
  assertEqual(
    result.error.type === "SqliteWasmCompileError"
      ? String(result.error.cause)
      : result.error.type,
    "SqliteWasmBuildMismatch",
  );
};

/** Runs the callback with the process's local time zone set to the given one. */
const withTimeZone = async (
  timeZone: string,
  callback: () => Promise<void>,
): Promise<void> => {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    await callback();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
};

/**
 * The 32-bit FNV-1a hash of the strings, each with a terminating NUL, as
 * {@link sqliteWasmBuildHash} defines it.
 */
const fnv1a32OfCStrings = (strings: ReadonlyArray<string>): number => {
  let hash = 0x811c9dc5;
  for (const string of strings)
    for (const byte of new TextEncoder().encode(`${string}\0`))
      hash = Math.imul(hash ^ byte, 0x01000193);
  return hash >>> 0;
};

/** Assembles a WebAssembly text module into a binary. */
const assembleWat = (wat: string): Uint8Array<ArrayBuffer> => {
  const parsed = wabt.parseWat("test.wat", wat);
  try {
    return new Uint8Array(parsed.toBinary({}).buffer);
  } finally {
    parsed.destroy();
  }
};

/**
 * The SQL of a chain of tables `t0` to `t<levels>` and `levels` AFTER INSERT
 * triggers, each inserting the new row into the next table, so an insert into
 * `t0` nests that many triggers. SQLite allows 1,000.
 */
const triggerChainSql = (levels: number): string =>
  [
    ...Array.from({ length: levels + 1 }, (_, i) => `CREATE TABLE t${i}(x);`),
    ...Array.from(
      { length: levels },
      (_, i) =>
        `CREATE TRIGGER g${i} AFTER INSERT ON t${i} BEGIN INSERT INTO t${i + 1} VALUES (new.x); END;`,
    ),
  ].join("\n");

test("createSqliteWasm loads the pinned binary", async () => {
  const deps = await setupSqliteWasm();

  const versionPtr = sqlite3_libversion(deps)();
  const heap = deps.sqliteWasm.getHeapU8();
  assertEqual(
    new TextDecoder().decode(
      heap.subarray(versionPtr, heap.indexOf(0, versionPtr)),
    ),
    "3.53.4",
  );
  assertEqual(sqlite3_libversion_number(deps)(), 3053004);
});

test("createSqliteWasm compiles bytes", async () => {
  await using run = testCreateRun();

  const result = await run(createSqliteWasm(sqliteWasmBinary));

  assertOk(result);
  assertEqual(
    sqlite3_libversion_number({ sqliteWasm: result.value })(),
    3053004,
  );
});

test("createSqliteWasm compiles a plain ArrayBuffer, such as Response.arrayBuffer returns", async () => {
  await using run = testCreateRun();
  const buffer = sqliteWasmBinary.buffer.slice(
    sqliteWasmBinary.byteOffset,
    sqliteWasmBinary.byteOffset + sqliteWasmBinary.byteLength,
  );

  const result = await run(createSqliteWasm(buffer));

  assertOk(result);
  assertEqual(
    sqlite3_libversion_number({ sqliteWasm: result.value })(),
    3053004,
  );
});

test("createSqliteWasm compiles a Response of type application/wasm while it streams", async (t) => {
  await using run = testCreateRun();
  const compileStreaming = t.mock.method(WebAssembly, "compileStreaming");
  const response = new Response(sqliteWasmBinary, {
    headers: { "Content-Type": "application/wasm" },
  });

  const result = await run(createSqliteWasm(response));

  assertOk(result);
  assertEqual(
    sqlite3_libversion_number({ sqliteWasm: result.value })(),
    3053004,
  );
  assertEqual(
    compileStreaming.mock.calls.map((call) => call.arguments),
    [[response]],
  );
});

test("createSqliteWasm compiles a promised Response of type application/wasm, such as fetch returns, while it streams", async (t) => {
  await using run = testCreateRun();
  const compileStreaming = t.mock.method(WebAssembly, "compileStreaming");
  const response = new Response(sqliteWasmBinary, {
    headers: { "Content-Type": "application/wasm" },
  });

  const result = await run(createSqliteWasm(Promise.resolve(response)));

  assertOk(result);
  assertEqual(
    sqlite3_libversion_number({ sqliteWasm: result.value })(),
    3053004,
  );
  assertEqual(
    compileStreaming.mock.calls.map((call) => call.arguments),
    [[response]],
  );
});

test("createSqliteWasm fails with SqliteWasmCompileError for bytes that are not wasm", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(new TextEncoder().encode("not wasm")),
  );

  assertErr(result);
  assert(result.error.type === "SqliteWasmCompileError", result.error.type);
  assertInstanceOf(result.error.cause, WebAssembly.CompileError);
});

// Exactly application/wasm is the only type every engine's
// WebAssembly.compileStreaming accepts: browsers reject any parameter, as the
// spec says, and Node.js also rejects another case, although the spec allows
// it.
for (const contentType of [
  "application/octet-stream",
  "application/wasm; charset=binary",
  "Application/WASM",
  null,
])
  test(`createSqliteWasm compiles the bytes of a Response of type ${String(contentType)}`, async (t) => {
    await using run = testCreateRun();
    const compileStreaming = t.mock.method(WebAssembly, "compileStreaming");
    const headers: Record<string, string> =
      contentType == null ? {} : { "Content-Type": contentType };

    for (const source of [
      new Response(sqliteWasmBinary, { headers }),
      Promise.resolve(new Response(sqliteWasmBinary, { headers })),
    ]) {
      const result = await run(createSqliteWasm(source));

      assertOk(result);
      assertEqual(
        sqlite3_libversion_number({ sqliteWasm: result.value })(),
        3053004,
      );
    }
    assertEqual(compileStreaming.mock.callCount(), 0);
  });

test("createSqliteWasm fails with SqliteWasmCompileError when the body of a Response that cannot stream fails to download", async () => {
  await using run = testCreateRun();
  const cause = new TypeError("network error");

  const result = await run(
    createSqliteWasm(
      new Response(
        new ReadableStream({
          pull: (controller) => {
            controller.error(cause);
          },
        }),
        { headers: { "Content-Type": "application/octet-stream" } },
      ),
    ),
  );

  assertErr(result, { type: "SqliteWasmCompileError", cause });
});

test("createSqliteWasm fails with SqliteWasmCompileError when the fetch fails", async () => {
  await using run = testCreateRun();
  const cause = new TypeError("Failed to fetch");

  const result = await run(createSqliteWasm(Promise.reject(cause)));

  assertErr(result, { type: "SqliteWasmCompileError", cause });
});

for (const contentType of ["text/html", "application/wasm"])
  test(`createSqliteWasm fails with SqliteWasmCompileError naming the status of a Response of type ${contentType} that is not ok`, async () => {
    await using run = testCreateRun();
    const headers = { "Content-Type": contentType };

    for (const source of [
      new Response("<!doctype html>Not Found", { status: 404, headers }),
      Promise.resolve(
        new Response("<!doctype html>Not Found", { status: 404, headers }),
      ),
    ]) {
      const result = await run(createSqliteWasm(source));

      assertErr(result);
      assert(result.error.type === "SqliteWasmCompileError", result.error.type);
      assertInstanceOf(result.error.cause, TypeError);
      assertEqual(
        result.error.cause.message,
        "Fetching the SQLite wasm failed with HTTP status 404.",
      );
    }
  });

test("createSqliteWasm fails with SqliteWasmCompileError when a Content Security Policy forbids compiling wasm, even for a precompiled Module", async (t) => {
  await using run = testCreateRun();
  // Without 'wasm-unsafe-eval', browsers refuse to compile wasm, which the
  // default VFS's methods need.
  const cause = new WebAssembly.CompileError(
    "Wasm code generation disallowed by embedder",
  );
  t.mock.property(
    WebAssembly,
    "Module",
    new Proxy(WebAssembly.Module, {
      construct: () => {
        throw cause;
      },
    }),
  );

  const result = await run(createSqliteWasm(sqliteWasmModule));

  assertErr(result, { type: "SqliteWasmCompileError", cause });
});

test("createSqliteWasm fails with SqliteWasmUnknownImport before instantiating a binary with imports it does not implement", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (import "env" "emscripten_get_now" (func (result f64)))
        (import "wasi_snapshot_preview1" "proc_exit" (func (param i32)))
        (import "wasi_snapshot_preview2" "x" (func))
        ;; Emscripten's abort, exit, mmap and heap maximum, and WASI's
        ;; random_get, which the pinned binary does not import.
        (import "env" "_abort_js" (func))
        (import "env" "exit" (func (param i32)))
        (import "env" "_mmap_js"
          (func (param i32 i32 i32 i32 i64 i32 i32) (result i32)))
        (import "env" "_munmap_js"
          (func (param i32 i32 i32 i32 i32 i64) (result i32)))
        (import "env" "emscripten_get_heap_max" (func (result i32)))
        (import "wasi_snapshot_preview1" "random_get"
          (func (param i32 i32) (result i32)))
        (func (export "__wasm_call_ctors") unreachable))`),
    ),
  );

  assertErr(result, {
    type: "SqliteWasmUnknownImport",
    imports: [
      "wasi_snapshot_preview1.proc_exit",
      "wasi_snapshot_preview2.x",
      "env._abort_js",
      "env.exit",
      "env._mmap_js",
      "env._munmap_js",
      "env.emscripten_get_heap_max",
      "wasi_snapshot_preview1.random_get",
    ],
  });
});

test("createSqliteWasm fails with SqliteWasmCompileError when its memory cannot be allocated", async (t) => {
  await using run = testCreateRun();
  // What V8 throws when it cannot reserve a wasm memory, as on a device low
  // on memory.
  const cause = new RangeError(
    "WebAssembly.Memory(): could not allocate memory",
  );
  t.mock.property(
    WebAssembly,
    "Memory",
    new Proxy(WebAssembly.Memory, {
      construct: () => {
        throw cause;
      },
    }),
  );

  const result = await run(createSqliteWasm(sqliteWasmModule));

  assertErr(result, { type: "SqliteWasmCompileError", cause });
});

test("createSqliteWasm fails with SqliteWasmCompileError when instantiation fails", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      // More memory than the loader provides, which a later build could need.
      assembleWat(`(module
        (import "env" "memory" (memory 300))
        (func (export "__wasm_call_ctors")))`),
    ),
  );

  assertErr(result);
  assert(result.error.type === "SqliteWasmCompileError", result.error.type);
  assertInstanceOf(result.error.cause, WebAssembly.LinkError);
});

test("createSqliteWasm fails with SqliteWasmBuildMismatch for another build", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (data (i32.const 1024) "{}\\00")
        (func (export "__wasm_call_ctors"))
        (func (export "sqlite3__wasm_enum_json") (result i32)
          i32.const 1024))`),
    ),
  );

  assertErr(result, {
    type: "SqliteWasmBuildMismatch",
    expectedHash: sqliteWasmBuildHash,
    actualHash: fnv1a32OfCStrings([
      "{}",
      "__wasm_call_ctors",
      "sqlite3__wasm_enum_json",
    ]),
  });
});

test("createSqliteWasm hashes the enum JSON as empty for a binary without sqlite3__wasm_enum_json", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (func (export "__wasm_call_ctors")))`),
    ),
  );

  assertErr(result, {
    type: "SqliteWasmBuildMismatch",
    expectedHash: sqliteWasmBuildHash,
    actualHash: fnv1a32OfCStrings(["", "__wasm_call_ctors"]),
  });
});

test("createSqliteWasm hashes the enum JSON as empty when sqlite3__wasm_enum_json returns NULL", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      // A string at address 0 would be read if NULL were not checked.
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (data (i32.const 0) "{}\\00")
        (func (export "__wasm_call_ctors"))
        (func (export "sqlite3__wasm_enum_json") (result i32)
          i32.const 0))`),
    ),
  );

  assertErr(result, {
    type: "SqliteWasmBuildMismatch",
    expectedHash: sqliteWasmBuildHash,
    actualHash: fnv1a32OfCStrings([
      "",
      "__wasm_call_ctors",
      "sqlite3__wasm_enum_json",
    ]),
  });
});

test("createSqliteWasm fails with SqliteWasmInitializeError when sqlite3_initialize fails", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleFakeBuild({ ctors: "", initialize: "i32.const 7" }),
    ),
  );

  assertErr(result, { type: "SqliteWasmInitializeError", code: 7 });
});

test("createSqliteWasm calls __wasm_call_ctors exactly once, before sqlite3_initialize", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleFakeBuild({
        ctors: `global.get $state
          i32.const 1
          i32.add
          global.set $state`,
        // SQLITE_MISUSE unless the constructors ran exactly once, and
        // SQLITE_NOMEM otherwise, so loading stops before step 7.
        initialize: `i32.const 7
          i32.const 21
          global.get $state
          i32.const 1
          i32.eq
          select`,
      }),
    ),
  );

  assertErr(result, { type: "SqliteWasmInitializeError", code: 7 });
});

test("createSqliteWasm initializes the C stack and sets the stack check's limits to its base and end before it runs the static constructors", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      // As in Emscripten, the stack's base and end read 0 until
      // emscripten_stack_init, and the constructors trap unless the limits are
      // the stack's.
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (global $base (mut i32) (i32.const 0))
        (global $end (mut i32) (i32.const 0))
        (global $limitBase (mut i32) (i32.const 0))
        (global $limitEnd (mut i32) (i32.const 0))
        (func (export "emscripten_stack_init")
          (global.set $base (i32.const 65536))
          (global.set $end (i32.const 4096)))
        (func (export "emscripten_stack_get_base") (result i32)
          global.get $base)
        (func (export "emscripten_stack_get_end") (result i32)
          global.get $end)
        (func (export "__set_stack_limits") (param i32 i32)
          (global.set $limitBase (local.get 0))
          (global.set $limitEnd (local.get 1)))
        (func (export "__wasm_call_ctors")
          (if (i32.or
                (i32.ne (global.get $limitBase) (i32.const 65536))
                (i32.ne (global.get $limitEnd) (i32.const 4096)))
            (then unreachable))))`),
    ),
  );

  assertConstructorsReturned(result);
});

test("createSqliteWasm fails with SqliteWasmInitializeError when the default VFS cannot be allocated", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleFakeBuild({
        ctors: "",
        initialize: "i32.const 0",
        functions: { sqlite3_malloc: "(param i32) (result i32) i32.const 0" },
      }),
    ),
  );

  assertErr(result, {
    type: "SqliteWasmInitializeError",
    code: SQLITE_NOMEM,
  });
});

test("createSqliteWasm fails with SqliteWasmInitializeError when the default VFS cannot be registered", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleFakeBuild({
        ctors: "",
        initialize: "i32.const 0",
        functions: {
          // An address past the pinned enum JSON at 1024.
          sqlite3_malloc: "(param i32) (result i32) i32.const 1048576",
          sqlite3_vfs_register: "(param i32 i32) (result i32) i32.const 21",
        },
      }),
    ),
  );

  assertErr(result, { type: "SqliteWasmInitializeError", code: 21 });
});

test("createSqliteWasm fails with the SqliteWasmInitializeError of initializeSqliteWasm when the registered default VFS is not found", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleFakeBuild({
        ctors: "",
        initialize: "i32.const 0",
        functions: {
          // An address past the pinned enum JSON at 1024.
          sqlite3_malloc: "(param i32) (result i32) i32.const 1048576",
          sqlite3_vfs_register: "(param i32 i32) (result i32) i32.const 0",
          sqlite3_vfs_find: "(param i32) (result i32) i32.const 0",
        },
      }),
    ),
  );

  assertErr(result, {
    type: "SqliteWasmInitializeError",
    code: SQLITE_MISUSE,
  });
});

test("createSqliteWasm fills every field of the default VFS, in memory sqlite3_malloc leaves dirty", async () => {
  await using run = testCreateRun();
  // Each allocation fills 0xff into the next 64 KiB past the pinned enum JSON.
  const firstAllocation = 1048576;

  const result = await run(
    createSqliteWasm(
      assembleFakeBuild({
        ctors: "",
        initialize: "i32.const 0",
        functions: {
          sqlite3_malloc: `(param $size i32) (result i32) (local $ptr i32)
            (local.set $ptr
              (i32.add (i32.const ${firstAllocation}) (global.get $state)))
            (global.set $state (i32.add (global.get $state) (i32.const 65536)))
            (memory.fill (local.get $ptr) (i32.const 0xff) (local.get $size))
            local.get $ptr`,
          sqlite3_vfs_register: "(param i32 i32) (result i32) i32.const 0",
        },
      }),
    ),
  );

  assertOk(result);
  const vfs = firstAllocation;
  const view = result.value.getHeapDataView();
  const methods = new Set([
    "xDelete",
    "xAccess",
    "xFullPathname",
    "xRandomness",
    "xSleep",
    "xCurrentTime",
    "xGetLastError",
    "xCurrentTimeInt64",
  ]);
  assertEqual(
    Object.fromEntries(
      Object.entries(sqlite3_vfs_layout.members).map(([name, { offset }]) => {
        const value = view.getInt32(vfs + offset, true);
        // A method's pointer is its slot in the function table.
        return [name, methods.has(name) ? value > 0 : value];
      }),
    ),
    {
      iVersion: 2,
      szOsFile: sqlite3_file_layout.sizeof,
      mxPathname: 1024,
      pNext: 0,
      zName: vfs + sqlite3_vfs_layout.sizeof,
      pAppData: 0,
      xOpen: 0,
      xDelete: true,
      xAccess: true,
      xFullPathname: true,
      xDlOpen: 0,
      xDlError: 0,
      xDlSym: 0,
      xDlClose: 0,
      xRandomness: true,
      xSleep: true,
      xCurrentTime: true,
      xGetLastError: true,
      xCurrentTimeInt64: true,
      xSetSystemCall: 0,
      xGetSystemCall: 0,
      xNextSystemCall: 0,
    },
  );
  const zName = vfs + sqlite3_vfs_layout.sizeof;
  assertEqual(
    result.value.getHeapU8().slice(zName, zName + 13),
    new TextEncoder().encode("evolu-memory\0"),
  );
});

test("createSqliteWasm fails with SqliteWasmCompileError when the constructors trap", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (func (export "__wasm_call_ctors") unreachable))`),
    ),
  );

  assertErr(result);
  assert(result.error.type === "SqliteWasmCompileError", result.error.type);
  assertInstanceOf(result.error.cause, WebAssembly.RuntimeError);
});

test("env.__handle_stack_overflow, which Emscripten's stack check calls instead of moving the stack pointer out of the C stack, throws a WebAssembly.RuntimeError, as a trap does", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (import "env" "__handle_stack_overflow" (func $overflow (param i32)))
        (func (export "__wasm_call_ctors")
          (call $overflow (i32.const 4080))))`),
    ),
  );

  assertErr(result);
  assert(result.error.type === "SqliteWasmCompileError", result.error.type);
  assertInstanceOf(result.error.cause, WebAssembly.RuntimeError);
  assertEqual(result.error.cause.message, "SQLite's C stack overflowed.");
});

test("the loader's file system calls return -ENOSYS", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleImportResultCheck(
        Object.keys(pinnedImports)
          .filter((name) => /^env\.__syscall_\w+$/u.test(name))
          .map((name) => [name, -52]),
      ),
    ),
  );

  assertConstructorsReturned(result);
});

test("the loader's WASI file calls but fd_write return ENOSYS", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleImportResultCheck(
        Object.keys(pinnedImports)
          .filter(
            (name) =>
              name.startsWith("wasi_snapshot_preview1.fd_") &&
              name !== "wasi_snapshot_preview1.fd_write",
          )
          .map((name) => [name, 52]),
      ),
    ),
  );

  assertConstructorsReturned(result);
});

test("the loader's environment is empty", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory $memory 1))
        (import "wasi_snapshot_preview1" "environ_sizes_get"
          (func $environ_sizes_get (param i32 i32) (result i32)))
        (import "wasi_snapshot_preview1" "environ_get"
          (func $environ_get (param i32 i32) (result i32)))
        (data (i32.const 16) "\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff")
        (func $expectZero (param $value i32)
          local.get $value
          if
            unreachable
          end)
        (func (export "__wasm_call_ctors")
          (call $expectZero
            (call $environ_sizes_get (i32.const 16) (i32.const 20)))
          (call $expectZero (i32.load (i32.const 16)))
          (call $expectZero (i32.load (i32.const 20)))
          (call $expectZero
            (call $environ_get (i32.const 32) (i32.const 40)))))`),
    ),
  );

  assertConstructorsReturned(result);
});

test("createSqliteWasm gives the binary 256 pages of memory, growable to 32768", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 256 32768))
        (func (export "__wasm_call_ctors")
          memory.size
          i32.const 256
          i32.ne
          if
            unreachable
          end
          i32.const 32512
          memory.grow
          i32.const -1
          i32.eq
          if
            unreachable
          end
          i32.const 1
          memory.grow
          i32.const -1
          i32.ne
          if
            unreachable
          end))`),
    ),
  );

  assertConstructorsReturned(result);
});

test("SQLite grows memory, and the heap views follow", async () => {
  const deps = await setupSqliteWasm();
  const heapBefore = deps.sqliteWasm.getHeapU8();
  const byteLength = 64 * 1024 * 1024;

  const ptr = sqlite3_malloc(deps)(byteLength);

  assertTrue(ptr !== 0);
  const heap = deps.sqliteWasm.getHeapU8();
  assertTrue(heap.length >= heapBefore.length + byteLength);
  // Growing detached the previous view.
  assertEqual(heapBefore.length, 0);
  assertEqual(deps.sqliteWasm.getHeapDataView().byteLength, heap.length);
  heap.fill(1, ptr, ptr + byteLength);
  sqlite3_free(deps)(ptr);
});

test("emscripten_resize_heap reads the requested size as unsigned and grows to at most 2 GiB", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 256 32768))
        (import "env" "emscripten_resize_heap"
          (func $resize (param i32) (result i32)))
        (func $expect (param $actual i32) (param $expected i32)
          local.get $actual
          local.get $expected
          i32.ne
          if
            unreachable
          end)
        (func (export "__wasm_call_ctors")
          (call $expect (call $resize (i32.const 0x80000001)) (i32.const 0))
          (call $expect (memory.size) (i32.const 256))
          (call $expect (call $resize (i32.const 0x80000000)) (i32.const 1))
          (call $expect (memory.size) (i32.const 32768))))`),
    ),
  );

  assertConstructorsReturned(result);
});

test("emscripten_date_now returns Time's wall-clock milliseconds", async () => {
  const time = testCreateTime({ startAt: Millis.orThrow(1_790_000_000_123) });
  await using run = testCreateRun({ ...testCreateDeps(), time });

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (import "env" "emscripten_date_now" (func $now (result f64)))
        (func (export "__wasm_call_ctors")
          call $now
          f64.const 1790000000123
          f64.ne
          if
            unreachable
          end))`),
    ),
  );

  assertConstructorsReturned(result);
});

test("emscripten_get_now returns Time's performance milliseconds", async () => {
  const time = testCreateTime({ startAt: Millis.orThrow(1_790_000_000_123) });
  time.advance("2s");
  await using run = testCreateRun({ ...testCreateDeps(), time });

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (import "env" "emscripten_get_now" (func $now (result f64)))
        (func (export "__wasm_call_ctors")
          call $now
          f64.const 2000
          f64.ne
          if
            unreachable
          end))`),
    ),
  );

  assertConstructorsReturned(result);
});

test("clock_time_get returns Time in nanoseconds, to the microsecond: wall-clock for the realtime clock, performance for the others", async () => {
  const testTime = testCreateTime({
    startAt: Millis.orThrow(1_790_000_000_123),
  });
  testTime.advance("2s");
  // testCreateTime advances whole milliseconds, and clocks keep microseconds.
  const time: Time = {
    ...testTime,
    performance: {
      ...testTime.performance,
      now: () => 2000.0005 as PerformanceTime,
    },
  };
  await using run = testCreateRun({ ...testCreateDeps(), time });

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (import "wasi_snapshot_preview1" "clock_time_get"
          (func $clock (param i32 i64 i32) (result i32)))
        (func $expect (param $actual i64) (param $expected i64)
          local.get $actual
          local.get $expected
          i64.ne
          if
            unreachable
          end)
        (func $read (param $clock i32) (result i64)
          (call $expect
            (i64.extend_i32_u (call $clock (local.get $clock) (i64.const 1) (i32.const 16)))
            (i64.const 0))
          (i64.load (i32.const 16)))
        (func (export "__wasm_call_ctors")
          ;; CLOCK_REALTIME
          (call $expect (call $read (i32.const 0)) (i64.const 1790000002123000000))
          ;; CLOCK_MONOTONIC, CLOCK_PROCESS_CPUTIME_ID, CLOCK_THREAD_CPUTIME_ID
          (call $expect (call $read (i32.const 1)) (i64.const 2000001000))
          (call $expect (call $read (i32.const 2)) (i64.const 2000001000))
          (call $expect (call $read (i32.const 3)) (i64.const 2000001000))
          ;; An unknown clock is EINVAL.
          (call $expect
            (i64.extend_i32_u (call $clock (i32.const 4) (i64.const 1) (i32.const 16)))
            (i64.const 28))
          (call $expect
            (i64.extend_i32_u (call $clock (i32.const -1) (i64.const 1) (i32.const 16)))
            (i64.const 28))))`),
    ),
  );

  assertConstructorsReturned(result);
});

test("fd_write writes lines of stdout to Console.log and of stderr to Console.error", async () => {
  const deps = testCreateDeps();
  await using run = testCreateRun(deps);

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (import "wasi_snapshot_preview1" "fd_write"
          (func $fd_write (param i32 i32 i32 i32) (result i32)))
        (data (i32.const 1024) "SQLite says\\nhi")
        (data (i32.const 1040) "\\nout\\n")
        ;; iovecs: "SQLite " and "says\\nhi", then "\\n", then "out\\n"
        (data (i32.const 2048)
          "\\00\\04\\00\\00\\07\\00\\00\\00"
          "\\07\\04\\00\\00\\07\\00\\00\\00"
          "\\10\\04\\00\\00\\01\\00\\00\\00"
          "\\11\\04\\00\\00\\04\\00\\00\\00")
        (func $expect (param $actual i32) (param $expected i32)
          local.get $actual
          local.get $expected
          i32.ne
          if
            unreachable
          end)
        (func (export "__wasm_call_ctors")
          (call $expect
            (call $fd_write (i32.const 2) (i32.const 2048) (i32.const 2) (i32.const 4096))
            (i32.const 0))
          (call $expect (i32.load (i32.const 4096)) (i32.const 14))
          (call $expect
            (call $fd_write (i32.const 2) (i32.const 2064) (i32.const 1) (i32.const 4096))
            (i32.const 0))
          (call $expect (i32.load (i32.const 4096)) (i32.const 1))
          (call $expect
            (call $fd_write (i32.const 1) (i32.const 2072) (i32.const 1) (i32.const 4096))
            (i32.const 0))
          (call $expect (i32.load (i32.const 4096)) (i32.const 4))
          ;; Any other file descriptor is EBADF.
          (call $expect
            (call $fd_write (i32.const 3) (i32.const 2072) (i32.const 1) (i32.const 4096))
            (i32.const 8))))`),
    ),
  );

  assertConstructorsReturned(result);
  assertEqual(
    deps.console
      .getEntriesSnapshot()
      .map(({ method, args }) => [method, ...args]),
    [
      ["error", "SQLite says"],
      ["error", "hi"],
      ["log", "out"],
    ],
  );
});

test("fd_write decodes a character split across writes", async () => {
  const deps = testCreateDeps();
  await using run = testCreateRun(deps);

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (import "wasi_snapshot_preview1" "fd_write"
          (func $fd_write (param i32 i32 i32 i32) (result i32)))
        (data (i32.const 1024) "\\c3\\a9\\0a")
        ;; iovecs: the first byte of "é", then its second byte and "\\n"
        (data (i32.const 2048)
          "\\00\\04\\00\\00\\01\\00\\00\\00"
          "\\01\\04\\00\\00\\02\\00\\00\\00")
        (func (export "__wasm_call_ctors")
          (drop
            (call $fd_write (i32.const 1) (i32.const 2048) (i32.const 1) (i32.const 4096)))
          (drop
            (call $fd_write (i32.const 1) (i32.const 2056) (i32.const 1) (i32.const 4096)))))`),
    ),
  );

  assertConstructorsReturned(result);
  assertEqual(
    deps.console
      .getEntriesSnapshot()
      .map(({ method, args }) => [method, ...args]),
    [["log", "é"]],
  );
});

test("_tzset_js writes nothing, because nothing in the binary reads the time zone it would describe", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (import "env" "_tzset_js" (func $tzset (param i32 i32 i32 i32)))
        ;; timezone, daylight and the two names, over non-zero bytes.
        (data (i32.const 32) "${"\\ff".repeat(80)}")
        (func (export "__wasm_call_ctors")
          (local $address i32)
          (call $tzset (i32.const 32) (i32.const 36) (i32.const 48) (i32.const 80))
          (local.set $address (i32.const 32))
          loop $bytes
            (i32.ne (i32.load8_u (local.get $address)) (i32.const 0xff))
            if
              unreachable
            end
            (local.set $address (i32.add (local.get $address) (i32.const 1)))
            (br_if $bytes (i32.lt_u (local.get $address) (i32.const 112)))
          end))`),
    ),
  );

  assertConstructorsReturned(result);
});

test("_localtime_js fills the struct tm fields SQLite reads with the local time and zeroes the others", async () => {
  // Fields of struct tm at 4-byte offsets: tm_sec, tm_min, tm_hour, tm_mday,
  // tm_mon, tm_year, tm_wday, tm_yday, tm_isdst, tm_gmtoff. SQLite reads the
  // first six.
  const assembleLocaltimeCheck = (
    time: bigint,
    expected: ReadonlyArray<number>,
  ) =>
    assembleWat(`(module
      (import "env" "memory" (memory 1))
      (import "env" "_localtime_js" (func $localtime (param i64 i32) (result i32)))
      ;; The struct is written over non-zero bytes, so each field is written.
      (data (i32.const 64) "${"\\ff".repeat(40)}")
      (func $expect (param $actual i32) (param $expected i32)
        local.get $actual
        local.get $expected
        i32.ne
        if
          unreachable
        end)
      (func (export "__wasm_call_ctors")
        (call $expect (call $localtime (i64.const ${time}) (i32.const 64)) (i32.const 0))
        ${expected
          .map(
            (value, index) =>
              `(call $expect (i32.load (i32.const ${64 + index * 4})) (i32.const ${value}))`,
          )
          .join("\n")}))`);

  for (const [timeZone, time, expected] of [
    // 2026-09-21 10:13:20 EDT.
    ["America/New_York", 1_790_000_000n, [20, 13, 10, 21, 8, 126, 0, 0, 0, 0]],
    // 2026-01-01 00:00:00 EST.
    ["America/New_York", 1_767_243_600n, [0, 0, 0, 1, 0, 126, 0, 0, 0, 0]],
    // 2025-12-31 23:00:00 EST, when it is already 2026 in UTC.
    ["America/New_York", 1_767_240_000n, [0, 0, 23, 31, 11, 125, 0, 0, 0, 0]],
    // 2026-09-22 09:00:00 IST, at 03:30 UTC.
    ["Asia/Kolkata", 1_790_047_800n, [0, 0, 9, 22, 8, 126, 0, 0, 0, 0]],
  ] as const)
    await withTimeZone(timeZone, async () => {
      await using run = testCreateRun();
      const result = await run(
        createSqliteWasm(assembleLocaltimeCheck(time, expected)),
      );
      assertConstructorsReturned(result);
    });
});

test("_localtime_js fails for a time Date cannot represent", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (import "env" "_localtime_js" (func $localtime (param i64 i32) (result i32)))
        (func $expectFailure (param $time i64)
          (call $localtime (local.get $time) (i32.const 64))
          i32.const 1
          i32.ne
          if
            unreachable
          end)
        (func (export "__wasm_call_ctors")
          ;; Beyond Date's range of 8.64e15 milliseconds.
          (call $expectFailure (i64.const 8640000000001))
          ;; Beyond 2^53, where a bigint no longer converts exactly.
          (call $expectFailure (i64.const 0x7fffffffffffffff))
          (call $expectFailure (i64.const -0x8000000000000000))))`),
    ),
  );

  assertConstructorsReturned(result);
});

test("createSqliteWasm fails with SqliteWasmBuildMismatch for a binary without __wasm_call_ctors", async () => {
  await using run = testCreateRun();

  const result = await run(
    createSqliteWasm(
      assembleWat(`(module
        (import "env" "memory" (memory 1))
        (data (i32.const 1024) "{}\\00")
        (func (export "sqlite3__wasm_enum_json") (result i32)
          i32.const 1024))`),
    ),
  );

  assertErr(result, {
    type: "SqliteWasmBuildMismatch",
    expectedHash: sqliteWasmBuildHash,
    actualHash: fnv1a32OfCStrings(["{}", "sqlite3__wasm_enum_json"]),
  });
});

test("getHeapU8 and getHeapDataView create a view again only after memory grew", async () => {
  const deps = await setupSqliteWasm();
  const { getHeapU8, getHeapDataView } = deps.sqliteWasm;
  const heapU8 = getHeapU8();
  const heapDataView = getHeapDataView();

  assertSame(getHeapU8(), heapU8);
  assertSame(getHeapDataView(), heapDataView);

  const ptr = sqlite3_malloc(deps)(heapU8.length);
  assertTrue(ptr !== 0);

  const grownHeapU8 = getHeapU8();
  const grownHeapDataView = getHeapDataView();
  assertNotSame(grownHeapU8, heapU8);
  assertNotSame(grownHeapDataView, heapDataView);
  assertSame(getHeapU8(), grownHeapU8);
  assertSame(getHeapDataView(), grownHeapDataView);
  sqlite3_free(deps)(ptr);
});

test("an exception that escapes SqliteWasm.call breaks the instance: it is rethrown, and every later call throws without calling", async () => {
  const t = await setupDatabase();
  trapEveryOpen(t);
  assertFalse(t.sqliteWasm.isBroken());

  const trapped = trySync(() => t.sqliteWasm.call(() => t.open(":memory:")));
  assertErr(trapped);
  assertInstanceOf(trapped.error, WebAssembly.RuntimeError);
  assertTrue(t.sqliteWasm.isBroken());

  let called = false;
  const refused = trySync(() =>
    t.sqliteWasm.call(() => {
      called = true;
    }),
  );
  assertErr(refused);
  assertInstanceOf(refused.error, Error);
  assertEqual(
    refused.error.message,
    "The SQLite wasm instance is broken: an exception escaped a wasm call.",
  );
  assertSame(refused.error.cause, trapped.error);
  assertFalse(called);
});

test("initializeSqliteWasm refuses a broken instance", async () => {
  const t = await setupDatabase();
  trapEveryOpen(t);
  const trapped = trySync(() => t.sqliteWasm.call(() => t.open(":memory:")));
  assertErr(trapped);

  const refused = trySync(() => initializeSqliteWasm(t)());

  assertErr(refused);
  assertInstanceOf(refused.error, Error);
  assertSame(refused.error.cause, trapped.error);
});

// SQLite's makefile gives the C stack 512 KiB, directly above SQLite's static
// data. Each level of this chain takes about 900 bytes of it.
test("SQL that overflows SQLite's C stack throws a WebAssembly.RuntimeError and breaks the instance, instead of overwriting SQLite's static data", async () => {
  const deps = await setupSqliteWasm();
  const database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(database.exec(triggerChainSql(600)));

  const overflowed = trySync(() =>
    database.run("INSERT INTO t0 VALUES (1)", []),
  );

  assertErr(overflowed);
  assertInstanceOf(overflowed.error, WebAssembly.RuntimeError);
  assertEqual(overflowed.error.message, "SQLite's C stack overflowed.");
  assertTrue(deps.sqliteWasm.isBroken());
  assertThrows(
    () => createSqliteDatabase(deps)({ type: "Memory" }),
    (thrown) => {
      assertInstanceOf(thrown, Error);
      assertSame(thrown.cause, overflowed.error);
    },
  );
});

// The deepest chain that fits has 582 levels, so this one fails when the stack
// check's limits are 64 KiB tighter than the stack.
test("SQL that recurses deep into SQLite's C stack without overflowing it runs", async () => {
  const deps = await setupSqliteWasm();
  using database = getOrThrow(createSqliteDatabase(deps)({ type: "Memory" }));
  assertOk(database.exec(triggerChainSql(550)));

  assertOk(database.run("INSERT INTO t0 VALUES (1)", []));

  assertEqual(
    database.run("SELECT x FROM t550", []),
    ok({ rows: [{ x: 1 }], changes: 0 }),
  );
  assertFalse(deps.sqliteWasm.isBroken());
});
