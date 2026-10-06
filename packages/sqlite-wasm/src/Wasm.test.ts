import { test } from "node:test";

import {
  assertEqual,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertOk,
  assertSame,
  testCreateDeps,
  trySync,
} from "@evolu/common";
import type { SqliteCExports } from "./CApi.ts";
import {
  SQLITE_BUSY,
  SQLITE_ERROR,
  SQLITE_MISUSE,
  SQLITE_NOMEM,
  SQLITE_OK,
} from "./Constants.ts";
import type { SqliteFunctionPtr } from "./Pointer.ts";
import {
  initializeSqliteWasm,
  installWasmFunctions,
  type SqliteWasm,
  type SqliteWasmFunction,
} from "./Wasm.ts";

/**
 * Fake dependencies whose instance has only a real function table, with its
 * NULL slot, so installed functions are called through it from JavaScript, and
 * a broken flag the test sets.
 */
const setupFakeSqliteWasm = () => {
  const functionTable = new WebAssembly.Table({
    initial: 1,
    element: "anyfunc",
  });
  let broken = false;
  const callFunction = (pointer: SqliteFunctionPtr) =>
    functionTable.get(pointer) as (...args: ReadonlyArray<unknown>) => unknown;
  return {
    ...testCreateDeps(),
    sqliteWasm: { functionTable, isBroken: () => broken } as SqliteWasm,
    functionTable,
    callFunction,
    breakInstance: () => {
      broken = true;
    },
  };
};

test("installWasmFunctions installs functions into the table, returning their pointers in order", () => {
  const deps = setupFakeSqliteWasm();
  const pushed: Array<number> = [];

  const { pointers } = installWasmFunctions(deps)([
    { signature: "i(ii)", fn: (a: number, b: number) => a + b },
    {
      signature: "v(i)",
      fn: (value: number) => {
        pushed.push(value);
      },
    },
  ]);

  assertEqual(deps.callFunction(pointers[0])(2, 3), 5);
  assertEqual(deps.callFunction(pointers[1])(7), undefined);
  assertEqual(pushed, [7]);
});

test("installWasmFunctions installs more functions than one byte counts in one module", () => {
  const deps = setupFakeSqliteWasm();
  const functions = Array.from({ length: 300 }, (_, index) => ({
    signature: "i()",
    fn: () => index,
  }));

  const { pointers } = installWasmFunctions(deps)([
    { signature: "i()", fn: () => -1 },
    ...functions,
  ]);

  assertEqual(
    pointers.map((pointer) => deps.callFunction(pointer)()),
    [-1, ...functions.map((_, index) => index)],
  );
});

test("installWasmFunctions passes i, p and s as i32, j as a bigint and d as a double", () => {
  const deps = setupFakeSqliteWasm();
  const received: Array<ReadonlyArray<unknown>> = [];

  const { pointers } = installWasmFunctions(deps)([
    {
      signature: "v(ipsjd)",
      fn: (...args: ReadonlyArray<unknown>) => {
        received.push(args);
      },
    },
  ]);
  // An f32 would round 0.1 to 0.10000000149011612.
  deps.callFunction(pointers[0])(2 ** 32 + 1, -1, 3.7, 2n ** 64n + 5n, 0.1);

  assertEqual(received, [[1, -1, 3, 5n, 0.1]]);
});

test("installWasmFunctions reports what a function throws as a defect and returns SQLITE_ERROR, or nothing without a result", () => {
  const deps = setupFakeSqliteWasm();
  const error = new Error("from a callback");
  const thrown = "a string";

  const { pointers } = installWasmFunctions(deps)([
    {
      signature: "i(i)",
      fn: () => {
        throw error;
      },
    },
    {
      signature: "v()",
      fn: () => {
        // oxlint-disable-next-line typescript/only-throw-error -- Anything can be thrown.
        throw thrown;
      },
    },
  ]);

  assertEqual(deps.callFunction(pointers[0])(1), SQLITE_ERROR);
  assertEqual(deps.callFunction(pointers[1])(), undefined);
  const defects = deps.reportDefect.getDefects();
  assertEqual(defects.length, 2);
  assertSame(defects[0], error);
  assertSame(defects[1], thrown);
});

test("installWasmFunctions reports an int result that is not a number as a defect and returns SQLITE_ERROR", () => {
  const deps = setupFakeSqliteWasm();
  // A function typed to return nothing may return anything, and converting a
  // bigint to i32 at the wasm boundary would throw into wasm.
  // oxlint-disable-next-line typescript/strict-void-return -- The case under test.
  const fn: () => void = () => 1n;

  const { pointers } = installWasmFunctions(deps)([{ signature: "i()", fn }]);

  assertEqual(deps.callFunction(pointers[0])(), SQLITE_ERROR);
  const defects = deps.reportDefect.getDefects();
  assertEqual(defects.length, 1);
  assertInstanceOf(defects[0], TypeError);
});

