import { test } from "node:test";

import {
  assertEqual,
  assertErr,
  assertFalse,
  assertOk,
  assertTrue,
} from "@evolu/common";
import type { SqliteCExports } from "./CApi.ts";
import {
  allocCString,
  allocWasm,
  copyWasmBytes,
  createSqliteScratch,
  isInt32,
  isSqliteInt64,
  maxInt32,
  maxSqliteInt64,
  minSqliteInt64,
  readCString,
  readUtf8,
  writeUtf8,
  writeWasmBytes,
} from "./Memory.ts";
import type { CStringPtr, SqliteOwnedPtr, WasmPtr } from "./Pointer.ts";
import type { SqliteWasmDep } from "./Wasm.ts";

/**
 * A fake {@link SqliteWasmDep} over a real `WebAssembly.Memory`, whose
 * `sqlite3_malloc` returns NULL for 0 bytes, as SQLite's does, and for the
 * lengths `mallocFails` accepts, and otherwise allocates 8-byte aligned memory
 * after growing the memory by a page, so that every allocation detaches the
 * previous heap views.
 */
const setupFakeSqliteWasm = ({
  mallocFails = () => false,
}: { mallocFails?: (byteLength: number) => boolean } = {}) => {
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 1000 });
  const mallocCalls: Array<number> = [];
  const freed: Array<number> = [];
  let end = 8;

  const sqlite3_malloc = (byteLength: number): SqliteOwnedPtr | 0 => {
    mallocCalls.push(byteLength);
    if (mallocFails(byteLength) || byteLength <= 0) return 0;
    const ptr = Math.ceil(end / 8) * 8;
    end = ptr + byteLength;
    memory.grow(
      Math.max(1, Math.ceil((end - memory.buffer.byteLength) / 65536)),
    );
    return ptr as SqliteOwnedPtr;
  };
  const sqlite3_free = (ptr: SqliteOwnedPtr | 0): void => {
    freed.push(ptr);
  };

  const deps: SqliteWasmDep = {
    sqliteWasm: {
      exports: { sqlite3_malloc, sqlite3_free } as unknown as SqliteCExports,
      functionTable: new WebAssembly.Table({ initial: 0, element: "anyfunc" }),
      getHeapU8: () => new Uint8Array(memory.buffer),
      getHeapDataView: () => new DataView(memory.buffer),
      call: (fn) => fn(),
      isBroken: () => false,
    },
  };
  return { deps, mallocCalls, freed };
};

