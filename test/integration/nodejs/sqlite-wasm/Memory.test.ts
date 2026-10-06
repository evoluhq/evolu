import { assertEqual, assertErr, assertOk, assertTrue } from "@evolu/common";
import { test } from "node:test";
import {
  sqlite3_free,
  sqlite3_malloc,
  sqlite3_msize,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  allocCString,
  allocWasm,
  copyWasmBytes,
  createSqliteScratch,
  maxInt32,
  readCString,
  writeWasmBytes,
} from "../../../../packages/sqlite-wasm/src/Memory.ts";
import { setupSqliteWasm } from "./_sqliteWasm.ts";

test("allocWasm gets a non-NULL address for zero bytes, which sqlite3_malloc does not", async () => {
  const deps = await setupSqliteWasm();

  assertEqual(sqlite3_malloc(deps)(0), 0);

  const result = allocWasm(deps)(0);
  assertOk(result);
  assertTrue(result.value !== 0);
  assertTrue(sqlite3_msize(deps)(result.value) >= 1n);
  sqlite3_free(deps)(result.value);
});

test("allocWasm fails with SqliteNoMem when SQLite cannot allocate", async () => {
  const deps = await setupSqliteWasm();

  assertErr(allocWasm(deps)(maxInt32), {
    type: "SqliteNoMem",
    byteLength: maxInt32,
  });
});

test("allocCString and readCString round-trip text through SQLite's heap", async () => {
  const deps = await setupSqliteWasm();
  const value = "Příliš žluťoučký kůň úpěl ďábelské ódy 🐴";
  // Leave non-zero bytes where SQLite will allocate the string.
  const byteLength = new TextEncoder().encode(value).length + 1;
  const dirty = allocWasm(deps)(byteLength);
  assertOk(dirty);
  deps.sqliteWasm.getHeapU8().fill(0xff, dirty.value, dirty.value + byteLength);
  sqlite3_free(deps)(dirty.value);

  const result = allocCString(deps)(value);

  assertOk(result);
  assertEqual(readCString(deps)(result.value), value);
  sqlite3_free(deps)(result.value);
});

test("SqliteScratch.reserve falls back to the requested length when twice its capacity exceeds wasm memory", async () => {
  const deps = await setupSqliteWasm();
  const result = createSqliteScratch(deps);
  assertOk(result);
  const scratch = result.value;
  const mebibyte = 1024 * 1024;

  assertOk(scratch.reserve(1100 * mebibyte));
  // Twice 1100 MiB is above the 2 GiB of wasm memory.
  assertOk(scratch.reserve(1200 * mebibyte));
  assertOk(scratch.reserve(16));
  scratch[Symbol.dispose]();
});

test("copyWasmBytes returns bytes that survive memory growth", async () => {
  const deps = await setupSqliteWasm();
  const allocated = allocWasm(deps)(3);
  assertOk(allocated);
  writeWasmBytes(deps)(allocated.value, Uint8Array.of(1, 2, 3));

  const copy = copyWasmBytes(deps)(allocated.value, 3);
  const large = allocWasm(deps)(deps.sqliteWasm.getHeapU8().length);
  assertOk(large);

  assertEqual(copy, Uint8Array.of(1, 2, 3));
  sqlite3_free(deps)(large.value);
  sqlite3_free(deps)(allocated.value);
});