test("installWasmFunctions reports a ReportDefect failure from a microtask and still returns SQLITE_ERROR", (t) => {
  // reportDefectAfterMicrotask throws from a microtask, which would fail the
  // test file, so the microtask is captured and run here.
  const microtasks: Array<VoidFunction> = [];
  t.mock.method(globalThis, "queueMicrotask", (callback: VoidFunction) => {
    microtasks.push(callback);
  });
  const error = new Error("from a callback");
  const reporterError = new Error("from ReportDefect");
  const deps = {
    ...setupFakeSqliteWasm(),
    reportDefect: () => {
      throw reporterError;
    },
  };

  const { pointers } = installWasmFunctions(deps)([
    {
      signature: "i()",
      fn: () => {
        throw error;
      },
    },
  ]);

  assertEqual(deps.callFunction(pointers[0])(), SQLITE_ERROR);
  assertEqual(microtasks.length, 1);
  const uncaught = trySync(microtasks[0], (thrown) => thrown);
  assertErr(uncaught);
  assertInstanceOf(uncaught.error, AggregateError);
  assertEqual(
    uncaught.error.message,
    "ReportDefect failed while reporting a defect",
  );
  assertSame(uncaught.error.errors[0], error);
  assertSame(uncaught.error.errors[1], reporterError);
});

test("installWasmFunctions lets a WebAssembly.RuntimeError through, because the instance is broken", () => {
  const deps = setupFakeSqliteWasm();
  // A trap in wasm called from the function has unwound C frames without
  // cleanup, so returning to C would run on corrupt state.
  const trap = new WebAssembly.RuntimeError("unreachable");

  const { pointers } = installWasmFunctions(deps)([
    {
      signature: "i()",
      fn: () => {
        throw trap;
      },
    },
  ]);
  const result = trySync(
    () => deps.callFunction(pointers[0])(),
    (error) => error,
  );

  assertErr(result);
  assertSame(result.error, trap);
  assertEqual(deps.reportDefect.getDefects(), []);
});

test("installWasmFunctions lets anything through once the instance is broken, such as a stack overflow from a nested call that broke it", () => {
  const deps = setupFakeSqliteWasm();
  // A nested call through SqliteWasm.call broke the instance and rethrew.
  const overflow = new RangeError("Maximum call stack size exceeded");

  const { pointers } = installWasmFunctions(deps)([
    {
      signature: "i()",
      fn: () => {
        deps.breakInstance();
        throw overflow;
      },
    },
  ]);
  const result = trySync(
    () => deps.callFunction(pointers[0])(),
    (error) => error,
  );

  assertErr(result);
  assertSame(result.error, overflow);
  assertEqual(deps.reportDefect.getDefects(), []);
});

test("disposing installed functions empties their slots, which later installs reuse", () => {
  const deps = setupFakeSqliteWasm();
  const install = installWasmFunctions(deps);
  const first = install([
    { signature: "i()", fn: () => 1 },
    { signature: "i()", fn: () => 2 },
  ]);
  const tableLength = deps.functionTable.length;

  first[Symbol.dispose]();

  for (const pointer of first.pointers)
    assertEqual(deps.functionTable.get(pointer), null);
  const second = install([
    { signature: "i()", fn: () => 3 },
    { signature: "i()", fn: () => 4 },
  ]);
  assertEqual(deps.functionTable.length, tableLength);
  assertEqual(
    [...second.pointers].toSorted((a, b) => a - b),
    [...first.pointers].toSorted((a, b) => a - b),
  );
  assertEqual(
    second.pointers.map((pointer) => deps.callFunction(pointer)()),
    [3, 4],
  );
});

test("disposing installed functions twice empties their slots once", () => {
  const deps = setupFakeSqliteWasm();
  const install = installWasmFunctions(deps);
  const installed = install([{ signature: "i()", fn: () => 1 }]);

  installed[Symbol.dispose]();
  installed[Symbol.dispose]();

  const { pointers } = install([
    { signature: "i()", fn: () => 2 },
    { signature: "i()", fn: () => 3 },
  ]);
  assertEqual(new Set(pointers).size, 2);
  assertEqual(
    pointers.map((pointer) => deps.callFunction(pointer)()),
    [2, 3],
  );
});

test("each instance reuses only its own emptied slots", () => {
  const first = setupFakeSqliteWasm();
  const second = setupFakeSqliteWasm();
  const fn = { signature: "i()", fn: () => 1 } as const;
  const installed = installWasmFunctions(first)([fn, fn, fn]);
  installed[Symbol.dispose]();

  const other = installWasmFunctions(second)([fn]);

  assertEqual(other.pointers, [1]);
  assertEqual(second.callFunction(other.pointers[0])(), 1);
  const reused = installWasmFunctions(first)([fn, fn, fn]);
  assertEqual(
    [...reused.pointers].toSorted((a, b) => a - b),
    [...installed.pointers].toSorted((a, b) => a - b),
  );
});