const utf8 = (value: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(value);

test("maxInt32 is the largest C int", () => {
  assertEqual(maxInt32, 2 ** 31 - 1);
});

test("isInt32 accepts exactly the integers a C int holds", () => {
  for (const value of [0, 1, -1, maxInt32, -maxInt32 - 1, -0])
    assertTrue(isInt32(value));
  for (const value of [
    maxInt32 + 1,
    -maxInt32 - 2,
    0.5,
    2 ** 53,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])
    assertFalse(isInt32(value));
});

test("isSqliteInt64 accepts exactly the integers from minSqliteInt64 to maxSqliteInt64", () => {
  assertEqual(maxSqliteInt64, 2n ** 63n - 1n);
  assertEqual(minSqliteInt64, -(2n ** 63n));
  for (const value of [0n, -1n, maxSqliteInt64, minSqliteInt64])
    assertTrue(isSqliteInt64(value));
  for (const value of [maxSqliteInt64 + 1n, minSqliteInt64 - 1n, 2n ** 64n])
    assertFalse(isSqliteInt64(value));
});

test("allocWasm allocates at least one byte, so a zero-length value keeps a non-NULL address", () => {
  const { deps, mallocCalls } = setupFakeSqliteWasm();

  const result = allocWasm(deps)(0);

  assertOk(result);
  assertTrue(result.value !== 0);
  assertEqual(mallocCalls, [1]);
});

test("allocWasm fails with SqliteNoMem when sqlite3_malloc returns NULL", () => {
  const { deps } = setupFakeSqliteWasm({ mallocFails: () => true });

  assertErr(allocWasm(deps)(10), { type: "SqliteNoMem", byteLength: 10 });
});

test("allocWasm fails without calling sqlite3_malloc above maxInt32, which a C int would wrap", () => {
  const { deps, mallocCalls } = setupFakeSqliteWasm();

  assertErr(allocWasm(deps)(maxInt32 + 1), {
    type: "SqliteNoMem",
    byteLength: maxInt32 + 1,
  });
  assertEqual(mallocCalls, []);
});

test("allocWasm calls sqlite3_malloc for exactly maxInt32", () => {
  const { deps, mallocCalls } = setupFakeSqliteWasm({
    mallocFails: (byteLength) => byteLength === maxInt32,
  });

  assertErr(allocWasm(deps)(maxInt32), {
    type: "SqliteNoMem",
    byteLength: maxInt32,
  });
  assertEqual(mallocCalls, [maxInt32]);
});

test("allocCString copies a string into new memory as NUL-terminated UTF-8", () => {
  const { deps, mallocCalls } = setupFakeSqliteWasm();
  const value = "Žluťoučký kůň 🐴";

  const result = allocCString(deps)(value);

  assertOk(result);
  const bytes = utf8(value);
  assertEqual(mallocCalls, [bytes.length + 1]);
  assertEqual(
    deps.sqliteWasm
      .getHeapU8()
      .slice(result.value, result.value + bytes.length + 1),
    Uint8Array.of(...bytes, 0),
  );
});

test("allocCString fails with SqliteNoMem for the encoded length and its NUL", () => {
  const { deps } = setupFakeSqliteWasm({ mallocFails: () => true });

  assertErr(allocCString(deps)("kůň"), { type: "SqliteNoMem", byteLength: 6 });
});

test("writeUtf8 encodes into existing memory without a NUL and returns the byte length, cutting at a character boundary", () => {
  const { deps } = setupFakeSqliteWasm();
  const ptr = 64 as WasmPtr;
  const heap = deps.sqliteWasm.getHeapU8();
  heap.fill(0xff, ptr, ptr + 16);

  assertEqual(writeUtf8(deps)("kůň🐴", ptr, 16), 9);
  assertEqual(heap.slice(ptr, ptr + 10), Uint8Array.of(...utf8("kůň🐴"), 0xff));

  heap.fill(0xff, ptr, ptr + 16);
  assertEqual(writeUtf8(deps)("kůň🐴", ptr, 7), 5);
  assertEqual(
    heap.slice(ptr, ptr + 8),
    Uint8Array.of(...utf8("kůň"), 0xff, 0xff, 0xff),
  );
});

const byteOrderMark = Uint8Array.of(0xef, 0xbb, 0xbf);

test("readCString decodes up to the NUL, keeping a leading byte order mark", () => {
  const { deps } = setupFakeSqliteWasm();
  const ptr = 64 as CStringPtr;
  deps.sqliteWasm
    .getHeapU8()
    .set([...byteOrderMark, ...utf8("kůň"), 0, ...utf8("after")], ptr);

  assertEqual(readCString(deps)(ptr), "\uFEFFkůň");
});

test("readUtf8 decodes a byte length, keeping a leading byte order mark and embedded NUL characters", () => {
  const { deps } = setupFakeSqliteWasm();
  const ptr = 64 as WasmPtr;
  const bytes = Uint8Array.of(...byteOrderMark, ...utf8("a"), 0, ...utf8("ž"));
  deps.sqliteWasm.getHeapU8().set([...bytes, ...utf8("after")], ptr);

  assertEqual(readUtf8(deps)(ptr, bytes.length), "\uFEFFa\0ž");
});

test("copyWasmBytes copies bytes into their own ArrayBuffer", () => {
  const { deps } = setupFakeSqliteWasm();
  const ptr = 64 as WasmPtr;
  const heap = deps.sqliteWasm.getHeapU8();
  heap.set([1, 2, 3, 4], ptr);

  const copy = copyWasmBytes(deps)(ptr, 3);
  heap.fill(0, ptr, ptr + 4);

  assertEqual(copy, Uint8Array.of(1, 2, 3));
  assertEqual(copy.buffer.byteLength, 3);
});

test("writeWasmBytes copies bytes into wasm memory", () => {
  const { deps } = setupFakeSqliteWasm();
  const ptr = 64 as WasmPtr;

  writeWasmBytes(deps)(ptr, Uint8Array.of(1, 2, 3));

  assertEqual(
    deps.sqliteWasm.getHeapU8().slice(ptr - 1, ptr + 4),
    Uint8Array.of(0, 1, 2, 3, 0),
  );
});

test("createSqliteScratch allocates 16 bytes, 8-byte aligned, for output parameters", () => {
  const { deps, mallocCalls } = setupFakeSqliteWasm();

  const result = createSqliteScratch(deps);

  assertOk(result);
  assertEqual(result.value.out % 8, 0);
  assertEqual(mallocCalls, [16]);
});

test("SqliteScratch.reserve reuses its memory and doubles it when a value does not fit", () => {
  const { deps, mallocCalls, freed } = setupFakeSqliteWasm();
  const result = createSqliteScratch(deps);
  assertOk(result);
  const scratch = result.value;

  const first = scratch.reserve(100);
  assertOk(first);
  assertEqual(scratch.reserve(100), first);
  assertEqual(scratch.reserve(1), first);

  const second = scratch.reserve(150);
  assertOk(second);
  assertEqual(freed, [first.value]);
  assertEqual(scratch.reserve(200), second);

  const third = scratch.reserve(1000);
  assertOk(third);
  assertEqual(freed, [first.value, second.value]);
  assertEqual(mallocCalls, [16, 100, 200, 1000]);
});

test("SqliteScratch.reserve fails with SqliteNoMem and recovers once memory is available", () => {
  let outOfMemory = false;
  const { deps, freed } = setupFakeSqliteWasm({
    mallocFails: () => outOfMemory,
  });
  const result = createSqliteScratch(deps);
  assertOk(result);
  const scratch = result.value;
  assertOk(scratch.reserve(100));

  outOfMemory = true;
  assertErr(scratch.reserve(1000), { type: "SqliteNoMem", byteLength: 1000 });

  outOfMemory = false;
  const recovered = scratch.reserve(100);
  assertOk(recovered);
  assertFalse(freed.includes(recovered.value));
});

test("SqliteScratch.reserve falls back to the requested length when twice its capacity is unavailable, and a failure leaves it empty", () => {
  const { deps, mallocCalls } = setupFakeSqliteWasm({
    mallocFails: (byteLength) => byteLength > 1000,
  });
  const result = createSqliteScratch(deps);
  assertOk(result);
  const scratch = result.value;
  assertOk(scratch.reserve(600));

  mallocCalls.length = 0;
  assertOk(scratch.reserve(700));
  assertEqual(mallocCalls, [1200, 700]);

  mallocCalls.length = 0;
  assertErr(scratch.reserve(1001), { type: "SqliteNoMem", byteLength: 1001 });
  assertEqual(mallocCalls, [1400, 1001]);

  mallocCalls.length = 0;
  // Not twice a capacity it no longer has.
  assertOk(scratch.reserve(16));
  assertEqual(mallocCalls, [16]);
});

test("disposing a SqliteScratch frees its memory", () => {
  const { deps, freed } = setupFakeSqliteWasm();
  const result = createSqliteScratch(deps);
  assertOk(result);
  const reserved = result.value.reserve(100);
  assertOk(reserved);

  result.value[Symbol.dispose]();

  assertEqual(
    freed.toSorted((a, b) => a - b),
    [result.value.out, reserved.value].toSorted((a, b) => a - b),
  );
});

test("createSqliteScratch fails with SqliteNoMem without memory", () => {
  const { deps } = setupFakeSqliteWasm({ mallocFails: () => true });

  assertErr(createSqliteScratch(deps), { type: "SqliteNoMem", byteLength: 16 });
});