test("a SqliteWasmFunction returns an int or nothing", () => {
  const functions: Array<SqliteWasmFunction> = [];

  functions.push({ signature: "i()", fn: () => 1 });
  functions.push({ signature: "v(j)", fn: (_value: bigint) => {} });
  // @ts-expect-error The signature's result is i or v, so never a bigint.
  functions.push({ signature: "i()", fn: () => 1n });
});

test("installWasmFunctions throws for a signature it does not support, installing nothing", () => {
  const deps = setupFakeSqliteWasm();

  for (const signature of [
    "x()",
    "i(x)",
    "j()",
    "d(i)",
    "p(i)",
    "i(i",
    "i()v",
  ]) {
    const result = trySync(
      () =>
        installWasmFunctions(deps)([
          { signature: "i()", fn: () => 0 },
          { signature, fn: () => 0 },
        ]),
      (error) => error,
    );

    assertErr(result);
    assertInstanceOf(result.error, Error);
    assertEqual(
      result.error.message,
      `Invalid wasm function signature: ${signature}`,
    );
  }
  assertEqual(deps.functionTable.length, 1);
});

/**
 * Fake dependencies whose library records the calls {@link initializeSqliteWasm}
 * makes and returns the given results, with a heap for the names it allocates.
 */
const setupFakeLibrary = ({
  initialize = SQLITE_OK,
  malloc = 64,
  find = 1024,
  findKvvfs = 2048,
  register = SQLITE_OK,
}: {
  initialize?: number;
  malloc?: number;
  find?: number;
  findKvvfs?: number;
  register?: number;
} = {}) => {
  const heap = new Uint8Array(4096);
  const calls: Array<ReadonlyArray<unknown>> = [];
  const exports = {
    sqlite3_initialize: () => {
      calls.push(["sqlite3_initialize"]);
      return initialize;
    },
    sqlite3_malloc: (byteLength: number) => {
      calls.push(["sqlite3_malloc", byteLength]);
      return malloc;
    },
    sqlite3_vfs_find: (zVfsName: number) => {
      const name = new TextDecoder().decode(
        heap.subarray(zVfsName, heap.indexOf(0, zVfsName)),
      );
      calls.push(["sqlite3_vfs_find", name]);
      return name === "kvvfs" ? findKvvfs : find;
    },
    sqlite3_vfs_unregister: (vfs: number) => {
      calls.push(["sqlite3_vfs_unregister", vfs]);
      return SQLITE_OK;
    },
    sqlite3_free: (ptr: number) => {
      calls.push(["sqlite3_free", ptr]);
    },
    sqlite3_vfs_register: (vfs: number, makeDflt: number) => {
      calls.push(["sqlite3_vfs_register", vfs, makeDflt]);
      return register;
    },
    sqlite3_randomness: (byteLength: number, ptr: number) => {
      calls.push(["sqlite3_randomness", byteLength, ptr]);
    },
  };
  return {
    sqliteWasm: {
      exports: exports as unknown as SqliteCExports,
      getHeapU8: () => heap,
      call: (fn) => fn(),
    } as SqliteWasm,
    calls,
  };
};

test("initializeSqliteWasm initializes the library, unregisters kvvfs, makes evolu-memory the default VFS and resets the random number generator", () => {
  const { calls, ...deps } = setupFakeLibrary();

  assertOk(initializeSqliteWasm(deps)());

  assertEqual(calls, [
    ["sqlite3_initialize"],
    ["sqlite3_malloc", 19],
    ["sqlite3_vfs_find", "evolu-memory"],
    ["sqlite3_vfs_find", "kvvfs"],
    ["sqlite3_free", 64],
    ["sqlite3_vfs_unregister", 2048],
    ["sqlite3_vfs_register", 1024, 1],
    ["sqlite3_randomness", 0, 0],
  ]);
});

test("initializeSqliteWasm unregisters nothing when kvvfs is not registered, as after an earlier call without sqlite3_shutdown", () => {
  const { calls, ...deps } = setupFakeLibrary({ findKvvfs: 0 });

  assertOk(initializeSqliteWasm(deps)());

  assertFalse(calls.some(([name]) => name === "sqlite3_vfs_unregister"));
});

test("initializeSqliteWasm fails with SqliteWasmInitializeError at the first step that fails", () => {
  for (const [options, code, lastCall] of [
    [{ initialize: SQLITE_ERROR }, SQLITE_ERROR, "sqlite3_initialize"],
    [{ malloc: 0 }, SQLITE_NOMEM, "sqlite3_malloc"],
    // Only sqlite3_vfs_unregister removes evolu-memory.
    [{ find: 0 }, SQLITE_MISUSE, "sqlite3_free"],
    [{ register: SQLITE_BUSY }, SQLITE_BUSY, "sqlite3_vfs_register"],
  ] as const) {
    const { calls, ...deps } = setupFakeLibrary(options);

    assertErr(initializeSqliteWasm(deps)(), {
      type: "SqliteWasmInitializeError",
      code,
    });
    assertEqual(calls.at(-1)?.[0], lastCall);
  }
});
